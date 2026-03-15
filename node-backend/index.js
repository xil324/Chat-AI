import './src/config/index.js';
import { config } from './src/config/index.js';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import { initRedis } from './src/utils/redis.js';
import { initElasticsearch } from './src/utils/ragHelper/esClient.js';
import { aiHelperManager } from './src/utils/aihelper/AIHelperManager.js';
import { getAllMessages } from './src/dao/messageDao.js';
import userRouter from './src/routes/user.js';
import chatRouter from './src/routes/chat.js';
import documentRouter from './src/routes/document.js';

async function readDataFromDB() {
  const messages = await getAllMessages();
  for (const msg of messages) {
    const role = msg.is_user ? 'user' : 'assistant';
    aiHelperManager.loadMessage(msg.user_name, msg.session_id, '3', role, msg.content);
  }
  console.log(`AIHelperManager hydrated with ${messages.length} messages`);
}

async function main() {
  await mongoose.connect(`${config.mongo.uri}/${config.mongo.dbName}`);
  console.log('MongoDB connected');

  await readDataFromDB();
  initRedis();
  await initElasticsearch();

  const app = express();
  app.use(cors());
  app.use(express.json());

  const v1 = express.Router();
  v1.use('/user', userRouter);
  v1.use('/chat', chatRouter);
  v1.use('/document', documentRouter);
  app.use('/api/v1', v1);

  app.listen(config.server.port, config.server.host, () => {
    console.log(`Server running on ${config.server.host}:${config.server.port}`);
  });
}

main().catch((err) => {
  console.error('Startup error:', err);
  process.exit(1);
});
