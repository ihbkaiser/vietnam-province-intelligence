import cors from 'cors';
import express from 'express';
import { provincesRouter } from './routes/provinces.js';
import { resolverRouter } from './routes/resolver.js';
// 1. Thêm import chatRouter (Nhớ để đuôi .js cho đồng bộ với dự án)
import chatRouter from './routes/chat.js';

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get('/api/health', (_request, response) => {
    response.json({ status: 'ok' });
  });

  app.use('/api/provinces', provincesRouter);
  app.use('/api', resolverRouter);
  
  // 2. Đăng ký luồng xử lý chat vào hệ thống
  app.use('/api', chatRouter);

  return app;
}