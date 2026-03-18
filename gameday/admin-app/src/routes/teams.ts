import { Hono } from 'hono';
import {
  docClient,
  TABLES,
  PutCommand,
  GetCommand,
  ScanCommand,
  UpdateCommand,
  DeleteCommand,
} from '../services/dynamodb';
import { getTeamProgress, updateTeamScore } from '../services/scoring';

const router = new Hono();

interface Team {
  team_id: string;
  team_name: string;
  ec2_ip?: string;
  total_score: number;
  questions_correct: number;
  current_stage: number;
  started_at: string;
  last_activity: string;
}

// チーム作成（フレンドリーID自動生成: team-01, team-02, ...）
router.post('/', async (c) => {
  try {
    const { team_name, ec2_ip } = await c.req.json<{ team_name?: string; ec2_ip?: string }>();

    if (!team_name) {
      return c.json({ error: 'team_name is required' }, 400);
    }

    // 次のチームIDを生成（既存チームの最大番号 + 1）
    const teamsResult = await docClient.send(new ScanCommand({ TableName: TABLES.TEAMS }));
    const existingTeams = teamsResult.Items || [];
    const maxNum = existingTeams.reduce((max, t) => {
      const match = t.team_id?.match(/^team-(\d+)$/);
      return match ? Math.max(max, parseInt(match[1], 10)) : max;
    }, 0);
    const teamId = `team-${String(maxNum + 1).padStart(2, '0')}`;

    const team: Team = {
      team_id: teamId,
      team_name,
      ec2_ip: ec2_ip || undefined,
      total_score: 0,
      questions_correct: 0,
      current_stage: 1,
      started_at: new Date().toISOString(),
      last_activity: new Date().toISOString(),
    };

    await docClient.send(
      new PutCommand({
        TableName: TABLES.TEAMS,
        Item: team,
      })
    );

    return c.json(team, 201);
  } catch (error) {
    console.error('Error creating team:', error);
    return c.json({ error: 'Failed to create team' }, 500);
  }
});

// 全チーム取得
router.get('/', async (c) => {
  try {
    const result = await docClient.send(
      new ScanCommand({
        TableName: TABLES.TEAMS,
      })
    );

    const teams = (result.Items || []) as Team[];
    teams.sort((a, b) => (b.total_score || 0) - (a.total_score || 0));

    return c.json(teams);
  } catch (error) {
    console.error('Error getting teams:', error);
    return c.json({ error: 'Failed to get teams' }, 500);
  }
});

// 特定チーム取得
router.get('/:teamId', async (c) => {
  try {
    const teamId = c.req.param('teamId');

    const result = await docClient.send(
      new GetCommand({
        TableName: TABLES.TEAMS,
        Key: { team_id: teamId },
      })
    );

    if (!result.Item) {
      return c.json({ error: 'Team not found' }, 404);
    }

    return c.json(result.Item);
  } catch (error) {
    console.error('Error getting team:', error);
    return c.json({ error: 'Failed to get team' }, 500);
  }
});

// チームスコアと進捗取得
router.get('/:teamId/score', async (c) => {
  try {
    const teamId = c.req.param('teamId');

    const teamResult = await docClient.send(
      new GetCommand({
        TableName: TABLES.TEAMS,
        Key: { team_id: teamId },
      })
    );

    if (!teamResult.Item) {
      return c.json({ error: 'Team not found' }, 404);
    }

    const progress = await getTeamProgress(teamId);

    return c.json({
      team: teamResult.Item,
      progress,
    });
  } catch (error) {
    console.error('Error getting team score:', error);
    return c.json({ error: 'Failed to get team score' }, 500);
  }
});

// チーム情報更新
router.put('/:teamId', async (c) => {
  try {
    const teamId = c.req.param('teamId');
    const { team_name, ec2_ip, current_stage } = await c.req.json<{
      team_name?: string;
      ec2_ip?: string;
      current_stage?: number;
    }>();

    const updateExpressions: string[] = [];
    const expressionValues: Record<string, unknown> = {};

    if (team_name) {
      updateExpressions.push('team_name = :name');
      expressionValues[':name'] = team_name;
    }

    if (ec2_ip !== undefined) {
      updateExpressions.push('ec2_ip = :ip');
      expressionValues[':ip'] = ec2_ip;
    }

    if (current_stage !== undefined) {
      updateExpressions.push('current_stage = :stage');
      expressionValues[':stage'] = current_stage;
    }

    updateExpressions.push('last_activity = :now');
    expressionValues[':now'] = new Date().toISOString();

    await docClient.send(
      new UpdateCommand({
        TableName: TABLES.TEAMS,
        Key: { team_id: teamId },
        UpdateExpression: `SET ${updateExpressions.join(', ')}`,
        ExpressionAttributeValues: expressionValues,
      })
    );

    const result = await docClient.send(
      new GetCommand({
        TableName: TABLES.TEAMS,
        Key: { team_id: teamId },
      })
    );

    return c.json(result.Item);
  } catch (error) {
    console.error('Error updating team:', error);
    return c.json({ error: 'Failed to update team' }, 500);
  }
});

// チーム削除（関連する回答レコードも削除）
router.delete('/:teamId', async (c) => {
  try {
    const teamId = c.req.param('teamId');

    const teamResult = await docClient.send(
      new GetCommand({
        TableName: TABLES.TEAMS,
        Key: { team_id: teamId },
      })
    );

    if (!teamResult.Item) {
      return c.json({ error: 'Team not found' }, 404);
    }

    const answersResult = await docClient.send(
      new ScanCommand({
        TableName: TABLES.ANSWERS,
        FilterExpression: 'team_id = :tid',
        ExpressionAttributeValues: {
          ':tid': teamId,
        },
      })
    );

    const answers = answersResult.Items || [];
    for (const answer of answers) {
      await docClient.send(
        new DeleteCommand({
          TableName: TABLES.ANSWERS,
          Key: { team_id: answer.team_id, question_id: answer.question_id },
        })
      );
    }

    await docClient.send(
      new DeleteCommand({
        TableName: TABLES.TEAMS,
        Key: { team_id: teamId },
      })
    );

    return c.json({
      message: 'チームと関連する回答を削除しました',
      deleted_answers: answers.length,
    });
  } catch (error) {
    console.error('Error deleting team:', error);
    return c.json({ error: 'Failed to delete team' }, 500);
  }
});

// チームスコア再計算
router.post('/:teamId/refresh-score', async (c) => {
  try {
    const teamId = c.req.param('teamId');

    await updateTeamScore(teamId);

    const result = await docClient.send(
      new GetCommand({
        TableName: TABLES.TEAMS,
        Key: { team_id: teamId },
      })
    );

    return c.json(result.Item);
  } catch (error) {
    console.error('Error refreshing team score:', error);
    return c.json({ error: 'Failed to refresh team score' }, 500);
  }
});

export default router;
