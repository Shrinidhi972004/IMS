import { useState, useEffect } from 'react'
import api from '../lib/api'
import { clearToken } from '../lib/api'

export default function TopBar({ onLogout, wsConnected }) {
  const [stats, setStats] = useState(null)

  useEffect(() => {
    const fetch = () => api.getDashboard().then(setStats).catch(() => {})
    fetch()
    const interval = setInterval(fetch, 10_000)
    return () => clearInterval(interval)
  }, [])

  return (
    <header style={styles.bar}>
      {/* Logo */}
      <div style={styles.logo}>
        <span style={styles.logoIcon}>◈</span>
        <div>
          <div style={styles.logoName}>IMS</div>
          <div style={styles.logoSub}>INCIDENT MANAGEMENT SYSTEM</div>
        </div>
      </div>

      {/* Live counters */}
      {stats && (
        <div style={styles.counters}>
          <Counter label="OPEN"   value={stats.total_open}          color="var(--p0)" />
          <Counter label="ACTIVE" value={stats.total_investigating}  color="var(--p1)" />
          <Counter label="SIG/S"  value={stats.signals_per_second?.toFixed(1) ?? '0'} color="var(--accent)" />
        </div>
      )}

      {/* Right side */}
      <div style={styles.right}>
        {/* WS connection indicator */}
        <div style={styles.wsIndicator}>
          <span style={{
            ...styles.wsDot,
            background: wsConnected ? '#4caf7d' : '#ff3b3b',
            boxShadow: wsConnected
              ? '0 0 8px rgba(76,175,125,0.6)'
              : '0 0 8px rgba(255,59,59,0.6)',
          }} />
          <span style={styles.wsLabel}>
            {wsConnected ? 'LIVE' : 'OFFLINE'}
          </span>
        </div>

        {/* Clock */}
        <Clock />

        {/* Logout */}
        <button
          style={styles.logoutBtn}
          onClick={() => { clearToken(); onLogout() }}
        >
          EXIT
        </button>
      </div>
    </header>
  )
}

function Counter({ label, value, color }) {
  return (
    <div style={styles.counter}>
      <div style={{ ...styles.counterValue, color }}>{value}</div>
      <div style={styles.counterLabel}>{label}</div>
    </div>
  )
}

function Clock() {
  const [time, setTime] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  return (
    <div style={styles.clock}>
      {time.toUTCString().slice(17, 25)} UTC
    </div>
  )
}

const styles = {
  bar: {
    height: 56,
    background: 'var(--bg-surface)',
    borderBottom: '1px solid var(--border)',
    display: 'flex',
    alignItems: 'center',
    padding: '0 20px',
    gap: 32,
    flexShrink: 0,
    position: 'sticky',
    top: 0,
    zIndex: 100,
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  logoIcon: {
    fontSize: 22,
    color: 'var(--accent)',
    lineHeight: 1,
  },
  logoName: {
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    fontSize: 20,
    letterSpacing: '0.08em',
    color: 'var(--text-primary)',
    lineHeight: 1,
  },
  logoSub: {
    fontFamily: 'var(--font-mono)',
    fontSize: 8,
    letterSpacing: '0.12em',
    color: 'var(--text-muted)',
    marginTop: 2,
  },
  counters: {
    display: 'flex',
    gap: 24,
    marginLeft: 8,
  },
  counter: {
    textAlign: 'center',
  },
  counterValue: {
    fontFamily: 'var(--font-mono)',
    fontSize: 20,
    fontWeight: 700,
    lineHeight: 1,
  },
  counterLabel: {
    fontFamily: 'var(--font-mono)',
    fontSize: 9,
    letterSpacing: '0.12em',
    color: 'var(--text-muted)',
    marginTop: 2,
  },
  right: {
    marginLeft: 'auto',
    display: 'flex',
    alignItems: 'center',
    gap: 20,
  },
  wsIndicator: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  wsDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    display: 'inline-block',
    transition: 'all 0.3s',
  },
  wsLabel: {
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    letterSpacing: '0.1em',
    color: 'var(--text-secondary)',
  },
  clock: {
    fontFamily: 'var(--font-mono)',
    fontSize: 12,
    color: 'var(--text-secondary)',
    letterSpacing: '0.05em',
  },
  logoutBtn: {
    background: 'transparent',
    border: '1px solid var(--border-bright)',
    color: 'var(--text-secondary)',
    fontFamily: 'var(--font-display)',
    fontWeight: 600,
    fontSize: 11,
    letterSpacing: '0.1em',
    padding: '5px 12px',
    borderRadius: 'var(--radius)',
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
}
