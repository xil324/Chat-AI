import React from 'react'
import { useNavigate } from 'react-router-dom'
import { Box, Typography, Button, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions } from '@mui/material'
import ChatIcon from '@mui/icons-material/Chat'

function Menu() {
  const navigate = useNavigate()
  const [open, setOpen] = React.useState(false)

  return (
    <Box sx={{ minHeight: '100vh', background: '#000', display: 'flex', flexDirection: 'column' }}>
      {/* Nav */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 6, py: 3, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <Typography sx={{ color: '#fff', fontWeight: 800, fontSize: '1.1rem', letterSpacing: '-0.5px' }}>Sixi AI</Typography>
        <Button onClick={() => setOpen(true)} variant="outlined"
          sx={{ borderColor: 'rgba(255,255,255,0.15)', color: '#888', borderRadius: '50px', textTransform: 'none', px: 3,
            '&:hover': { borderColor: 'rgba(255,255,255,0.35)', color: '#fff', background: 'transparent' } }}>
          Logout
        </Button>
      </Box>

      {/* Hero */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', px: 4, textAlign: 'center' }}>
        <Typography sx={{ color: '#333', fontSize: '0.85rem', fontWeight: 600, letterSpacing: '2px', textTransform: 'uppercase', mb: 3 }}>
          AI Platform
        </Typography>
        <Typography sx={{ color: '#fff', fontWeight: 800, fontSize: { xs: '2.5rem', md: '4rem' }, lineHeight: 1.1, letterSpacing: '-2px', mb: 3, maxWidth: 700 }}>
          What do you want<br />to explore today?
        </Typography>
        <Typography sx={{ color: '#777', fontSize: '1.1rem', mb: 8, maxWidth: 480 }}>
          Chat with powerful AI models, analyze documents, and get instant answers.
        </Typography>

        {/* Feature card */}
        <Box onClick={() => navigate('/ai-chat')}
          sx={{ cursor: 'pointer', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '20px', p: 4, width: '100%', maxWidth: 420,
            display: 'flex', alignItems: 'center', gap: 3, textAlign: 'left', background: 'transparent', transition: 'all 0.2s',
            '&:hover': { border: '1px solid rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.03)', transform: 'translateY(-2px)' } }}>
          <Box sx={{ width: 52, height: 52, borderRadius: '14px', background: 'rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <ChatIcon sx={{ color: '#fff', fontSize: 24 }} />
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography sx={{ color: '#fff', fontWeight: 700, fontSize: '1rem', mb: 0.5 }}>AI Chat</Typography>
            <Typography sx={{ color: '#777', fontSize: '0.875rem', lineHeight: 1.4 }}>Talk with Sixi using Ollama or Claude</Typography>
          </Box>
          <Typography sx={{ color: '#333', fontSize: '1.2rem' }}>→</Typography>
        </Box>
      </Box>

      <Dialog open={open} onClose={() => setOpen(false)}
        PaperProps={{ sx: { background: '#141414', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '16px', color: '#fff', boxShadow: '0 24px 80px rgba(0,0,0,0.8)' } }}>
        <DialogTitle sx={{ color: '#fff', fontWeight: 700 }}>Sign out?</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ color: '#888' }}>You will need to sign in again to access Sixi.</DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
          <Button onClick={() => setOpen(false)} sx={{ color: '#777', textTransform: 'none', '&:hover': { color: '#fff', background: 'transparent' } }}>Cancel</Button>
          <Button onClick={() => { localStorage.removeItem('token'); navigate('/login') }} variant="contained"
            sx={{ background: '#fff', color: '#000', textTransform: 'none', borderRadius: '50px', px: 3, fontWeight: 700, boxShadow: 'none',
              '&:hover': { background: '#e0e0e0', boxShadow: 'none' } }}>
            Sign out
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

export default Menu
