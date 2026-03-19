import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { TextField, Button, Typography, Box, Alert, Grid } from '@mui/material'
import api from '../utils/api'
import LanguageToggle from '../components/LanguageToggle'

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

function Register() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [formData, setFormData] = useState({ email: '', captcha: '', password: '', confirmPassword: '' })
  const [loading, setLoading] = useState(false)
  const [codeLoading, setCodeLoading] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [error, setError] = useState('')

  const handleChange = (e) => { setFormData({ ...formData, [e.target.name]: e.target.value }); setError('') }

  const sendCode = async () => {
    if (!formData.email) { setError(t('register.error.empty')); return }
    try {
      setCodeLoading(true)
      await api.post('/user/captcha', { email: formData.email })
      setCountdown(60)
      const timer = setInterval(() => setCountdown(prev => { if (prev <= 1) { clearInterval(timer); return 0 } return prev - 1 }), 1000)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to send captcha')
    } finally { setCodeLoading(false) }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!formData.email || !formData.captcha || !formData.password) { setError(t('register.error.empty')); return }
    if (formData.password.length < 6) { setError(t('register.error.shortPassword')); return }
    if (formData.password !== formData.confirmPassword) { setError(t('register.error.passwordMismatch')); return }
    try {
      setLoading(true)
      await api.post('/user/register', { email: formData.email, captcha: formData.captcha, password: formData.password })
      navigate('/login')
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed')
    } finally { setLoading(false) }
  }

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', background: '#000' }}>
      {/* Left branding panel */}
      <Box sx={{ flex: 1, display: { xs: 'none', md: 'flex' }, flexDirection: 'column', justifyContent: 'space-between', p: 6, borderRight: '1px solid rgba(255,255,255,0.06)' }}>
        <Typography sx={{ color: '#fff', fontWeight: 800, fontSize: '1.2rem', letterSpacing: '-0.5px' }}>{t('brand')}</Typography>
        <Box>
          <Typography sx={{ color: '#fff', fontWeight: 800, fontSize: '2.8rem', lineHeight: 1.15, letterSpacing: '-1.5px', mb: 2 }}>
            {t('register.tagline')}
          </Typography>
          <Typography sx={{ color: '#777', fontSize: '1rem' }}>
            {t('register.powered')}
          </Typography>
        </Box>
        <Typography sx={{ color: '#333', fontSize: '0.8rem' }}>{t('copyright')}</Typography>
      </Box>

      {/* Right form panel */}
      <Box sx={{ width: { xs: '100%', md: 480 }, display: 'flex', flexDirection: 'column', justifyContent: 'center', px: { xs: 4, md: 8 }, py: 6, position: 'relative' }}>
        <Box sx={{ position: 'absolute', top: 24, right: 24 }}>
          <LanguageToggle />
        </Box>
        <Typography variant="h4" sx={{ color: '#fff', fontWeight: 800, letterSpacing: '-1px', mb: 1 }}>{t('register.title')}</Typography>
        <Typography sx={{ color: '#777', mb: 4, fontSize: '0.95rem' }}>{t('register.subtitle')}</Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 3, background: 'rgba(239,68,68,0.08)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '10px', '& .MuiAlert-icon': { color: '#f87171' } }}>
            {error}
          </Alert>
        )}

        <form onSubmit={handleSubmit}>
          <TextField fullWidth label={t('register.email')} name="email" type="email" value={formData.email} onChange={handleChange} required sx={{ mb: 2, ...fieldSx }} />
          <Grid container spacing={1.5} sx={{ mb: 2 }}>
            <Grid item xs={8}>
              <TextField fullWidth label={t('register.captcha')} name="captcha" value={formData.captcha} onChange={handleChange} required sx={fieldSx} />
            </Grid>
            <Grid item xs={4}>
              <Button fullWidth variant="outlined" onClick={sendCode} disabled={codeLoading || countdown > 0}
                sx={{ height: '56px', borderColor: 'rgba(255,255,255,0.15)', color: '#888', borderRadius: '12px', textTransform: 'none', fontWeight: 600,
                  '&:hover': { borderColor: 'rgba(255,255,255,0.4)', color: '#fff', background: 'transparent' },
                  '&:disabled': { borderColor: 'rgba(255,255,255,0.06)', color: '#333' } }}>
                {countdown > 0 ? `${countdown}s` : t('register.sendCode')}
              </Button>
            </Grid>
          </Grid>
          <TextField fullWidth label={t('register.password')} name="password" type="password" value={formData.password} onChange={handleChange} required sx={{ mb: 2, ...fieldSx }} />
          <TextField fullWidth label={t('register.confirmPassword')} name="confirmPassword" type="password" value={formData.confirmPassword} onChange={handleChange} required sx={{ mb: 3, ...fieldSx }} />
          <Button type="submit" fullWidth variant="contained" disabled={loading}
            sx={{ py: 1.6, background: '#fff', color: '#000', borderRadius: '50px', fontWeight: 700, fontSize: '0.95rem', textTransform: 'none', boxShadow: 'none', mb: 3,
              '&:hover': { background: '#e8e8e8', boxShadow: 'none' }, '&:disabled': { background: '#1a1a1a', color: '#777' } }}>
            {loading ? t('register.loading') : t('register.submit')}
          </Button>
          <Typography sx={{ textAlign: 'center', color: '#777', fontSize: '0.875rem' }}>
            {t('register.hasAccount')}{' '}
            <Link to="/login" style={{ color: '#fff', textDecoration: 'none', fontWeight: 600 }}>{t('register.signIn')}</Link>
          </Typography>
        </form>
      </Box>
    </Box>
  )
}

export default Register