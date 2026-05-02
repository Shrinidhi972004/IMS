import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import api from '../lib/api'

const CATEGORIES = [
  { value: 'INFRASTRUCTURE', label: 'Infrastructure', icon: '🏗️', desc: 'Hardware, network, or cloud provider issues' },
  { value: 'APPLICATION', label: 'Application', icon: '💻', desc: 'Software bugs or deployment issues' },
  { value: 'NETWORK', label: 'Network', icon: '🌐', desc: 'Connectivity or routing problems' },
  { value: 'DATABASE', label: 'Database', icon: '🗄️', desc: 'Query performance or data integrity issues' },
  { value: 'THIRD_PARTY', label: 'Third Party', icon: '🔌', desc: 'External service or vendor failure' },
  { value: 'HUMAN_ERROR', label: 'Human Error', icon: '👤', desc: 'Misconfiguration or operational mistake' },
  { value: 'UNKNOWN', label: 'Unknown', icon: '❓', desc: 'Root cause not yet determined' },
]

function nowLocal() {
  const now = new Date()
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset())
  return now.toISOString().slice(0, 16)
}

function maxDateTime() {
  const now = new Date()
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset())
  return now.toISOString().slice(0, 16)
}

export default function RCAForm() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [form, setForm] = useState({
    incident_start: nowLocal(),
    incident_end: nowLocal(),
    root_cause_category: '',
    root_cause_detail: '',
    fix_applied: '',
    prevention_steps: '',
  })
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [serverError, setServerError] = useState('')
  const [success, setSuccess] = useState(false)

  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }))
    setErrors(e => ({ ...e, [field]: '' }))
  }

  function isFuture(val) {
    return new Date(val) > new Date()
  }

  function validate() {
    const errs = {}
    const start = new Date(form.incident_start)
    const end = new Date(form.incident_end)

    if (!form.incident_start) errs.incident_start = 'Start time is required'
    else if (isFuture(form.incident_start)) errs.incident_start = 'Start time cannot be in the future'

    if (!form.incident_end) errs.incident_end = 'End time is required'
    else if (isFuture(form.incident_end)) errs.incident_end = 'End time cannot exceed current time'
    else if (end <= start) errs.incident_end = 'End time must be after start time'

    if (!form.root_cause_category) errs.root_cause_category = 'Please select a category'
    if (form.root_cause_detail.length < 20) errs.root_cause_detail = `${20 - form.root_cause_detail.length} more characters needed`
    if (form.fix_applied.length < 10) errs.fix_applied = `${10 - form.fix_applied.length} more characters needed`
    if (form.prevention_steps.length < 10) errs.prevention_steps = `${10 - form.prevention_steps.length} more characters needed`
    return errs
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    setSubmitting(true)
    setServerError('')
    try {
      await api.submitRCA(id, {
        ...form,
        incident_start: new Date(form.incident_start).toISOString(),
        incident_end: new Date(form.incident_end).toISOString(),
      })
      setSuccess(true)
      setTimeout(() => navigate(`/incident/${id}`), 2000)
    } catch (err) {
      setServerError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const mttr = form.incident_start && form.incident_end
    ? Math.max(0, (new Date(form.incident_end) - new Date(form.incident_start)) / 60000).toFixed(1)
    : null

  if (success) {
    return (
      <div style={s.successPage}>
        <div style={s.successCard}>
          <div style={s.successIconWrap}>
            <span style={{ fontSize: 40 }}>✅</span>
          </div>
          <h2 style={s.successTitle}>RCA Submitted Successfully</h2>
          <p style={s.successDesc}>Your root cause analysis has been recorded. Redirecting back to the incident...</p>
          <div style={s.successProgress} />
        </div>
      </div>
    )
  }

  return (
    <div style={s.root}>
      {/* Breadcrumb */}
      <div style={s.breadcrumb}>
        <button style={s.backBtn} onClick={() => navigate(`/incident/${id}`)}>
          ← Back to Incident
        </button>
        <span style={s.breadSep}>/</span>
        <span style={s.breadCurrent}>Submit RCA</span>
      </div>

      {/* Page header */}
      <div style={s.pageHeader}>
        <div>
          <h1 style={s.title}>Root Cause Analysis</h1>
          <p style={s.subtitle}>
            Document the incident timeline, root cause, and preventative measures.
          </p>
        </div>
        <div style={s.workItemBadge}>
          <span style={s.workItemLabel}>Work Item</span>
          <span style={s.workItemId}>{id.slice(0, 12)}...</span>
        </div>
      </div>

      <form onSubmit={handleSubmit} style={s.form}>

        {/* Section 1 — Timeline */}
        <div style={s.section}>
          <div style={s.sectionHeader}>
            <div style={s.sectionNum}>1</div>
            <div>
              <div style={s.sectionTitle}>Incident Timeline</div>
              <div style={s.sectionDesc}>Define when the incident started and ended</div>
            </div>
          </div>
          <div style={s.sectionBody}>
            <div style={s.timelineGrid}>
              <div style={s.timelineCard}>
                <div style={s.timelineLabel}>
                  <span style={{ ...s.timelineDot, background: '#dc2626' }} />
                  Incident Start
                </div>
                <input
                  style={{ ...s.input, ...(errors.incident_start ? s.inputError : {}) }}
                  type="datetime-local"
                  value={form.incident_start}
                  max={maxDateTime()}
                  onChange={e => {
                    const val = e.target.value
                    if (isFuture(val)) {
                      set('incident_start', maxDateTime())
                      setErrors(err => ({ ...err, incident_start: 'Start time cannot be in the future' }))
                    } else {
                      set('incident_start', val)
                    }
                  }}
                />
                {errors.incident_start && <div style={s.fieldError}>{errors.incident_start}</div>}
              </div>

              <div style={s.timelineArrow}>→</div>

              <div style={s.timelineCard}>
                <div style={s.timelineLabel}>
                  <span style={{ ...s.timelineDot, background: '#16a34a' }} />
                  Incident End
                </div>
                <input
                  style={{ ...s.input, ...(errors.incident_end ? s.inputError : {}) }}
                  type="datetime-local"
                  value={form.incident_end}
                  max={maxDateTime()}
                  onChange={e => {
                    const val = e.target.value
                    if (isFuture(val)) {
                      set('incident_end', maxDateTime())
                      setErrors(err => ({ ...err, incident_end: 'End time cannot exceed current time' }))
                    } else {
                      set('incident_end', val)
                    }
                  }}
                />
                {errors.incident_end && <div style={s.fieldError}>{errors.incident_end}</div>}
              </div>
            </div>

            {/* MTTR Preview */}
            {mttr && Number(mttr) > 0 && (
              <div style={s.mttrPreview}>
                <div style={s.mttrIcon}>⏱</div>
                <div>
                  <div style={s.mttrValue}>{mttr} minutes</div>
                  <div style={s.mttrLabel}>Calculated MTTR (Mean Time To Repair)</div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Section 2 — Root Cause Category */}
        <div style={s.section}>
          <div style={s.sectionHeader}>
            <div style={s.sectionNum}>2</div>
            <div>
              <div style={s.sectionTitle}>Root Cause Category</div>
              <div style={s.sectionDesc}>Select the category that best describes the root cause</div>
            </div>
          </div>
          <div style={s.sectionBody}>
            <div style={s.categoryGrid}>
              {CATEGORIES.map(({ value, label, icon, desc }) => {
                const selected = form.root_cause_category === value
                return (
                  <button
                    key={value}
                    type="button"
                    style={{
                      ...s.categoryCard,
                      ...(selected ? s.categoryCardSelected : {}),
                    }}
                    onClick={() => set('root_cause_category', value)}
                  >
                    <span style={s.categoryIcon}>{icon}</span>
                    <span style={{ ...s.categoryLabel, color: selected ? '#4f46e5' : '#1e293b' }}>{label}</span>
                    <span style={s.categoryDesc}>{desc}</span>
                    {selected && <div style={s.categoryCheck}>✓</div>}
                  </button>
                )
              })}
            </div>
            {errors.root_cause_category && (
              <div style={s.fieldError}>{errors.root_cause_category}</div>
            )}
          </div>
        </div>

        {/* Section 3 — Analysis */}
        <div style={s.section}>
          <div style={s.sectionHeader}>
            <div style={s.sectionNum}>3</div>
            <div>
              <div style={s.sectionTitle}>Root Cause Analysis</div>
              <div style={s.sectionDesc}>Describe the root cause in detail</div>
            </div>
          </div>
          <div style={s.sectionBody}>
            <TextAreaField
              label="Root Cause Detail"
              hint="Describe what failed, why it failed, and the chain of events that led to the incident."
              value={form.root_cause_detail}
              onChange={v => set('root_cause_detail', v)}
              error={errors.root_cause_detail}
              minLen={20}
              placeholder="e.g. The cache cluster exceeded its memory limit due to an unexpected spike in traffic. The eviction policy was set to noeviction which caused all new writes to fail..."
              rows={5}
            />
          </div>
        </div>

        {/* Section 4 — Remediation */}
        <div style={s.section}>
          <div style={s.sectionHeader}>
            <div style={s.sectionNum}>4</div>
            <div>
              <div style={s.sectionTitle}>Remediation</div>
              <div style={s.sectionDesc}>Document the fix and how to prevent recurrence</div>
            </div>
          </div>
          <div style={s.sectionBody}>
            <TextAreaField
              label="Fix Applied"
              hint="What immediate action was taken to resolve the incident?"
              value={form.fix_applied}
              onChange={v => set('fix_applied', v)}
              error={errors.fix_applied}
              minLen={10}
              placeholder="e.g. Restarted the cache cluster with increased memory limit and changed eviction policy to allkeys-lru..."
              rows={4}
            />
            <TextAreaField
              label="Prevention Steps"
              hint="What changes will prevent this from happening again?"
              value={form.prevention_steps}
              onChange={v => set('prevention_steps', v)}
              error={errors.prevention_steps}
              minLen={10}
              placeholder="e.g. 1. Add memory usage alert at 70% threshold. 2. Review eviction policy monthly. 3. Add load testing to CI pipeline..."
              rows={4}
            />
          </div>
        </div>

        {/* Server error */}
        {serverError && (
          <div style={s.serverError}>
            <span>⚠</span> {serverError}
          </div>
        )}

        {/* Actions */}
        <div style={s.actions}>
          <button
            type="button"
            style={s.cancelBtn}
            onClick={() => navigate(`/incident/${id}`)}
          >
            Cancel
          </button>
          <button
            type="submit"
            style={s.submitBtn}
            disabled={submitting}
          >
            {submitting ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={s.spinner} /> Submitting...
              </span>
            ) : '📋 Submit Root Cause Analysis'}
          </button>
        </div>

      </form>
    </div>
  )
}

function TextAreaField({ label, hint, value, onChange, error, minLen, placeholder, rows }) {
  const remaining = Math.max(0, minLen - value.length)
  const done = value.length >= minLen

  return (
    <div style={tf.wrap}>
      <div style={tf.labelRow}>
        <label style={tf.label}>{label}</label>
        <span style={{ ...tf.counter, color: done ? '#16a34a' : remaining <= 5 ? '#d97706' : '#94a3b8' }}>
          {done ? `✓ ${value.length} chars` : `${remaining} more needed`}
        </span>
      </div>
      <p style={tf.hint}>{hint}</p>
      <textarea
        style={{
          ...tf.textarea,
          borderColor: error ? '#fca5a5' : done ? '#86efac' : '#e2e8f0',
          boxShadow: done ? '0 0 0 3px rgba(22,163,74,0.08)' : 'none',
        }}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
      />
      {error && <div style={tf.error}>{error}</div>}
    </div>
  )
}

const s = {
  root: { padding: '28px 36px', maxWidth: 960, margin: '0 auto' },
  breadcrumb: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 },
  backBtn: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, background: '#fff', border: '1.5px solid #e2e8f0', color: '#475569', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
  breadSep: { color: '#cbd5e1', fontSize: 16 },
  breadCurrent: { fontSize: 13, color: '#94a3b8' },
  pageHeader: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 },
  title: { fontSize: 26, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.03em', marginBottom: 6 },
  subtitle: { fontSize: 14, color: '#64748b', lineHeight: 1.5 },
  workItemBadge: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 },
  workItemLabel: { fontSize: 10, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' },
  workItemId: { fontSize: 12, color: '#6366f1', fontFamily: 'monospace', fontWeight: 600, background: '#eef2ff', padding: '3px 10px', borderRadius: 6 },
  form: { display: 'flex', flexDirection: 'column', gap: 20 },
  section: { background: 'white', border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' },
  sectionHeader: { display: 'flex', alignItems: 'flex-start', gap: 14, padding: '16px 20px', background: '#f8fafc', borderBottom: '1px solid #f1f5f9' },
  sectionNum: { width: 28, height: 28, borderRadius: '50%', background: '#6366f1', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 },
  sectionTitle: { fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 2 },
  sectionDesc: { fontSize: 12, color: '#64748b' },
  sectionBody: { padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 },
  timelineGrid: { display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 12, alignItems: 'center' },
  timelineCard: { display: 'flex', flexDirection: 'column', gap: 8 },
  timelineLabel: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: '#374151' },
  timelineDot: { width: 8, height: 8, borderRadius: '50%', display: 'inline-block' },
  timelineArrow: { fontSize: 20, color: '#94a3b8', textAlign: 'center', paddingTop: 24 },
  input: { width: '100%', padding: '10px 14px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13, color: '#0f172a', background: '#fff', outline: 'none', fontFamily: 'inherit', transition: 'border-color 0.15s' },
  inputError: { borderColor: '#fca5a5' },
  mttrPreview: { display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', background: 'linear-gradient(135deg, #eef2ff, #f0fdf4)', border: '1px solid #c7d2fe', borderRadius: 10 },
  mttrIcon: { fontSize: 28 },
  mttrValue: { fontSize: 22, fontWeight: 800, color: '#4f46e5', letterSpacing: '-0.02em' },
  mttrLabel: { fontSize: 11, color: '#6366f1', fontWeight: 500, marginTop: 2 },
  categoryGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 },
  categoryCard: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '14px 10px', background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s', position: 'relative', textAlign: 'center' },
  categoryCardSelected: { background: '#eef2ff', border: '1.5px solid #6366f1', boxShadow: '0 0 0 3px rgba(99,102,241,0.1)' },
  categoryIcon: { fontSize: 22 },
  categoryLabel: { fontSize: 12, fontWeight: 700 },
  categoryDesc: { fontSize: 10, color: '#94a3b8', lineHeight: 1.4 },
  categoryCheck: { position: 'absolute', top: 6, right: 8, fontSize: 11, fontWeight: 700, color: '#6366f1' },
  fieldError: { fontSize: 12, color: '#dc2626', marginTop: 4 },
  serverError: { display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, fontSize: 13, color: '#dc2626' },
  actions: { display: 'flex', gap: 12, justifyContent: 'flex-end', paddingTop: 4, paddingBottom: 20 },
  cancelBtn: { padding: '10px 24px', background: 'white', border: '1.5px solid #e2e8f0', borderRadius: 10, fontSize: 13, fontWeight: 600, color: '#475569', cursor: 'pointer', fontFamily: 'inherit' },
  submitBtn: { padding: '11px 28px', background: '#6366f1', color: 'white', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 2px 8px rgba(99,102,241,0.3)' },
  spinner: { width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.6s linear infinite', display: 'inline-block' },
  successPage: { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '80vh' },
  successCard: { textAlign: 'center', padding: '48px 40px', background: 'white', borderRadius: 16, border: '1px solid #e2e8f0', boxShadow: '0 4px 24px rgba(0,0,0,0.08)', maxWidth: 400 },
  successIconWrap: { marginBottom: 16 },
  successTitle: { fontSize: 20, fontWeight: 800, color: '#0f172a', marginBottom: 10 },
  successDesc: { fontSize: 14, color: '#64748b', lineHeight: 1.6, marginBottom: 20 },
  successProgress: { height: 4, background: 'linear-gradient(to right, #6366f1, #4f46e5)', borderRadius: 2 },
}

const tf = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 6 },
  labelRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  label: { fontSize: 13, fontWeight: 700, color: '#374151' },
  counter: { fontSize: 11, fontWeight: 600, transition: 'color 0.2s' },
  hint: { fontSize: 12, color: '#94a3b8', lineHeight: 1.5, marginBottom: 2 },
  textarea: { width: '100%', padding: '12px 14px', border: '1.5px solid #e2e8f0', borderRadius: 10, fontSize: 13, color: '#1e293b', background: '#fff', outline: 'none', fontFamily: 'inherit', lineHeight: 1.6, resize: 'vertical', transition: 'border-color 0.2s, box-shadow 0.2s' },
  error: { fontSize: 12, color: '#dc2626', marginTop: 2 },
}