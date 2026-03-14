import { getUserByUsername, getUserByEmail, insertUser } from '../dao/userDao.js';
import { checkCaptchaForEmail } from '../utils/redis.js';
import { generateToken } from '../utils/jwt.js';
import { md5, getRandomNumbers, generateUserId } from '../utils/helpers.js';

export async function login(username, password) {
  const user = await getUserByUsername(username);
  if (!user) {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }
  if (user.password !== md5(password)) {
    const err = new Error('Invalid password');
    err.status = 401;
    throw err;
  }
  const token = generateToken({ id: user._id, username: user.username });
  return { token };
}

export async function register(email, password, captcha) {
  const valid = await checkCaptchaForEmail(email, captcha);
  if (!valid) {
    const err = new Error('Invalid or expired captcha');
    err.status = 400;
    throw err;
  }

  const existing = await getUserByEmail(email);
  if (existing) {
    const err = new Error('User already exists');
    err.status = 409;
    throw err;
  }

  const username = getRandomNumbers(11);
  const userData = {
    _id: generateUserId(),
    name: username,
    email,
    username,
    password: md5(password),
    created_at: new Date(),
    updated_at: new Date(),
  };
  await insertUser(userData);

  const token = generateToken({ id: userData._id, username });
  return { token };
}
