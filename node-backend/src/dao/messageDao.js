import Message from '../models/Message.js';

export async function getMessagesBySessionId(sessionId) {
  return Message.find({ session_id: sessionId }).sort({ created_at: 1 }).lean();
}

export async function getAllMessages() {
  return Message.find({}).sort({ created_at: 1 }).lean();
}

export async function createMessage(messageData) {
  const message = new Message(messageData);
  return message.save();
}
