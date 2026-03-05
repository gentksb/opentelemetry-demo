// 環境変数を他のインポートより先に読み込む
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import express from 'express';
import cors from 'cors';

import { docClient, TABLES, ScanCommand } from './services/dynamodb';
import teamsRouter from './routes/teams';
import answersRouter from './routes/answers';
import adminRouter from './routes/admin';
import questionsRouter from './routes/questions';
import { getGameState, getGameStartedAt, getSplunkOrgId, getAstronomyShopUrl, getOtelEnv } from './routes/admin';

const app = express();
const PORT = process.env.PORT || 3000;

// ミドルウェア
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// 管理API用の簡易認証ミドルウェア
const adminAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    // パスワード未設定時は認証スキップ（開発環境用）
    return next();
  }

  // Bearer トークンによる認証
  const authHeader = req.headers.authorization;
  if (authHeader === `Bearer ${adminPassword}`) {
    return next();
  }

  // Cookie ベースの認証（ブラウザアクセス用）
  const cookies = req.headers.cookie?.split(';').map(c => c.trim()) || [];
  const authCookie = cookies.find(c => c.startsWith('admin_token='));
  if (authCookie && authCookie.split('=')[1] === adminPassword) {
    return next();
  }

  res.status(401).json({ error: 'Unauthorized' });
};

// ゲーム状態取得（公開API、認証不要 - 参加者画面からも取得するため）
app.get('/api/game/state', (req, res) => {
  const state = getGameState();
  const startedAt = getGameStartedAt();
  const elapsedMinutes = startedAt
    ? (Date.now() - new Date(startedAt).getTime()) / 60000
    : 0;
  res.json({
    state,
    started_at: startedAt,
    elapsed_minutes: Math.round(elapsedMinutes * 100) / 100,
  });
});

// 参加者向けリーダーボード（公開API、認証不要）
app.get('/api/leaderboard', async (req, res) => {
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
    res.json({ teams });
  } catch (error) {
    console.error('Error getting leaderboard:', error);
    res.status(500).json({ error: 'Failed to get leaderboard' });
  }
});

// 環境設定取得（公開API - チーム画面でO11y Cloudフィルタ情報を表示するため）
app.get('/api/config', (req, res) => {
  res.json({
    cluster_name: process.env.CLUSTER_NAME || '',
    splunk_realm: process.env.SPLUNK_REALM || 'jp0',
    splunk_org_id: getSplunkOrgId(),
    astronomy_shop_url: getAstronomyShopUrl(),
    otel_env: getOtelEnv(),
  });
});

// APIルート
app.use('/api/teams', teamsRouter);
app.use('/api/answers', answersRouter);
app.use('/api/admin', adminAuth, adminRouter);
app.use('/api/questions', questionsRouter);

// ヘルスチェック
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// フロントエンドページの配信（Viteビルド出力: index.html, admin.html）
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/admin.html'));
});

// エラーハンドリングミドルウェア
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

app.listen(PORT, () => {
  console.log(`Game Day Admin Server running on port ${PORT}`);
  console.log(`Team UI: http://localhost:${PORT}/`);
  console.log(`Admin UI: http://localhost:${PORT}/admin`);
});

export default app;
