import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { formatDistanceToNow, format } from 'date-fns'
import api from '../lib/api'

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
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  async function handleTransition(toState) {
    setTransErr(null)
    setTransitioning(true)
    try {
      await api.transition(id, toState)
      await load()
    } catch (e) {
      setTransErr(e.message)
    } finally {
      setTransitioning(false)
    }
  }

  if (loading) return (
    <div style={styles.center}><div className="spinner" /></div>
  )
  if (error) return (
    <div style={styles.center}>
      <span style={{ color: 'var(--p0)', fontFamily: 'var(--font-mono)' }}>✗ {error}</span>
    </div>
  )

  const { work_item: wi, signals, rca, valid_transitions } = data

  const severityColor = { P0: 'var(--p0)', P1: 'var(--p1)', P2: 'var(--p2)' }[wi.severity]

  return (
    <div style={styles.root}>
      {/* Back */}
      <button style={styles.backBtn} onClick={() => navigate('/')}>
        ← BACK TO FEED
      </button>

      {/* Header */}
      <div style={{ ...styles.incidentHeader, borderLeftColor: severityColor }}>
        <div style={styles.headerTop}>
          <span className={`badge badge-${wi.severity}`}>{wi.severity}</span>
          <span className={`state-badge state-${wi.state}`}>{wi.state}</span>
          {wi.mttr_minutes && (
            <span style={styles.mttr}>
              MTTR: {wi.mttr_minutes.toFixed(1)}m
            </span>
          )}
        </div>
        <h1 style={styles.incidentTitle}>{wi.title}</h1>
        <div style={styles.meta} className="mono">
          <span style={{ color: 'var(--text-mono)' }}>{wi.component_id}</span>
          <span style={{ color: 'var(--text-muted)' }}>·</span>
          <span>{wi.component_type}</span>
          <span style={{ color: 'var(--text-muted)' }}>·</span>
          <span>ID: {wi.id}</span>
          <span style={{ color: 'var(--text-muted)' }}>·</span>
          <span>{formatDistanceToNow(new Date(wi.created_at))} ago</span>
          <span style={{ color: 'var(--text-muted)' }}>·</span>
          <span>{wi.signal_count} signals</span>
        </div>
      </div>

      <div style={styles.cols}>
        {/* Left column */}
        <div style={styles.left}>
          {/* State machine transitions */}
          <Section title="STATE TRANSITIONS">
            {transErr && (
              <div style={styles.transErr}>{transErr}</div>
            )}
            <div style={styles.stateFlow}>
              {['OPEN', 'INVESTIGATING', 'RESOLVED', 'CLOSED'].map((s, i, arr) => (
                <div key={s} style={styles.stateStep}>
                  <div style={{
                    ...styles.stateNode,
                    background: wi.state === s ? 'var(--accent-dim)' : 'var(--bg-raised)',
                    border: `1px solid ${wi.state === s ? 'var(--accent)' : 'var(--border)'}`,
                    color: wi.state === s ? 'var(--accent)' : 'var(--text-muted)',
                  }}>
                    {s}
                  </div>
                  {i < arr.length - 1 && (
                    <div style={styles.stateArrow}>→</div>
                  )}
                </div>
              ))}
            </div>

            <div style={styles.transButtons}>
              {valid_transitions?.length === 0 && (
                <span style={styles.terminalMsg}>
                  {wi.state === 'CLOSED' ? '✓ Incident closed' : 'No transitions available'}
                </span>
              )}
              {valid_transitions?.map(ts => (
                <button
                  key={ts}
                  style={styles.transBtn}
                  onClick={() => handleTransition(ts)}
                  disabled={transitioning}
                >
                  {transitioning ? '…' : `→ ${ts}`}
                </button>
              ))}
              {valid_transitions?.includes('CLOSED') && !rca && (
                <div style={styles.rcaWarning}>
                  ⚠ RCA required before closing
                </div>
              )}
            </div>
          </Section>

          {/* RCA status */}
          <Section title="ROOT CAUSE ANALYSIS">
            {rca ? (
              <div style={styles.rcaBox}>
                <Field label="CATEGORY"    value={rca.root_cause_category} />
                <Field label="ROOT CAUSE"  value={rca.root_cause_detail} />
                <Field label="FIX APPLIED" value={rca.fix_applied} />
                <Field label="PREVENTION"  value={rca.prevention_steps} />
                <Field label="SUBMITTED"   value={format(new Date(rca.submitted_at), 'PPpp')} />
                <Field label="MTTR"        value={`${((new Date(rca.incident_end) - new Date(rca.incident_start)) / 60000).toFixed(1)} minutes`} />
              </div>
            ) : (
              <div style={styles.noRca}>
                <span style={{ fontSize: 24, color: 'var(--border-bright)' }}>◻</span>
                <span>No RCA submitted yet</span>
                {(wi.state === 'INVESTIGATING' || wi.state === 'RESOLVED') && (
                  <button
                    style={styles.rcaBtn}
                    onClick={() => navigate(`/incident/${id}/rca`)}
                  >
                    SUBMIT RCA →
                  </button>
                )}
              </div>
            )}
          </Section>
        </div>

        {/* Right column — raw signals */}
        <div style={styles.right}>
          <Section title={`RAW SIGNALS (${signals?.length ?? 0})`}>
            <div style={styles.signalList}>
              {signals?.length === 0 && (
                <div style={styles.noSignals}>No signals ingested yet</div>
              )}
              {signals?.map((sig, i) => (
                <SignalRow key={sig.id ?? i} sig={sig} />
              ))}
            </div>
          </Section>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div style={styles.section}>
      <div style={styles.sectionTitle}>{title}</div>
      {children}
    </div>
  )
}

function Field({ label, value }) {
  return (
    <div style={styles.field}>
      <div style={styles.fieldLabel}>{label}</div>
      <div style={styles.fieldValue}>{value}</div>
    </div>
  )
}

function SignalRow({ sig }) {
  return (
    <div style={styles.sigRow}>
      <div style={styles.sigHeader}>
        <span className={`badge badge-${sig.severity}`}>{sig.severity}</span>
        <span style={styles.sigTime} className="mono">
          {format(new Date(sig.received_at), 'HH:mm:ss.SSS')}
        </span>
      </div>
      <div style={styles.sigMsg} className="mono">{sig.message}</div>
      <div style={styles.sigId} className="mono">{sig.id}</div>
    </div>
  )
}

const styles = {
  root: {
    padding: '20px 24px',
    maxWidth: 1400,
    margin: '0 auto',
  },
  center: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: 300,
  },
  backBtn: {
    background: 'transparent',
    border: '1px solid var(--border)',
    color: 'var(--text-secondary)',
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    letterSpacing: '0.08em',
    padding: '6px 14px',
    borderRadius: 'var(--radius)',
    cursor: 'pointer',
    marginBottom: 20,
    transition: 'all 0.15s',
  },
  incidentHeader: {
    background: 'var(--bg-surface)',
    border: '1px solid var(--border)',
    borderLeft: '4px solid var(--p0)',
    borderRadius: 'var(--radius-lg)',
    padding: '20px 24px',
    marginBottom: 20,
  },
  headerTop: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  mttr: {
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    color: 'var(--state-closed)',
    background: 'rgba(76,175,125,0.1)',
    border: '1px solid rgba(76,175,125,0.3)',
    padding: '2px 8px',
    borderRadius: 'var(--radius-sm)',
  },
  incidentTitle: {
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    fontSize: 22,
    color: 'var(--text-primary)',
    marginBottom: 8,
    letterSpacing: '0.02em',
  },
  meta: {
    display: 'flex',
    gap: 10,
    fontSize: 11,
    color: 'var(--text-secondary)',
    flexWrap: 'wrap',
  },
  cols: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 16,
    alignItems: 'start',
  },
  left: { display: 'flex', flexDirection: 'column', gap: 16 },
  right: { display: 'flex', flexDirection: 'column', gap: 16 },
  section: {
    background: 'var(--bg-surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)',
    overflow: 'hidden',
  },
  sectionTitle: {
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    letterSpacing: '0.12em',
    color: 'var(--text-muted)',
    padding: '10px 16px',
    background: 'var(--bg-raised)',
    borderBottom: '1px solid var(--border)',
  },
  stateFlow: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '16px',
    flexWrap: 'wrap',
  },
  stateStep: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  stateNode: {
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    letterSpacing: '0.08em',
    padding: '5px 10px',
    borderRadius: 'var(--radius)',
    whiteSpace: 'nowrap',
  },
  stateArrow: {
    color: 'var(--text-muted)',
    fontSize: 12,
  },
  transButtons: {
    display: 'flex',
    gap: 8,
    padding: '0 16px 16px',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  transBtn: {
    background: 'var(--accent-dim)',
    border: '1px solid var(--accent)',
    color: 'var(--accent)',
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    fontSize: 12,
    letterSpacing: '0.08em',
    padding: '8px 20px',
    borderRadius: 'var(--radius)',
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  transErr: {
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    color: 'var(--p0)',
    background: 'var(--p0-dim)',
    border: '1px solid rgba(255,59,59,0.2)',
    margin: '12px 16px 0',
    padding: '8px 12px',
    borderRadius: 'var(--radius)',
  },
  terminalMsg: {
    fontFamily: 'var(--font-mono)',
    fontSize: 12,
    color: 'var(--state-closed)',
  },
  rcaWarning: {
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    color: 'var(--p2)',
  },
  rcaBox: {
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  noRca: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 10,
    padding: 32,
    fontFamily: 'var(--font-mono)',
    fontSize: 12,
    color: 'var(--text-muted)',
  },
  rcaBtn: {
    background: 'transparent',
    border: '1px solid var(--accent)',
    color: 'var(--accent)',
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    fontSize: 12,
    letterSpacing: '0.1em',
    padding: '8px 20px',
    borderRadius: 'var(--radius)',
    cursor: 'pointer',
    marginTop: 8,
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  fieldLabel: {
    fontFamily: 'var(--font-mono)',
    fontSize: 9,
    letterSpacing: '0.12em',
    color: 'var(--text-muted)',
  },
  fieldValue: {
    fontSize: 13,
    color: 'var(--text-primary)',
    lineHeight: 1.5,
  },
  signalList: {
    maxHeight: 480,
    overflowY: 'auto',
  },
  sigRow: {
    padding: '10px 16px',
    borderBottom: '1px solid var(--border)',
  },
  sigHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  sigTime: {
    fontSize: 10,
    color: 'var(--text-secondary)',
  },
  sigMsg: {
    fontSize: 12,
    color: 'var(--text-primary)',
    marginBottom: 2,
  },
  sigId: {
    fontSize: 9,
    color: 'var(--text-muted)',
  },
  noSignals: {
    fontFamily: 'var(--font-mono)',
    fontSize: 12,
    color: 'var(--text-muted)',
    padding: '32px 16px',
    textAlign: 'center',
  },
  transErr: {
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    color: 'var(--p0)',
    padding: '8px 16px',
    background: 'var(--p0-dim)',
  },
}
