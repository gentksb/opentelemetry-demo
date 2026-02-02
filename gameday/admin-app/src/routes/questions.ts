import { Router, Request, Response } from 'express';
import { QUESTIONS, getQuestion, getQuestionsForStage, getTeamProgress } from '../services/scoring';

const router = Router();

// Get all questions (without answer keywords for team view)
router.get('/', async (req: Request, res: Response) => {
  try {
    const { stage, team_id } = req.query;

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
    const sanitizedQuestions = questions.map((q) => ({
      question_id: q.question_id,
      flag_name: q.flag_name,
      service: q.service,
      question_text: q.question_text,
      base_points: q.base_points,
      stage: q.stage,
      answered: progress?.correctQuestions.includes(q.question_id) || false,
    }));

    res.json({
      questions: sanitizedQuestions,
      progress,
    });
  } catch (error) {
    console.error('Error getting questions:', error);
    res.status(500).json({ error: 'Failed to get questions' });
  }
});

// Get a specific question
router.get('/:questionId', async (req: Request, res: Response) => {
  try {
    const { questionId } = req.params;

    const question = getQuestion(questionId);
    if (!question) {
      return res.status(404).json({ error: 'Question not found' });
    }

    // Remove answer keywords for security
    const sanitizedQuestion = {
      question_id: question.question_id,
      flag_name: question.flag_name,
      service: question.service,
      question_text: question.question_text,
      base_points: question.base_points,
      stage: question.stage,
    };

    res.json(sanitizedQuestion);
  } catch (error) {
    console.error('Error getting question:', error);
    res.status(500).json({ error: 'Failed to get question' });
  }
});

// Get questions for a specific stage
router.get('/stage/:stageNumber', async (req: Request, res: Response) => {
  try {
    const { stageNumber } = req.params;
    const questions = getQuestionsForStage(Number(stageNumber));

    // Remove answer keywords
    const sanitizedQuestions = questions.map((q) => ({
      question_id: q.question_id,
      flag_name: q.flag_name,
      service: q.service,
      question_text: q.question_text,
      base_points: q.base_points,
      stage: q.stage,
    }));

    res.json(sanitizedQuestions);
  } catch (error) {
    console.error('Error getting questions by stage:', error);
    res.status(500).json({ error: 'Failed to get questions' });
  }
});

export default router;
