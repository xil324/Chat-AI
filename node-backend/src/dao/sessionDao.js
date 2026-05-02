import Session from '../models/Session.js';

export async function getSessionsByUserName(userName) {
  return Session.find({ user_name: userName }).sort({ created_at: 1 }).lean();
}

export async function getSessionById(sessionId) {
  return Session.findOne({ id: sessionId }).lean();
}

export async function createSession(sessionData) {
  const session = new Session(sessionData);
  return session.save();
}

export async function updateAttachedDocument(sessionId, documentId) {
  return Session.updateOne({ id: sessionId }, { attached_document_id: documentId });
}

export async function clearAttachedDocument(sessionId) {
  return Session.updateOne({ id: sessionId }, { attached_document_id: null });
}
