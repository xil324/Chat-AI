import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Login from './views/Login'
import Register from './views/Register'
import Menu from './views/Menu'
import AIChat from './views/AIChat'
import PrivateRoute from './components/PrivateRoute'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/menu" element={<PrivateRoute><Menu /></PrivateRoute>} />
      <Route path="/ai-chat" element={<PrivateRoute><AIChat /></PrivateRoute>} />
    </Routes>
  )
}

export default App

