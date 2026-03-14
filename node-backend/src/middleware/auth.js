import { parseToken } from '../utils/jwt.js';

export function auth(req, res, next) {
  let token = req.headers['authorization'];
  if (token?.startsWith('Bearer ')) {
    token = token.slice(7);
  } else {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({ error: 'Missing token' });
  }

  try {
    const payload = parseToken(token);
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}
