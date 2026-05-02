import { useState, useCallback } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import LoginPage from './pages/LoginPage'
import IncidentDetail from './pages/IncidentDetail'
import RCAForm from './pages/RCAForm'
import LiveFeed from './components/LiveFeed'
import TopBar from './components/TopBar'
import './index.css'

function isAuthenticated() {
  return !!localStorage.getItem('ims_token')
}

export default function App() {
  const [authed, setAuthed] = useState(isAuthenticated)
  const [wsConnected, setWsConnected] = useState(false)

  const handleLogin = () => setAuthed(true)
  const handleLogout = () => { setAuthed(false) }
  const handleWsConnect = useCallback(() => setWsConnected(true), [])

  if (!authed) {
    return <LoginPage onLogin={handleLogin} />
  }

  return (
    <BrowserRouter>
      <div style={styles.layout}>
        <TopBar onLogout={handleLogout} wsConnected={wsConnected} />
        <div style={styles.body}>
          <Routes>
            <Route
              path="/"
              element={<LiveFeed onWsConnect={handleWsConnect} />}
            />
            <Route path="/incident/:id" element={<IncidentDetail />} />
            <Route path="/incident/:id/rca" element={<RCAForm />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  )
}

const styles = {
  layout: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    overflow: 'hidden',
  },
  body: {
    flex: 1,
    overflowY: 'auto',
  },
}
