import './src/config/index.js'; // load dotenv first
import { config } from './src/config/index.js';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import { initRedis } from './src/utils/redis.js';
import { initImageRecognizer } from './src/utils/image.js';
import { aiHelperManager } from './src/utils/aihelper/AIHelperManager.js';
import { getAllMessages } from './src/dao/messageDao.js';
import userRouter from './src/routes/user.js';
import chatRouter from './src/routes/chat.js';
import imageRouter from './src/routes/image.js';

async function readDataFromDB() {
  const messages = await getAllMessages();
  for (const msg of messages) {
    const role = msg.is_user ? 'user' : 'assistant';
    // Default to Claude (type "3") when rehydrating; model won't be called
    aiHelperManager.loadMessage(msg.user_name, msg.session_id, '3', role, msg.content);
  }
  console.log(`AIHelperManager hydrated with ${messages.length} messages`);
}

async function main() {
  // Connect to MongoDB
  await mongoose.connect(`${config.mongo.uri}/${config.mongo.dbName}`);
  console.log('MongoDB connected');

  // Load conversation history into memory
  await readDataFromDB();

  // Connect to Redis
  initRedis();

  // Initialize image recognizer (optional)
  await initImageRecognizer();

  // Build Express app
  const app = express();
  app.use(cors());
  app.use(express.json());

  const v1 = express.Router();
  v1.use('/user', userRouter);
  v1.use('/chat', chatRouter);
  v1.use('/image', imageRouter);
  app.use('/api/v1', v1);

  app.listen(config.server.port, config.server.host, () => {
    console.log(`Server running on ${config.server.host}:${config.server.port}`);
  });
}

main().catch((err) => {
  console.error('Startup error:', err);
  process.exit(1);
});
