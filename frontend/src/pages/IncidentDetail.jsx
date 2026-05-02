import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { formatDistanceToNow, format } from 'date-fns'
import api from '../lib/api'

const STATE_FLOW = ['OPEN', 'INVESTIGATING', 'RESOLVED', 'CLOSED']

export default function IncidentDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [transitioning, setTransitioning] = useState(false)
  const [transErr, setTransErr] = useState(null)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    try {
      const res = await api.getWorkItem(id)
      setData(res)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }, [id])

  useEffect(() => { load() }, [load])

  async function handleTransition(toState) {
    setTransErr(null)
    setTransitioning(true)
    try { await api.transition(id, toState); await load() }
    catch (e) { setTransErr(e.message) }
    finally { setTransitioning(false) }
  }

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><span className="spinner" /></div>
  if (error) return <div style={{ padding: 32, color: '#dc2626', fontSize: 13 }}>{error}</div>

  const { work_item: wi, signals, rca, valid_transitions } = data
  const sevColor = { P0: '#dc2626', P1: '#d97706', P2: '#2563eb' }[wi.severity]
  const sevBg = { P0: '#fef2f2', P1: '#fffbeb', P2: '#eff6ff' }[wi.severity]

  return (
    <div style={s.root}>

      {/* Breadcrumb */}
      <div style={s.breadcrumb}>
        <button style={s.backBtn} onClick={() => navigate('/incidents')}>
          ← Incidents
        </button>
        <span style={s.breadSep}>/</span>
        <span style={s.breadCurrent}>{wi.id.slice(0, 12)}...</span>
      </div>

      {/* Header card */}
      <div style={{ ...s.header, borderLeft: `5px solid ${sevColor}` }}>
        <div style={s.headerTop}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: sevColor, background: sevBg, padding: '4px 10px', borderRadius: 6, border: `1px solid ${sevColor}30` }}>
              {wi.severity}
            </span>
            <span style={{ ...s.statePill, ...stateStyle(wi.state) }}>
              {wi.state}
            </span>
            {wi.mttr_minutes && (
              <span style={s.mttrPill}>⏱ MTTR: {wi.mttr_minutes.toFixed(1)}m</span>
            )}
          </div>
          <span style={s.createdAt}>Created {formatDistanceToNow(new Date(wi.created_at))} ago</span>
        </div>
        <h1 style={s.incTitle}>{wi.title}</h1>
        <div style={s.metaGrid}>
          <MetaItem label="ID" value={wi.id.slice(0, 12) + '...'} mono />
          <MetaItem label="Component" value={wi.component_id} mono />
          <MetaItem label="Type" value={wi.component_type} />
          <MetaItem label="Signals" value={wi.signal_count} />
          <MetaItem label="Created" value={format(new Date(wi.created_at), 'MMM d, yyyy HH:mm')} />
        </div>
      </div>

      {/* Body */}
      <div style={s.body}>

        {/* Left — Timeline */}
        <div style={s.colLeft}>
          <div style={s.card}>
            <div style={s.cardHeader}>
              <span style={s.cardTitle}>Timeline</span>
              <span style={s.cardMeta}>{signals?.length ?? 0} signals</span>
            </div>
            <div>
              <TimelineEvent
                icon="⚡"
                iconColor="#dc2626"
                iconBg="#fef2f2"
                title="Incident created"
                actor="System"
                tag="CREATED"
                tagColor="#dc2626"
                time={format(new Date(wi.created_at), 'HH:mm:ss')}
                message={`${wi.component_type} failure detected on ${wi.component_id}`}
              />
              {wi.state !== 'OPEN' && (
                <TimelineEvent
                  icon="🔍"
                  iconColor="#d97706"
                  iconBg="#fffbeb"
                  title="Moved to Investigating"
                  actor="Operator"
                  tag="STATUS CHANGE"
                  tagColor="#d97706"
                  time={format(new Date(wi.updated_at), 'HH:mm:ss')}
                  message="An engineer has acknowledged and is investigating the incident."
                />
              )}
              {(wi.state === 'RESOLVED' || wi.state === 'CLOSED') && (
                <TimelineEvent
                  icon="✓"
                  iconColor="#2563eb"
                  iconBg="#eff6ff"
                  title="Incident Resolved"
                  actor="Operator"
                  tag="STATUS CHANGE"
                  tagColor="#2563eb"
                  time={wi.resolved_at ? format(new Date(wi.resolved_at), 'HH:mm:ss') : '—'}
                  message="Immediate fix applied. Incident marked as resolved, awaiting RCA."
                />
              )}
              {wi.state === 'CLOSED' && rca && (
                <TimelineEvent
                  icon="📋"
                  iconColor="#16a34a"
                  iconBg="#f0fdf4"
                  title="RCA Submitted & Incident Closed"
                  actor={rca.submitted_by || 'Operator'}
                  tag="CLOSED"
                  tagColor="#16a34a"
                  time={format(new Date(rca.submitted_at), 'HH:mm:ss')}
                  message={`Root cause: ${rca.root_cause_category}. MTTR: ${wi.mttr_minutes?.toFixed(1)}m`}
                />
              )}
              {/* Raw signals */}
              {signals?.slice(0, 5).map((sig, i) => (
                <TimelineEvent
                  key={sig.id ?? i}
                  icon="📡"
                  iconColor="#6366f1"
                  iconBg="#eef2ff"
                  title={sig.component_id}
                  actor="Signal"
                  tag={sig.severity}
                  tagColor={{ P0: '#dc2626', P1: '#d97706', P2: '#2563eb' }[sig.severity]}
                  time={format(new Date(sig.received_at), 'HH:mm:ss')}
                  message={sig.message}
                />
              ))}
              {signals?.length > 5 && (
                <div style={s.moreSignals}>
                  + {signals.length - 5} more signals in audit log
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right — Status + RCA */}
        <div style={s.colRight}>

          {/* Incident Status */}
          <div style={s.card}>
            <div style={s.cardHeader}>
              <span style={s.cardTitle}>Incident Status</span>
            </div>
            <div style={{ padding: '20px 20px 8px' }}>

              {/* Stepper */}
              <div style={s.stepper}>
                {STATE_FLOW.map((state, i) => {
                  const idx = STATE_FLOW.indexOf(wi.state)
                  const done = i < idx
                  const active = i === idx
                  return (
                    <div key={state} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                        {i > 0 && (
                          <div style={{
                            flex: 1, height: 3, borderRadius: 2,
                            background: done ? '#6366f1' : active ? 'linear-gradient(to right, #6366f1, #e2e8f0)' : '#e2e8f0',
                          }} />
                        )}
                        <div style={{
                          width: 32, height: 32, borderRadius: '50%',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 12, fontWeight: 700, flexShrink: 0,
                          background: active ? '#6366f1' : done ? '#6366f1' : '#f1f5f9',
                          color: (active || done) ? '#fff' : '#94a3b8',
                          border: active ? '3px solid #a5b4fc' : done ? 'none' : '2px solid #e2e8f0',
                          boxShadow: active ? '0 0 0 4px rgba(99,102,241,0.15)' : 'none',
                          transition: 'all 0.3s',
                        }}>
                          {done ? '✓' : i + 1}
                        </div>
                        {i < STATE_FLOW.length - 1 && (
                          <div style={{
                            flex: 1, height: 3, borderRadius: 2,
                            background: done ? '#6366f1' : '#e2e8f0',
                          }} />
                        )}
                      </div>
                      <div style={{
                        fontSize: 10, fontWeight: 600, marginTop: 6, textAlign: 'center',
                        color: active ? '#6366f1' : done ? '#16a34a' : '#94a3b8',
                        letterSpacing: '0.04em',
                      }}>
                        {state}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Transition error */}
              {transErr && (
                <div style={s.transErr}>{transErr}</div>
              )}

              {/* Action buttons */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 20 }}>
                {valid_transitions?.map(ts => (
                  <button
                    key={ts}
                    style={s.transBtn}
                    onClick={() => handleTransition(ts)}
                    disabled={transitioning}
                  >
                    {transitioning ? '...' : `→ Move to ${ts}`}
                  </button>
                ))}
                {valid_transitions?.length === 0 && wi.state === 'CLOSED' && (
                  <div style={s.closedMsg}>✓ Incident successfully closed</div>
                )}
              </div>

              {valid_transitions?.includes('CLOSED') && !rca && (
                <div style={s.rcaWarning}>
                  ⚠ You must submit an RCA before closing this incident
                </div>
              )}
            </div>
          </div>

          {/* RCA Card */}
          <div style={s.card}>
            <div style={{ ...s.cardHeader, justifyContent: 'space-between' }}>
              <span style={s.cardTitle}>Root Cause Analysis</span>
              {!rca && (wi.state === 'INVESTIGATING' || wi.state === 'RESOLVED') && (
                <button style={s.rcaSubmitBtn} onClick={() => navigate(`/incident/${id}/rca`)}>
                  + Submit RCA
                </button>
              )}
            </div>
            <div style={{ padding: 20 }}>
              {rca ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <RCAField label="Category" value={rca.root_cause_category} highlight />
                  <RCAField label="Root Cause Detail" value={rca.root_cause_detail} large />
                  <RCAField label="Fix Applied" value={rca.fix_applied} large />
                  <RCAField label="Prevention Steps" value={rca.prevention_steps} large />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <RCAField label="MTTR" value={`${((new Date(rca.incident_end) - new Date(rca.incident_start)) / 60000).toFixed(1)} minutes`} />
                    <RCAField label="Submitted by" value={rca.submitted_by || 'Operator'} />
                    <RCAField label="Submitted at" value={format(new Date(rca.submitted_at), 'MMM d, HH:mm')} />
                  </div>
                </div>
              ) : (
                <div style={s.noRca}>
                  <div style={s.noRcaIcon}>📋</div>
                  <div style={s.noRcaTitle}>No RCA submitted yet</div>
                  <div style={s.noRcaDesc}>Submit a root cause analysis to document this incident and enable closure.</div>
                  {(wi.state === 'INVESTIGATING' || wi.state === 'RESOLVED') && (
                    <button style={s.noRcaBtn} onClick={() => navigate(`/incident/${id}/rca`)}>
                      Submit RCA →
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}

function stateStyle(state) {
  const map = {
    OPEN: { background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' },
    INVESTIGATING: { background: '#fffbeb', color: '#d97706', border: '1px solid #fde68a' },
    RESOLVED: { background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe' },
    CLOSED: { background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0' },
  }
  return map[state] || map.OPEN
}

function TimelineEvent({ icon, iconBg, iconColor, title, actor, tag, tagColor, time, message }) {
  return (
    <div style={te.row}>
      <div style={{ display: 'flex', gap: 14 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
          <div style={{ ...te.icon, background: iconBg, color: iconColor }}>
            {icon}
          </div>
          <div style={te.line} />
        </div>
        <div style={{ flex: 1, paddingBottom: 20 }}>
          <div style={te.header}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={te.title}>{title}</span>
              <span style={{ ...te.tag, color: tagColor, background: `${tagColor}15` }}>{tag}</span>
            </div>
            <span style={te.time}>{time}</span>
          </div>
          <div style={te.actor}>{actor}</div>
          <div style={te.message}>{message}</div>
        </div>
      </div>
    </div>
  )
}

function MetaItem({ label, value, mono }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 13, color: '#1e293b', fontFamily: mono ? 'monospace' : 'inherit', fontWeight: 600 }}>{value}</span>
    </div>
  )
}

function RCAField({ label, value, large, highlight }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
      <div style={{
        fontSize: 13, color: '#1e293b', lineHeight: 1.6,
        background: highlight ? '#eef2ff' : '#f8fafc',
        border: `1px solid ${highlight ? '#c7d2fe' : '#e2e8f0'}`,
        borderRadius: 8,
        padding: large ? '10px 14px' : '8px 12px',
        fontWeight: highlight ? 700 : 400,
        color: highlight ? '#4f46e5' : '#1e293b',
      }}>
        {value}
      </div>
    </div>
  )
}

const s = {
  root: { padding: '24px 32px', maxWidth: 1400, margin: '0 auto' },
  breadcrumb: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 },
  backBtn: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '7px 14px', borderRadius: 8,
    background: '#ffffff', border: '1.5px solid #e2e8f0',
    color: '#475569', fontSize: 13, fontWeight: 600,
    cursor: 'pointer', fontFamily: 'inherit',
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
    transition: 'all 0.15s',
  },
  breadSep: { color: '#cbd5e1', fontSize: 16 },
  breadCurrent: { fontSize: 13, color: '#94a3b8', fontFamily: 'monospace' },
  header: {
    background: 'white', border: '1px solid #e2e8f0',
    borderRadius: 14, padding: '20px 24px', marginBottom: 24,
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },
  headerTop: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 },
  statePill: { fontSize: 12, fontWeight: 600, padding: '4px 14px', borderRadius: 20, display: 'inline-block' },
  mttrPill: { fontSize: 11, fontWeight: 600, background: '#f0fdf4', color: '#16a34a', padding: '3px 10px', borderRadius: 20, border: '1px solid #bbf7d0' },
  createdAt: { fontSize: 12, color: '#94a3b8' },
  incTitle: { fontSize: 20, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em', marginBottom: 16 },
  metaGrid: { display: 'flex', gap: 28, flexWrap: 'wrap' },
  body: { display: 'grid', gridTemplateColumns: '1fr 400px', gap: 20, alignItems: 'start' },
  colLeft: { display: 'flex', flexDirection: 'column', gap: 16 },
  colRight: { display: 'flex', flexDirection: 'column', gap: 16 },
  card: { background: 'white', border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' },
  cardHeader: { padding: '14px 20px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { fontSize: 14, fontWeight: 700, color: '#0f172a' },
  cardMeta: { fontSize: 12, color: '#94a3b8', fontWeight: 500 },
  moreSignals: { padding: '14px 20px', fontSize: 12, color: '#6366f1', textAlign: 'center', background: '#f8faff', cursor: 'pointer', fontWeight: 500 },
  stepper: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '4px 0 16px' },
  transErr: { padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 12, color: '#dc2626', marginTop: 12 },
  transBtn: {
    width: '100%', padding: '11px 16px',
    background: '#6366f1', color: 'white',
    border: 'none', borderRadius: 10,
    fontSize: 13, fontWeight: 600, cursor: 'pointer',
    fontFamily: 'inherit', transition: 'background 0.15s',
  },
  closedMsg: { textAlign: 'center', color: '#16a34a', fontSize: 13, fontWeight: 600, padding: '8px', background: '#f0fdf4', borderRadius: 8 },
  rcaWarning: { marginTop: 12, padding: '10px 14px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, fontSize: 12, color: '#d97706', fontWeight: 500 },
  rcaSubmitBtn: { padding: '5px 12px', background: '#6366f1', color: 'white', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  noRca: { textAlign: 'center', padding: '28px 16px' },
  noRcaIcon: { fontSize: 36, marginBottom: 10 },
  noRcaTitle: { fontSize: 15, fontWeight: 700, color: '#1e293b', marginBottom: 6 },
  noRcaDesc: { fontSize: 13, color: '#64748b', lineHeight: 1.5, marginBottom: 16 },
  noRcaBtn: { padding: '8px 20px', background: '#6366f1', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
}

const te = {
  row: { padding: '16px 20px 0' },
  icon: { width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0, border: '1px solid rgba(0,0,0,0.06)' },
  line: { width: 2, flex: 1, background: '#f1f5f9', marginTop: 6, minHeight: 20 },
  header: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 3 },
  title: { fontSize: 14, fontWeight: 700, color: '#0f172a' },
  tag: { fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 4, textTransform: 'uppercase', letterSpacing: '0.06em' },
  time: { fontSize: 11, color: '#94a3b8', fontFamily: 'monospace', flexShrink: 0 },
  actor: { fontSize: 11, color: '#94a3b8', marginBottom: 5, fontWeight: 500 },
  message: { fontSize: 13, color: '#475569', lineHeight: 1.6, background: '#f8fafc', border: '1px solid #f1f5f9', borderRadius: 8, padding: '8px 12px' },
}