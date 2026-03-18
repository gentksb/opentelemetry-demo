import { docClient, TABLES, GetCommand, UpdateCommand } from './dynamodb';

export interface GameSettings {
  game_state: 'waiting' | 'active' | 'finished';
  game_started_at: string | null;
  splunk_org_id: string;
  astronomy_shop_url: string;
  otel_env: string;
  itsi_url: string;
  itsi_username: string;
  itsi_password: string;
}

const SETTINGS_KEY = 'global';

const DEFAULTS: GameSettings = {
  game_state: 'waiting',
  game_started_at: null,
  splunk_org_id: '',
  astronomy_shop_url: '',
  otel_env: '',
  itsi_url: '',
  itsi_username: '',
  itsi_password: '',
};

// Simple 1-second in-process cache to reduce DynamoDB reads on polling endpoints
let cache: { value: GameSettings; expiresAt: number } | null = null;
const CACHE_TTL_MS = 1000;

export async function getSettings(): Promise<GameSettings> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) {
    return cache.value;
  }

  const result = await docClient.send(
    new GetCommand({
      TableName: TABLES.SETTINGS,
      Key: { setting_key: SETTINGS_KEY },
    })
  );

  const item = result.Item;
  const value: GameSettings = {
    game_state: (item?.game_state as GameSettings['game_state']) || DEFAULTS.game_state,
    game_started_at: item?.game_started_at || null,
    splunk_org_id: item?.splunk_org_id || '',
    astronomy_shop_url: item?.astronomy_shop_url || '',
    otel_env: item?.otel_env || '',
    itsi_url: item?.itsi_url || '',
    itsi_username: item?.itsi_username || '',
    itsi_password: item?.itsi_password || '',
  };

  cache = { value, expiresAt: now + CACHE_TTL_MS };
  return value;
}

export async function updateSettings(partial: Partial<GameSettings>): Promise<void> {
  // Invalidate cache on write
  cache = null;

  const entries = Object.entries(partial).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return;

  const sets: string[] = [];
  const names: Record<string, string> = {};
  const values: Record<string, string | null> = {};

  for (const [key, val] of entries) {
    const nameToken = `#${key}`;
    const valToken = `:${key}`;
    sets.push(`${nameToken} = ${valToken}`);
    names[nameToken] = key;
    // Store null game_started_at as empty string since DynamoDB cannot store JSON null
    values[valToken] = val === null ? '' : (val as string);
  }

  await docClient.send(
    new UpdateCommand({
      TableName: TABLES.SETTINGS,
      Key: { setting_key: SETTINGS_KEY },
      UpdateExpression: `SET ${sets.join(', ')}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    })
  );
}
