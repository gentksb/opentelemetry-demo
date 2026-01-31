import { Router, Request, Response } from 'express';
import {
  docClient,
  TABLES,
  ScanCommand,
  UpdateCommand,
  QueryCommand,
} from '../services/dynamodb';
import { QUESTIONS, getTeamProgress, updateTeamScore } from '../services/scoring';

const router = Router();

// Get scoreboard (all teams sorted by score)
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

    // Sort by total_score descending
    teams.sort((a, b) => b.total_score - a.total_score);

    // Add rank
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

// Get detailed team progress (admin view)
router.get('/teams/:teamId/detail', async (req: Request, res: Response) => {
  try {
    const { teamId } = req.params;

    // Get team info
    const progress = await getTeamProgress(teamId);

    // Get all answers
    const answersResult = await docClient.send(
      new QueryCommand({
        TableName: TABLES.ANSWERS,
        KeyConditionExpression: 'team_id = :tid',
        ExpressionAttributeValues: {
          ':tid': teamId,
        },
      })
    );

    // Map questions with answers
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
        answer_keywords: q.answer_keywords, // Admin can see keywords
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

// Move team to next stage manually
router.post('/teams/:teamId/advance-stage', async (req: Request, res: Response) => {
  try {
    const { teamId } = req.params;

    await docClient.send(
      new UpdateCommand({
        TableName: TABLES.TEAMS,
        Key: { team_id: teamId },
        UpdateExpression: 'SET current_stage = current_stage + :inc, last_activity = :now',
        ExpressionAttributeValues: {
          ':inc': 1,
          ':now': new Date().toISOString(),
        },
      })
    );

    res.json({ message: 'Team advanced to next stage' });
  } catch (error) {
    console.error('Error advancing team:', error);
    res.status(500).json({ error: 'Failed to advance team' });
  }
});

// Reset team progress
router.post('/teams/:teamId/reset', async (req: Request, res: Response) => {
  try {
    const { teamId } = req.params;

    // Reset team score
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

    // Note: Answer records are kept for history
    // To fully reset, you would need to delete answers too

    res.json({ message: 'Team progress reset' });
  } catch (error) {
    console.error('Error resetting team:', error);
    res.status(500).json({ error: 'Failed to reset team' });
  }
});

// Recalculate all team scores
router.post('/recalculate-scores', async (req: Request, res: Response) => {
  try {
    // Get all teams
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

// Get all questions (admin view with answers)
router.get('/questions', async (req: Request, res: Response) => {
  try {
    res.json(QUESTIONS);
  } catch (error) {
    console.error('Error getting questions:', error);
    res.status(500).json({ error: 'Failed to get questions' });
  }
});

// Get game statistics
router.get('/stats', async (req: Request, res: Response) => {
  try {
    // Get all teams
    const teamsResult = await docClient.send(
      new ScanCommand({
        TableName: TABLES.TEAMS,
      })
    );
    const teams = teamsResult.Items || [];

    // Get all answers
    const answersResult = await docClient.send(
      new ScanCommand({
        TableName: TABLES.ANSWERS,
      })
    );
    const answers = answersResult.Items || [];

    // Calculate stats
    const correctAnswers = answers.filter((a) => a.is_correct);
    const totalAttempts = answers.reduce((sum, a) => sum + (a.attempt_count || 1), 0);

    // Question completion rates
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
