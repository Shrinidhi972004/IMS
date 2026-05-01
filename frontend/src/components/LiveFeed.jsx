import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import api from '../lib/api'
import { useWebSocket } from '../hooks/useWebSocket'

export default function LiveFeed({ onWsConnect }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState('ALL')
  const navigate = useNavigate()

  const load = useCallback(async () => {
    try {
      const res = await api.listWorkItems()
      setItems(res.data || [])
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // WebSocket — refresh list on any incident update
  const handleWsMessage = useCallback((msg) => {
    if (msg.type === 'incident_update' || msg.type === 'dashboard_update') {
      load()
    }
    if (onWsConnect) onWsConnect(true)
  }, [load, onWsConnect])

  useWebSocket(handleWsMessage)

  const filtered = items.filter(wi => {
    if (filter === 'ALL') return true
    if (filter === 'ACTIVE') return wi.state === 'OPEN' || wi.state === 'INVESTIGATING'
    return wi.state === filter
  })

  return (
    <div style={styles.root}>
      {/* Section header */}
      <div style={styles.header}>
        <div style={styles.titleRow}>
          <span style={styles.pulseWrap}>
            <span className="pulse-dot" />
          </span>
          <h2 style={styles.title}>ACTIVE INCIDENTS</h2>
          <span style={styles.count}>{filtered.length}</span>
        </div>

        {/* Filter tabs */}
        <div style={styles.filters}>
          {['ALL', 'ACTIVE', 'OPEN', 'INVESTIGATING', 'RESOLVED', 'CLOSED'].map(f => (
            <button
              key={f}
              style={{
                ...styles.filterBtn,
                ...(filter === f ? styles.filterBtnActive : {}),
              }}
              onClick={() => setFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Column headers */}
      <div style={styles.tableHead}>
        <span style={{ width: 60 }}>SEV</span>
        <span style={{ flex: 1 }}>INCIDENT</span>
        <span style={{ width: 120 }}>COMPONENT</span>
        <span style={{ width: 100 }}>STATE</span>
        <span style={{ width: 80 }}>SIGNALS</span>
        <span style={{ width: 120 }}>AGE</span>
      </div>

      {/* Rows */}
      <div style={styles.list}>
        {loading && (
          <div style={styles.center}>
            <div className="spinner" />
          </div>
        )}
        {error && (
          <div style={styles.errorMsg}>✗ {error}</div>
        )}
        {!loading && filtered.length === 0 && (
          <div style={styles.empty}>
            <span style={styles.emptyIcon}>◎</span>
            <span>No incidents match filter</span>
          </div>
        )}
        {filtered.map((wi, i) => (
          <IncidentRow
            key={wi.id}
            wi={wi}
            index={i}
            onClick={() => navigate(`/incident/${wi.id}`)}
          />
        ))}
      </div>
    </div>
  )
}

function IncidentRow({ wi, onClick, index }) {
  const severityColor = {
    P0: 'var(--p0)', P1: 'var(--p1)', P2: 'var(--p2)',
  }[wi.severity] || 'var(--text-secondary)'

  const age = formatDistanceToNow(new Date(wi.created_at), { addSuffix: false })

  return (
    <div
      style={{
        ...styles.row,
        animationDelay: `${index * 30}ms`,
        borderLeft: `3px solid ${severityColor}`,
      }}
      className="fade-up"
      onClick={onClick}
    >
      {/* Severity */}
      <span style={{ width: 60 }}>
        <span className={`badge badge-${wi.severity}`}>{wi.severity}</span>
      </span>

      {/* Title */}
      <span style={{ flex: 1 }}>
        <div style={styles.rowTitle}>{wi.title}</div>
        <div style={styles.rowId} className="mono">{wi.id.slice(0, 8)}…</div>
      </span>

      {/* Component */}
      <span style={{ width: 120 }}>
        <div style={styles.component} className="mono">{wi.component_id}</div>
        <div style={styles.compType}>{wi.component_type}</div>
      </span>

      {/* State */}
      <span style={{ width: 100 }}>
        <span className={`state-badge state-${wi.state}`}>{wi.state}</span>
      </span>

      {/* Signal count */}
      <span style={{ width: 80 }}>
        <span style={styles.sigCount} className="mono">{wi.signal_count}</span>
      </span>

      {/* Age */}
      <span style={{ width: 120 }}>
        <span style={styles.age} className="mono">{age}</span>
      </span>
    </div>
  )
}

const styles = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 20px',
    borderBottom: '1px solid var(--border)',
    flexShrink: 0,
    flexWrap: 'wrap',
    gap: 12,
  },
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  pulseWrap: {
    display: 'flex',
    alignItems: 'center',
  },
  title: {
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    fontSize: 16,
    letterSpacing: '0.1em',
    color: 'var(--text-primary)',
  },
  count: {
    fontFamily: 'var(--font-mono)',
    fontSize: 12,
    color: 'var(--text-secondary)',
    background: 'var(--bg-raised)',
    border: '1px solid var(--border)',
    padding: '1px 8px',
    borderRadius: 'var(--radius-sm)',
  },
  filters: {
    display: 'flex',
    gap: 4,
  },
  filterBtn: {
    background: 'transparent',
    border: '1px solid var(--border)',
    color: 'var(--text-secondary)',
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    letterSpacing: '0.08em',
    padding: '4px 10px',
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  filterBtnActive: {
    background: 'var(--accent-dim)',
    border: '1px solid var(--accent)',
    color: 'var(--accent)',
  },
  tableHead: {
    display: 'flex',
    alignItems: 'center',
    padding: '8px 20px',
    background: 'var(--bg-raised)',
    borderBottom: '1px solid var(--border)',
    fontFamily: 'var(--font-mono)',
    fontSize: 9,
    letterSpacing: '0.12em',
    color: 'var(--text-muted)',
    flexShrink: 0,
    gap: 12,
  },
  list: {
    flex: 1,
    overflowY: 'auto',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    padding: '12px 20px',
    borderBottom: '1px solid var(--border)',
    cursor: 'pointer',
    transition: 'background 0.12s',
    gap: 12,
  },
  rowTitle: {
    color: 'var(--text-primary)',
    fontSize: 13,
    fontWeight: 500,
    marginBottom: 2,
  },
  rowId: {
    fontSize: 10,
    color: 'var(--text-muted)',
  },
  component: {
    fontSize: 12,
    color: 'var(--text-mono)',
  },
  compType: {
    fontSize: 10,
    color: 'var(--text-muted)',
    marginTop: 2,
  },
  sigCount: {
    fontSize: 14,
    color: 'var(--text-secondary)',
  },
  age: {
    fontSize: 11,
    color: 'var(--text-secondary)',
  },
  center: {
    display: 'flex',
    justifyContent: 'center',
    padding: 48,
  },
  errorMsg: {
    fontFamily: 'var(--font-mono)',
    fontSize: 12,
    color: 'var(--p0)',
    padding: '20px 24px',
  },
  empty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12,
    padding: 64,
    fontFamily: 'var(--font-mono)',
    fontSize: 12,
    color: 'var(--text-muted)',
  },
  emptyIcon: {
    fontSize: 32,
    color: 'var(--border-bright)',
  },
}
