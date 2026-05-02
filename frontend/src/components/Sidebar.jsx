import { useNavigate, useLocation } from 'react-router-dom'
import { clearToken } from '../lib/api'

const NAV = [
  { section: 'OVERVIEW', items: [
    { label: 'Dashboard', path: '/', icon: '▦' },
  ]},
  { section: 'OPERATIONS', items: [
    { label: 'Incidents', path: '/incidents', icon: '⚠' },
  ]},
]

export default function Sidebar({ onLogout, wsConnected }) {
  const navigate = useNavigate()
  const location = useLocation()

  return (
    <aside style={s.sidebar}>
      {/* Logo */}
      <div style={s.logo}>
        <div style={s.logoIcon}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
          </svg>
        </div>
        <span style={s.logoText}>IMS</span>
      </div>

      {/* Nav */}
      <nav style={s.nav}>
        {NAV.map(({ section, items }) => (
          <div key={section} style={s.section}>
            <div style={s.sectionLabel}>{section}</div>
            {items.map(({ label, path, icon }) => {
              const active = location.pathname === path
              return (
                <button
                  key={path}
                  style={{ ...s.navItem, ...(active ? s.navItemActive : {}) }}
                  onClick={() => navigate(path)}
                >
                  <span style={s.navIcon}>{icon}</span>
                  {label}
                </button>
              )
            })}
          </div>
        ))}
      </nav>

      {/* Bottom */}
      <div style={s.bottom}>
        <div style={s.wsRow}>
          <span style={{ ...s.wsDot, background: wsConnected ? '#4ade80' : '#f87171' }} />
          <span style={s.wsText}>{wsConnected ? 'Live' : 'Connecting'}</span>
        </div>
        <button style={s.logoutBtn} onClick={() => { clearToken(); onLogout() }}>
          Sign out
        </button>
      </div>
    </aside>
  )
}

const s = {
  sidebar: {
    width: 270,
    background: '#0f172a',
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
    height: '100vh',
    borderRight: '1px solid rgba(255,255,255,0.06)',
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '20px 16px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
  },
  logoIcon: {
    width: 28,
    height: 28,
    borderRadius: 7,
    background: '#6366f1',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    fontSize: 15,
    fontWeight: 700,
    color: '#ffffff',
    letterSpacing: '-0.02em',
  },
  nav: {
    flex: 1,
    padding: '12px 8px',
    overflowY: 'auto',
  },
  section: {
    marginBottom: 20,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: 600,
    color: 'rgba(255,255,255,0.25)',
    letterSpacing: '0.1em',
    padding: '4px 8px',
    marginBottom: 4,
  },
  navItem: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 10px',
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 500,
    color: 'rgba(255,255,255,0.5)',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'all 0.15s',
    fontFamily: 'inherit',
  },
  navItemActive: {
    background: 'rgba(99,102,241,0.15)',
    color: '#a5b4fc',
  },
  navIcon: {
    fontSize: 14,
    width: 18,
    textAlign: 'center',
  },
  bottom: {
    padding: '12px 16px',
    borderTop: '1px solid rgba(255,255,255,0.06)',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  wsRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  wsDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    display: 'inline-block',
  },
  wsText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
  },
  logoutBtn: {
    width: '100%',
    padding: '7px',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 6,
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
}