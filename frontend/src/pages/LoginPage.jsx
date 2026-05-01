import { useState } from 'react'
import api, { setToken } from '../lib/api'

export default function LoginPage({ onLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await api.login(username, password)
      setToken(res.token)
      onLogin()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={styles.root}>
      <div style={styles.terminal}>
        {/* Header */}
        <div style={styles.termHeader}>
          <span style={styles.dot} />
          <span style={{ ...styles.dot, background: '#ff8c00' }} />
          <span style={{ ...styles.dot, background: '#4caf7d' }} />
          <span style={styles.termTitle}>ims-auth — bash</span>
        </div>

        {/* Boot lines */}
        <div style={styles.boot}>
          <BootLine delay={0}  text="IMS v1.0.0 — Incident Management System" />
          <BootLine delay={80} text="Loading subsystems..." dim />
          <BootLine delay={160} text="[  OK  ] Postgres · MongoDB · Redis" green />
          <BootLine delay={240} text="[  OK  ] Worker pool · WebSocket hub" green />
          <BootLine delay={320} text="Awaiting operator authentication." />
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.field}>
            <label style={styles.label}>LOGIN</label>
            <div style={styles.inputRow}>
              <span style={styles.prompt}>$</span>
              <input
                style={styles.input}
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="username"
                autoFocus
                autoComplete="username"
                spellCheck={false}
              />
            </div>
          </div>

          <div style={styles.field}>
            <label style={styles.label}>PASSWORD</label>
            <div style={styles.inputRow}>
              <span style={styles.prompt}>$</span>
              <input
                style={styles.input}
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </div>
          </div>

          {error && (
            <div style={styles.error}>
              ✗ {error}
            </div>
          )}

          <button type="submit" style={styles.btn} disabled={loading}>
            {loading ? 'AUTHENTICATING...' : '[ AUTHENTICATE ]'}
          </button>
        </form>

        <div style={styles.hint}>
          Demo credentials: admin / admin123 &nbsp;·&nbsp; viewer / viewer123
        </div>
      </div>
    </div>
  )
}

function BootLine({ text, dim, green, delay }) {
  return (
    <div style={{
      fontFamily: "'Share Tech Mono', monospace",
      fontSize: 12,
      color: green ? '#4caf7d' : dim ? '#3d5166' : '#6b8299',
      marginBottom: 2,
      animation: `fadeUp 0.3s ease ${delay}ms both`,
    }}>
      {text}
    </div>
  )
}

const styles = {
  root: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  terminal: {
    background: '#0d1117',
    border: '1px solid #1e2d3d',
    borderRadius: 6,
    width: '100%',
    maxWidth: 480,
    overflow: 'hidden',
    boxShadow: '0 0 60px rgba(0,0,0,0.6), 0 0 120px rgba(59,158,255,0.04)',
  },
  termHeader: {
    background: '#131920',
    borderBottom: '1px solid #1e2d3d',
    padding: '10px 16px',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 10, height: 10,
    borderRadius: '50%',
    background: '#ff3b3b',
    display: 'inline-block',
  },
  termTitle: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 11,
    color: '#3d5166',
    marginLeft: 8,
    letterSpacing: '0.05em',
  },
  boot: {
    padding: '20px 24px 8px',
  },
  form: {
    padding: '16px 24px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  label: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 10,
    letterSpacing: '0.15em',
    color: '#3b9eff',
  },
  inputRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    background: '#080b0f',
    border: '1px solid #1e2d3d',
    borderRadius: 4,
    padding: '0 12px',
  },
  prompt: {
    fontFamily: "'Share Tech Mono', monospace",
    color: '#4caf7d',
    fontSize: 14,
    flexShrink: 0,
  },
  input: {
    background: 'transparent',
    border: 'none',
    color: '#c9d8e8',
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 13,
    padding: '10px 0',
    outline: 'none',
    width: '100%',
  },
  error: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 12,
    color: '#ff3b3b',
    background: 'rgba(255,59,59,0.08)',
    border: '1px solid rgba(255,59,59,0.2)',
    borderRadius: 4,
    padding: '8px 12px',
  },
  btn: {
    background: 'transparent',
    border: '1px solid #3b9eff',
    color: '#3b9eff',
    fontFamily: "'Barlow Condensed', sans-serif",
    fontWeight: 700,
    fontSize: 13,
    letterSpacing: '0.1em',
    padding: '12px 24px',
    borderRadius: 4,
    cursor: 'pointer',
    transition: 'all 0.15s',
    marginTop: 4,
  },
  hint: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 10,
    color: '#3d5166',
    textAlign: 'center',
    padding: '0 24px 16px',
  },
}
