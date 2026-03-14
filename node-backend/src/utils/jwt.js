import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';

export function generateToken(payload) {
  return jwt.sign(payload, config.jwt.key, {
    expiresIn: `${config.jwt.expireHours}h`,
  });
}

export function parseToken(token) {
  return jwt.verify(token, config.jwt.key);
}