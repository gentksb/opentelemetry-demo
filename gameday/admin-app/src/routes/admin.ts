import { Hono } from 'hono';
import { getElapsedMinutes } from '../utils/time';
import {
  docClient,
  TABLES,
  ScanCommand,
  UpdateCommand,
  QueryCommand,
  DeleteCommand,
} from '../services/dynamodb';
import { QUESTIONS, getTeamProgress, updateTeamScore } from '../services/scoring';
import { getSettings, updateSettings } from '../services/settings';

const router = new Hono();

// ゲーム開始 - 全チームの started_at を現在時刻にリセットし、一斉スタートとする
router.post('/game/start', async (c) => {
  try {
    const current = await getSettings();
    if (current.game_state === 'active') {
      return c.json({ error: 'ゲームは既に開始されています' }, 400);
    }

    const now = new Date().toISOString();
    await updateSettings({ game_state: 'active', game_started_at: now });

    // 全チームの started_at を現在時刻にリセット（一斉スタート）
    const teamsResult = await docClient.send(
      new ScanCommand({ TableName: TABLES.TEAMS })
    );
    const teams = teamsResult.Items || [];

    for (const team of teams) {
      await docClient.send(
        new UpdateCommand({
          TableName: TABLES.TEAMS,
          Key: { team_id: team.team_id },
          UpdateExpression: 'SET started_at = :now, last_activity = :now',
          ExpressionAttributeValues: {
            ':now': now,
          },
        })
      );
    }

    return c.json({
      message: 'ゲームを開始しました',
      state: 'active',
      started_at: now,
      teams_reset: teams.length,
    });
  } catch (error) {
    console.error('Error starting game:', error);
    return c.json({ error: 'ゲームの開始に失敗しました' }, 500);
  }
});

// ゲーム停止 - 状態を 'finished' に変更
router.post('/game/stop', async (c) => {
  try {
    const current = await getSettings();
    if (current.game_state !== 'active') {
      return c.json({ error: 'ゲームは現在アクティブではありません' }, 400);
    }

    await updateSettings({ game_state: 'finished' });

    return c.json({
      message: 'ゲームを終了しました',
      state: 'finished',
      started_at: current.game_started_at,
    });
  } catch (error) {
    console.error('Error stopping game:', error);
    return c.json({ error: 'ゲームの停止に失敗しました' }, 500);
  }
});

// ゲームリセット - 状態を 'waiting' に戻す
router.post('/game/reset', async (c) => {
  try {
    await updateSettings({ game_state: 'waiting', game_started_at: null });

    return c.json({
      message: 'ゲーム状態をリセットしました',
      state: 'waiting',
    });
  } catch (error) {
    console.error('Error resetting game:', error);
    return c.json({ error: 'ゲームのリセットに失敗しました' }, 500);
  }
});

// ゲーム状態取得（認証付きルート内にも配置。公開用は app.ts で別途定義）
router.get('/game/state', async (c) => {
  try {
    const settings = await getSettings();
    const startedAt = settings.game_started_at || null;
    const elapsedMinutes = getElapsedMinutes(startedAt);

    return c.json({
      state: settings.game_state,
      started_at: startedAt,
      elapsed_minutes: Math.round(elapsedMinutes * 100) / 100,
    });
  } catch (error) {
    console.error('Error getting game state:', error);
    return c.json({ error: 'Failed to get game state' }, 500);
  }
});

// スコアボード取得（全チームをスコア順にソート）
router.get('/scoreboard', async (c) => {
  try {
    const result = await docClient.send(
      new ScanCommand({
        TableName: TABLES.TEAMS,
      })
    );

    const teams = (result.Items || []).map((team) => ({
      team_id: team.team_id,
      team_name: team.team_name,
      total_score: team.total_score || 0,
      questions_correct: team.questions_correct || 0,
      current_stage: team.current_stage || 1,
      last_activity: team.last_activity,
    }));

    teams.sort((a, b) => b.total_score - a.total_score);

    const rankedTeams = teams.map((team, index) => ({
      rank: index + 1,
      ...team,
    }));

    return c.json({
      teams: rankedTeams,
      total_teams: rankedTeams.length,
      total_questions: QUESTIONS.length,
      updated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error getting scoreboard:', error);
    return c.json({ error: 'Failed to get scoreboard' }, 500);
  }
});

// チーム詳細進捗取得（管理者ビュー）
router.get('/teams/:teamId/detail', async (c) => {
  try {
    const teamId = c.req.param('teamId');

    const progress = await getTeamProgress(teamId);

    const answersResult = await docClient.send(
      new QueryCommand({
        TableName: TABLES.ANSWERS,
        KeyConditionExpression: 'team_id = :tid',
        ExpressionAttributeValues: {
          ':tid': teamId,
        },
      })
    );

    const questionDetails = QUESTIONS.map((q) => {
      const answer = (answersResult.Items || []).find(
        (a) => a.question_id === q.question_id
      );
      return {
        question_id: q.question_id,
        flag_name: q.flag_name,
        service: q.service,
        question_text: q.question_text,
        base_points: q.base_points,
        stage: q.stage,
        answer_keywords: q.answer_keywords,
        answered: !!answer,
        is_correct: answer?.is_correct || false,
        points_awarded: answer?.points_awarded || 0,
        attempt_count: answer?.attempt_count || 0,
        answered_at: answer?.answered_at,
        submitted_answer: answer?.answer_text,
      };
    });

    return c.json({
      team_id: teamId,
      progress,
      questions: questionDetails,
    });
  } catch (error) {
    console.error('Error getting team detail:', error);
    return c.json({ error: 'Failed to get team detail' }, 500);
  }
});

// チーム進捗リセット
router.post('/teams/:teamId/reset', async (c) => {
  try {
    const teamId = c.req.param('teamId');

    await docClient.send(
      new UpdateCommand({
        TableName: TABLES.TEAMS,
        Key: { team_id: teamId },
        UpdateExpression:
          'SET total_score = :zero, questions_correct = :zero, current_stage = :one, started_at = :now, last_activity = :now',
        ExpressionAttributeValues: {
          ':zero': 0,
          ':one': 1,
          ':now': new Date().toISOString(),
        },
      })
    );

    const answersResult = await docClient.send(
      new QueryCommand({
        TableName: TABLES.ANSWERS,
        KeyConditionExpression: 'team_id = :tid',
        ExpressionAttributeValues: { ':tid': teamId },
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

    return c.json({ message: 'Team progress reset', deleted_answers: answers.length });
  } catch (error) {
    console.error('Error resetting team:', error);
    return c.json({ error: 'Failed to reset team' }, 500);
  }
});

// 全チームスコア再計算
router.post('/recalculate-scores', async (c) => {
  try {
    const teamsResult = await docClient.send(
      new ScanCommand({
        TableName: TABLES.TEAMS,
      })
    );

    const teams = teamsResult.Items || [];
    const results = [];

    for (const team of teams) {
      await updateTeamScore(team.team_id);
      results.push(team.team_id);
    }

    return c.json({
      message: 'Scores recalculated',
      teams_updated: results.length,
    });
  } catch (error) {
    console.error('Error recalculating scores:', error);
    return c.json({ error: 'Failed to recalculate scores' }, 500);
  }
});

// 設定取得（管理者専用）
router.get('/config', async (c) => {
  try {
    const settings = await getSettings();
    return c.json({
      splunk_org_id: settings.splunk_org_id,
      astronomy_shop_url: settings.astronomy_shop_url,
      otel_env: settings.otel_env,
      itsi_url: settings.itsi_url,
      itsi_username: settings.itsi_username,
      itsi_password: settings.itsi_password,
    });
  } catch (error) {
    console.error('Error getting config:', error);
    return c.json({ error: 'Failed to get config' }, 500);
  }
});

// 設定更新（管理者専用）
router.put('/config', async (c) => {
  try {
    const { org_id, astronomy_shop_url, otel_env, itsi_url, itsi_username, itsi_password } =
      await c.req.json<{
        org_id?: string;
        astronomy_shop_url?: string;
        otel_env?: string;
        itsi_url?: string;
        itsi_username?: string;
        itsi_password?: string;
      }>();
    const partial: Partial<import('../services/settings').GameSettings> = {};

    if (org_id !== undefined) {
      if (typeof org_id !== 'string') {
        return c.json({ error: 'org_id must be a string' }, 400);
      }
      partial.splunk_org_id = org_id.trim();
    }
    if (astronomy_shop_url !== undefined) {
      if (typeof astronomy_shop_url !== 'string') {
        return c.json({ error: 'astronomy_shop_url must be a string' }, 400);
      }
      const trimmed = astronomy_shop_url.trim();
      if (trimmed !== '' && !/^https?:\/\//i.test(trimmed)) {
        return c.json({ error: 'astronomy_shop_url must start with http:// or https://' }, 400);
      }
      partial.astronomy_shop_url = trimmed;
    }
    if (otel_env !== undefined) {
      if (typeof otel_env !== 'string') {
        return c.json({ error: 'otel_env must be a string' }, 400);
      }
      partial.otel_env = otel_env.trim();
    }
    if (itsi_url !== undefined) {
      if (typeof itsi_url !== 'string') {
        return c.json({ error: 'itsi_url must be a string' }, 400);
      }
      const trimmed = itsi_url.trim();
      if (trimmed !== '' && !/^https?:\/\//i.test(trimmed)) {
        return c.json({ error: 'itsi_url must start with http:// or https://' }, 400);
      }
      partial.itsi_url = trimmed;
    }
    if (itsi_username !== undefined) {
      if (typeof itsi_username !== 'string') {
        return c.json({ error: 'itsi_username must be a string' }, 400);
      }
      partial.itsi_username = itsi_username.trim();
    }
    if (itsi_password !== undefined) {
      if (typeof itsi_password !== 'string') {
        return c.json({ error: 'itsi_password must be a string' }, 400);
      }
      partial.itsi_password = itsi_password.trim();
    }

    await updateSettings(partial);
    const updated = await getSettings();

    return c.json({
      splunk_org_id: updated.splunk_org_id,
      astronomy_shop_url: updated.astronomy_shop_url,
      otel_env: updated.otel_env,
      itsi_url: updated.itsi_url,
      itsi_username: updated.itsi_username,
      itsi_password: updated.itsi_password,
    });
  } catch (error) {
    console.error('Error updating config:', error);
    return c.json({ error: 'Failed to update config' }, 500);
  }
});

// 全問題取得（管理者ビュー、回答キーワード付き）
router.get('/questions', async (c) => {
  try {
    return c.json(QUESTIONS);
  } catch (error) {
    console.error('Error getting questions:', error);
    return c.json({ error: 'Failed to get questions' }, 500);
  }
});

// ゲーム統計取得
router.get('/stats', async (c) => {
  try {
    const teamsResult = await docClient.send(
      new ScanCommand({
        TableName: TABLES.TEAMS,
      })
    );
    const teams = teamsResult.Items || [];

    const answersResult = await docClient.send(
      new ScanCommand({
        TableName: TABLES.ANSWERS,
      })
    );
    const answers = answersResult.Items || [];

    const correctAnswers = answers.filter((a) => a.is_correct);
    const totalAttempts = answers.reduce((sum, a) => sum + (a.attempt_count || 1), 0);

    const questionStats = QUESTIONS.map((q) => {
      const questionAnswers = correctAnswers.filter(
        (a) => a.question_id === q.question_id
      );
      return {
        question_id: q.question_id,
        flag_name: q.flag_name,
        service: q.service,
        teams_completed: questionAnswers.length,
        completion_rate:
          teams.length > 0
            ? Math.round((questionAnswers.length / teams.length) * 100)
            : 0,
      };
    });

    return c.json({
      total_teams: teams.length,
      total_questions: QUESTIONS.length,
      total_correct_answers: correctAnswers.length,
      total_attempts: totalAttempts,
      average_score:
        teams.length > 0
          ? Math.round(
              teams.reduce((sum, t) => sum + (t.total_score || 0), 0) / teams.length
            )
          : 0,
      question_stats: questionStats,
      updated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error getting stats:', error);
    return c.json({ error: 'Failed to get stats' }, 500);
  }
});

export default router;
