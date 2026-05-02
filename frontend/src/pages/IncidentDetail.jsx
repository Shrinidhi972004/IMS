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
  const [error, setError] = useState(null)
  const [transErr, setTransErr] = useState(null)

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

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 64 }}><span className="spinner" /></div>
  if (error) return <div style={{ padding: 32, color: 'var(--p0)', fontSize: 13 }}>{error}</div>

  const { work_item: wi, signals, rca, valid_transitions } = data
  const sevColor = { P0: 'var(--p0)', P1: 'var(--p1)', P2: 'var(--p2)' }[wi.severity]

  return (
    <div style={s.root}>
      {/* Breadcrumb */}
      <div style={s.breadcrumb}>
        <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => navigate('/')}>
          ← Incidents
        </button>
        <span style={s.breadSep}>/</span>
        <span style={{ fontSize: 12, color: 'var(--text2)' }}>{wi.id.slice(0, 8)}...</span>
      </div>

      {/* Header card */}
      <div className="card" style={{ ...s.headerCard, borderLeft: `4px solid ${sevColor}` }}>
        <div style={s.headerTop}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className={`badge badge-${wi.severity}`}>{wi.severity}</span>
            <span className={`state-badge state-${wi.state}`}>{wi.state}</span>
            {wi.mttr_minutes && (
              <span style={s.mttrBadge}>MTTR: {wi.mttr_minutes.toFixed(1)}m</span>
            )}
          </div>
          <span style={s.age}>{formatDistanceToNow(new Date(wi.created_at))} ago</span>
        </div>
        <h1 style={s.incTitle}>{wi.title}</h1>
        <div style={s.incMeta}>
          <MetaItem label="Component" value={wi.component_id} mono />
          <MetaItem label="Type" value={wi.component_type} />
          <MetaItem label="Signals" value={wi.signal_count} />
          <MetaItem label="Created" value={format(new Date(wi.created_at), 'MMM d, yyyy HH:mm')} />
        </div>
      </div>

      {/* Two column layout */}
      <div style={s.cols}>
        <div style={s.colLeft}>
          {/* State machine */}
          <Section title="Incident timeline">
            <div style={s.stateFlow}>
              {STATE_FLOW.map((state, i) => {
                const idx = STATE_FLOW.indexOf(wi.state)
                const done = i < idx
                const active = i === idx
                return (
                  <div key={state} style={s.stateStep}>
                    <div style={{ ...s.stateNode, ...(active ? s.stateActive : done ? s.stateDone : s.stateInactive) }}>
                      {done ? '✓' : i + 1}
                    </div>
                    <div style={{ ...s.stateLabel, color: active ? 'var(--text)' : done ? 'var(--green)' : 'var(--text3)' }}>{state}</div>
                    {i < STATE_FLOW.length - 1 && <div style={{ ...s.stateConnector, background: done ? 'var(--green)' : 'var(--border)' }} />}
                  </div>
                )
              })}
            </div>

            {transErr && <div style={s.transErr}>{transErr}</div>}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {valid_transitions?.map(ts => (
                <button key={ts} className="btn btn-primary" onClick={() => handleTransition(ts)} disabled={transitioning}>
                  {transitioning ? <span className="spinner" style={{ width: 12, height: 12, borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#fff' }} /> : null}
                  Move to {ts}
                </button>
              ))}
              {valid_transitions?.length === 0 && wi.state === 'CLOSED' && (
                <span style={{ fontSize: 13, color: 'var(--green)' }}>✓ Incident closed</span>
              )}
            </div>

            {valid_transitions?.includes('CLOSED') && !rca && (
              <div style={s.rcaAlert}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                RCA required before closing this incident
              </div>
            )}
          </Section>

          {/* RCA */}
          <Section title="Root cause analysis" action={!rca && (wi.state === 'INVESTIGATING' || wi.state === 'RESOLVED') ? (
            <button className="btn btn-primary" style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => navigate(`/incident/${id}/rca`)}>Submit RCA</button>
          ) : null}>
            {rca ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <Field label="Category" value={rca.root_cause_category} />
                <Field label="Root cause" value={rca.root_cause_detail} />
                <Field label="Fix applied" value={rca.fix_applied} />
                <Field label="Prevention" value={rca.prevention_steps} />
                <div style={{ display: 'flex', gap: 24 }}>
                  <Field label="MTTR" value={`${((new Date(rca.incident_end) - new Date(rca.incident_start)) / 60000).toFixed(1)} minutes`} />
                  <Field label="Submitted" value={format(new Date(rca.submitted_at), 'MMM d, HH:mm')} />
                </div>
              </div>
            ) : (
              <div style={s.noRca}>
                <div style={s.noRcaIcon}>📋</div>
                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)', marginBottom: 4 }}>No RCA submitted</div>
                <div style={{ fontSize: 13, color: 'var(--text2)' }}>Submit a root cause analysis to close this incident</div>
              </div>
            )}
          </Section>
        </div>

        {/* Raw signals */}
        <div style={s.colRight}>
          <Section title={`Raw signals (${signals?.length ?? 0})`}>
            <div style={s.signalList}>
              {signals?.length === 0 && <div style={{ padding: '32px 16px', textAlign: 'center', fontSize: 13, color: 'var(--text3)' }}>No signals yet</div>}
              {signals?.map((sig, i) => (
                <div key={sig.id ?? i} style={s.sigRow}>
                  <div style={s.sigHeader}>
                    <span className={`badge badge-${sig.severity}`}>{sig.severity}</span>
                    <span style={s.sigTime}>{format(new Date(sig.received_at), 'HH:mm:ss.SSS')}</span>
                  </div>
                  <div style={s.sigMsg}>{sig.message}</div>
                </div>
              ))}
            </div>
          </Section>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children, action }) {
  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div style={secs.header}>
        <span style={secs.title}>{title}</span>
        {action}
      </div>
      <div style={secs.body}>{children}</div>
    </div>
  )
}

function MetaItem({ label, value, mono }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
      <span style={{ fontSize: 13, color: 'var(--text)', fontFamily: mono ? 'monospace' : 'inherit', fontWeight: 500 }}>{value}</span>
    </div>
  )
}

function Field({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6 }}>{value}</div>
    </div>
  )
}

const s = {
  root: { padding: '24px 32px', maxWidth: 1200, margin: '0 auto' },
  breadcrumb: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 },
  breadSep: { color: 'var(--text3)', fontSize: 12 },
  headerCard: { padding: '20px 24px', marginBottom: 20, borderRadius: 12 },
  headerTop: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  age: { fontSize: 12, color: 'var(--text3)' },
  mttrBadge: { fontSize: 11, fontWeight: 600, background: 'var(--green-bg)', color: 'var(--green)', padding: '2px 8px', borderRadius: 4 },
  incTitle: { fontSize: 18, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em', marginBottom: 14 },
  incMeta: { display: 'flex', gap: 28, flexWrap: 'wrap' },
  cols: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' },
  colLeft: { display: 'flex', flexDirection: 'column', gap: 16 },
  colRight: { display: 'flex', flexDirection: 'column', gap: 16 },
  stateFlow: { display: 'flex', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 0 },
  stateStep: { display: 'flex', alignItems: 'center', gap: 0 },
  stateNode: { width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, flexShrink: 0 },
  stateActive: { background: 'var(--accent)', color: '#fff' },
  stateDone: { background: 'var(--green-bg)', color: 'var(--green)', border: '2px solid var(--green)' },
  stateInactive: { background: 'var(--surface2)', color: 'var(--text3)', border: '1px solid var(--border)' },
  stateLabel: { fontSize: 11, fontWeight: 500, margin: '0 6px', whiteSpace: 'nowrap' },
  stateConnector: { height: 2, width: 20, flexShrink: 0 },
  transErr: { padding: '10px 12px', background: 'var(--p0-bg)', border: '1px solid var(--p0-border)', borderRadius: 8, fontSize: 13, color: 'var(--p0)', marginBottom: 12 },
  rcaAlert: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: 'var(--p1-bg)', border: '1px solid var(--p1-border)', borderRadius: 8, fontSize: 12, color: 'var(--p1)', marginTop: 12 },
  noRca: { padding: '32px 16px', textAlign: 'center' },
  noRcaIcon: { fontSize: 32, marginBottom: 12 },
  signalList: { maxHeight: 480, overflowY: 'auto' },
  sigRow: { padding: '10px 0', borderBottom: '1px solid var(--border)' },
  sigHeader: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 },
  sigTime: { fontSize: 11, color: 'var(--text3)', fontFamily: 'monospace' },
  sigMsg: { fontSize: 12, color: 'var(--text)', lineHeight: 1.5 },
}

const secs = {
  header: { padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--surface2)' },
  title: { fontSize: 13, fontWeight: 600, color: 'var(--text)' },
  body: { padding: '18px' },
}
