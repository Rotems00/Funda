import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import stocksRouter from './routes/stocks';
import usersRouter from './routes/users';
import authRouter from './routes/auth';
import portfolioRouter from './routes/portfolio';

/**
 * Builds the configured Express app WITHOUT connecting to MongoDB or starting a
 * listener — so it can be imported directly by Supertest in tests. The actual
 * DB connection + server start live in index.ts.
 */
export function createApp(): Express {
  const app: Express = express();

  // credentials: true + an explicit origin (not '*') is required for the
  // session cookie to be sent/accepted cross-origin (frontend :5173, backend :3001)
  app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173', credentials: true }));
  app.use(express.json());
  app.use(cookieParser());

  // Health check
  app.get('/health', (req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Mount API routes
  app.use('/api/stocks', stocksRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/portfolio', portfolioRouter);

  // 404 handler
  app.use((req: Request, res: Response) => {
    res.status(404).json({ error: 'Route not found' });
  });

  // Error handler
  app.use((err: any, req: Request, res: Response, _next: express.NextFunction) => {
    console.error('Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

export default createApp();
