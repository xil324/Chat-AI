import { v4 as uuidv4 } from 'uuid';
import { aiHelperManager } from '../utils/aihelper/AIHelperManager.js';
import { createSession, getSessionsByUserName } from '../dao/sessionDao.js';
import { createMessage, getMessagesBySessionId } from '../dao/messageDao.js';

export async function getSessions(userName) {
  const sessionIds = aiHelperManager.getSessions(userName);

  // Fall back to DB if nothing in memory (e.g. after restart)
  if (sessionIds.length === 0) {
    const dbSessions = await getSessionsByUserName(userName);
    return dbSessions.map((s) => ({ sessionId: s.id, name: s.title }));
  }

  // Fetch titles from DB for in-memory sessions
  const dbSessions = await getSessionsByUserName(userName);
  const titleMap = new Map(dbSessions.map((s) => [s.id, s.title]));
  return sessionIds.map((id) => ({ sessionId: id, name: titleMap.get(id) || id }));
}

export async function sendNewSession(userName, question, modelType) {
  const sessionId = uuidv4();

  // Persist session with question as title
  await createSession({
    id: sessionId,
    user_name: userName,
    title: question.slice(0, 100),
    created_at: new Date(),
    updated_at: new Date(),
  });

  // Get or create helper and generate response
  const helper = aiHelperManager.getOrCreate(userName, sessionId, modelType);
  const reply = await helper.generateResponse(question);

  // Persist both messages
  await saveMessages(sessionId, userName, question, reply);

  return { sessionId, message: reply };
}

export async function sendMessage(userName, sessionId, question, modelType) {
  const helper = aiHelperManager.getOrCreate(userName, sessionId, modelType);
  const reply = await helper.generateResponse(question);

  await saveMessages(sessionId, userName, question, reply);

  return { message: reply };
}

export async function getHistory(sessionId) {
  const messages = await getMessagesBySessionId(sessionId);
  return messages.map((m) => ({ is_user: m.is_user, content: m.content }));
}

async function saveMessages(sessionId, userName, userContent, aiContent) {
  const now = new Date();
  await createMessage({ session_id: sessionId, user_name: userName, content: userContent, is_user: true, created_at: now });
  await createMessage({ session_id: sessionId, user_name: userName, content: aiContent, is_user: false, created_at: new Date() });
}
