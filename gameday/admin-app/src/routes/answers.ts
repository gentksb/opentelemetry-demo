import { Hono } from 'hono';
import {
  docClient,
  TABLES,
  PutCommand,
  GetCommand,
  QueryCommand,
} from '../services/dynamodb';
import {
  getQuestion,
  checkAnswer,
  calculateScore,
  updateTeamScore,
  getTeamProgress,
} from '../services/scoring';
import { getSettings } from '../services/settings';
import { getElapsedMinutes } from '../utils/time';

const router = new Hono();

interface AnswerSubmission {
  team_id: string;
  question_id: string;
  answer_text: string;
}

// 回答を提出
router.post('/', async (c) => {
  try {
    // ゲーム状態チェック（アクティブでなければ回答を受け付けない）
    const settings = await getSettings();
    if (settings.game_state !== 'active') {
      return c.json({ error: 'ゲームが開始されていません' }, 403);
    }

    const { team_id, question_id, answer_text } = await c.req.json<AnswerSubmission>();

    if (!team_id || !question_id || !answer_text) {
      return c.json(
        { error: 'team_id, question_id, and answer_text are required' },
        400
      );
    }

    // 問題を取得
    const question = getQuestion(question_id);
    if (!question) {
      return c.json({ error: 'Question not found' }, 404);
    }

    // チーム情報を取得して経過時間を計算
    const teamResult = await docClient.send(
      new GetCommand({
        TableName: TABLES.TEAMS,
        Key: { team_id },
      })
    );

    if (!teamResult.Item) {
      return c.json({ error: 'Team not found' }, 404);
    }

    const team = teamResult.Item;
    const timeElapsedMinutes = getElapsedMinutes(team.started_at);

    // 既に正解済みかチェック
    const existingAnswer = await docClient.send(
      new GetCommand({
        TableName: TABLES.ANSWERS,
        Key: { team_id, question_id },
      })
    );

    if (existingAnswer.Item?.is_correct) {
      return c.json(
        {
          error: 'Question already answered correctly',
          existing_answer: existingAnswer.Item,
        },
        400
      );
    }

    // 回答回数を取得
    const attemptCount = (existingAnswer.Item?.attempt_count || 0) + 1;

    // 回答が正しいかチェック
    const isCorrect = checkAnswer(answer_text, question.answer_keywords);

    // ポイントを計算
    const pointsAwarded = isCorrect
      ? calculateScore(question.base_points, timeElapsedMinutes, attemptCount)
      : 0;

    // 回答を保存
    const answer = {
      team_id,
      question_id,
      answer_text,
      is_correct: isCorrect,
      points_awarded: pointsAwarded,
      attempt_count: attemptCount,
      answered_at: new Date().toISOString(),
      time_elapsed_minutes: Math.round(timeElapsedMinutes * 100) / 100,
    };

    await docClient.send(
      new PutCommand({
        TableName: TABLES.ANSWERS,
        Item: answer,
      })
    );

    // 正解ならチームスコアを更新
    if (isCorrect) {
      await updateTeamScore(team_id);
    }

    // 更新された進捗を取得
    const progress = await getTeamProgress(team_id);

    return c.json({
      result: isCorrect ? 'correct' : 'incorrect',
      answer,
      progress,
      message: isCorrect
        ? `正解です！ ${pointsAwarded}点獲得しました。`
        : `不正解です。再度お試しください。（${attemptCount}回目の回答）`,
      explanation: isCorrect ? question.explanation : undefined,
    });
  } catch (error) {
    console.error('Error submitting answer:', error);
    return c.json({ error: 'Failed to submit answer' }, 500);
  }
});

// チームの回答一覧を取得
router.get('/team/:teamId', async (c) => {
  try {
    const teamId = c.req.param('teamId');

    const result = await docClient.send(
      new QueryCommand({
        TableName: TABLES.ANSWERS,
        KeyConditionExpression: 'team_id = :tid',
        ExpressionAttributeValues: {
          ':tid': teamId,
        },
      })
    );

    return c.json(result.Items || []);
  } catch (error) {
    console.error('Error getting answers:', error);
    return c.json({ error: 'Failed to get answers' }, 500);
  }
});

// 特定の回答を取得
router.get('/team/:teamId/question/:questionId', async (c) => {
  try {
    const teamId = c.req.param('teamId');
    const questionId = c.req.param('questionId');

    const result = await docClient.send(
      new GetCommand({
        TableName: TABLES.ANSWERS,
        Key: { team_id: teamId, question_id: questionId },
      })
    );

    if (!result.Item) {
      return c.json({ error: 'Answer not found' }, 404);
    }

    return c.json(result.Item);
  } catch (error) {
    console.error('Error getting answer:', error);
    return c.json({ error: 'Failed to get answer' }, 500);
  }
});

export default router;
