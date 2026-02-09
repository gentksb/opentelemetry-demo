import { Router, Request, Response } from 'express';
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

const router = Router();

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
router.post('/', async (req: Request, res: Response) => {
  try {
    const { team_name, ec2_ip } = req.body;

    if (!team_name) {
      return res.status(400).json({ error: 'team_name is required' });
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
      ec2_ip: ec2_ip || null,
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

    res.status(201).json(team);
  } catch (error) {
    console.error('Error creating team:', error);
    res.status(500).json({ error: 'Failed to create team' });
  }
});

// 全チーム取得
router.get('/', async (req: Request, res: Response) => {
  try {
    const result = await docClient.send(
      new ScanCommand({
        TableName: TABLES.TEAMS,
      })
    );

    const teams = (result.Items || []) as Team[];

    // スコア降順でソート
    teams.sort((a, b) => (b.total_score || 0) - (a.total_score || 0));

    res.json(teams);
  } catch (error) {
    console.error('Error getting teams:', error);
    res.status(500).json({ error: 'Failed to get teams' });
  }
});

// 特定チーム取得
router.get('/:teamId', async (req: Request, res: Response) => {
  try {
    const { teamId } = req.params;

    const result = await docClient.send(
      new GetCommand({
        TableName: TABLES.TEAMS,
        Key: { team_id: teamId },
      })
    );

    if (!result.Item) {
      return res.status(404).json({ error: 'Team not found' });
    }

    res.json(result.Item);
  } catch (error) {
    console.error('Error getting team:', error);
    res.status(500).json({ error: 'Failed to get team' });
  }
});

// チームスコアと進捗取得
router.get('/:teamId/score', async (req: Request, res: Response) => {
  try {
    const { teamId } = req.params;

    // チーム情報を取得
    const teamResult = await docClient.send(
      new GetCommand({
        TableName: TABLES.TEAMS,
        Key: { team_id: teamId },
      })
    );

    if (!teamResult.Item) {
      return res.status(404).json({ error: 'Team not found' });
    }

    // 詳細な進捗を取得
    const progress = await getTeamProgress(teamId);

    res.json({
      team: teamResult.Item,
      progress,
    });
  } catch (error) {
    console.error('Error getting team score:', error);
    res.status(500).json({ error: 'Failed to get team score' });
  }
});

// チーム情報更新
router.put('/:teamId', async (req: Request, res: Response) => {
  try {
    const { teamId } = req.params;
    const { team_name, ec2_ip, current_stage } = req.body;

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

    // 更新後のチーム情報を取得
    const result = await docClient.send(
      new GetCommand({
        TableName: TABLES.TEAMS,
        Key: { team_id: teamId },
      })
    );

    res.json(result.Item);
  } catch (error) {
    console.error('Error updating team:', error);
    res.status(500).json({ error: 'Failed to update team' });
  }
});

// チーム削除（関連する回答レコードも削除）
router.delete('/:teamId', async (req: Request, res: Response) => {
  try {
    const { teamId } = req.params;

    // チームの存在確認
    const teamResult = await docClient.send(
      new GetCommand({
        TableName: TABLES.TEAMS,
        Key: { team_id: teamId },
      })
    );

    if (!teamResult.Item) {
      return res.status(404).json({ error: 'Team not found' });
    }

    // 関連する回答レコードを検索して削除
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

    // チームレコードを削除
    await docClient.send(
      new DeleteCommand({
        TableName: TABLES.TEAMS,
        Key: { team_id: teamId },
      })
    );

    res.json({
      message: 'チームと関連する回答を削除しました',
      deleted_answers: answers.length,
    });
  } catch (error) {
    console.error('Error deleting team:', error);
    res.status(500).json({ error: 'Failed to delete team' });
  }
});

// チームスコア再計算
router.post('/:teamId/refresh-score', async (req: Request, res: Response) => {
  try {
    const { teamId } = req.params;

    await updateTeamScore(teamId);

    const result = await docClient.send(
      new GetCommand({
        TableName: TABLES.TEAMS,
        Key: { team_id: teamId },
      })
    );

    res.json(result.Item);
  } catch (error) {
    console.error('Error refreshing team score:', error);
    res.status(500).json({ error: 'Failed to refresh team score' });
  }
});

export default router;
