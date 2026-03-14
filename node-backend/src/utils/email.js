import nodemailer from 'nodemailer';
import { config } from '../config/index.js';

export async function sendCaptchaEmail(toEmail, code) {
  const { address, appPassword, smtpHost, smtpPort } = config.email;

  // Dev mode: log to console if email not configured
  if (!address || !appPassword) {
    console.log(`[DEV] Captcha for ${toEmail}: ${code}`);
    return;
  }

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: false,
    auth: { user: address, pass: appPassword },
  });

  await transporter.sendMail({
    from: address,
    to: toEmail,
    subject: 'Your verification code',
    text: `Your verification code is: ${code}`,
  });
}
