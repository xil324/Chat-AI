import React, { useState, useEffect, useRef } from 'react'
import {
  Drawer, Box, Typography, Button, IconButton, List, ListItem,
  ListItemText, Divider, CircularProgress
} from '@mui/material'
import DeleteIcon from '@mui/icons-material/Delete'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import api from '../utils/api'

export default function PDFLibrary({ open, onClose, sessionId, attachedDocId, onAttach, onDetach }) {
  const [documents, setDocuments] = useState([])
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const fileInputRef = useRef(null)

  const loadDocuments = async () => {
    try {
      const res = await api.get('/document/list')
      setDocuments(res.data.documents || [])
    } catch {
      setError('Failed to load documents')
    }
  }

  useEffect(() => {
    if (open) loadDocuments()
  }, [open])

  const handleFileChange = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    e.target.value = ''
    const formData = new FormData()
    formData.append('file', file)
    setUploading(true)
    setError('')
    try {
      await api.post('/document/upload', formData)
      await loadDocuments()
    } catch (err) {
      setError(err.response?.data?.error || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (docId) => {
    try {
      await api.delete(`/document/${docId}`)
      if (attachedDocId === docId) onDetach()
      await loadDocuments()
    } catch {
      setError('Delete failed')
    }
  }

  const handleAttach = async (doc) => {
    if (!sessionId) { setError('Start or select a session first'); return }
    try {
      await api.post('/document/attach', { sessionId, documentId: doc.id })
      onAttach(doc)
    } catch {
      setError('Failed to attach document')
    }
  }

  const handleDetach = async () => {
    if (!sessionId) return
    try {
      await api.post('/document/detach', { sessionId })
      onDetach()
    } catch {
      setError('Failed to detach document')
    }
  }

  return (
    <Drawer anchor="right" open={open} onClose={onClose}
      PaperProps={{ sx: { background: '#0d0d0d', borderLeft: '1px solid rgba(255,255,255,0.08)', width: 340 } }}>
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', p: 3 }}>

        {/* Header */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Typography sx={{ color: '#fff', fontWeight: 700, fontSize: '1rem', letterSpacing: '-0.3px' }}>
            PDF Library
          </Typography>
          <IconButton onClick={onClose} size="small" sx={{ color: '#555', '&:hover': { color: '#fff', background: 'transparent' } }}>
            ✕
          </IconButton>
        </Box>

        {/* Upload button */}
        <Button
          variant="outlined"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
          sx={{ mb: 2.5, borderColor: 'rgba(255,255,255,0.15)', color: '#aaa', borderRadius: '10px',
            textTransform: 'none', fontWeight: 600, py: 1.2,
            '&:hover': { borderColor: 'rgba(255,255,255,0.35)', color: '#fff', background: 'transparent' },
            '&:disabled': { borderColor: 'rgba(255,255,255,0.06)', color: '#444' } }}>
          {uploading
            ? <><CircularProgress size={14} sx={{ color: '#555', mr: 1 }} />Processing…</>
            : '+ Upload PDF'}
        </Button>
        <input ref={fileInputRef} type="file" accept="application/pdf" style={{ display: 'none' }} onChange={handleFileChange} />

        {error && (
          <Box sx={{ mb: 2, px: 2, py: 1.2, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
            borderRadius: '8px', color: '#f87171', fontSize: '0.8rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {error}
            <IconButton size="small" onClick={() => setError('')} sx={{ color: '#f87171', p: 0.25, '&:hover': { background: 'transparent' } }}>✕</IconButton>
          </Box>
        )}

        {/* Count label */}
        <Typography sx={{ color: '#555', fontSize: '0.7rem', fontWeight: 600, letterSpacing: '1px', textTransform: 'uppercase', mb: 1.5 }}>
          {documents.length} document{documents.length !== 1 ? 's' : ''}
        </Typography>

        {/* Document list */}
        <Box sx={{ flex: 1, overflowY: 'auto' }}>
          {documents.length === 0 ? (
            <Box sx={{ py: 6, textAlign: 'center' }}>
              <Typography sx={{ color: '#444', fontSize: '0.875rem' }}>No PDFs yet.</Typography>
              <Typography sx={{ color: '#333', fontSize: '0.8rem', mt: 0.5 }}>Upload one above.</Typography>
            </Box>
          ) : (
            <List dense disablePadding>
              {documents.map((doc) => {
                const isAttached = doc.id === attachedDocId
                return (
                  <React.Fragment key={doc.id}>
                    <ListItem disablePadding sx={{
                      borderRadius: '10px', mb: 0.5, px: 1.5, py: 1,
                      background: isAttached ? 'rgba(99,179,140,0.08)' : 'rgba(255,255,255,0.03)',
                      border: isAttached ? '1px solid rgba(99,179,140,0.2)' : '1px solid rgba(255,255,255,0.05)',
                    }}>
                      <ListItemText
                        primary={
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.25 }}>
                            {isAttached && <CheckCircleIcon sx={{ fontSize: 14, color: '#63b38c' }} />}
                            <Typography sx={{ color: isAttached ? '#9ee3c2' : '#ccc', fontSize: '0.83rem', fontWeight: 500, wordBreak: 'break-all', lineHeight: 1.4 }}>
                              {doc.filename}
                            </Typography>
                          </Box>
                        }
                        secondary={
                          <Typography sx={{ color: '#555', fontSize: '0.72rem' }}>
                            {new Date(doc.created_at).toLocaleDateString()}
                          </Typography>
                        }
                      />
                      <Box sx={{ display: 'flex', gap: 0.5, ml: 1, flexShrink: 0 }}>
                        {isAttached ? (
                          <Button size="small" onClick={handleDetach}
                            sx={{ color: '#f87171', textTransform: 'none', fontSize: '0.75rem', px: 1, py: 0.3, minWidth: 0,
                              '&:hover': { background: 'rgba(248,113,113,0.08)' } }}>
                            Detach
                          </Button>
                        ) : (
                          <Button size="small" onClick={() => handleAttach(doc)} disabled={!sessionId}
                            sx={{ color: '#63b38c', textTransform: 'none', fontSize: '0.75rem', px: 1, py: 0.3, minWidth: 0,
                              '&:hover': { background: 'rgba(99,179,140,0.08)' },
                              '&:disabled': { color: '#333' } }}>
                            Attach
                          </Button>
                        )}
                        <IconButton size="small" onClick={() => handleDelete(doc.id)}
                          sx={{ color: '#444', p: 0.5, '&:hover': { color: '#f87171', background: 'transparent' } }}>
                          <DeleteIcon sx={{ fontSize: 15 }} />
                        </IconButton>
                      </Box>
                    </ListItem>
                  </React.Fragment>
                )
              })}
            </List>
          )}
        </Box>
      </Box>
    </Drawer>
  )
}
