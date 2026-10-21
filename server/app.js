import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { buildRouter } from './routes/index.js';
import { AppError } from './utils/errors.js';
import { config } from './config.js';

export function createApp({ serveClient = false } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  // Basic security headers
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });

  app.use('/api', buildRouter());

  if (serveClient && fs.existsSync(config.clientDist)) {
    app.use(express.static(config.clientDist));
    app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(config.clientDist, 'index.html')));
  }

  // Central error handler → consistent JSON errors
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err instanceof AppError || err.status) {
      return res.status(err.status).json({ error: err.message, code: err.code, details: err.details });
    }
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed JSON body', code: 'BAD_JSON' });
    if (typeof err.code === 'string' && err.code.startsWith('SQLITE_CONSTRAINT')) {
      return res.status(409).json({ error: 'The operation violates a data integrity rule', code: err.code });
    }
    console.error(err);
    return res.status(500).json({ error: 'Internal server error', code: 'INTERNAL' });
  });
  return app;
}
