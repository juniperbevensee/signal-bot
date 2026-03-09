/**
 * Express server for Signal Bot Web UI
 */

import express, { type Express } from 'express';
import cors from 'cors';
import { join } from 'path';
import type { DatabaseClient } from '../database/client';
import type { Agent } from '../agent/service';
import type { TaskScheduler } from '../scheduler/task-scheduler';

// Import routes
import { createChatRouter } from './routes/chat';
import { createSchedulerRouter } from './routes/scheduler';
import { createLogsRouter } from './routes/logs';
import { createStatsRouter } from './routes/stats';

export interface ServerDependencies {
  db: DatabaseClient;
  agent: Agent;
  scheduler: TaskScheduler;
  config: any;
}

export interface ServerOptions {
  port: number;
  isDev?: boolean;
  cors?: {
    origin: string | string[];
  };
}

export function createApp(dependencies: ServerDependencies, options: ServerOptions): Express {
  const app = express();

  // Middleware
  app.use(cors(options.cors || { origin: '*' }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Request logging (skip noisy polling endpoints)
  app.use((req, res, next) => {
    const skipPaths = ['/health', '/dashboard', '/performance', '/api/stats'];
    const shouldLog = !skipPaths.includes(req.path);

    if (shouldLog) {
      const start = Date.now();
      res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
      });
    }
    next();
  });

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // API routes
  app.use('/api/chat', createChatRouter(dependencies));
  app.use('/api/scheduler', createSchedulerRouter(dependencies));
  app.use('/api/logs', createLogsRouter(dependencies));
  app.use('/api/stats', createStatsRouter(dependencies));

  // Serve static files in production
  if (!options.isDev) {
    const staticPath = join(process.cwd(), 'web', 'dist');
    app.use(express.static(staticPath));

    // SPA fallback - serve index.html for all unmatched routes
    app.get('*', (req, res) => {
      res.sendFile(join(staticPath, 'index.html'));
    });
  }

  // Error handling middleware
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Server error:', err);
    res.status(err.status || 500).json({
      error: err.message || 'Internal server error',
      ...(options.isDev && { stack: err.stack }),
    });
  });

  return app;
}

export function startServer(
  app: Express,
  port: number
): Promise<{ close: () => Promise<void> }> {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, () => {
      console.log(`✓ Web UI started on http://localhost:${port}`);
      resolve({
        close: () => {
          return new Promise((resolve, reject) => {
            server.close((err) => {
              if (err) reject(err);
              else resolve();
            });
          });
        },
      });
    });

    server.on('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        reject(new Error(`Port ${port} is already in use`));
      } else {
        reject(err);
      }
    });
  });
}
