import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import api from '../lib/api'
import { useWebSocket } from '../hooks/useWebSocket'

export default function Dashboard({ onWsConnect }) {
  const [stats, setStats] = useState(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  const load = useCallback(async () => {
    try {
      const [dash, wi] = await Promise.all([
        api.getDashboard(),
        api.listWorkItems(),
      ])
      setStats(dash)
      setItems(wi.data || [])
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    load()
    const interval = setInterval(load, 3000)
    return () => clearInterval(interval)
  }, [load])

  const handleWsMessage = useCallback((msg) => {
    if (msg.type !== 'ping') load()
    if (onWsConnect) onWsConnect(true)
  }, [load, onWsConnect])

  useWebSocket(handleWsMessage)

  const active = items.filter(i => i.state === 'OPEN' || i.state === 'INVESTIGATING')

  return (
    <div style={s.root}>
      {/* Page header */}
      <div style={s.pageHeader}>
        <div>
          <h1 style={s.title}>Dashboard</h1>
          <p style={s.subtitle}>Real-time overview of your infrastructure health</p>
        </div>
        <div style={s.liveWrap}>
          <span className="live-dot" />
          <span style={{ fontSize: 12, color: 'var(--text2)' }}>Live</span>
        </div>
      </div>

      {/* Stat cards */}
      <div style={s.statsGrid}>
        <StatCard label="Open" value={stats?.total_open ?? 0} color="#dc2626" bg="#fef2f2" icon="🔴" />
        <StatCard label="Investigating" value={stats?.total_investigating ?? 0} color="#d97706" bg="#fffbeb" icon="🟡" />
        <StatCard label="Resolved" value={stats?.total_resolved ?? 0} color="#2563eb" bg="#eff6ff" icon="🔵" />
        <StatCard label="Closed" value={stats?.total_closed ?? 0} color="#16a34a" bg="#f0fdf4" icon="✅" />
        <StatCard label="Signals/sec" value={stats?.signals_per_second?.toFixed(1) ?? '0'} color="#6366f1" bg="#eef2ff" icon="📡" />
      </div>

      {/* Active incidents */}
      <div style={s.section}>
        <div style={s.sectionHeader}>
          <h2 style={s.sectionTitle}>Active Incidents</h2>
          <button className="btn btn-secondary" style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => navigate('/incidents')}>
            View all →
          </button>
        </div>

        <div className="card" style={{ overflow: 'hidden' }}>
          <table style={s.table}>
            <thead>
              <tr style={s.thead}>
                <th style={s.th}>Severity</th>
                <th style={s.th}>Incident</th>
                <th style={s.th}>Component</th>
                <th style={s.th}>Status</th>
                <th style={s.th}>Signals</th>
                <th style={{ ...s.th, textAlign: 'right' }}>Age</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={6} style={{ padding: 48, textAlign: 'center' }}><span className="spinner" /></td></tr>
              )}
              {!loading && active.length === 0 && (
                <tr><td colSpan={6} style={{ padding: 48, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
                  No active incidents 🎉
                </td></tr>
              )}
              {active.map((wi, i) => (
                <IncidentRow key={wi.id} wi={wi} onClick={() => navigate(`/incident/${wi.id}`)} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value, color, bg, icon }) {
  return (
    <div style={{ ...s.statCard, background: bg, borderColor: `${color}20` }}>
      <div style={s.statIcon}>{icon}</div>
      <div style={{ ...s.statValue, color }}>{value}</div>
      <div style={s.statLabel}>{label}</div>
    </div>
  )
}

function IncidentRow({ wi, onClick }) {
  const [hovered, setHovered] = useState(false)
  const sevColor = { P0: 'var(--p0)', P1: 'var(--p1)', P2: 'var(--p2)' }[wi.severity]
  return (
    <tr
      style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', background: hovered ? 'var(--surface2)' : 'transparent', transition: 'background 0.1s' }}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <td style={s.td}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 3, height: 32, background: sevColor, borderRadius: 2, flexShrink: 0 }} />
          <span className={`badge badge-${wi.severity}`}>{wi.severity}</span>
        </div>
      </td>
      <td style={s.td}>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', marginBottom: 2 }}>{wi.title}</div>
        <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'monospace' }}>{wi.id.slice(0, 8)}...</div>
      </td>
      <td style={s.td}>
        <div style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--text)', fontWeight: 500 }}>{wi.component_id}</div>
        <div style={{ fontSize: 11, color: 'var(--text3)' }}>{wi.component_type}</div>
      </td>
      <td style={s.td}><span className={`state-badge state-${wi.state}`}>{wi.state}</span></td>
      <td style={{ ...s.td, color: 'var(--text2)', fontSize: 13 }}>{wi.signal_count}</td>
      <td style={{ ...s.td, textAlign: 'right', color: 'var(--text3)', fontSize: 12 }}>{formatDistanceToNow(new Date(wi.created_at))}</td>
    </tr>
  )
}



const s = {
  root: { padding: '28px 32px', maxWidth: 1200, margin: '0 auto' },
  pageHeader: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 },
  title: { fontSize: 22, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em', marginBottom: 4 },
  subtitle: { fontSize: 13, color: 'var(--text2)' },
  liveWrap: { display: 'flex', alignItems: 'center', gap: 6 },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 28 },
  statCard: { border: '1px solid', borderRadius: 12, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 4 },
  statIcon: { fontSize: 20, marginBottom: 4 },
  statValue: { fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em' },
  statLabel: { fontSize: 12, color: 'var(--text2)', fontWeight: 500 },
  section: { marginBottom: 24 },
  sectionHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: 600, color: 'var(--text)' },
  table: { width: '100%', borderCollapse: 'collapse' },
  thead: { background: 'var(--surface2)' },
  th: { padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid var(--border)' },
  td: { padding: '12px 16px', verticalAlign: 'middle' },
}