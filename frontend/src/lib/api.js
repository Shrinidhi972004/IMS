// API client — wraps fetch with JWT auth, base URL, and error handling

const BASE = '/api/v1'

function getToken() {
  return localStorage.getItem('ims_token')
}

export function setToken(token) {
  localStorage.setItem('ims_token', token)
}

export function clearToken() {
  localStorage.removeItem('ims_token')
}

async function request(method, path, body) {
  const headers = { 'Content-Type': 'application/json' }
  const token = getToken()
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })

  if (res.status === 401) {
    clearToken()
    window.location.href = '/login'
    return
  }

  const data = await res.json().catch(() => ({}))

  if (!res.ok) {
    throw new Error(data.error || `Request failed: ${res.status}`)
  }

  return data
}

const api = {
  // Auth
  signup: (username, password) =>
    request('POST', '/auth/signup', { username, password }),

  login: (username, password) =>
    request('POST', '/auth/login', { username, password }),

  // Dashboard
  getDashboard: () => request('GET', '/dashboard'),

  // Work items
  listWorkItems: () => request('GET', '/workitems'),
  getWorkItem: (id) => request('GET', `/workitems/${id}`),
  transition: (id, toState) =>
    request('PATCH', `/workitems/${id}/transition`, { to_state: toState }),

  // RCA
  submitRCA: (id, rca) => request('POST', `/workitems/${id}/rca`, rca),
  getRCA: (id) => request('GET', `/workitems/${id}/rca`),

  // Signals
  getSignals: (workItemId) => request('GET', `/signals/${workItemId}`),

  // Ingestion (for simulate script)
  ingestSignal: (signal) => request('POST', '/signals', signal),
  ingestBatch: (signals) => request('POST', '/signals/batch', signals),
}

export default api
