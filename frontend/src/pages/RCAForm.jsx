import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import api from '../lib/api'

const CATEGORIES = ['INFRASTRUCTURE','APPLICATION','NETWORK','DATABASE','THIRD_PARTY','HUMAN_ERROR','UNKNOWN']
const now = () => format(new Date(), "yyyy-MM-dd'T'HH:mm")

export default function RCAForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [form, setForm] = useState({ incident_start: now(), incident_end: now(), root_cause_category: '', root_cause_detail: '', fix_applied: '', prevention_steps: '' })
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [serverError, setServerError] = useState('')
  const [success, setSuccess] = useState(false)

  function set(field, value) { setForm(f => ({ ...f, [field]: value })); setErrors(e => ({ ...e, [field]: '' })) }

  function validate() {
    const errs = {}
    if (!form.incident_start) errs.incident_start = 'Required'
    if (!form.incident_end) errs.incident_end = 'Required'
    if (form.incident_end <= form.incident_start) errs.incident_end = 'End must be after start'
    if (!form.root_cause_category) errs.root_cause_category = 'Required'
    if (form.root_cause_detail.length < 20) errs.root_cause_detail = 'Minimum 20 characters'
    if (form.fix_applied.length < 10) errs.fix_applied = 'Minimum 10 characters'
    if (form.prevention_steps.length < 10) errs.prevention_steps = 'Minimum 10 characters'
    return errs
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    setSubmitting(true); setServerError('')
    try {
      await api.submitRCA(id, { ...form, incident_start: new Date(form.incident_start).toISOString(), incident_end: new Date(form.incident_end).toISOString() })
      setSuccess(true)
      setTimeout(() => navigate(`/incident/${id}`), 1500)
    } catch (err) { setServerError(err.message) }
    finally { setSubmitting(false) }
  }

  const mttr = form.incident_start && form.incident_end
    ? Math.max(0, (new Date(form.incident_end) - new Date(form.incident_start)) / 60000).toFixed(1)
    : null

  if (success) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 400 }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>RCA Submitted</div>
        <div style={{ fontSize: 13, color: 'var(--text2)' }}>Redirecting to incident...</div>
      </div>
    </div>
  )

  return (
    <div style={s.root}>
      <div style={s.breadcrumb}>
        <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => navigate(`/incident/${id}`)}>← Back to incident</button>
      </div>

      <div style={s.header}>
        <h1 style={s.title}>Root Cause Analysis</h1>
        <p style={s.sub}>Work item: <code style={{ fontSize: 12, background: 'var(--surface2)', padding: '2px 6px', borderRadius: 4 }}>{id}</code></p>
      </div>

      <form onSubmit={handleSubmit} style={s.form}>
        {/* Timeline */}
        <Card title="Incident timeline">
          <div style={s.grid2}>
            <Field label="Start time" error={errors.incident_start}>
              <input className={`input${errors.incident_start ? ' error' : ''}`} type="datetime-local" value={form.incident_start} onChange={e => set('incident_start', e.target.value)} />
            </Field>
            <Field label="End time" error={errors.incident_end}>
              <input className={`input${errors.incident_end ? ' error' : ''}`} type="datetime-local" value={form.incident_end} onChange={e => set('incident_end', e.target.value)} />
            </Field>
          </div>
          {mttr && (
            <div style={s.mttrPreview}>
              <span style={{ color: 'var(--text2)' }}>Calculated MTTR:</span>
              <span style={{ fontWeight: 600, color: 'var(--accent)' }}>{mttr} minutes</span>
            </div>
          )}
        </Card>

        {/* Root cause */}
        <Card title="Root cause">
          <Field label="Category" error={errors.root_cause_category}>
            <select className={`input${errors.root_cause_category ? ' error' : ''}`} value={form.root_cause_category} onChange={e => set('root_cause_category', e.target.value)}>
              <option value="">Select category...</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c.replace('_', ' ')}</option>)}
            </select>
          </Field>
          <Field label={`Root cause detail (${form.root_cause_detail.length}/20 min)`} error={errors.root_cause_detail}>
            <textarea className={`input${errors.root_cause_detail ? ' error' : ''}`} rows={4} value={form.root_cause_detail} onChange={e => set('root_cause_detail', e.target.value)} placeholder="Describe what failed, why it failed, and the chain of events..." style={{ resize: 'vertical' }} />
          </Field>
        </Card>

        {/* Remediation */}
        <Card title="Remediation">
          <Field label={`Fix applied (${form.fix_applied.length}/10 min)`} error={errors.fix_applied}>
            <textarea className={`input${errors.fix_applied ? ' error' : ''}`} rows={3} value={form.fix_applied} onChange={e => set('fix_applied', e.target.value)} placeholder="Describe the immediate fix or workaround applied..." style={{ resize: 'vertical' }} />
          </Field>
          <Field label={`Prevention steps (${form.prevention_steps.length}/10 min)`} error={errors.prevention_steps}>
            <textarea className={`input${errors.prevention_steps ? ' error' : ''}`} rows={3} value={form.prevention_steps} onChange={e => set('prevention_steps', e.target.value)} placeholder="List preventative actions to avoid recurrence..." style={{ resize: 'vertical' }} />
          </Field>
        </Card>

        {serverError && <div style={s.serverError}>{serverError}</div>}

        <div style={s.actions}>
          <button type="button" className="btn btn-secondary" onClick={() => navigate(`/incident/${id}`)}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? <span className="spinner" style={{ width: 12, height: 12, borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#fff' }} /> : null}
            {submitting ? 'Submitting...' : 'Submit RCA'}
          </button>
        </div>
      </form>
    </div>
  )
}

function Card({ title, children }) {
  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', background: 'var(--surface2)', fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{title}</div>
      <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>{children}</div>
    </div>
  )
}

function Field({ label, error, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{label}</label>
      {children}
      {error && <span style={{ fontSize: 12, color: 'var(--p0)' }}>{error}</span>}
    </div>
  )
}

const s = {
  root: { padding: '24px 32px', maxWidth: 860, margin: '0 auto' },
  breadcrumb: { marginBottom: 20 },
  header: { marginBottom: 24 },
  title: { fontSize: 22, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em', marginBottom: 6 },
  sub: { fontSize: 13, color: 'var(--text2)' },
  form: { display: 'flex', flexDirection: 'column', gap: 16 },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 },
  mttrPreview: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: 'var(--accent-light)', borderRadius: 8, fontSize: 13, marginTop: 4 },
  serverError: { padding: '10px 14px', background: 'var(--p0-bg)', border: '1px solid var(--p0-border)', borderRadius: 8, fontSize: 13, color: 'var(--p0)' },
  actions: { display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4 },
}
