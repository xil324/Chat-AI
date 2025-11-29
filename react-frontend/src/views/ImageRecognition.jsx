import React, { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box,
  Button,
  Typography,
  Snackbar,
  Alert
} from '@mui/material'
import api from '../utils/api'

function ImageRecognition() {
  const navigate = useNavigate()
  const [messages, setMessages] = useState([])
  const [selectedFile, setSelectedFile] = useState(null)
  const [error, setError] = useState('')
  const fileInputRef = useRef(null)
  const chatContainerRef = useRef(null)

  const scrollToBottom = () => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight
    }
  }

  const handleFileSelect = (e) => {
    setSelectedFile(e.target.files[0])
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!selectedFile) return

    const file = selectedFile
    const imageUrl = URL.createObjectURL(file)

    setMessages(prev => [...prev, {
      role: 'user',
      content: `Uploaded image: ${file.name}`,
      imageUrl: imageUrl
    }])

    setTimeout(scrollToBottom, 100)

    const formData = new FormData()
    formData.append('image', file)

    try {
      const response = await api.post('/image/recognize', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      })

      if (response.data && response.data.class_name) {
        const aiText = `Recognition result: ${response.data.class_name}`
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: aiText
        }])
      } else {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `[Error] ${response.data.status_msg || 'Recognition failed'}`
        }])
      }
    } catch (err) {
      console.error('Upload error:', err)
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `[Error] Unable to connect to server or upload failed: ${err.message}`
      }])
    } finally {
      URL.revokeObjectURL(imageUrl)
      setTimeout(scrollToBottom, 100)
      setSelectedFile(null)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  return (
    <Box sx={{ height: '100vh', display: 'flex', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
      {/* Session List */}
      <Box sx={{ width: 280, height: '100vh', background: 'rgba(255, 255, 255, 0.95)', display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ p: 2.5, textAlign: 'center', background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.06) 0%, rgba(103, 194, 58, 0.06) 100%)', borderBottom: '1px solid rgba(0, 0, 0, 0.06)' }}>
          <Typography sx={{ fontWeight: 600 }}>Image Recognition</Typography>
        </Box>
        <Box sx={{ flex: 1, overflowY: 'auto' }}>
          <Box
            sx={{
              p: 2,
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: 'white',
              fontWeight: 600
            }}
          >
            Image Recognition Assistant
          </Box>
        </Box>
      </Box>

      {/* Chat Section */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Top Bar */}
        <Box sx={{ background: 'rgba(255, 255, 255, 0.95)', p: 1.5, display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Button onClick={() => navigate('/menu')}>← Back</Button>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>AI Image Recognition Assistant</Typography>
        </Box>

        {/* Messages */}
        <Box
          ref={chatContainerRef}
          sx={{
            flex: 1,
            overflowY: 'auto',
            p: 4,
            display: 'flex',
            flexDirection: 'column',
            gap: 2
          }}
        >
          {messages.map((message, index) => (
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
              </Box>
              <Box sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {message.content}
                {message.imageUrl && (
                  <Box
                    component="img"
                    src={message.imageUrl}
                    alt="Uploaded image"
                    sx={{
                      maxWidth: 250,
                      borderRadius: '12px',
                      display: 'block',
                      mt: 1.5,
                      boxShadow: '0 4px 15px rgba(0, 0, 0, 0.2)',
                      '&:hover': { transform: 'scale(1.05)' },
                      transition: 'transform 0.3s ease'
                    }}
                  />
                )}
              </Box>
            </Box>
          ))}
        </Box>

        {/* Input */}
        <Box sx={{ p: 3, background: 'rgba(255, 255, 255, 0.96)', borderTop: '1px solid rgba(0, 0, 0, 0.06)' }}>
          <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '20px' }}>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              required
              onChange={handleFileSelect}
              style={{
                flex: 1,
                border: '2px dashed #d9d9d9',
                borderRadius: '12px',
                padding: '15px 20px',
                background: 'rgba(255, 255, 255, 0.8)',
                cursor: 'pointer'
              }}
            />
            <Button
              type="submit"
              variant="contained"
              disabled={!selectedFile}
              sx={{
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                '&:hover': { background: 'linear-gradient(135deg, #5568d3 0%, #653a91 100%)' }
              }}
            >
              Send Image
            </Button>
          </form>
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

export default ImageRecognition

