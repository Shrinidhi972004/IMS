import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import api from '../lib/api'

const ROOT_CAUSE_CATEGORIES = [
  'INFRASTRUCTURE',
  'APPLICATION',
  'NETWORK',
  'DATABASE',
  'THIRD_PARTY',
  'HUMAN_ERROR',
  'UNKNOWN',
]

export default function RCAForm() {
  const { id } = useParams()
  const navigate = useNavigate()

  const now = format(new Date(), "yyyy-MM-dd'T'HH:mm")

  const [form, setForm] = useState({
    incident_start: now,
    incident_end: now,
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

  function validate() {
    const errs = {}
    if (!form.incident_start) errs.incident_start = 'Required'
    if (!form.incident_end)   errs.incident_end = 'Required'
    if (form.incident_end <= form.incident_start)
      errs.incident_end = 'End must be after start'
    if (!form.root_cause_category) errs.root_cause_category = 'Required'
    if (form.root_cause_detail.length < 20)
      errs.root_cause_detail = 'Minimum 20 characters'
    if (form.fix_applied.length < 10)
      errs.fix_applied = 'Minimum 10 characters'
    if (form.prevention_steps.length < 10)
      errs.prevention_steps = 'Minimum 10 characters'
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
        incident_end:   new Date(form.incident_end).toISOString(),
      })
      setSuccess(true)
      setTimeout(() => navigate(`/incident/${id}`), 1800)
    } catch (err) {
      setServerError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (success) {
    return (
      <div style={styles.successWrap}>
        <div style={styles.successBox}>
          <div style={styles.successIcon}>✓</div>
          <div style={styles.successTitle}>RCA SUBMITTED</div>
          <div style={styles.successSub}>Redirecting to incident…</div>
        </div>
      </div>
    )
  }

  // MTTR preview
  const mttrPreview = form.incident_start && form.incident_end
    ? Math.max(0, (new Date(form.incident_end) - new Date(form.incident_start)) / 60000).toFixed(1)
    : null

  return (
    <div style={styles.root}>
      <button style={styles.backBtn} onClick={() => navigate(`/incident/${id}`)}>
        ← BACK TO INCIDENT
      </button>

      <div style={styles.header}>
        <h1 style={styles.title}>ROOT CAUSE ANALYSIS</h1>
        <div style={styles.subtitle} className="mono">
          Work Item: {id}
        </div>
      </div>

      <form onSubmit={handleSubmit} style={styles.form}>
        {/* Timeline section */}
        <FormSection title="INCIDENT TIMELINE">
          <div style={styles.grid2}>
            <FormField label="INCIDENT START" error={errors.incident_start} required>
              <input
                type="datetime-local"
                value={form.incident_start}
                onChange={e => set('incident_start', e.target.value)}
                style={inputStyle(errors.incident_start)}
              />
            </FormField>
            <FormField label="INCIDENT END" error={errors.incident_end} required>
              <input
                type="datetime-local"
                value={form.incident_end}
                onChange={e => set('incident_end', e.target.value)}
                style={inputStyle(errors.incident_end)}
              />
            </FormField>
          </div>
          {mttrPreview !== null && (
            <div style={styles.mttrPreview}>
              Calculated MTTR: <span style={{ color: 'var(--accent)' }}>{mttrPreview} minutes</span>
            </div>
          )}
        </FormSection>

        {/* Root cause section */}
        <FormSection title="ROOT CAUSE">
          <FormField label="CATEGORY" error={errors.root_cause_category} required>
            <select
              value={form.root_cause_category}
              onChange={e => set('root_cause_category', e.target.value)}
              style={inputStyle(errors.root_cause_category)}
            >
              <option value="">— select category —</option>
              {ROOT_CAUSE_CATEGORIES.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </FormField>

          <FormField
            label={`ROOT CAUSE DETAIL (${form.root_cause_detail.length}/20 min)`}
            error={errors.root_cause_detail}
            required
          >
            <textarea
              value={form.root_cause_detail}
              onChange={e => set('root_cause_detail', e.target.value)}
              rows={4}
              placeholder="Describe the root cause in detail. What failed, why it failed, and the chain of events that led to the incident."
              style={inputStyle(errors.root_cause_detail)}
            />
          </FormField>
        </FormSection>

        {/* Remediation section */}
        <FormSection title="REMEDIATION">
          <FormField
            label={`FIX APPLIED (${form.fix_applied.length}/10 min)`}
            error={errors.fix_applied}
            required
          >
            <textarea
              value={form.fix_applied}
              onChange={e => set('fix_applied', e.target.value)}
              rows={3}
              placeholder="Describe the immediate fix or workaround that was applied to resolve the incident."
              style={inputStyle(errors.fix_applied)}
            />
          </FormField>

          <FormField
            label={`PREVENTION STEPS (${form.prevention_steps.length}/10 min)`}
            error={errors.prevention_steps}
            required
          >
            <textarea
              value={form.prevention_steps}
              onChange={e => set('prevention_steps', e.target.value)}
              rows={3}
              placeholder="List the preventative actions, process improvements, or monitoring changes to prevent recurrence."
              style={inputStyle(errors.prevention_steps)}
            />
          </FormField>
        </FormSection>

        {/* Server error */}
        {serverError && (
          <div style={styles.serverError}>✗ {serverError}</div>
        )}

        {/* Submit */}
        <div style={styles.actions}>
          <button type="button" style={styles.cancelBtn} onClick={() => navigate(`/incident/${id}`)}>
            CANCEL
          </button>
          <button type="submit" style={styles.submitBtn} disabled={submitting}>
            {submitting ? 'SUBMITTING…' : '[ SUBMIT RCA ]'}
          </button>
        </div>
      </form>
    </div>
  )
}

function FormSection({ title, children }) {
  return (
    <div style={styles.section}>
      <div style={styles.sectionTitle}>{title}</div>
      <div style={styles.sectionBody}>{children}</div>
    </div>
  )
}

function FormField({ label, error, required, children }) {
  return (
    <div style={styles.fieldWrap}>
      <label style={styles.label}>
        {label}
        {required && <span style={{ color: 'var(--p0)', marginLeft: 4 }}>*</span>}
      </label>
      {children}
      {error && <div style={styles.fieldError}>{error}</div>}
    </div>
  )
}

function inputStyle(error) {
  return {
    borderColor: error ? 'var(--p0)' : undefined,
  }
}

const styles = {
  root: {
    padding: '20px 24px',
    maxWidth: 900,
    margin: '0 auto',
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
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    fontSize: 24,
    letterSpacing: '0.08em',
    color: 'var(--text-primary)',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 12,
    color: 'var(--text-muted)',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
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
  sectionBody: {
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  grid2: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 16,
  },
  mttrPreview: {
    fontFamily: 'var(--font-mono)',
    fontSize: 12,
    color: 'var(--text-secondary)',
    padding: '8px 12px',
    background: 'var(--bg-raised)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
  },
  fieldWrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  label: {
    fontFamily: 'var(--font-mono)',
    fontSize: 9,
    letterSpacing: '0.12em',
    color: 'var(--text-muted)',
  },
  fieldError: {
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    color: 'var(--p0)',
  },
  serverError: {
    fontFamily: 'var(--font-mono)',
    fontSize: 12,
    color: 'var(--p0)',
    background: 'var(--p0-dim)',
    border: '1px solid rgba(255,59,59,0.2)',
    borderRadius: 'var(--radius)',
    padding: '12px 16px',
  },
  actions: {
    display: 'flex',
    gap: 12,
    justifyContent: 'flex-end',
    paddingTop: 8,
  },
  cancelBtn: {
    background: 'transparent',
    border: '1px solid var(--border)',
    color: 'var(--text-secondary)',
    fontFamily: 'var(--font-display)',
    fontWeight: 600,
    fontSize: 12,
    letterSpacing: '0.08em',
    padding: '10px 24px',
    borderRadius: 'var(--radius)',
    cursor: 'pointer',
  },
  submitBtn: {
    background: 'var(--accent-dim)',
    border: '1px solid var(--accent)',
    color: 'var(--accent)',
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    fontSize: 13,
    letterSpacing: '0.1em',
    padding: '10px 32px',
    borderRadius: 'var(--radius)',
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  successWrap: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: 400,
  },
  successBox: {
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  successIcon: {
    fontSize: 48,
    color: 'var(--state-closed)',
  },
  successTitle: {
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    fontSize: 22,
    letterSpacing: '0.1em',
    color: 'var(--state-closed)',
  },
  successSub: {
    fontFamily: 'var(--font-mono)',
    fontSize: 12,
    color: 'var(--text-muted)',
  },
}
