import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box,
  Button,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Typography,
  IconButton,
  Snackbar,
  Alert
} from '@mui/material'
import VolumeUpIcon from '@mui/icons-material/VolumeUp'
import FolderIcon from '@mui/icons-material/Folder'
import Chip from '@mui/material/Chip'
import PDFLibrary from '../components/PDFLibrary'
import api from '../utils/api'

function AIChat() {
  const navigate = useNavigate()
  const [sessions, setSessions] = useState({})
  const [currentSessionId, setCurrentSessionId] = useState(null)
  const [tempSession, setTempSession] = useState(false)
  const [currentMessages, setCurrentMessages] = useState([])
  const [inputMessage, setInputMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [selectedModel, setSelectedModel] = useState('2')
  const [error, setError] = useState('')
  const messagesRef = useRef(null)
  const messageInputRef = useRef(null)
  const [pdfLibraryOpen, setPdfLibraryOpen] = useState(false)
  const [attachedDoc, setAttachedDoc] = useState(null) // { id, filename } | null

  const renderMarkdown = (text) => {
    if (!text && text !== '') return ''
    return String(text)
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br>')
  }

  const scrollToBottom = () => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight
    }
  }

  const playTTS = async (text) => {
    try {
      const response = await api.post('/chat/tts', { text })
      if (response.data && response.data.status_code === 1000 && response.data.url) {
        const audio = new Audio(response.data.url)
        audio.play()
      } else {
        setError('Unable to get audio')
      }
    } catch (err) {
      console.error('TTS error:', err)
      setError('TTS API request failed')
    }
  }

  const loadSessions = async () => {
    try {
      const response = await api.get('/chat/sessions')
      if (response.data && Array.isArray(response.data.sessions)) {
        const sessionMap = {}
        response.data.sessions.forEach(s => {
          const sid = String(s.sessionId)
          sessionMap[sid] = {
            id: sid,
            name: s.name || `Session ${sid}`,
            attachedDocumentId: s.attachedDocumentId || null,
            attachedDocumentName: s.attachedDocumentName || '',
            messages: []
          }
        })
        setSessions(sessionMap)
      }
    } catch (err) {
      console.error('Load sessions error:', err)
    }
  }

  const createNewSession = () => {
    setCurrentSessionId('temp')
    setTempSession(true)
    setCurrentMessages([])
    setAttachedDoc(null)
    if (messageInputRef.current) {
      messageInputRef.current.focus()
    }
  }

  const switchSession = async (sessionId) => {
    if (!sessionId) return
    setCurrentSessionId(String(sessionId))
    setTempSession(false)
    // Sync attached document from session data
    const sessionData = sessions[String(sessionId)]
    if (sessionData?.attachedDocumentId) {
      setAttachedDoc({ id: sessionData.attachedDocumentId, filename: sessionData.attachedDocumentName || '' })
    } else {
      setAttachedDoc(null)
    }

    if (!sessions[sessionId]?.messages || sessions[sessionId].messages.length === 0) {
      try {
        const response = await api.post('/chat/history', { sessionId: String(sessionId) })
        if (response.data && Array.isArray(response.data.history)) {
          const messages = response.data.history.map(item => ({
            role: item.is_user ? 'user' : 'assistant',
            content: item.content
          }))
          setSessions(prev => ({
            ...prev,
            [sessionId]: {
              ...prev[sessionId],
              messages
            }
          }))
          setCurrentMessages(messages)
        }
      } catch (err) {
        console.error('Load history error:', err)
      }
    } else {
      setCurrentMessages([...sessions[sessionId].messages])
    }
    setTimeout(scrollToBottom, 100)
  }

  const handleNormal = async (question) => {
    if (tempSession || !currentSessionId || currentSessionId === 'temp') {
      const response = await api.post('/chat/send-new-session', {
        question,
        modelType: selectedModel
      })
      const sessionId = String(response.data.sessionId)
      const aiMessage = {
        role: 'assistant',
        content: response.data.message || ''
      }
      setSessions(prev => ({
        ...prev,
        [sessionId]: {
          id: sessionId,
          name: question.slice(0, 30),
          messages: [{ role: 'user', content: question }, aiMessage]
        }
      }))
      setCurrentSessionId(sessionId)
      setTempSession(false)
      setCurrentMessages([{ role: 'user', content: question }, aiMessage])
    } else {
      const sessionMsgs = [...(sessions[currentSessionId]?.messages || [])]
      sessionMsgs.push({ role: 'user', content: question })

      const response = await api.post('/chat/send', {
        question,
        modelType: selectedModel,
        sessionId: currentSessionId
      })
      const aiMessage = { role: 'assistant', content: response.data.message || '' }
      sessionMsgs.push(aiMessage)
      setSessions(prev => ({
        ...prev,
        [currentSessionId]: {
          ...prev[currentSessionId],
          messages: sessionMsgs
        }
      }))
      setCurrentMessages([...sessionMsgs])
    }
  }

  const sendMessage = async () => {
    if (!inputMessage.trim()) {
      setError('Please enter message content')
      return
    }

    const userMessage = {
      role: 'user',
      content: inputMessage
    }
    const currentInput = inputMessage
    setInputMessage('')

    setCurrentMessages(prev => [...prev, userMessage])
    setTimeout(scrollToBottom, 100)

    try {
      setLoading(true)
      await handleNormal(currentInput)
    } catch (err) {
      console.error('Send message error:', err)
      setError('Failed to send, please try again')
      if (!tempSession && currentSessionId && sessions[currentSessionId]?.messages) {
        const sessionArr = sessions[currentSessionId].messages
        if (Array.isArray(sessionArr) && sessionArr.length) sessionArr.pop()
      }
      setCurrentMessages(prev => prev.slice(0, -1))
    } finally {
      setLoading(false)
      setTimeout(scrollToBottom, 100)
    }
  }

  useEffect(() => {
    loadSessions()
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [currentMessages])

  const sessionsList = Object.values(sessions)

  return (
    <Box sx={{ height: '100vh', display: 'flex', background: '#000' }}>
      {/* Sidebar */}
      <Box sx={{ width: 240, height: '100vh', borderRight: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column' }}>
        {/* Logo */}
        <Box sx={{ px: 3, py: 2.5, borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography sx={{ color: '#fff', fontWeight: 800, fontSize: '1rem', letterSpacing: '-0.5px' }}>Sixi AI</Typography>
          <Button onClick={() => navigate('/menu')} sx={{ color: '#999', textTransform: 'none', minWidth: 0, p: 0.5, fontSize: '0.75rem', '&:hover': { color: '#fff', background: 'transparent' } }}>
            ← Menu
          </Button>
        </Box>

        {/* New Chat */}
        <Box sx={{ p: 2 }}>
          <Button fullWidth onClick={createNewSession} variant="outlined"
            sx={{ borderColor: 'rgba(255,255,255,0.1)', color: '#888', borderRadius: '10px', textTransform: 'none', fontSize: '0.875rem', py: 1,
              '&:hover': { borderColor: 'rgba(255,255,255,0.3)', color: '#fff', background: 'transparent' } }}>
            + New chat
          </Button>
        </Box>

        {/* Sessions */}
        <Box sx={{ flex: 1, overflowY: 'auto', px: 1.5 }}>
          <Typography sx={{ color: '#777', fontSize: '0.7rem', fontWeight: 600, letterSpacing: '1px', textTransform: 'uppercase', px: 1.5, mb: 1 }}>Recent</Typography>
          {sessionsList.map(session => (
            <Box key={session.id} onClick={() => switchSession(session.id)}
              sx={{ px: 1.5, py: 1.2, mb: 0.5, cursor: 'pointer', borderRadius: '8px',
                background: currentSessionId === session.id ? 'rgba(255,255,255,0.08)' : 'transparent',
                color: currentSessionId === session.id ? '#fff' : '#bbb',
                fontSize: '0.83rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                '&:hover': { background: 'rgba(255,255,255,0.05)', color: '#ddd' }
              }}>
              {session.name || `Chat ${session.id.slice(0, 8)}`}
            </Box>
          ))}
        </Box>
      </Box>

      {/* Main chat area */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

{/* Messages */}
        <Box ref={messagesRef} sx={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 0 }}>
          {currentMessages.length === 0 && !loading && (
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 400, px: 4, textAlign: 'center' }}>
              <Box sx={{ width: 56, height: 56, borderRadius: '16px', background: 'rgba(99,179,140,0.12)', border: '1px solid rgba(99,179,140,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 3, fontSize: '1.5rem', color: '#63b38c', fontWeight: 700 }}>
                S
              </Box>
              <Typography sx={{ color: '#fff', fontWeight: 700, fontSize: '1.4rem', letterSpacing: '-0.5px', mb: 1 }}>
                How can I help you?
              </Typography>
              <Typography sx={{ color: '#777', fontSize: '0.9rem', maxWidth: 360 }}>
                Start a conversation below. {attachedDoc ? `Chatting with context from "${attachedDoc.filename}".` : 'You can attach a PDF for document Q&A.'}
              </Typography>
            </Box>
          )}
          <Box sx={{ flex: 1, maxWidth: 760, width: '100%', mx: 'auto', px: 4, py: 4, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {currentMessages.map((message, index) => (
              <Box key={index} sx={{ display: 'flex', gap: 2.5, alignItems: 'flex-start', flexDirection: message.role === 'user' ? 'row-reverse' : 'row' }}>
                {/* Avatar */}
                <Box sx={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 700,
                  background: message.role === 'user' ? 'rgba(59,130,246,0.2)' : 'rgba(99,179,140,0.18)',
                  color: message.role === 'user' ? '#93c5fd' : '#63b38c',
                  border: message.role === 'user' ? '1px solid rgba(59,130,246,0.35)' : '1px solid rgba(99,179,140,0.3)' }}>
                  {message.role === 'user' ? 'Y' : 'S'}
                </Box>
                <Box sx={{ flex: 1, maxWidth: message.role === 'user' ? '75%' : '100%' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.75,
                    justifyContent: message.role === 'user' ? 'flex-end' : 'flex-start' }}>
                    <Typography sx={{ color: message.role === 'user' ? '#93c5fd' : '#63b38c', fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.5px' }}>
                      {message.role === 'user' ? 'You' : 'Sixi'}
                    </Typography>
                    {message.role === 'assistant' && (
                      <IconButton size="small" onClick={() => playTTS(message.content)} sx={{ color: '#555', p: 0.25, '&:hover': { color: '#999', background: 'transparent' } }}>
                        <VolumeUpIcon sx={{ fontSize: 13 }} />
                      </IconButton>
                    )}
                  </Box>
                  <Box dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }}
                    sx={{
                      color: message.role === 'user' ? '#e8e8e8' : '#d4d4d4',
                      fontSize: '0.95rem', lineHeight: 1.75, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                      background: message.role === 'user' ? 'rgba(59,130,246,0.15)' : 'rgba(99,179,140,0.05)',
                      border: message.role === 'user' ? '1px solid rgba(59,130,246,0.25)' : '1px solid rgba(99,179,140,0.12)',
                      borderRadius: message.role === 'user' ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
                      px: 2.5, py: 1.75
                    }} />
                </Box>
              </Box>
            ))}
            {loading && (
              <Box sx={{ display: 'flex', gap: 3, alignItems: 'flex-start' }}>
                <Box sx={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 700,
                  background: 'rgba(99,179,140,0.18)', color: '#63b38c', border: '1px solid rgba(99,179,140,0.3)' }}>S</Box>
                <Box sx={{ pt: 0.5 }}>
                  <Typography sx={{ color: '#63b38c', fontSize: '0.78rem', fontWeight: 700, mb: 1.5 }}>Sixi</Typography>
                  <Box sx={{ display: 'flex', gap: 0.75 }}>
                    {[0, 1, 2].map(i => (
                      <Box key={i} sx={{ width: 6, height: 6, borderRadius: '50%', background: '#666',
                        animation: 'bounce 1.2s infinite', animationDelay: `${i * 0.2}s`,
                        '@keyframes bounce': { '0%, 80%, 100%': { transform: 'translateY(0)', opacity: 0.3 }, '40%': { transform: 'translateY(-6px)', opacity: 1 } }
                      }} />
                    ))}
                  </Box>
                </Box>
              </Box>
            )}
          </Box>
        </Box>

        {/* Input */}
        <Box sx={{ px: 4, pt: 2.5, pb: 3, borderTop: '1px solid rgba(255,255,255,0.06)', background: '#080808' }}>
          <Box sx={{ maxWidth: 760, mx: 'auto' }}>
            {/* Toolbar row */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
              <FormControl size="small" sx={{ minWidth: 130,
                '& .MuiOutlinedInput-root': { color: '#aaa', borderRadius: '8px', fontSize: '0.8rem', background: 'rgba(255,255,255,0.04)',
                  '& fieldset': { borderColor: 'rgba(255,255,255,0.1)' },
                  '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.25)' },
                  '&.Mui-focused fieldset': { borderColor: 'rgba(255,255,255,0.4)' } },
                '& .MuiInputLabel-root': { color: '#777', fontSize: '0.8rem' },
                '& .MuiSelect-icon': { color: '#777' } }}>
                <InputLabel>Model</InputLabel>
                <Select value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)} label="Model"
                  MenuProps={{ PaperProps: { sx: { background: '#111', border: '1px solid rgba(255,255,255,0.1)', color: '#e0e0e0', borderRadius: '10px' } } }}>
                  <MenuItem value="2" sx={{ fontSize: '0.875rem', '&:hover': { background: 'rgba(255,255,255,0.05)' } }}>Ollama (Local)</MenuItem>
                  <MenuItem value="3" sx={{ fontSize: '0.875rem', '&:hover': { background: 'rgba(255,255,255,0.05)' } }}>Claude</MenuItem>
                </Select>
              </FormControl>
              <IconButton onClick={() => setPdfLibraryOpen(true)} size="small"
                sx={{ color: '#777', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', p: 0.75,
                  '&:hover': { color: '#ccc', border: '1px solid rgba(255,255,255,0.3)', background: 'transparent' } }}>
                <FolderIcon sx={{ fontSize: 16 }} />
              </IconButton>
              {attachedDoc && (
                <Chip label={`📄 ${attachedDoc.filename}`} size="small" onDelete={() => setPdfLibraryOpen(true)}
                  sx={{ fontSize: '0.75rem', background: 'rgba(255,255,255,0.06)', color: '#aaa', border: '1px solid rgba(255,255,255,0.12)',
                    '& .MuiChip-deleteIcon': { color: '#666', '&:hover': { color: '#fff' } } }} />
              )}
            </Box>
            {/* Text + Send row */}
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-end' }}>
              <TextField fullWidth multiline rows={1} value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                placeholder="Message Sixi..."
                disabled={loading}
                inputRef={messageInputRef}
                sx={{ '& .MuiOutlinedInput-root': { color: '#e0e0e0', borderRadius: '14px', background: '#0d0d0d',
                    '& fieldset': { borderColor: 'rgba(255,255,255,0.1)' },
                    '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.2)' },
                    '&.Mui-focused fieldset': { borderColor: 'rgba(255,255,255,0.4)' } },
                  '& .MuiInputBase-input::placeholder': { color: '#666' }
                }}
              />
              <Button variant="contained" onClick={sendMessage} disabled={!inputMessage.trim() || loading}
                sx={{ px: 3.5, py: 1.6, background: '#fff', color: '#000', borderRadius: '50px', textTransform: 'none', fontWeight: 700, whiteSpace: 'nowrap', boxShadow: 'none',
                  '&:hover': { background: '#e8e8e8', boxShadow: 'none' }, '&:disabled': { background: '#111', color: '#333', boxShadow: 'none' } }}>
                {loading ? '...' : 'Send'}
              </Button>
            </Box>
          </Box>
        </Box>
      </Box>

      <PDFLibrary
        open={pdfLibraryOpen}
        onClose={() => setPdfLibraryOpen(false)}
        sessionId={tempSession ? null : currentSessionId}
        attachedDocId={attachedDoc?.id || null}
        onAttach={(doc) => {
          setAttachedDoc(doc)
          if (currentSessionId && !tempSession) {
            setSessions(prev => ({
              ...prev,
              [currentSessionId]: {
                ...prev[currentSessionId],
                attachedDocumentId: doc.id,
                attachedDocumentName: doc.filename,
              }
            }))
          }
        }}
        onDetach={() => {
          setAttachedDoc(null)
          if (currentSessionId && !tempSession) {
            setSessions(prev => ({
              ...prev,
              [currentSessionId]: {
                ...prev[currentSessionId],
                attachedDocumentId: null,
                attachedDocumentName: '',
              }
            }))
          }
        }}
      />
      <Snackbar open={!!error} autoHideDuration={6000} onClose={() => setError('')}>
        <Alert onClose={() => setError('')} severity="error">
          {error}
        </Alert>
      </Snackbar>
    </Box>
  )
}

export default AIChat

