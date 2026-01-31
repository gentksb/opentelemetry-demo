import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import {
  docClient,
  TABLES,
  PutCommand,
  GetCommand,
  QueryCommand,
  UpdateCommand,
} from '../services/dynamodb';
import {
  getQuestion,
  checkAnswer,
  calculateScore,
  updateTeamScore,
  getTeamProgress,
} from '../services/scoring';

const router = Router();

interface AnswerSubmission {
  team_id: string;
  question_id: string;
  answer_text: string;
}

// Submit an answer
router.post('/', async (req: Request, res: Response) => {
  try {
    const { team_id, question_id, answer_text }: AnswerSubmission = req.body;

    if (!team_id || !question_id || !answer_text) {
      return res.status(400).json({
        error: 'team_id, question_id, and answer_text are required',
      });
    }

    // Get the question
    const question = getQuestion(question_id);
    if (!question) {
      return res.status(404).json({ error: 'Question not found' });
    }

    // Get team info to calculate time elapsed
    const teamResult = await docClient.send(
      new GetCommand({
        TableName: TABLES.TEAMS,
        Key: { team_id },
      })
    );

    if (!teamResult.Item) {
      return res.status(404).json({ error: 'Team not found' });
    }

    const team = teamResult.Item;
    const startedAt = new Date(team.started_at);
    const now = new Date();
    const timeElapsedMinutes = (now.getTime() - startedAt.getTime()) / (1000 * 60);

    // Check if already answered correctly
    const existingAnswer = await docClient.send(
      new GetCommand({
        TableName: TABLES.ANSWERS,
        Key: { team_id, question_id },
      })
    );

    if (existingAnswer.Item?.is_correct) {
      return res.status(400).json({
        error: 'Question already answered correctly',
        existing_answer: existingAnswer.Item,
      });
    }

    // Get attempt count
    const attemptCount = (existingAnswer.Item?.attempt_count || 0) + 1;

    // Check if answer is correct
    const isCorrect = checkAnswer(answer_text, question.answer_keywords);

    // Calculate points
    const pointsAwarded = isCorrect
      ? calculateScore(question.base_points, timeElapsedMinutes, attemptCount)
      : 0;

    // Store the answer
    const answer = {
      team_id,
      question_id,
      answer_text,
      is_correct: isCorrect,
      points_awarded: pointsAwarded,
      attempt_count: attemptCount,
      answered_at: now.toISOString(),
      time_elapsed_minutes: Math.round(timeElapsedMinutes * 100) / 100,
    };

    await docClient.send(
      new PutCommand({
        TableName: TABLES.ANSWERS,
        Item: answer,
      })
    );

    // Update team score if correct
    if (isCorrect) {
      await updateTeamScore(team_id);
    }

    // Get updated progress
    const progress = await getTeamProgress(team_id);

    res.json({
      result: isCorrect ? 'correct' : 'incorrect',
      answer,
      progress,
      message: isCorrect
        ? `正解です！ ${pointsAwarded}点獲得しました。`
        : `不正解です。再度お試しください。（${attemptCount}回目の回答）`,
    });
  } catch (error) {
    console.error('Error submitting answer:', error);
    res.status(500).json({ error: 'Failed to submit answer' });
  }
});

// Get answers for a team
router.get('/team/:teamId', async (req: Request, res: Response) => {
  try {
    const { teamId } = req.params;

    const result = await docClient.send(
      new QueryCommand({
        TableName: TABLES.ANSWERS,
        KeyConditionExpression: 'team_id = :tid',
        ExpressionAttributeValues: {
          ':tid': teamId,
        },
      })
    );

    res.json(result.Items || []);
  } catch (error) {
    console.error('Error getting answers:', error);
    res.status(500).json({ error: 'Failed to get answers' });
  }
});

// Get a specific answer
router.get('/team/:teamId/question/:questionId', async (req: Request, res: Response) => {
  try {
    const { teamId, questionId } = req.params;

    const result = await docClient.send(
      new GetCommand({
        TableName: TABLES.ANSWERS,
        Key: { team_id: teamId, question_id: questionId },
      })
    );

    if (!result.Item) {
      return res.status(404).json({ error: 'Answer not found' });
    }

    res.json(result.Item);
  } catch (error) {
    console.error('Error getting answer:', error);
    res.status(500).json({ error: 'Failed to get answer' });
  }
});

export default router;
