import { login, register } from '../services/userService.js';
import { setCaptchaForEmail } from '../utils/redis.js';
import { sendCaptchaEmail } from '../utils/email.js';
import { getRandomNumbers } from '../utils/helpers.js';

export async function handleLogin(req, res) {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }
  try {
    const result = await login(username, password);
    return res.status(200).json(result);
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
}

export async function handleRegister(req, res) {
  const { email, password, captcha } = req.body;
  if (!email || !password || !captcha) {
    return res.status(400).json({ error: 'email, password, and captcha are required' });
  }
  try {
    const result = await register(email, password, captcha);
    return res.status(201).json(result);
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
}

export async function handleCaptcha(req, res) {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'email is required' });
  }
  try {
    const code = getRandomNumbers(6);
    await setCaptchaForEmail(email, code);
    await sendCaptchaEmail(email, code);
    return res.status(200).json({ message: 'Captcha sent' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
