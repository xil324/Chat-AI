import { getSessions, sendNewSession, sendMessage, getHistory } from '../services/chatService.js';

export async function handleGetSessions(req, res) {
  const userName = req.user.username;
  try {
    const sessions = await getSessions(userName);
    return res.status(200).json({ sessions });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

export async function handleSendNewSession(req, res) {
  const { question, modelType } = req.body;
  const userName = req.user.username;
  if (!question || !modelType) {
    return res.status(400).json({ error: 'question and modelType are required' });
  }
  try {
    const result = await sendNewSession(userName, question, modelType);
    return res.status(201).json(result);
  } catch (err) {
    const httpStatus = err.status && err.status !== 401 && err.status !== 403 ? err.status : 500;
    return res.status(httpStatus).json({ error: err.message });
  }
}

export async function handleSendMessage(req, res) {
  const { question, modelType, sessionId } = req.body;
  const userName = req.user.username;
  if (!question || !modelType || !sessionId) {
    return res.status(400).json({ error: 'question, modelType, and sessionId are required' });
  }
  try {
    const result = await sendMessage(userName, sessionId, question, modelType);
    return res.status(200).json(result);
  } catch (err) {
    const httpStatus = err.status && err.status !== 401 && err.status !== 403 ? err.status : 500;
    return res.status(httpStatus).json({ error: err.message });
  }
}

export async function handleGetHistory(req, res) {
  const { sessionId } = req.body;
  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId is required' });
  }
  try {
    const history = await getHistory(sessionId);
    return res.status(200).json({ history });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
