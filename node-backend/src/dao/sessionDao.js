import Session from '../models/Session.js';

export async function getSessionsByUserName(userName) {
  return Session.find({ user_name: userName }).sort({ created_at: 1 });
}

export async function getSessionById(sessionId) {
  return Session.findOne({ id: sessionId });
}

export async function createSession(sessionData) {
  const session = new Session(sessionData);
  return session.save();
}