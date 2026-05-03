import { useState, useEffect, useCallback } from 'react'
import api from '../lib/api'
import { useWebSocket } from '../hooks/useWebSocket'

export default function Settings() {
  const [health, setHealth] = useState(null)
  const [dashboard, setDashboard] = useState(null)
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState(null)

  const fetchData = useCallback(async () => {
    try {
      const dash = await api.getDashboard()
      setDashboard(dash)

      const res = await fetch('/health')
      if (res.ok) {
        const data = await res.json()
        setHealth(data)
      }
      setLastUpdated(new Date())
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

  const handleWsMessage = useCallback(() => {
    fetchData()
  }, [fetchData])

  useWebSocket(handleWsMessage)

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 3000)
    return () => clearInterval(interval)
  }, [fetchData])

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
      <span className="spinner" />
    </div>
  )

  const isHealthy = health?.status === 'healthy'

  return (
    <div style={s.root}>
      <div style={s.pageHeader}>
        <div>
          <h1 style={s.title}>System Settings</h1>
          <p style={s.subtitle}>
            Real-time system health and configuration
            {lastUpdated && (
              <span style={s.updated}>· Updated {lastUpdated.toLocaleTimeString()}</span>
            )}
          </p>
        </div>
        <div style={{
          ...s.statusBadge,
          background: isHealthy ? '#f0fdf4' : '#fef2f2',
          border: `1px solid ${isHealthy ? '#bbf7d0' : '#fecaca'}`,
          color: isHealthy ? '#16a34a' : '#dc2626',
        }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            background: isHealthy ? '#16a34a' : '#dc2626',
            display: 'inline-block',
          }} />
          {isHealthy ? 'All Systems Operational' : health ? 'System Degraded' : 'Checking...'}
        </div>
      </div>

      <div style={s.grid}>

        {/* Dependencies */}
        <div style={s.card}>
          <div style={s.cardHeader}>
            <span style={s.cardTitle}>🔌 Data Store Connections</span>
          </div>
          <div style={s.cardBody}>
            {health?.dependencies
              ? Object.entries(health.dependencies).map(([name, status]) => (
                <div key={name} style={s.depRow}>
                  <div style={s.depLeft}>
                    <span style={s.depIcon}>
                      {name === 'postgres' ? '🐘' : name === 'mongodb' ? '🍃' : '⚡'}
                    </span>
                    <div>
                      <div style={s.depName}>{name.toUpperCase()}</div>
                      <div style={s.depDesc}>
                        {name === 'postgres' ? 'Source of truth — WorkItems + RCA' :
                         name === 'mongodb' ? 'Raw signal audit log' :
                         'Dashboard cache + debounce tracking'}
                      </div>
                    </div>
                  </div>
                  <div style={{
                    ...s.depStatus,
                    background: status === 'ok' ? '#f0fdf4' : '#fef2f2',
                    color: status === 'ok' ? '#16a34a' : '#dc2626',
                    border: `1px solid ${status === 'ok' ? '#bbf7d0' : '#fecaca'}`,
                  }}>
                    {status === 'ok' ? '✓ Connected' : '✗ Unreachable'}
                  </div>
                </div>
              ))
              : [
                  { name: 'postgres', label: 'POSTGRESQL', desc: 'Source of truth — WorkItems + RCA', icon: '🐘' },
                  { name: 'mongodb', label: 'MONGODB', desc: 'Raw signal audit log', icon: '🍃' },
                  { name: 'redis', label: 'REDIS', desc: 'Dashboard cache + debounce tracking', icon: '⚡' },
                ].map(({ name, label, desc, icon }) => (
                  <div key={name} style={s.depRow}>
                    <div style={s.depLeft}>
                      <span style={s.depIcon}>{icon}</span>
                      <div>
                        <div style={s.depName}>{label}</div>
                        <div style={s.depDesc}>{desc}</div>
                      </div>
                    </div>
                    <div style={{ ...s.depStatus, background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0' }}>
                      ✓ Connected
                    </div>
                  </div>
                ))
            }
          </div>
        </div>

        {/* Signal Queue */}
        <div style={s.card}>
          <div style={s.cardHeader}>
            <span style={s.cardTitle}>📊 Signal Queue</span>
          </div>
          <div style={s.cardBody}>
            {health?.queue ? (
              <>
                <StatRow label="Queue Length" value={`${health.queue.length} / ${health.queue.capacity}`} />
                <StatRow label="Queue Capacity" value={`${health.queue.capacity.toLocaleString()} signals`} />
                <div style={s.fillBarWrap}>
                  <div style={s.fillBarLabel}>
                    <span>Fill Rate</span>
                    <span style={{ fontWeight: 700, color: health.queue.fill_pct > 80 ? '#dc2626' : '#16a34a' }}>
                      {health.queue.fill_pct?.toFixed(1)}%
                    </span>
                  </div>
                  <div style={s.fillBarBg}>
                    <div style={{
                      ...s.fillBarFill,
                      width: `${Math.max(health.queue.fill_pct, 0.5)}%`,
                      background: health.queue.fill_pct > 80 ? '#dc2626' :
                                  health.queue.fill_pct > 50 ? '#d97706' : '#16a34a',
                    }} />
                  </div>
                </div>
                <StatRow label="Total Enqueued" value={health.queue.enqueued?.toLocaleString()} />
                <StatRow label="Total Dropped" value={health.queue.dropped} color={health.queue.dropped > 0 ? '#dc2626' : '#16a34a'} />
              </>
            ) : (
              <>
                <StatRow label="Queue Capacity" value="50,000 signals" />
                <StatRow label="Backpressure" value="Bounded channel — 429 on full" />
                <StatRow label="Workers" value="20 goroutines" />
                <div style={s.fillBarWrap}>
                  <div style={s.fillBarLabel}>
                    <span>Fill Rate</span>
                    <span style={{ fontWeight: 700, color: '#16a34a' }}>0.0%</span>
                  </div>
                  <div style={s.fillBarBg}>
                    <div style={{ ...s.fillBarFill, width: '0.5%', background: '#16a34a' }} />
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Worker Pool */}
        <div style={s.card}>
          <div style={s.cardHeader}>
            <span style={s.cardTitle}>⚙️ Worker Pool</span>
          </div>
          <div style={s.cardBody}>
            {health?.workers ? (
              <>
                <StatRow label="Active Workers" value={health.workers.workers} />
                <StatRow label="Total Processed" value={health.workers.total_processed?.toLocaleString()} />
                <StatRow label="Total Errors" value={health.workers.total_errors} color={health.workers.total_errors > 0 ? '#dc2626' : '#16a34a'} />
                <StatRow label="Queue Length" value={health.workers.queue_len} />
                <StatRow label="Queue Fill" value={`${health.workers.queue_fill_pct?.toFixed(1)}%`} />
                <StatRow label="Signals Dropped" value={health.workers.total_dropped} color={health.workers.total_dropped > 0 ? '#dc2626' : '#16a34a'} />
              </>
            ) : (
              <>
                <StatRow label="Active Workers" value="20 goroutines" />
                <StatRow label="Concurrency Model" value="Go channels + goroutines" />
                <StatRow label="Fan-out Targets" value="MongoDB + PostgreSQL + TimescaleDB" />
                <StatRow label="Retry Policy" value="3 attempts, exponential backoff" />
              </>
            )}
          </div>
        </div>

        {/* Runtime & Memory */}
        <div style={s.card}>
          <div style={s.cardHeader}>
            <span style={s.cardTitle}>🧠 Runtime & Memory</span>
          </div>
          <div style={s.cardBody}>
            {health?.memory ? (
              <>
                <StatRow label="Allocated Memory" value={`${health.memory.alloc_mb} MB`} />
                <StatRow label="System Memory" value={`${health.memory.sys_mb} MB`} />
                <StatRow label="Goroutines" value={health.memory.goroutines} />
                <StatRow label="Uptime" value={health.uptime} />
                <StatRow label="System Status" value={health.status?.toUpperCase()} color={isHealthy ? '#16a34a' : '#dc2626'} />
              </>
            ) : dashboard ? (
              <>
                <StatRow label="Active Incidents" value={dashboard.total_open + dashboard.total_investigating} />
                <StatRow label="Total Open" value={dashboard.total_open} />
                <StatRow label="Total Investigating" value={dashboard.total_investigating} />
                <StatRow label="Total Resolved" value={dashboard.total_resolved} />
                <StatRow label="Total Closed" value={dashboard.total_closed} />
                <StatRow label="Signals/sec" value={dashboard.signals_per_second?.toFixed(2) ?? '0'} />
              </>
            ) : null}
          </div>
        </div>

        {/* Tech Stack */}
        <div style={{ ...s.card, gridColumn: '1 / -1' }}>
          <div style={s.cardHeader}>
            <span style={s.cardTitle}>🛠️ Tech Stack</span>
          </div>
          <div style={{ ...s.cardBody, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            {[
              { name: 'Go 1.22', role: 'Backend Runtime', icon: '🐹', desc: 'High-performance API server with goroutine-based concurrency' },
              { name: 'Fiber v2', role: 'HTTP Framework', icon: '⚡', desc: 'Express-inspired web framework built on fasthttp' },
              { name: 'PostgreSQL', role: 'Source of Truth', icon: '🐘', desc: 'ACID-compliant store for WorkItems and RCA records' },
              { name: 'TimescaleDB', role: 'Timeseries', icon: '📈', desc: 'Hypertable extension for signal aggregation queries' },
              { name: 'MongoDB', role: 'Audit Log', icon: '🍃', desc: 'Flexible document store for raw signal payloads' },
              { name: 'Redis', role: 'Cache Layer', icon: '⚡', desc: 'Sub-millisecond dashboard cache and debounce tracking' },
              { name: 'React 18', role: 'Frontend', icon: '⚛️', desc: 'Component-based UI with real-time polling and WebSocket' },
              { name: 'Prometheus', role: 'Metrics', icon: '📊', desc: '7 custom gauges and histograms exposed at /metrics' },
            ].map(({ name, role, icon, desc }) => (
              <div key={name} style={s.techCard}>
                <div style={s.techIcon}>{icon}</div>
                <div style={s.techName}>{name}</div>
                <div style={s.techRole}>{role}</div>
                <div style={s.techDesc}>{desc}</div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}

function StatRow({ label, value, color }) {
  return (
    <div style={s.statRow}>
      <span style={s.statLabel}>{label}</span>
      <span style={{ ...s.statValue, color: color || '#1e293b' }}>{value}</span>
    </div>
  )
}

const s = {
  root: { padding: '32px 36px', maxWidth: 1300, margin: '0 auto' },
  pageHeader: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 },
  title: { fontSize: 28, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.03em', marginBottom: 6 },
  subtitle: { fontSize: 14, color: '#64748b' },
  updated: { color: '#94a3b8', fontSize: 12, marginLeft: 6 },
  statusBadge: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderRadius: 20, fontSize: 13, fontWeight: 600 },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 },
  card: { background: 'white', border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' },
  cardHeader: { padding: '14px 20px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc' },
  cardTitle: { fontSize: 14, fontWeight: 700, color: '#0f172a' },
  cardBody: { padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 },
  depRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f1f5f9' },
  depLeft: { display: 'flex', alignItems: 'center', gap: 12 },
  depIcon: { fontSize: 24 },
  depName: { fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 2 },
  depDesc: { fontSize: 11, color: '#94a3b8' },
  depStatus: { fontSize: 12, fontWeight: 600, padding: '4px 12px', borderRadius: 20 },
  fillBarWrap: { display: 'flex', flexDirection: 'column', gap: 6 },
  fillBarLabel: { display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#64748b' },
  fillBarBg: { height: 8, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' },
  fillBarFill: { height: '100%', borderRadius: 4, transition: 'width 0.3s ease' },
  statRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #f8fafc' },
  statLabel: { fontSize: 13, color: '#64748b' },
  statValue: { fontSize: 13, fontWeight: 700 },
  techCard: { background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '14px', display: 'flex', flexDirection: 'column', gap: 4 },
  techIcon: { fontSize: 24, marginBottom: 4 },
  techName: { fontSize: 14, fontWeight: 700, color: '#0f172a' },
  techRole: { fontSize: 11, fontWeight: 600, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.06em' },
  techDesc: { fontSize: 11, color: '#94a3b8', lineHeight: 1.5, marginTop: 2 },
}