import express from 'express';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';

import teamsRouter from './routes/teams';
import answersRouter from './routes/answers';
import adminRouter from './routes/admin';
import questionsRouter from './routes/questions';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// API Routes
app.use('/api/teams', teamsRouter);
app.use('/api/answers', answersRouter);
app.use('/api/admin', adminRouter);
app.use('/api/questions', questionsRouter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Serve frontend pages
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/team.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/admin.html'));
});

// Error handling middleware
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
