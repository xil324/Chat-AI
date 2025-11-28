import React from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Grid,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions
} from '@mui/material'
import ChatIcon from '@mui/icons-material/Chat'
import CameraAltIcon from '@mui/icons-material/CameraAlt'

function Menu() {
  const navigate = useNavigate()
  const [open, setOpen] = React.useState(false)

  const handleLogout = () => {
    setOpen(true)
  }

  const handleConfirmLogout = () => {
    localStorage.removeItem('token')
    navigate('/login')
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      <Box
        sx={{
          background: 'rgba(255, 255, 255, 0.1)',
          backdropFilter: 'blur(10px)',
          color: 'white',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          p: 3,
          boxShadow: '0 2px 20px rgba(0, 0, 0, 0.1)'
        }}
      >
        <Typography variant="h4" sx={{ fontWeight: 600 }}>
          TEST AI Platform
        </Typography>
        <Button
          variant="contained"
          color="error"
          onClick={handleLogout}
        >
          Logout
        </Button>
      </Box>

      <Box
        sx={{
          flex: 1,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          p: 4
        }}
      >
        <Grid container spacing={4} sx={{ maxWidth: 900 }}>
          <Grid item xs={12} sm={6}>
            <Card
              sx={{
                cursor: 'pointer',
                background: 'rgba(255, 255, 255, 0.95)',
                backdropFilter: 'blur(15px)',
                borderRadius: '20px',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
                transition: 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                '&:hover': {
                  transform: 'translateY(-15px) scale(1.05)',
                  boxShadow: '0 20px 60px rgba(0, 0, 0, 0.2)'
                }
              }}
              onClick={() => navigate('/ai-chat')}
            >
              <CardContent sx={{ textAlign: 'center', p: 5 }}>
                <ChatIcon sx={{ fontSize: 48, color: '#409eff', mb: 2 }} />
                <Typography variant="h5" sx={{ mb: 1, fontWeight: 600 }}>
                  AI Chat
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Chat with AI
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6}>
            <Card
              sx={{
                cursor: 'pointer',
                background: 'rgba(255, 255, 255, 0.95)',
                backdropFilter: 'blur(15px)',
                borderRadius: '20px',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
                transition: 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                '&:hover': {
                  transform: 'translateY(-15px) scale(1.05)',
                  boxShadow: '0 20px 60px rgba(0, 0, 0, 0.2)'
                }
              }}
              onClick={() => navigate('/image-recognition')}
            >
              <CardContent sx={{ textAlign: 'center', p: 5 }}>
                <CameraAltIcon sx={{ fontSize: 48, color: '#67c23a', mb: 2 }} />
                <Typography variant="h5" sx={{ mb: 1, fontWeight: 600 }}>
                  Image Recognition
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Upload image to AI recognition
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Box>

      <Dialog open={open} onClose={() => setOpen(false)}>
        <DialogTitle>Confirm</DialogTitle>
        <DialogContent>
          <DialogContentText>Are you sure you want to logout?</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleConfirmLogout} color="error" variant="contained">
            Confirm
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

export default Menu

