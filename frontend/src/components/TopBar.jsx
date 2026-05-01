import { useState, useEffect } from 'react'
import api, { clearToken } from '../lib/api'

export default function TopBar({ onLogout, wsConnected }) {
  const [stats, setStats] = useState(null)
  const [time, setTime] = useState(new Date())

  useEffect(() => {
    const fetch = () => api.getDashboard().then(setStats).catch(() => {})
    fetch()
    const i = setInterval(fetch, 3000)
    return () => clearInterval(i)
  }, [])

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  return (
    <header style={s.bar}>
      <div style={s.left}>
        <div style={s.logoWrap}>
          <div style={s.logoIcon}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
            </svg>
          </div>
          <span style={s.logoText}>IMS</span>
        </div>

        <div style={s.divider} />

        {stats && (
          <div style={s.stats}>
            <Stat label="Open" value={stats.total_open} color="var(--p0)" />
            <Stat label="Investigating" value={stats.total_investigating} color="var(--p1)" />
            <Stat label="Sig/s" value={stats.signals_per_second?.toFixed(1) ?? '0'} color="var(--accent)" />
          </div>
        )}
      </div>

      <div style={s.right}>
        <div style={s.wsStatus}>
          <span style={{ ...s.wsDot, background: wsConnected ? 'var(--green)' : 'var(--p0)' }} />
          <span style={s.wsText}>{wsConnected ? 'Live' : 'Connecting'}</span>
        </div>
        <span style={s.clock}>{time.toUTCString().slice(17, 25)} UTC</span>
        <button className="btn btn-secondary" style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => { clearToken(); onLogout() }}>
          Sign out
        </button>
      </div>
    </header>
  )
}

function Stat({ label, value, color }) {
  return (
    <div style={s.stat}>
      <span style={{ ...s.statValue, color }}>{value}</span>
      <span style={s.statLabel}>{label}</span>
    </div>
  )
}

const s = {
  bar: { height: 52, background: 'var(--surface)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', padding: '0 20px', gap: 0, flexShrink: 0, position: 'sticky', top: 0, zIndex: 100, boxShadow: '0 1px 0 var(--border)' },
  left: { display: 'flex', alignItems: 'center', gap: 16, flex: 1 },
  logoWrap: { display: 'flex', alignItems: 'center', gap: 8 },
  logoIcon: { width: 28, height: 28, borderRadius: 7, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  logoText: { fontSize: 15, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em' },
  divider: { width: 1, height: 20, background: 'var(--border)', margin: '0 4px' },
  stats: { display: 'flex', gap: 20 },
  stat: { display: 'flex', alignItems: 'baseline', gap: 5 },
  statValue: { fontSize: 15, fontWeight: 600 },
  statLabel: { fontSize: 11, color: 'var(--text3)' },
  right: { display: 'flex', alignItems: 'center', gap: 16 },
  wsStatus: { display: 'flex', alignItems: 'center', gap: 5 },
  wsDot: { width: 6, height: 6, borderRadius: '50%', display: 'inline-block' },
  wsText: { fontSize: 12, color: 'var(--text2)' },
  clock: { fontSize: 12, color: 'var(--text3)', fontVariantNumeric: 'tabular-nums' },
}
