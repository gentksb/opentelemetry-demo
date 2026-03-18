import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { MiddlewareHandler } from 'hono';
import { docClient, TABLES, ScanCommand } from './services/dynamodb';
import { getSettings } from './services/settings';
import teamsRouter from './routes/teams';
import answersRouter from './routes/answers';
import adminRouter from './routes/admin';
import questionsRouter from './routes/questions';
import { getElapsedMinutes } from './utils/time';

const app = new Hono();

app.use('*', cors());

const adminAuth: MiddlewareHandler = async (c, next) => {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    await next();
    return;
  }

  const authHeader = c.req.header('authorization');
  if (authHeader === `Bearer ${adminPassword}`) {
    await next();
    return;
  }

  const cookie = c.req.header('cookie') || '';
  const cookies = cookie.split(';').map((s) => s.trim());
  const authCookie = cookies.find((s) => s.startsWith('admin_token='));
  if (authCookie && authCookie.split('=')[1] === adminPassword) {
    await next();
    return;
  }

  return c.json({ error: 'Unauthorized' }, 401);
};

// ゲーム状態取得（公開API）
app.get('/api/game/state', async (c) => {
  try {
    const settings = await getSettings();
    const startedAt = settings.game_started_at || null;
    const elapsedMinutes = getElapsedMinutes(startedAt);
    return c.json({
      state: settings.game_state,
      started_at: startedAt,
      elapsed_minutes: Math.round(elapsedMinutes * 100) / 100,
    });
  } catch (error) {
    console.error('Error getting game state:', error);
    return c.json({ error: 'Failed to get game state' }, 500);
  }
});

// 参加者向けリーダーボード（公開API）
app.get('/api/leaderboard', async (c) => {
  try {
    const result = await docClient.send(new ScanCommand({ TableName: TABLES.TEAMS }));
    const teams = (result.Items || [])
      .map((t) => ({
        team_id: t.team_id,
        team_name: t.team_name,
        total_score: t.total_score || 0,
        questions_correct: t.questions_correct || 0,
        current_stage: t.current_stage || 1,
      }))
      .sort((a, b) => b.total_score - a.total_score)
      .map((t, i) => ({ rank: i + 1, ...t }));
    return c.json({ teams });
  } catch (error) {
    console.error('Error getting leaderboard:', error);
    return c.json({ error: 'Failed to get leaderboard' }, 500);
  }
});

// 環境設定取得（公開API）
app.get('/api/config', async (c) => {
  try {
    const settings = await getSettings();
    return c.json({
      cluster_name: process.env.CLUSTER_NAME || '',
      splunk_realm: process.env.SPLUNK_REALM || 'jp0',
      splunk_org_id: settings.splunk_org_id,
      astronomy_shop_url: settings.astronomy_shop_url,
      otel_env: settings.otel_env,
      itsi_url: settings.itsi_url,
      itsi_username: settings.itsi_username,
      itsi_password: settings.itsi_password,
    });
  } catch (error) {
    console.error('Error getting config:', error);
    return c.json({ error: 'Failed to get config' }, 500);
  }
});

// ヘルスチェック
app.get('/health', (c) => {
  return c.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// 管理APIに認証ミドルウェアを適用
app.use('/api/admin/*', adminAuth);

// APIルート
app.route('/api/teams', teamsRouter);
app.route('/api/answers', answersRouter);
app.route('/api/admin', adminRouter);
app.route('/api/questions', questionsRouter);

// エラーハンドリング
app.onError((err, c) => {
  console.error('Error:', err);
  return c.json({ error: 'Internal server error', message: err.message }, 500);
});

export default app;
