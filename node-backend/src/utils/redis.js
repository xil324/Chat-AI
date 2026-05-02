import Redis from 'ioredis';
import { config } from '../config/index.js';

let client;
let readyPromise;

function createRedisClient() {
  return new Redis({
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password || undefined,
    db: config.redis.db,
  });
}

export function initRedis() {
  client = createRedisClient();

  readyPromise = new Promise((resolve, reject) => {
    client.once('ready', resolve);
    client.once('error', reject);
  });

  client.on('connect', () => console.log('Redis connected'));
  client.on('ready', () => console.log('Redis ready'));
  client.on('error', (err) => console.error('Redis error:', err));
  return client;
}

export function getRedisClient() {
  return client;
}

export function createRedisWorkerClient() {
  return createRedisClient();
}

export async function waitForRedisReady(timeoutMs = 3000) {
  if (!readyPromise) throw new Error('Redis client is not initialized');

  return Promise.race([
    readyPromise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Redis ready timeout')), timeoutMs),
    ),
  ]);
}

const CAPTCHA_TTL = 120; // 2 minutes

export async function setCaptchaForEmail(email, code) {
  await client.set(`captcha:${email}`, code, 'EX', CAPTCHA_TTL);
}

export async function checkCaptchaForEmail(email, input) {
  const stored = await client.get(`captcha:${email}`);
  if (!stored) return false;
  if (stored.toLowerCase() !== input.toLowerCase()) return false;
  await client.del(`captcha:${email}`);
  return true;
}
