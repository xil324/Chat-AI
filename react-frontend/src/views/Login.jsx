import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { TextField, Button, Typography, Box, Alert } from '@mui/material'
import api from '../utils/api'

const fieldSx = {
  '& .MuiOutlinedInput-root': {
    color: '#fff', borderRadius: '12px', background: '#0d0d0d',
    '& fieldset': { borderColor: 'rgba(255,255,255,0.1)' },
    '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.3)' },
    '&.Mui-focused fieldset': { borderColor: 'rgba(255,255,255,0.6)' },
  },
  '& .MuiInputLabel-root': { color: '#777' },
  '& .MuiInputLabel-root.Mui-focused': { color: '#888' },
}

function Login() {
  const navigate = useNavigate()
  const [formData, setFormData] = useState({ username: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleChange = (e) => { setFormData({ ...formData, [e.target.name]: e.target.value }); setError('') }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!formData.username || !formData.password) { setError('Please enter username and password'); return }
    if (formData.password.length < 6) { setError('Password must be at least 6 characters'); return }
    try {
      setLoading(true)
      const response = await api.post('/user/login', { username: formData.username, password: formData.password })
      localStorage.setItem('token', response.data.token)
      navigate('/menu')
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed')
    } finally { setLoading(false) }
  }

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', background: '#000' }}>
      {/* Left branding panel */}
      <Box sx={{ flex: 1, display: { xs: 'none', md: 'flex' }, flexDirection: 'column', justifyContent: 'space-between', p: 6, borderRight: '1px solid rgba(255,255,255,0.06)' }}>
        <Typography sx={{ color: '#fff', fontWeight: 800, fontSize: '1.2rem', letterSpacing: '-0.5px' }}>Sixi AI</Typography>
        <Box>
          <Typography sx={{ color: '#fff', fontWeight: 800, fontSize: '2.8rem', lineHeight: 1.15, letterSpacing: '-1.5px', mb: 2 }}>
            Your intelligent<br />chat assistant
          </Typography>
          <Typography sx={{ color: '#777', fontSize: '1rem' }}>
            Powered by local and cloud AI models.
          </Typography>
        </Box>
        <Typography sx={{ color: '#333', fontSize: '0.8rem' }}>© 2026 Sixi AI</Typography>
      </Box>

      {/* Right form panel */}
      <Box sx={{ width: { xs: '100%', md: 480 }, display: 'flex', flexDirection: 'column', justifyContent: 'center', px: { xs: 4, md: 8 }, py: 6 }}>
        <Typography variant="h4" sx={{ color: '#fff', fontWeight: 800, letterSpacing: '-1px', mb: 1 }}>Sign in</Typography>
        <Typography sx={{ color: '#777', mb: 4, fontSize: '0.95rem' }}>Enter your credentials to continue</Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 3, background: 'rgba(239,68,68,0.08)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '10px', '& .MuiAlert-icon': { color: '#f87171' } }}>
            {error}
          </Alert>
        )}

        <form onSubmit={handleSubmit}>
          <TextField fullWidth label="Username" name="username" value={formData.username} onChange={handleChange} required sx={{ mb: 2, ...fieldSx }} />
          <TextField fullWidth label="Password" name="password" type="password" value={formData.password} onChange={handleChange} required sx={{ mb: 3, ...fieldSx }} />
          <Button type="submit" fullWidth variant="contained" disabled={loading}
            sx={{ py: 1.6, background: '#fff', color: '#000', borderRadius: '50px', fontWeight: 700, fontSize: '0.95rem', textTransform: 'none', boxShadow: 'none', mb: 3,
              '&:hover': { background: '#e8e8e8', boxShadow: 'none' }, '&:disabled': { background: '#1a1a1a', color: '#444' } }}>
            {loading ? 'Signing in...' : 'Sign in →'}
          </Button>
          <Typography sx={{ textAlign: 'center', color: '#777', fontSize: '0.875rem' }}>
            No account?{' '}
            <Link to="/register" style={{ color: '#fff', textDecoration: 'none', fontWeight: 600 }}>Register</Link>
          </Typography>
        </form>
      </Box>
    </Box>
  )
}

export default Login
