import { useState, useCallback } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import LoginPage from './pages/LoginPage'
import Sidebar from './components/Sidebar'
import Dashboard from './pages/Dashboard'
import IncidentsPage from './pages/IncidentsPage'
import IncidentDetail from './pages/IncidentDetail'
import RCAForm from './pages/RCAForm'
import './index.css'

function isAuthenticated() {
  return !!localStorage.getItem('ims_token')
}

export default function App() {
  const [authed, setAuthed] = useState(isAuthenticated)
  const [wsConnected, setWsConnected] = useState(false)
  const handleLogin = () => setAuthed(true)
  const handleLogout = () => setAuthed(false)
  const handleWsConnect = useCallback(() => setWsConnected(true), [])

  if (!authed) return <LoginPage onLogin={handleLogin} />

  return (
    <BrowserRouter>
      <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg)' }}>
        <Sidebar onLogout={handleLogout} wsConnected={wsConnected} />
        <main style={{ flex: 1, overflowY: 'auto' }}>
          <Routes>
            <Route path="/" element={<Dashboard onWsConnect={handleWsConnect} />} />
            <Route path="/incidents" element={<IncidentsPage onWsConnect={handleWsConnect} />} />
            <Route path="/incident/:id" element={<IncidentDetail />} />
            <Route path="/incident/:id/rca" element={<RCAForm />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}