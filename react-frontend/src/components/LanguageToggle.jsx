import React from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@mui/material'

export default function LanguageToggle({ sx = {} }) {
  const { i18n } = useTranslation()
  const isZh = i18n.language === 'zh'

  return (
    <Button
      onClick={() => i18n.changeLanguage(isZh ? 'en' : 'zh')}
      sx={{
        color: '#777', textTransform: 'none', fontWeight: 600, fontSize: '0.8rem',
        minWidth: 0, px: 1.5, py: 0.5, borderRadius: '6px',
        border: '1px solid rgba(255,255,255,0.1)',
        '&:hover': { color: '#fff', borderColor: 'rgba(255,255,255,0.3)', background: 'transparent' },
        ...sx,
      }}
    >
      {isZh ? 'EN' : '中文'}
    </Button>
  )
}