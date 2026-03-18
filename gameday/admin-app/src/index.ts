// 環境変数を他のインポートより先に読み込む
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import app from './app';

const PORT = Number(process.env.PORT) || 3000;

// フロントエンドページの配信
app.get('/', serveStatic({ root: './public', path: 'index.html' }));
app.get('/admin', serveStatic({ root: './public', path: 'admin.html' }));

// 静的ファイル配信
app.use('/*', serveStatic({ root: './public' }));

serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`Game Day Admin Server running on port ${PORT}`);
  console.log(`Team UI: http://localhost:${PORT}/`);
  console.log(`Admin UI: http://localhost:${PORT}/admin`);
});
