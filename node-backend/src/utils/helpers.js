import crypto from 'crypto';

export function md5(str) {
  return crypto.createHash('md5').update(str).digest('hex');
}

export function getRandomNumbers(n) {
  let result = '';
  for (let i = 0; i < n; i++) {
    result += Math.floor(Math.random() * 10).toString();
  }
  return result;
}

export function generateUserId() {
  return Date.now() * 1000 + Math.floor(Math.random() * 1000);
}