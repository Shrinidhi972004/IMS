import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import api from '../lib/api'
import { useWebSocket } from '../hooks/useWebSocket'

const FILTERS = ['All', 'Open', 'Investigating', 'Resolved', 'Closed']

export default function LiveFeed({ onWsConnect }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('All')
  const [error, setError] = useState(null)
  const navigate = useNavigate()

  const load = useCallback(async () => {
    try {
      const res = await api.listWorkItems()
      setItems(res.data || [])
      setError(null)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    load()
    const interval = setInterval(load, 3000)
    return () => clearInterval(interval)
  }, [load])

  const handleWsMessage = useCallback((msg) => {
    if (msg.type === 'incident_update' || msg.type === 'dashboard_update') load()
    if (onWsConnect) onWsConnect(true)
  }, [load, onWsConnect])

  useWebSocket(handleWsMessage)

  const filtered = items.filter(wi => {
    if (filter === 'All') return true
    return wi.state === filter.toUpperCase()
  })

  const counts = {
    All: items.length,
    Open: items.filter(i => i.state === 'OPEN').length,
    Investigating: items.filter(i => i.state === 'INVESTIGATING').length,
    Resolved: items.filter(i => i.state === 'RESOLVED').length,
    Closed: items.filter(i => i.state === 'CLOSED').length,
  }

  return (
    <div style={s.root}>
      <div style={s.pageHeader}>
        <div>
          <h1 style={s.pageTitle}>Incidents</h1>
          <p style={s.pageDesc}>Monitor and manage all active incidents across your stack</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="live-dot" />
          <span style={{ fontSize: 12, color: 'var(--text2)' }}>Live updates</span>
        </div>
      </div>

      <div style={s.filterBar}>
        {FILTERS.map(f => (
          <button key={f} style={{ ...s.filterTab, ...(filter === f ? s.filterTabActive : {}) }} onClick={() => setFilter(f)}>
            {f}
            <span style={{ ...s.filterCount, ...(filter === f ? s.filterCountActive : {}) }}>{counts[f]}</span>
          </button>
        ))}
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <table style={s.table}>
          <thead>
            <tr style={s.thead}>
              <th style={{ ...s.th, width: 80 }}>Severity</th>
              <th style={s.th}>Incident</th>
              <th style={{ ...s.th, width: 140 }}>Component</th>
              <th style={{ ...s.th, width: 120 }}>Status</th>
              <th style={{ ...s.th, width: 80, textAlign: 'right' }}>Signals</th>
              <th style={{ ...s.th, width: 110, textAlign: 'right' }}>Age</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={6} style={s.center}><span className="spinner" /></td></tr>
            )}
            {error && (
              <tr><td colSpan={6} style={s.center}><span style={{ color: 'var(--p0)', fontSize: 13 }}>{error}</span></td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={6} style={s.center}>
                <div style={{ color: 'var(--text3)', fontSize: 13 }}>No incidents found</div>
              </td></tr>
            )}
            {filtered.map((wi, i) => (
              <IncidentRow key={wi.id} wi={wi} index={i} onClick={() => navigate(`/incident/${wi.id}`)} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function IncidentRow({ wi, onClick, index }) {
  const [hovered, setHovered] = useState(false)
  const severityLeft = { P0: 'var(--p0)', P1: 'var(--p1)', P2: 'var(--p2)' }[wi.severity] || 'var(--border)'

  return (
    <tr
      className="fade-up"
      style={{ animationDelay: `${index * 20}ms`, cursor: 'pointer', background: hovered ? 'var(--surface2)' : 'transparent', borderBottom: '1px solid var(--border)', transition: 'background 0.1s' }}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <td style={{ ...s.td, paddingLeft: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', paddingLeft: 20 }}>
          <div style={{ width: 3, height: 36, background: severityLeft, borderRadius: 2, marginRight: 12, flexShrink: 0 }} />
          <span className={`badge badge-${wi.severity}`}>{wi.severity}</span>
        </div>
      </td>
      <td style={s.td}>
        <div style={s.rowTitle}>{wi.title}</div>
        <div style={s.rowId}>{wi.id.slice(0, 8)}...</div>
      </td>
      <td style={s.td}>
        <div style={s.compId}>{wi.component_id}</div>
        <div style={s.compType}>{wi.component_type}</div>
      </td>
      <td style={s.td}>
        <span className={`state-badge state-${wi.state}`}>{wi.state}</span>
      </td>
      <td style={{ ...s.td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--text2)', fontSize: 13 }}>
        {wi.signal_count}
      </td>
      <td style={{ ...s.td, textAlign: 'right', color: 'var(--text3)', fontSize: 12 }}>
        {formatDistanceToNow(new Date(wi.created_at))}
      </td>
    </tr>
  )
}

const s = {
  root: { padding: '28px 32px', maxWidth: 1200, margin: '0 auto' },
  pageHeader: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 },
  pageTitle: { fontSize: 22, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em', marginBottom: 4 },
  pageDesc: { fontSize: 13, color: 'var(--text2)' },
  filterBar: { display: 'flex', gap: 2, marginBottom: 16, background: 'var(--surface2)', borderRadius: 8, padding: 3, alignSelf: 'flex-start', width: 'fit-content' },
  filterTab: { padding: '6px 14px', borderRadius: 6, fontSize: 13, fontWeight: 500, color: 'var(--text2)', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.15s' },
  filterTabActive: { background: 'var(--surface)', color: 'var(--text)', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' },
  filterCount: { fontSize: 11, background: 'var(--border)', color: 'var(--text3)', padding: '1px 6px', borderRadius: 10, fontWeight: 600 },
  filterCountActive: { background: 'var(--accent-light)', color: 'var(--accent)' },
  table: { width: '100%', borderCollapse: 'collapse' },
  thead: { background: 'var(--surface2)' },
  th: { padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid var(--border)' },
  td: { padding: '12px 16px', verticalAlign: 'middle' },
  rowTitle: { fontSize: 13, fontWeight: 500, color: 'var(--text)', marginBottom: 2 },
  rowId: { fontSize: 11, color: 'var(--text3)', fontFamily: 'monospace' },
  compId: { fontSize: 13, color: 'var(--text)', fontFamily: 'monospace', fontWeight: 500, marginBottom: 1 },
  compType: { fontSize: 11, color: 'var(--text3)' },
  center: { padding: '48px 16px', textAlign: 'center' },
}