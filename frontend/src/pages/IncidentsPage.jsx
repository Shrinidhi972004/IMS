import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import api from '../lib/api'
import { useWebSocket } from '../hooks/useWebSocket'

const FILTERS = [
  { label: 'All', key: 'All', color: '#6366f1', bg: '#eef2ff' },
  { label: 'Open', key: 'Open', color: '#dc2626', bg: '#fef2f2' },
  { label: 'Investigating', key: 'Investigating', color: '#d97706', bg: '#fffbeb' },
  { label: 'Resolved', key: 'Resolved', color: '#2563eb', bg: '#eff6ff' },
  { label: 'Closed', key: 'Closed', color: '#16a34a', bg: '#f0fdf4' },
]

export default function IncidentsPage({ onWsConnect }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('All')
  const navigate = useNavigate()

  const load = useCallback(async () => {
    try {
      const res = await api.listWorkItems()
      setItems(res.data || [])
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

  const filtered = items.filter(wi =>
    filter === 'All' ? true : wi.state === filter.toUpperCase()
  )

  const counts = {
    All: items.length,
    Open: items.filter(i => i.state === 'OPEN').length,
    Investigating: items.filter(i => i.state === 'INVESTIGATING').length,
    Resolved: items.filter(i => i.state === 'RESOLVED').length,
    Closed: items.filter(i => i.state === 'CLOSED').length,
  }

  return (
    <div style={s.root}>
      {/* Page header */}
      <div style={s.pageHeader}>
        <div>
          <h1 style={s.title}>Incidents</h1>
          <p style={s.subtitle}>
            Track, manage and resolve all infrastructure incidents across your stack.
            {' '}<span style={s.liveTag}>
              <span className="live-dot" style={{ width: 6, height: 6 }} />
              Live
            </span>
          </p>
        </div>
        <div style={s.headerRight}>
          <div style={s.totalBadge}>
            <span style={s.totalNum}>{items.length}</span>
            <span style={s.totalLabel}>Total Incidents</span>
          </div>
        </div>
      </div>

      {/* Filter tabs */}
      <div style={s.filterBar}>
        {FILTERS.map(({ label, key, color, bg }) => {
          const active = filter === key
          return (
            <button
              key={key}
              style={{
                ...s.filterTab,
                background: active ? bg : 'white',
                border: `1.5px solid ${active ? color : '#e2e8f0'}`,
                color: active ? color : '#64748b',
              }}
              onClick={() => setFilter(key)}
            >
              <span style={{
                ...s.filterDot,
                background: color,
                opacity: active ? 1 : 0.3,
              }} />
              {label}
              <span style={{
                ...s.filterCount,
                background: active ? color : '#f1f5f9',
                color: active ? 'white' : '#64748b',
              }}>
                {counts[key]}
              </span>
            </button>
          )
        })}
      </div>

      {/* Table */}
      <div style={s.tableWrap}>
        <table style={s.table}>
          <thead>
            <tr style={s.thead}>
              <th style={{ ...s.th, width: 100 }}>Severity</th>
              <th style={s.th}>Incident</th>
              <th style={{ ...s.th, width: 180 }}>Component</th>
              <th style={{ ...s.th, width: 130 }}>Status</th>
              <th style={{ ...s.th, width: 90, textAlign: 'center' }}>Signals</th>
              <th style={{ ...s.th, width: 130, textAlign: 'right' }}>Age</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} style={{ padding: 64, textAlign: 'center' }}>
                  <span className="spinner" />
                </td>
              </tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={6} style={s.emptyCell}>
                  <div style={s.emptyIcon}>🎉</div>
                  <div style={s.emptyTitle}>No incidents found</div>
                  <div style={s.emptyDesc}>
                    {filter === 'All' ? 'Your infrastructure is healthy.' : `No ${filter.toLowerCase()} incidents.`}
                  </div>
                </td>
              </tr>
            )}
            {filtered.map(wi => (
              <IncidentRow key={wi.id} wi={wi} onClick={() => navigate(`/incident/${wi.id}`)} />
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer count */}
      {!loading && filtered.length > 0 && (
        <div style={s.tableFooter}>
          Showing {filtered.length} of {items.length} incidents
        </div>
      )}
    </div>
  )
}

function IncidentRow({ wi, onClick }) {
  const [hovered, setHovered] = useState(false)
  const sevColor = { P0: '#dc2626', P1: '#d97706', P2: '#2563eb' }[wi.severity]
  const sevBg = { P0: '#fef2f2', P1: '#fffbeb', P2: '#eff6ff' }[wi.severity]
  const stateColors = {
    OPEN: { color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
    INVESTIGATING: { color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
    RESOLVED: { color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
    CLOSED: { color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
  }
  const sc = stateColors[wi.state] || stateColors.OPEN

  return (
    <tr
      style={{
        borderBottom: '1px solid #f1f5f9',
        cursor: 'pointer',
        background: hovered ? '#f8faff' : 'white',
        transition: 'background 0.12s',
      }}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Severity */}
      <td style={s.td}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 4, height: 40, background: sevColor, borderRadius: 2, flexShrink: 0 }} />
          <span style={{
            fontSize: 11, fontWeight: 700, color: sevColor,
            background: sevBg, padding: '3px 8px', borderRadius: 5,
            border: `1px solid ${sevColor}30`,
          }}>
            {wi.severity}
          </span>
        </div>
      </td>

      {/* Incident */}
      <td style={s.td}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', marginBottom: 3 }}>
          {wi.title}
        </div>
        <div style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace' }}>
          ID: {wi.id.slice(0, 12)}...
        </div>
      </td>

      {/* Component */}
      <td style={s.td}>
        <div style={{ fontSize: 13, fontFamily: 'monospace', fontWeight: 600, color: '#1e293b', marginBottom: 3 }}>
          {wi.component_id}
        </div>
        <span style={{
          fontSize: 10, color: '#6366f1', background: '#eef2ff',
          padding: '1px 6px', borderRadius: 3, fontWeight: 600,
        }}>
          {wi.component_type}
        </span>
      </td>

      {/* Status */}
      <td style={s.td}>
        <span style={{
          fontSize: 12, fontWeight: 600, color: sc.color,
          background: sc.bg, border: `1px solid ${sc.border}`,
          padding: '4px 12px', borderRadius: 20, display: 'inline-block',
        }}>
          {wi.state}
        </span>
      </td>

      {/* Signals */}
      <td style={{ ...s.td, textAlign: 'center' }}>
        <span style={{
          fontSize: 14, fontWeight: 700, color: '#1e293b',
          background: '#f8fafc', border: '1px solid #e2e8f0',
          padding: '3px 10px', borderRadius: 6, display: 'inline-block',
        }}>
          {wi.signal_count}
        </span>
      </td>

      {/* Age */}
      <td style={{ ...s.td, textAlign: 'right' }}>
        <span style={{ fontSize: 12, color: '#64748b' }}>
          {formatDistanceToNow(new Date(wi.created_at))} ago
        </span>
      </td>
    </tr>
  )
}

const s = {
  root: { padding: '32px 36px', maxWidth: 1300, margin: '0 auto' },
  pageHeader: {
    display: 'flex', alignItems: 'flex-start',
    justifyContent: 'space-between', marginBottom: 28,
  },
  title: {
    fontSize: 28, fontWeight: 800, color: '#0f172a',
    letterSpacing: '-0.03em', marginBottom: 8,
  },
  subtitle: {
    fontSize: 15, color: '#475569', lineHeight: 1.5,
    display: 'flex', alignItems: 'center', gap: 10,
  },
  liveTag: {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    background: '#f0fdf4', color: '#16a34a',
    fontSize: 11, fontWeight: 600, padding: '2px 8px',
    borderRadius: 20, border: '1px solid #bbf7d0',
  },
  headerRight: { display: 'flex', alignItems: 'center', gap: 12 },
  totalBadge: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    background: 'white', border: '1px solid #e2e8f0',
    borderRadius: 12, padding: '10px 20px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
  },
  totalNum: { fontSize: 28, fontWeight: 800, color: '#6366f1', lineHeight: 1 },
  totalLabel: { fontSize: 11, color: '#94a3b8', marginTop: 3, fontWeight: 500 },
  filterBar: {
    display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap',
  },
  filterTab: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '9px 16px', borderRadius: 10,
    fontSize: 13, fontWeight: 600, cursor: 'pointer',
    transition: 'all 0.15s', fontFamily: 'inherit',
    boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
  },
  filterDot: {
    width: 7, height: 7, borderRadius: '50%', display: 'inline-block',
  },
  filterCount: {
    fontSize: 11, fontWeight: 700, padding: '1px 7px',
    borderRadius: 20, minWidth: 20, textAlign: 'center',
  },
  tableWrap: {
    background: 'white', borderRadius: 14,
    border: '1px solid #e2e8f0',
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
    overflow: 'hidden',
  },
  table: { width: '100%', borderCollapse: 'collapse' },
  thead: { background: '#f8fafc', borderBottom: '2px solid #e2e8f0' },
  th: {
    padding: '12px 16px', textAlign: 'left',
    fontSize: 11, fontWeight: 700, color: '#64748b',
    textTransform: 'uppercase', letterSpacing: '0.07em',
  },
  td: { padding: '14px 16px', verticalAlign: 'middle' },
  emptyCell: { padding: '80px 16px', textAlign: 'center' },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyTitle: { fontSize: 16, fontWeight: 600, color: '#1e293b', marginBottom: 6 },
  emptyDesc: { fontSize: 13, color: '#94a3b8' },
  tableFooter: {
    marginTop: 12, fontSize: 12, color: '#94a3b8', textAlign: 'right',
  },
}