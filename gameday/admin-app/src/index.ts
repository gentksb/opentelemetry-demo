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
  console.log(`Game Day Admin Server (backend) running on port ${PORT}`);
  if (process.env.NODE_ENV !== 'production') {
    console.log(`Frontend dev server (Vite): http://localhost:5173/`);
    console.log(`  Team UI:  http://localhost:5173/`);
    console.log(`  Admin UI: http://localhost:5173/admin`);
    console.log(`Backend API: http://localhost:${PORT}/api/...`);
  } else {
    console.log(`Team UI:  http://localhost:${PORT}/`);
    console.log(`Admin UI: http://localhost:${PORT}/admin`);
  }
});
