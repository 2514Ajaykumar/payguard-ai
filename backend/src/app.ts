import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config/env';
import apiRouter from './routes/api.router';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';
import { requestLogger } from './middleware/logger.middleware';

export const createApp = (): Application => {
  const app = express();

  // Security headers
  app.use(helmet());

  // CORS configuration: explicit origins only, no unrestricted wildcard
  const allowedOrigins = (
    Array.isArray(config.corsOrigin) ? config.corsOrigin : [config.corsOrigin]
  ).map((o) => o.replace(/\/+$/, ''));

  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (e.g. curl, server-to-server, Render health checks)
        if (!origin) {
          return callback(null, true);
        }
        const normalized = origin.replace(/\/+$/, '');
        if (
          allowedOrigins.includes(normalized) ||
          (config.nodeEnv === 'development' &&
            (normalized.startsWith('http://localhost:') || normalized.startsWith('http://127.0.0.1:')))
        ) {
          callback(null, true);
        } else {
          callback(new Error(`Origin ${origin} not allowed by CORS`));
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    })
  );

  // Request parsing
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Logging
  app.use(requestLogger);

  // Root redirect/status
  app.get('/', (req, res) => {
    res.json({
      message: 'PayGuard AI API Server is running.',
      healthCheck: '/api/health',
      docs: '/api',
    });
  });

  // Mount API endpoints
  app.use('/api', apiRouter);

  // 404 handling
  app.use(notFoundHandler);

  // Centralized Error handling
  app.use(errorHandler);

  return app;
};
