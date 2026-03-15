import React, { useState, useEffect, useRef } from 'react'
import {
  Drawer, Box, Typography, Button, IconButton, List, ListItem,
  ListItemText, Divider, CircularProgress, Alert
} from '@mui/material'
import DeleteIcon from '@mui/icons-material/Delete'
import AttachFileIcon from '@mui/icons-material/AttachFile'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import api from '../utils/api'

/**
 * PDFLibrary drawer — list, upload, and attach/detach PDFs.
 *
 * Props:
 *   open          boolean       drawer visibility
 *   onClose       () => void
 *   sessionId     string|null   current session id
 *   attachedDocId string|null   currently attached document id
 *   onAttach      (doc) => void called when user attaches a doc { id, filename }
 *   onDetach      () => void    called when user detaches
 */
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
    if (!sessionId) {
      setError('Start or select a session first')
      return
    }
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
    <Drawer anchor="right" open={open} onClose={onClose}>
      <Box sx={{ width: 340, p: 2, display: 'flex', flexDirection: 'column', height: '100%' }}>
        <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>PDF Library</Typography>

        {error && <Alert severity="error" sx={{ mb: 1 }} onClose={() => setError('')}>{error}</Alert>}

        <Button
          variant="contained"
          startIcon={uploading ? <CircularProgress size={16} color="inherit" /> : <AttachFileIcon />}
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
          sx={{ mb: 2 }}
        >
          {uploading ? 'Processing PDF…' : 'Upload PDF'}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />

        <Typography variant="caption" color="text.secondary" sx={{ mb: 1 }}>
          {documents.length} document{documents.length !== 1 ? 's' : ''}
        </Typography>

        <Box sx={{ flex: 1, overflowY: 'auto' }}>
          <List dense>
            {documents.map((doc) => {
              const isAttached = doc.id === attachedDocId
              return (
                <React.Fragment key={doc.id}>
                  <ListItem
                    sx={{
                      borderRadius: 1,
                      background: isAttached ? 'rgba(102,126,234,0.1)' : 'transparent',
                    }}
                    secondaryAction={
                      <Box sx={{ display: 'flex', gap: 0.5 }}>
                        {isAttached ? (
                          <Button size="small" onClick={handleDetach} color="warning">
                            Detach
                          </Button>
                        ) : (
                          <Button
                            size="small"
                            onClick={() => handleAttach(doc)}
                            disabled={!sessionId}
                            title={!sessionId ? 'Select a session first' : ''}
                          >
                            Attach
                          </Button>
                        )}
                        <IconButton size="small" onClick={() => handleDelete(doc.id)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Box>
                    }
                  >
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          {isAttached && <CheckCircleIcon sx={{ fontSize: 16, color: '#667eea' }} />}
                          <span style={{ fontSize: 13, wordBreak: 'break-all' }}>{doc.filename}</span>
                        </Box>
                      }
                      secondary={new Date(doc.created_at).toLocaleDateString()}
                    />
                  </ListItem>
                  <Divider />
                </React.Fragment>
              )
            })}
            {documents.length === 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: 'center' }}>
                No PDFs yet. Upload one above.
              </Typography>
            )}
          </List>
        </Box>
      </Box>
    </Drawer>
  )
}
