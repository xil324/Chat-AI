import Redis from 'ioredis';
import { config } from '../config/index.js';

let client;

export function initRedis() {
  client = new Redis({
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password || undefined,
    db: config.redis.db,
  });

  client.on('connect', () => console.log('Redis connected'));
  client.on('error', (err) => console.error('Redis error:', err));
  return client;
}

export function getRedisClient() {
  return client;
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
