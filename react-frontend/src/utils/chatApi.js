import api from './api'

export const getSessions = () =>
  api.get('/chat/sessions')

export const getChatHistory = (sessionId) =>
  api.post('/chat/history', { sessionId: String(sessionId) })

export const sendNewSession = (question, modelType) =>
  api.post('/chat/send-new-session', { question, modelType })

export const sendMessage = (question, modelType, sessionId) =>
  api.post('/chat/send', { question, modelType, sessionId })

export const getTTS = (text) =>
  api.post('/chat/tts', { text })
