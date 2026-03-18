import { Hono } from 'hono';
import { QUESTIONS, getQuestion, getQuestionsForStage, getTeamProgress } from '../services/scoring';
import { getSettings } from '../services/settings';
import { HINT_AVAILABLE_AFTER_MINUTES } from '../constants/game';
import { getElapsedMinutes } from '../utils/time';

const router = new Hono();

// Get all questions (without answer keywords for team view)
router.get('/', async (c) => {
  try {
    const stage = c.req.query('stage');
    const team_id = c.req.query('team_id');

    let questions = QUESTIONS;

    // Filter by stage if specified
    if (stage) {
      questions = getQuestionsForStage(Number(stage));
    }

    // If team_id is provided, include their progress
    let progress: {
      totalScore: number;
      answeredQuestions: string[];
      correctQuestions: string[];
      currentStage: number;
    } | null = null;
    if (team_id) {
      progress = await getTeamProgress(String(team_id));

      // Only show questions for current stage
      questions = questions.filter((q) => q.stage <= progress!.currentStage);
    }

    // Remove answer keywords for team view (security)
    // explanation is included only for answered questions
    const gameSettings = await getSettings();
    const elapsedMinutes = getElapsedMinutes(gameSettings.game_started_at || null);
    const hintsAvailable = elapsedMinutes >= HINT_AVAILABLE_AFTER_MINUTES;

    const sanitizedQuestions = questions.map((q) => {
      const answered = progress?.correctQuestions.includes(q.question_id) || false;
      return {
        question_id: q.question_id,
        flag_name: q.flag_name,
        service: q.service,
        trigger_type: q.trigger_type,
        difficulty: q.difficulty,
        scenario: q.scenario,
        question_text: q.question_text,
        base_points: q.base_points,
        stage: q.stage,
        hint: hintsAvailable ? q.hint : undefined,
        answered,
        ...(answered && q.explanation ? { explanation: q.explanation } : {}),
      };
    });

    return c.json({
      questions: sanitizedQuestions,
      progress,
    });
  } catch (error) {
    console.error('Error getting questions:', error);
    return c.json({ error: 'Failed to get questions' }, 500);
  }
});

// Get a specific question
router.get('/:questionId', async (c) => {
  try {
    const questionId = c.req.param('questionId');

    const question = getQuestion(questionId);
    if (!question) {
      return c.json({ error: 'Question not found' }, 404);
    }

    const sanitizedQuestion = {
      question_id: question.question_id,
      flag_name: question.flag_name,
      service: question.service,
      question_text: question.question_text,
      base_points: question.base_points,
      stage: question.stage,
    };

    return c.json(sanitizedQuestion);
  } catch (error) {
    console.error('Error getting question:', error);
    return c.json({ error: 'Failed to get question' }, 500);
  }
});

// Get questions for a specific stage
router.get('/stage/:stageNumber', async (c) => {
  try {
    const stageNumber = c.req.param('stageNumber');
    const questions = getQuestionsForStage(Number(stageNumber));

    const sanitizedQuestions = questions.map((q) => ({
      question_id: q.question_id,
      flag_name: q.flag_name,
      service: q.service,
      question_text: q.question_text,
      base_points: q.base_points,
      stage: q.stage,
    }));

    return c.json(sanitizedQuestions);
  } catch (error) {
    console.error('Error getting questions by stage:', error);
    return c.json({ error: 'Failed to get questions' }, 500);
  }
});

export default router;
