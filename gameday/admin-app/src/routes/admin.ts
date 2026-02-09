import { Router, Request, Response } from 'express';
import {
  docClient,
  TABLES,
  ScanCommand,
  UpdateCommand,
  QueryCommand,
  DeleteCommand,
  GetCommand,
} from '../services/dynamodb';
import { QUESTIONS, getTeamProgress, updateTeamScore } from '../services/scoring';

const router = Router();

// ゲーム状態管理（インメモリ。サーバー再起動でリセットされる）
let gameState: 'waiting' | 'active' | 'finished' = 'waiting';
let gameStartedAt: string | null = null;

// ゲーム状態を外部から取得するためのエクスポート関数
export function getGameState(): 'waiting' | 'active' | 'finished' {
  return gameState;
}

export function getGameStartedAt(): string | null {
  return gameStartedAt;
}

// ゲーム開始 - 全チームの started_at を現在時刻にリセットし、一斉スタートとする
router.post('/game/start', async (req: Request, res: Response) => {
  try {
    if (gameState === 'active') {
      return res.status(400).json({ error: 'ゲームは既に開始されています' });
    }

    const now = new Date().toISOString();
    gameState = 'active';
    gameStartedAt = now;

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

    res.json({
      message: 'ゲームを開始しました',
      state: gameState,
      started_at: gameStartedAt,
      teams_reset: teams.length,
    });
  } catch (error) {
    console.error('Error starting game:', error);
    res.status(500).json({ error: 'ゲームの開始に失敗しました' });
  }
});

// ゲーム停止 - 状態を 'finished' に変更
router.post('/game/stop', async (_req: Request, res: Response) => {
  try {
    if (gameState !== 'active') {
      return res.status(400).json({ error: 'ゲームは現在アクティブではありません' });
    }

    gameState = 'finished';

    res.json({
      message: 'ゲームを終了しました',
      state: gameState,
      started_at: gameStartedAt,
    });
  } catch (error) {
    console.error('Error stopping game:', error);
    res.status(500).json({ error: 'ゲームの停止に失敗しました' });
  }
});

// ゲームリセット - 状態を 'waiting' に戻す
router.post('/game/reset', async (_req: Request, res: Response) => {
  try {
    gameState = 'waiting';
    gameStartedAt = null;

    res.json({
      message: 'ゲーム状態をリセットしました',
      state: gameState,
    });
  } catch (error) {
    console.error('Error resetting game:', error);
    res.status(500).json({ error: 'ゲームのリセットに失敗しました' });
  }
});

// ゲーム状態取得（認証付きルート内にも配置。公開用は index.ts で別途定義）
router.get('/game/state', (req: Request, res: Response) => {
  const elapsedMinutes = gameStartedAt
    ? (Date.now() - new Date(gameStartedAt).getTime()) / 60000
    : 0;

  res.json({
    state: gameState,
    started_at: gameStartedAt,
    elapsed_minutes: Math.round(elapsedMinutes * 100) / 100,
  });
});

// スコアボード取得（全チームをスコア順にソート）
router.get('/scoreboard', async (req: Request, res: Response) => {
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

    // スコア降順でソート
    teams.sort((a, b) => b.total_score - a.total_score);

    // ランクを付与
    const rankedTeams = teams.map((team, index) => ({
      rank: index + 1,
      ...team,
    }));

    res.json({
      teams: rankedTeams,
      total_teams: rankedTeams.length,
      total_questions: QUESTIONS.length,
      updated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error getting scoreboard:', error);
    res.status(500).json({ error: 'Failed to get scoreboard' });
  }
});

// チーム詳細進捗取得（管理者ビュー）
router.get('/teams/:teamId/detail', async (req: Request, res: Response) => {
  try {
    const { teamId } = req.params;

    // チーム情報と進捗を取得
    const progress = await getTeamProgress(teamId);

    // 全回答を取得
    const answersResult = await docClient.send(
      new QueryCommand({
        TableName: TABLES.ANSWERS,
        KeyConditionExpression: 'team_id = :tid',
        ExpressionAttributeValues: {
          ':tid': teamId,
        },
      })
    );

    // 各問題に回答をマッピング
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
        answer_keywords: q.answer_keywords, // 管理者にはキーワードを表示
        answered: !!answer,
        is_correct: answer?.is_correct || false,
        points_awarded: answer?.points_awarded || 0,
        attempt_count: answer?.attempt_count || 0,
        answered_at: answer?.answered_at,
        submitted_answer: answer?.answer_text,
      };
    });

    res.json({
      team_id: teamId,
      progress,
      questions: questionDetails,
    });
  } catch (error) {
    console.error('Error getting team detail:', error);
    res.status(500).json({ error: 'Failed to get team detail' });
  }
});

// チームを次のステージに手動で進める（最大Stage 2）
router.post('/teams/:teamId/advance-stage', async (req: Request, res: Response) => {
  try {
    const { teamId } = req.params;
    const MAX_STAGE = 2;

    // 現在のステージを確認
    const teamResult = await docClient.send(
      new GetCommand({
        TableName: TABLES.TEAMS,
        Key: { team_id: teamId },
      })
    );

    if (!teamResult.Item) {
      return res.status(404).json({ error: 'Team not found' });
    }

    const currentStage = teamResult.Item.current_stage || 1;
    if (currentStage >= MAX_STAGE) {
      return res.status(400).json({ error: `既に最終ステージ(Stage ${MAX_STAGE})です` });
    }

    await docClient.send(
      new UpdateCommand({
        TableName: TABLES.TEAMS,
        Key: { team_id: teamId },
        UpdateExpression: 'SET current_stage = :stage, last_activity = :now',
        ExpressionAttributeValues: {
          ':stage': currentStage + 1,
          ':now': new Date().toISOString(),
        },
      })
    );

    res.json({ message: `Team advanced to Stage ${currentStage + 1}` });
  } catch (error) {
    console.error('Error advancing team:', error);
    res.status(500).json({ error: 'Failed to advance team' });
  }
});

// チーム進捗リセット
router.post('/teams/:teamId/reset', async (req: Request, res: Response) => {
  try {
    const { teamId } = req.params;

    // チームスコアをリセット
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

    // 回答レコードも削除（完全リセット）
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

    res.json({ message: 'Team progress reset', deleted_answers: answers.length });
  } catch (error) {
    console.error('Error resetting team:', error);
    res.status(500).json({ error: 'Failed to reset team' });
  }
});

// 全チームスコア再計算
router.post('/recalculate-scores', async (req: Request, res: Response) => {
  try {
    // 全チームを取得
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

    res.json({
      message: 'Scores recalculated',
      teams_updated: results.length,
    });
  } catch (error) {
    console.error('Error recalculating scores:', error);
    res.status(500).json({ error: 'Failed to recalculate scores' });
  }
});

// 全問題取得（管理者ビュー、回答キーワード付き）
router.get('/questions', async (req: Request, res: Response) => {
  try {
    res.json(QUESTIONS);
  } catch (error) {
    console.error('Error getting questions:', error);
    res.status(500).json({ error: 'Failed to get questions' });
  }
});

// ゲーム統計取得
router.get('/stats', async (req: Request, res: Response) => {
  try {
    // 全チームを取得
    const teamsResult = await docClient.send(
      new ScanCommand({
        TableName: TABLES.TEAMS,
      })
    );
    const teams = teamsResult.Items || [];

    // 全回答を取得
    const answersResult = await docClient.send(
      new ScanCommand({
        TableName: TABLES.ANSWERS,
      })
    );
    const answers = answersResult.Items || [];

    // 統計を計算
    const correctAnswers = answers.filter((a) => a.is_correct);
    const totalAttempts = answers.reduce((sum, a) => sum + (a.attempt_count || 1), 0);

    // 問題ごとの完了率
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

    res.json({
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
      teams_in_stage2: teams.filter((t) => t.current_stage === 2).length,
      question_stats: questionStats,
      updated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

export default router;
