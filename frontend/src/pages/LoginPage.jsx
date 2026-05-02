import { useState } from 'react'
import api, { setToken } from '../lib/api'

export default function LoginPage({ onLogin }) {
  const [mode, setMode] = useState('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPass, setShowPass] = useState(false)

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
      <div style={s.left}>
        <div style={s.formWrap}>
          <div style={s.logo}>
            <div style={s.logoIcon}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
              </svg>
            </div>
            <span style={s.logoText}>IMS</span>
          </div>

          <h1 style={s.heading}>{mode === 'login' ? 'Welcome Back' : 'Create Account'}</h1>
          <p style={s.subheading}>
            {mode === 'login'
              ? 'Enter your credentials to access your dashboard.'
              : 'Register to start managing incidents.'}
          </p>

          <form onSubmit={handleSubmit} style={s.form}>
            <div style={s.field}>
              <label style={s.label}>Username</label>
              <input
                style={s.input}
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="your_username"
                autoFocus
                minLength={3}
                required
              />
            </div>

            <div style={s.field}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label style={s.label}>Password</label>
                {mode === 'signup' && <span style={s.hint}>min. 6 characters</span>}
              </div>
              <div style={s.passWrap}>
                <input
                  style={{ ...s.input, paddingRight: 40 }}
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  minLength={6}
                  required
                />
                <button type="button" style={s.eyeBtn} onClick={() => setShowPass(!showPass)}>
                  {showPass ? '🙈' : '👁'}
                </button>
              </div>
            </div>

            {error && (
              <div style={s.error}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                {error}
              </div>
            )}

            <button type="submit" style={s.submitBtn} disabled={loading}>
              {loading ? '...' : (mode === 'login' ? 'Sign In' : 'Create Account')}
            </button>
          </form>

          <p style={s.switchText}>
            {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
            <button style={s.switchBtn} onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError('') }}>
              {mode === 'login' ? 'Register Now.' : 'Sign In.'}
            </button>
          </p>

          <div style={s.footer}>Copyright © 2025 IMS — Zeotap Assignment</div>
        </div>
      </div>

      <div style={s.right}>
        <div style={s.rightContent}>
          <h2 style={s.rightTitle}>Effortlessly manage incidents across your entire stack.</h2>
          <p style={s.rightSub}>Real-time incident detection, debounced alerting, and mandatory RCA workflows — all in one place.</p>

          <div style={s.mockWrap}>
            <div style={s.mockCard}>
              <div style={s.mockHeader}>
                <div style={s.mockDot} />
                <div style={{ ...s.mockDot, background: 'rgba(255,255,255,0.4)' }} />
                <div style={{ ...s.mockDot, background: 'rgba(255,255,255,0.2)' }} />
              </div>
              <div style={s.mockStats}>
                <MockStat label="Active Incidents" value="3" color="#ff6b6b" />
                <MockStat label="Signals/sec" value="124" color="#ffd43b" />
                <MockStat label="MTTR Avg" value="42m" color="#69db7c" />
              </div>
              <div style={s.mockRows}>
                <MockRow sev="P0" comp="RDBMS_PRIMARY" state="OPEN" />
                <MockRow sev="P1" comp="MCP_HOST_02" state="INVESTIGATING" />
                <MockRow sev="P2" comp="CACHE_CLUSTER" state="RESOLVED" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function MockStat({ label, value, color }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 20, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>{label}</div>
    </div>
  )
}

function MockRow({ sev, comp, state }) {
  const sevColor = { P0: '#ff6b6b', P1: '#ffd43b', P2: '#74c0fc' }[sev]
  const stateColor = { OPEN: '#ff6b6b', INVESTIGATING: '#ffd43b', RESOLVED: '#74c0fc' }[state]
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
      <span style={{ fontSize: 9, fontWeight: 700, color: sevColor, background: `${sevColor}20`, padding: '2px 6px', borderRadius: 3 }}>{sev}</span>
      <span style={{ flex: 1, fontSize: 10, color: 'rgba(255,255,255,0.7)', fontFamily: 'monospace' }}>{comp}</span>
      <span style={{ fontSize: 9, color: stateColor }}>{state}</span>
    </div>
  )
}

const s = {
  root: { display: 'flex', minHeight: '100vh', background: '#f8f9fa' },
  left: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 32px', background: '#ffffff' },
  formWrap: { width: '100%', maxWidth: 380, display: 'flex', flexDirection: 'column' },
  logo: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 36 },
  logoIcon: { width: 32, height: 32, borderRadius: 8, background: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  logoText: { fontSize: 16, fontWeight: 700, color: '#0f172a', letterSpacing: '-0.02em' },
  heading: { fontSize: 26, fontWeight: 700, color: '#0f172a', letterSpacing: '-0.02em', marginBottom: 8 },
  subheading: { fontSize: 13, color: '#64748b', marginBottom: 28, lineHeight: 1.5 },
  form: { display: 'flex', flexDirection: 'column', gap: 18 },
  field: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { fontSize: 13, fontWeight: 500, color: '#374151' },
  hint: { fontSize: 11, color: '#94a3b8' },
  input: { width: '100%', padding: '10px 14px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, color: '#0f172a', background: '#ffffff', outline: 'none', fontFamily: 'inherit' },
  passWrap: { position: 'relative' },
  eyeBtn: { position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, padding: 0 },
  error: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 12, color: '#dc2626' },
  submitBtn: { width: '100%', padding: '11px', background: '#6366f1', color: '#ffffff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', marginTop: 4, fontFamily: 'inherit' },
  switchText: { textAlign: 'center', marginTop: 20, fontSize: 13, color: '#64748b' },
  switchBtn: { background: 'none', border: 'none', color: '#6366f1', fontWeight: 600, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' },
  footer: { marginTop: 40, fontSize: 11, color: '#94a3b8', textAlign: 'center' },
  right: { width: '50%', background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 50%, #3730a3 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 40px' },
  rightContent: { maxWidth: 420 },
  rightTitle: { fontSize: 28, fontWeight: 700, color: '#ffffff', lineHeight: 1.3, marginBottom: 14, letterSpacing: '-0.02em' },
  rightSub: { fontSize: 14, color: 'rgba(255,255,255,0.65)', lineHeight: 1.6, marginBottom: 32 },
  mockWrap: { background: 'rgba(255,255,255,0.08)', borderRadius: 12, padding: 16, border: '1px solid rgba(255,255,255,0.15)' },
  mockCard: { background: 'rgba(15,23,42,0.6)', borderRadius: 8, padding: 14 },
  mockHeader: { display: 'flex', gap: 5, marginBottom: 14 },
  mockDot: { width: 8, height: 8, borderRadius: '50%', background: 'rgba(255,255,255,0.7)' },
  mockStats: { display: 'flex', justifyContent: 'space-around', padding: '10px 0', marginBottom: 12, borderBottom: '1px solid rgba(255,255,255,0.08)' },
  mockRows: { display: 'flex', flexDirection: 'column' },
}