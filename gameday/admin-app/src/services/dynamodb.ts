import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || 'ap-northeast-1',
});

export const docClient = DynamoDBDocumentClient.from(client);

// Table names
export const TABLES = {
  TEAMS: process.env.TEAMS_TABLE || 'gameday-teams',
  ANSWERS: process.env.ANSWERS_TABLE || 'gameday-answers',
  QUESTIONS: process.env.QUESTIONS_TABLE || 'gameday-questions',
};

export { PutCommand, GetCommand, QueryCommand, ScanCommand, UpdateCommand, DeleteCommand };
