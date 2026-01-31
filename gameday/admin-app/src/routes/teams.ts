import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import {
  docClient,
  TABLES,
  PutCommand,
  GetCommand,
  ScanCommand,
  UpdateCommand,
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

// Create a new team
router.post('/', async (req: Request, res: Response) => {
  try {
    const { team_name, ec2_ip } = req.body;

    if (!team_name) {
      return res.status(400).json({ error: 'team_name is required' });
    }

    const team: Team = {
      team_id: uuidv4(),
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

// Get all teams
router.get('/', async (req: Request, res: Response) => {
  try {
    const result = await docClient.send(
      new ScanCommand({
        TableName: TABLES.TEAMS,
      })
    );

    const teams = (result.Items || []) as Team[];

    // Sort by total_score descending
    teams.sort((a, b) => (b.total_score || 0) - (a.total_score || 0));

    res.json(teams);
  } catch (error) {
    console.error('Error getting teams:', error);
    res.status(500).json({ error: 'Failed to get teams' });
  }
});

// Get a specific team
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

// Get team score and progress
router.get('/:teamId/score', async (req: Request, res: Response) => {
  try {
    const { teamId } = req.params;

    // Get team info
    const teamResult = await docClient.send(
      new GetCommand({
        TableName: TABLES.TEAMS,
        Key: { team_id: teamId },
      })
    );

    if (!teamResult.Item) {
      return res.status(404).json({ error: 'Team not found' });
    }

    // Get detailed progress
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

// Update team info
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

    // Get updated team
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

// Refresh team score from answers
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
