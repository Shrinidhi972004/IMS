import { useState } from 'react'
import api, { setToken } from '../lib/api'

export default function LoginPage({ onLogin }) {
  const [mode, setMode] = useState('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = mode === 'login'
        ? await api.login(username, password)
        : await api.signup(username, password)
      setToken(res.token)
      onLogin()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={s.root}>
      <div style={s.card}>
        {/* Logo */}
        <div style={s.logo}>
          <div style={s.logoIcon}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </div>
          <div>
            <div style={s.logoName}>IMS</div>
            <div style={s.logoSub}>Incident Management System</div>
          </div>
        </div>

        <h2 style={s.heading}>{mode === 'login' ? 'Welcome back' : 'Create account'}</h2>
        <p style={s.subheading}>{mode === 'login' ? 'Sign in to your account to continue' : 'Get started with IMS'}</p>

        {/* Tabs */}
        <div style={s.tabs}>
          <button style={{ ...s.tab, ...(mode === 'login' ? s.tabActive : {}) }} onClick={() => { setMode('login'); setError('') }}>Sign in</button>
          <button style={{ ...s.tab, ...(mode === 'signup' ? s.tabActive : {}) }} onClick={() => { setMode('signup'); setError('') }}>Register</button>
        </div>

        <form onSubmit={handleSubmit} style={s.form}>
          <div style={s.field}>
            <label style={s.label}>Username</label>
            <input className="input" type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder="Enter your username" autoFocus autoComplete="username" minLength={3} required />
          </div>
          <div style={s.field}>
            <label style={s.label}>Password {mode === 'signup' && <span style={{ color: 'var(--text3)', fontWeight: 400 }}>(min. 6 characters)</span>}</label>
            <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter your password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={6} required />
          </div>

          {error && (
            <div style={s.error}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              {error}
            </div>
          )}

          <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '10px' }} disabled={loading}>
            {loading ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#fff' }} /> : null}
            {loading ? 'Please wait...' : (mode === 'login' ? 'Sign in' : 'Create account')}
          </button>
        </form>

        <p style={s.switchMode}>
          {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <button style={s.switchBtn} onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError('') }}>
            {mode === 'login' ? 'Register' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  )
}

const s = {
  root: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'var(--bg)' },
  card: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '40px 36px', width: '100%', maxWidth: 420, boxShadow: '0 4px 24px rgba(0,0,0,0.08)' },
  logo: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 },
  logoIcon: { width: 40, height: 40, borderRadius: 10, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  logoName: { fontSize: 18, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em' },
  logoSub: { fontSize: 11, color: 'var(--text3)', marginTop: 1 },
  heading: { fontSize: 22, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em', marginBottom: 6 },
  subheading: { fontSize: 14, color: 'var(--text2)', marginBottom: 24 },
  tabs: { display: 'flex', background: 'var(--surface2)', borderRadius: 8, padding: 3, marginBottom: 24 },
  tab: { flex: 1, padding: '7px 12px', borderRadius: 6, fontSize: 13, fontWeight: 500, color: 'var(--text2)', background: 'transparent', border: 'none', cursor: 'pointer', transition: 'all 0.15s' },
  tabActive: { background: 'var(--surface)', color: 'var(--text)', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' },
  form: { display: 'flex', flexDirection: 'column', gap: 16 },
  field: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { fontSize: 13, fontWeight: 500, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 },
  error: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: 'var(--p0-bg)', border: '1px solid var(--p0-border)', borderRadius: 8, fontSize: 13, color: 'var(--p0)' },
  switchMode: { textAlign: 'center', marginTop: 20, fontSize: 13, color: 'var(--text2)' },
  switchBtn: { background: 'none', border: 'none', color: 'var(--accent)', fontWeight: 500, cursor: 'pointer', fontSize: 13 },
}
