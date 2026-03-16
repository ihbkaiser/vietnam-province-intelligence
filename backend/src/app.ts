import cors from 'cors';
import express from 'express';
import { provincesRouter } from './routes/provinces.js';
import { resolverRouter } from './routes/resolver.js';

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get('/api/health', (_request, response) => {
    response.json({ status: 'ok' });
  });

  app.use('/api/provinces', provincesRouter);
  app.use('/api', resolverRouter);

  return app;
}

