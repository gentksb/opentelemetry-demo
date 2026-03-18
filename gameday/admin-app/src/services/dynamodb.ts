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
import dotenv from 'dotenv';
import path from 'path';

// Load .env before initializing DynamoDB client
// Use __dirname to ensure we find .env relative to this file
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

interface ClientConfig {
  region: string;
  endpoint?: string;
  credentials?: { accessKeyId: string; secretAccessKey: string };
}

const clientConfig: ClientConfig = {
  region: process.env.AWS_REGION || 'ap-northeast-1',
};

// Support for DynamoDB Local
if (process.env.DYNAMODB_ENDPOINT) {
  clientConfig.endpoint = process.env.DYNAMODB_ENDPOINT;
  // DynamoDB Local requires dummy credentials
  clientConfig.credentials = {
    accessKeyId: 'dummy',
    secretAccessKey: 'dummy',
  };
}

const client = new DynamoDBClient(clientConfig);

export const docClient = DynamoDBDocumentClient.from(client);

// Table names
export const TABLES = {
  TEAMS: process.env.TEAMS_TABLE || 'gameday-teams',
  ANSWERS: process.env.ANSWERS_TABLE || 'gameday-answers',
  QUESTIONS: process.env.QUESTIONS_TABLE || 'gameday-questions',
  SETTINGS: process.env.SETTINGS_TABLE || 'gameday-settings',
};

export { PutCommand, GetCommand, QueryCommand, ScanCommand, UpdateCommand, DeleteCommand };
