import api from './api'

export const listDocuments = () =>
  api.get('/document/list')

export const uploadDocument = (formData) =>
  api.post('/document/upload', formData)

export const deleteDocument = (docId) =>
  api.delete(`/document/${docId}`)

export const attachDocument = (sessionId, documentId) =>
  api.post('/document/attach', { sessionId, documentId })

export const detachDocument = (sessionId) =>
  api.post('/document/detach', { sessionId })
