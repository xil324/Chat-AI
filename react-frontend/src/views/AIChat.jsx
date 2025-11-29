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
      const response = await api.get('/AI/chat/sessions')
      if (response.data && response.data.status_code === 1000 && Array.isArray(response.data.sessions)) {
        const sessionMap = {}
        response.data.sessions.forEach(s => {
          const sid = String(s.sessionId)
          sessionMap[sid] = {
            id: sid,
            name: s.name || `Session ${sid}`,
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
    if (messageInputRef.current) {
      messageInputRef.current.focus()
    }
  }

  const switchSession = async (sessionId) => {
    if (!sessionId) return
    setCurrentSessionId(String(sessionId))
    setTempSession(false)

    if (!sessions[sessionId]?.messages || sessions[sessionId].messages.length === 0) {
      try {
        const response = await api.post('/AI/chat/history', { sessionId: String(sessionId) })
        if (response.data && response.data.status_code === 1000 && Array.isArray(response.data.history)) {
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

  const syncHistory = async () => {
    if (!currentSessionId || tempSession) {
      setError('Please select an existing session to sync')
      return
    }
    try {
      const response = await api.post('/AI/chat/history', { sessionId: currentSessionId })
      if (response.data && response.data.status_code === 1000 && Array.isArray(response.data.history)) {
        const messages = response.data.history.map(item => ({
          role: item.is_user ? 'user' : 'assistant',
          content: item.content
        }))
        setSessions(prev => ({
          ...prev,
          [currentSessionId]: {
            ...prev[currentSessionId],
            messages
          }
        }))
        setCurrentMessages([...messages])
        setTimeout(scrollToBottom, 100)
      } else {
        setError('Unable to get history data')
      }
    } catch (err) {
      console.error('Sync history error:', err)
      setError('Failed to get history data')
    }
  }

  const handleNormal = async (question) => {
    if (tempSession || !currentSessionId || currentSessionId === 'temp') {
      const response = await api.post('/AI/chat/send-new-session', {
        question,
        modelType: selectedModel
      })
      if (response.data && response.data.status_code === 1000) {
        const sessionId = String(response.data.sessionId)
        const aiMessage = {
          role: 'assistant',
          content: response.data.Information || ''
        }

        setSessions(prev => ({
          ...prev,
          [sessionId]: {
            id: sessionId,
            name: 'new session',
            messages: [{ role: 'user', content: question }, aiMessage]
          }
        }))
        setCurrentSessionId(sessionId)
        setTempSession(false)
        setCurrentMessages([{ role: 'user', content: question }, aiMessage])
      } else {
        setError(response.data?.status_msg || 'Failed to send')
        setCurrentMessages(prev => prev.slice(0, -1))
      }
    } else {
      const sessionMsgs = [...(sessions[currentSessionId]?.messages || [])]
      sessionMsgs.push({ role: 'user', content: question })

      const response = await api.post('/AI/chat/send', {
        question,
        modelType: selectedModel,
        sessionId: currentSessionId
      })
      if (response.data && response.data.status_code === 1000) {
        const aiMessage = { role: 'assistant', content: response.data.Information || '' }
        sessionMsgs.push(aiMessage)
        setSessions(prev => ({
          ...prev,
          [currentSessionId]: {
            ...prev[currentSessionId],
            messages: sessionMsgs
          }
        }))
        setCurrentMessages([...sessionMsgs])
      } else {
        setError(response.data?.status_msg || 'Failed to send')
        sessionMsgs.pop()
        setCurrentMessages(prev => prev.slice(0, -1))
      }
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
    <Box sx={{ height: '100vh', display: 'flex', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
      {/* Session List */}
      <Box sx={{ width: 280, height: '100vh', background: 'rgba(255, 255, 255, 0.95)', display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ p: 2.5, textAlign: 'center', background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.06) 0%, rgba(103, 194, 58, 0.06) 100%)', borderBottom: '1px solid rgba(0, 0, 0, 0.06)' }}>
          <Typography sx={{ mb: 1.5, fontWeight: 600 }}>Conversations</Typography>
          <Button
            fullWidth
            variant="contained"
            onClick={createNewSession}
            sx={{
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              '&:hover': { background: 'linear-gradient(135deg, #5568d3 0%, #653a91 100%)' }
            }}
          >
            ＋ New Chat
          </Button>
        </Box>
        <Box sx={{ flex: 1, overflowY: 'auto' }}>
          {sessionsList.map(session => (
            <Box
              key={session.id}
              onClick={() => switchSession(session.id)}
              sx={{
                p: 2,
                cursor: 'pointer',
                borderBottom: '1px solid rgba(0, 0, 0, 0.03)',
                background: currentSessionId === session.id
                  ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
                  : 'transparent',
                color: currentSessionId === session.id ? 'white' : '#2c3e50',
                '&:hover': {
                  background: currentSessionId === session.id
                    ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
                    : 'rgba(102, 126, 234, 0.06)'
                }
              }}
            >
              {session.name || `Conversation ${session.id}`}
            </Box>
          ))}
        </Box>
      </Box>

      {/* Chat Section */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Top Bar */}
        <Box sx={{ background: 'rgba(255, 255, 255, 0.95)', p: 1.5, display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Button onClick={() => navigate('/menu')}>← Back</Button>
          <Button
            onClick={syncHistory}
            disabled={!currentSessionId || tempSession}
            variant="contained"
            size="small"
          >
            Sync History Data
          </Button>
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>Select Model</InputLabel>
            <Select value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)} label="Select Model">
              <MenuItem value="2">Ollama (Local)</MenuItem>
              <MenuItem value="3">Google Gemini</MenuItem>
            </Select>
          </FormControl>
        </Box>

        {/* Messages */}
        <Box
          ref={messagesRef}
          sx={{
            flex: 1,
            overflowY: 'auto',
            p: 4,
            display: 'flex',
            flexDirection: 'column',
            gap: 2
          }}
        >
          {currentMessages.map((message, index) => (
            <Box
              key={index}
              sx={{
                maxWidth: '70%',
                p: '14px 18px',
                borderRadius: '18px',
                alignSelf: message.role === 'user' ? 'flex-end' : 'flex-start',
                background: message.role === 'user'
                  ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
                  : 'rgba(255, 255, 255, 0.95)',
                color: message.role === 'user' ? 'white' : '#2c3e50'
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {message.role === 'user' ? 'You' : 'AI'}:
                </Typography>
                {message.role === 'assistant' && (
                  <IconButton size="small" onClick={() => playTTS(message.content)}>
                    <VolumeUpIcon fontSize="small" />
                  </IconButton>
                )}
              </Box>
              <Box
                dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }}
                sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
              />
            </Box>
          ))}
        </Box>

        {/* Input */}
        <Box sx={{ p: 3, background: 'rgba(255, 255, 255, 0.96)', borderTop: '1px solid rgba(0, 0, 0, 0.06)' }}>
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-end' }}>
            <TextField
              fullWidth
              multiline
              rows={1}
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  sendMessage()
                }
              }}
              placeholder="Enter your question..."
              disabled={loading}
              inputRef={messageInputRef}
            />
            <Button
              variant="contained"
              onClick={sendMessage}
              disabled={!inputMessage.trim() || loading}
              sx={{
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                '&:hover': { background: 'linear-gradient(135deg, #5568d3 0%, #653a91 100%)' }
              }}
            >
              {loading ? 'Sending...' : 'Send'}
            </Button>
          </Box>
        </Box>
      </Box>

      <Snackbar open={!!error} autoHideDuration={6000} onClose={() => setError('')}>
        <Alert onClose={() => setError('')} severity="error">
          {error}
        </Alert>
      </Snackbar>
    </Box>
  )
}

export default AIChat

