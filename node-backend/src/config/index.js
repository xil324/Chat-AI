import dotenv from 'dotenv';

dotenv.config();

function toInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const config = {
  server: {
    host: process.env.SERVER_HOST || '0.0.0.0',
    port: toInt(process.env.SERVER_PORT, 9090),
  },
  mongo: {
    uri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017',
    dbName: process.env.MONGO_DB_NAME || 'chat_ai',
  },
  redis: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: toInt(process.env.REDIS_PORT, 6379),
    password: process.env.REDIS_PASSWORD || '',
    db: toInt(process.env.REDIS_DB, 0),
  },
  elasticsearch: {
    url: process.env.ELASTICSEARCH_URL || 'http://127.0.0.1:9200',
  },
  embeddingService: {
    url: process.env.EMBEDDING_SERVICE_URL || 'http://127.0.0.1:8001',
  },
  rerankerService: {
    url: process.env.RERANKER_SERVICE_URL || 'http://127.0.0.1:8002',
  },
  ollama: {
    baseURL: process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434',
    modelName: process.env.OLLAMA_MODEL_NAME || 'llama3',
  },
  claude: {
    apiKey: process.env.CLAUDE_API_KEY || '',
    model: process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001',
  },
  jwt: {
    key: process.env.JWT_KEY || 'chat-ai-dev-secret',
    expireHours: toInt(process.env.JWT_EXPIRE_HOURS, 72),
  },
  email: {
    address: process.env.EMAIL_ADDRESS || '',
    appPassword: process.env.EMAIL_APP_PASSWORD || '',
    smtpHost: process.env.EMAIL_SMTP_HOST || 'smtp.gmail.com',
    smtpPort: toInt(process.env.EMAIL_SMTP_PORT, 465),
  },
  defaultModelType: process.env.DEFAULT_MODEL_TYPE || '3',
  ingestion: {
    workerConcurrency: toInt(process.env.INGESTION_WORKER_CONCURRENCY, 1),
    maxRetries: toInt(process.env.INGESTION_MAX_RETRIES, 3),
  },
};

export default config;
