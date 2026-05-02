/* ──────────────────────────────────────────────────────────────────────────
   SAP Fiori Launchpad — tile-based home screen (Image 03 / 04 reference)
   - Light grey background (#f2f2f2)
   - Tab bar with active underline (no pill buttons)
   - Square white tiles, 1px border, 0px radius — exactly SAP
   - Section headers bold, no decoration
────────────────────────────────────────────────────────────────────────── */

import { useState } from 'react'

const SAP_BLUE  = '#0a6ed1'
const SHELL_BG  = '#0d1e35'   /* muted structural navy — shell bar only */

/* ── Matrix logo — interlocking torus/ring mark ──────────────────────── */
function MatrixLogo({ size = 22, color = '#fff', bg = SHELL_BG }) {
  const sw = 8, gap = 15
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" strokeLinecap="butt" style={{ display: 'block', flexShrink: 0 }}>
      <ellipse cx="50" cy="50" rx="40" ry="17" stroke={color} strokeWidth={sw}/>
      <ellipse cx="50" cy="50" rx="17" ry="40" stroke={bg} strokeWidth={gap}/>
      <ellipse cx="50" cy="50" rx="17" ry="40" stroke={color} strokeWidth={sw}/>
      <path d="M34.35,34.35 A40,17 0 0 0 34.35,65.65" stroke={bg} strokeWidth={gap}/>
      <path d="M34.35,34.35 A40,17 0 0 0 34.35,65.65" stroke={color} strokeWidth={sw}/>
      <path d="M65.65,34.35 A40,17 0 0 1 65.65,65.65" stroke={bg} strokeWidth={gap}/>
      <path d="M65.65,34.35 A40,17 0 0 1 65.65,65.65" stroke={color} strokeWidth={sw}/>
    </svg>
  )
}

/* ── App tiles (active modules) ──────────────────────────────────────── */
const APP_TILES = [
  {
    id: 'quality',
    title: 'Quality Management',
    subtitle: 'SQC',
    icon: (
      <svg viewBox="0 0 36 36" width="36" height="36" fill="none" stroke={SAP_BLUE} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="4"  width="12" height="12" />
        <rect x="20" y="4"  width="12" height="12" />
        <rect x="4" y="20" width="12" height="12" />
        <rect x="20" y="20" width="12" height="12" />
        <polyline points="22,28 25,24.5 28,26.5 31,22" />
      </svg>
    ),
  },
  {
    id: 'production',
    title: 'Production &\nInventory',
    subtitle: 'Output',
    icon: (
      <svg viewBox="0 0 36 36" width="36" height="36" fill="none" stroke={SAP_BLUE} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="5" y="18" width="10" height="13" />
        <rect x="19" y="11" width="12" height="20" />
        <line x1="9"  y1="18" x2="9"  y2="12" />
        <line x1="13" y1="18" x2="13" y2="14" />
        <line x1="22" y1="18" x2="28" y2="18" />
        <line x1="22" y1="22" x2="28" y2="22" />
        <line x1="22" y1="26" x2="26" y2="26" />
      </svg>
    ),
  },
  {
    id: 'masterdata',
    title: 'Master Data',
    subtitle: 'BP · MM',
    icon: (
      <svg viewBox="0 0 36 36" width="36" height="36" fill="none" stroke={SAP_BLUE} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        {/* Building / organisation icon */}
        <rect x="6" y="10" width="24" height="20" />
        <line x1="6"  y1="16" x2="30" y2="16" />
        <rect x="10" y="20" width="5" height="5" />
        <rect x="21" y="20" width="5" height="5" />
        <line x1="18" y1="10" x2="18" y2="6" />
        <line x1="12" y1="6"  x2="24" y2="6" />
      </svg>
    ),
  },
]

/* ── Planned tiles ────────────────────────────────────────────────────── */
const FUTURE_TILES = [
  {
    id: 'maintenance',
    title: 'Maintenance',
    subtitle: 'Planned',
    icon: (
      <svg viewBox="0 0 36 36" width="36" height="36" fill="none" stroke="#89919a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M27 9l-4 4-3-3 4-4a5.5 5.5 0 00-7 7L7 23a2.8 2.8 0 003.5 3.5L20 17a5.5 5.5 0 007-7z" />
      </svg>
    ),
  },
  {
    id: 'hr',
    title: 'Human Resources',
    subtitle: 'Planned',
    icon: (
      <svg viewBox="0 0 36 36" width="36" height="36" fill="none" stroke="#89919a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="18" cy="13" r="5.5" />
        <path d="M7 31a11 11 0 0122 0" />
      </svg>
    ),
  },
  {
    id: 'inventory',
    title: 'Inventory',
    subtitle: 'Planned',
    icon: (
      <svg viewBox="0 0 36 36" width="36" height="36" fill="none" stroke="#89919a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="5" y="5" width="26" height="26" />
        <line x1="5"  y1="13" x2="31" y2="13" />
        <line x1="5"  y1="21" x2="31" y2="21" />
        <line x1="14" y1="5"  x2="14" y2="31" />
      </svg>
    ),
  },
]

/* ── Tab configuration ────────────────────────────────────────────────── */
const TABS = [
  { id: 'apps',     label: 'My Applications' },
  { id: 'settings', label: 'Settings'         },
]

/* ── SAP Tile component ───────────────────────────────────────────────── */
function SapTile({ title, subtitle, icon, onClick, disabled, metric, metricLabel }) {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      onClick={disabled ? undefined : onClick}
      onMouseEnter={() => !disabled && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 176,
        height: 176,
        background: '#ffffff',
        border: hovered ? `1px solid ${SAP_BLUE}` : '1px solid #d9dadb',
        borderRadius: 0,
        padding: '16px 14px 14px',
        display: 'flex',
        flexDirection: 'column',
        cursor: disabled ? 'default' : 'pointer',
        position: 'relative',
        outline: hovered && !disabled ? `2px solid ${SAP_BLUE}` : 'none',
        outlineOffset: -1,
        boxShadow: hovered && !disabled ? '0 2px 8px rgba(8,84,160,.15)' : 'none',
        transition: 'border-color .1s, box-shadow .1s, outline .1s',
        userSelect: 'none',
        opacity: disabled ? .6 : 1,
      }}
    >
      {/* Title — top left, SAP standard */}
      <div style={{
        fontSize: 13.5,
        fontWeight: 400,
        color: disabled ? '#6a6d70' : '#32363a',
        lineHeight: 1.35,
        whiteSpace: 'pre-line',
      }}>
        {title}
      </div>

      {/* Icon or metric — vertically centred */}
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        {metric !== undefined ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{
              fontFamily: 'var(--mono)',
              fontSize: 40,
              fontWeight: 300,
              color: disabled ? '#89919a' : SAP_BLUE,
              lineHeight: 1,
            }}>
              {metric}
            </div>
            {metricLabel && (
              <div style={{ fontSize: 11, color: '#6a6d70', marginTop: 4 }}>{metricLabel}</div>
            )}
          </div>
        ) : icon}
      </div>

      {/* Footer — bottom, subtitle / source label */}
      <div style={{
        fontSize: 11,
        color: '#6a6d70',
        borderTop: '1px solid #e8e8e8',
        paddingTop: 8,
        marginTop: 6,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <span style={{ color: disabled ? '#c8cacb' : '#89919a' }}>{disabled ? 'Planned' : 'Active'}</span>
        <span style={{ color: '#89919a' }}>{subtitle}</span>
      </div>
    </div>
  )
}

/* ── LandingPage ─────────────────────────────────────────────────────── */
export default function LandingPage({ setCurrentModule, overview, alerts, depts }) {
  const [activeTab, setActiveTab] = useState('apps')

  const hour     = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const dateStr  = new Date().toLocaleDateString('en-IN', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })

  const hasBad    = alerts.some(a => a.severity === 'bad')
  const hasWarn   = alerts.some(a => a.severity === 'warn')
  const goodDepts = depts.filter(d => d.quality === 'ok').length
  const totalKpi  = overview.reduce((s, o) => s + (o.batch_count || 0), 0)

  return (
    <div style={{ height: '100%', background: 'var(--bg-2)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ── Shell bar ─────────────────────────────────────────────────── */}
      <div style={{
        height: 44,
        background: SHELL_BG,
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        gap: 0,
        flexShrink: 0,
      }}>
        {/* Matrix logo + brand */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 9,
          paddingRight: 14, borderRight: '1px solid rgba(255,255,255,.10)',
          marginRight: 14,
        }}>
          <MatrixLogo size={22} color="#fff" bg={SHELL_BG} />
          <span style={{ fontSize: 13, fontWeight: 600, color: '#fff', letterSpacing: '.06em' }}>Matrix</span>
        </div>

        {/* Context label */}
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,.38)' }}>Application Launchpad</span>

        {/* Right: system status + user icon */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'rgba(255,255,255,.55)' }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
              background: hasBad ? '#ff6b6b' : hasWarn ? '#ff8f3c' : '#3dd68c',
              display: 'inline-block',
            }} />
            {hasBad ? 'Action required' : hasWarn ? 'Warnings active' : 'All systems normal'}
          </div>
          {/* User icon — no SVS text */}
          <div style={{
            width: 28, height: 28,
            background: 'rgba(255,255,255,.10)',
            border: '1px solid rgba(255,255,255,.16)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="rgba(255,255,255,.65)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="8" cy="5.5" r="2.5" />
              <path d="M2.5 13.5c0-2.5 2.46-4.5 5.5-4.5s5.5 2 5.5 4.5" />
            </svg>
          </div>
        </div>
      </div>

      {/* ── SAP Fiori tab bar ─────────────────────────────────────────── */}
      <div style={{
        background: '#fff',
        borderBottom: '1px solid #d9dadb',
        padding: '0 24px',
        display: 'flex',
        alignItems: 'flex-end',
        gap: 0,
        flexShrink: 0,
      }}>
        {/* Greeting left-aligned */}
        <div style={{ fontSize: 12, color: '#6a6d70', padding: '12px 24px 12px 0', borderRight: '1px solid #d9dadb', marginRight: 8 }}>
          {greeting} — <span style={{ color: '#32363a', fontWeight: 500 }}>{dateStr}</span>
        </div>

        {TABS.map(tab => {
          const active = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '12px 20px 10px',
                fontSize: 13,
                fontWeight: active ? 600 : 400,
                border: 'none',
                borderBottom: active ? `3px solid ${SAP_BLUE}` : '3px solid transparent',
                background: 'transparent',
                color: active ? SAP_BLUE : '#6a6d70',
                cursor: 'pointer',
                fontFamily: 'var(--font)',
                transition: 'color .1s, border-color .1s',
                whiteSpace: 'nowrap',
              }}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* ── Content ────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px 40px' }}>

        {activeTab === 'apps' && (
          <>
            {/* ── Quick KPI bar (SAP analytics strip) ─────────────────── */}
            {overview.length > 0 && (
              <div style={{
                display: 'flex', gap: 0,
                background: '#fff', border: '1px solid #d9dadb',
                marginBottom: 24,
              }}>
                {[
                  { label: 'Departments in control', value: `${goodDepts} / ${depts.length}`, color: '#188f36' },
                  { label: 'Total batches recorded',  value: totalKpi,                          color: '#0a6ed1' },
                  { label: 'Active alerts',            value: alerts.filter(a => a.severity !== 'ok').length, color: hasBad ? '#bb0000' : hasWarn ? '#e6600d' : '#188f36' },
                  { label: 'Departments tracked',      value: depts.length,                      color: '#0a6ed1' },
                ].map((kpi, i, arr) => (
                  <div key={kpi.label} style={{
                    flex: 1,
                    padding: '14px 20px',
                    borderRight: i < arr.length - 1 ? '1px solid #d9dadb' : 'none',
                  }}>
                    <div style={{ fontSize: 11, color: '#6a6d70', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.07em' }}>
                      {kpi.label}
                    </div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 28, fontWeight: 300, color: kpi.color, lineHeight: 1 }}>
                      {kpi.value}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── Active Applications ──────────────────────────────────── */}
            <div style={{ marginBottom: 20 }}>
              <div style={{
                fontSize: 14, fontWeight: 600, color: '#32363a',
                marginBottom: 12, paddingBottom: 8,
                borderBottom: '1px solid #d9dadb',
              }}>
                My Applications
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {APP_TILES.map(tile => (
                  <SapTile
                    key={tile.id}
                    title={tile.title}
                    subtitle={tile.subtitle}
                    icon={tile.icon}
                    onClick={() => setCurrentModule(tile.id)}
                  />
                ))}
              </div>
            </div>

            {/* ── Planned Modules ──────────────────────────────────────── */}
            <div style={{ marginTop: 32 }}>
              <div style={{
                fontSize: 14, fontWeight: 600, color: '#32363a',
                marginBottom: 12, paddingBottom: 8,
                borderBottom: '1px solid #d9dadb',
              }}>
                Planned Modules
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {FUTURE_TILES.map(tile => (
                  <SapTile
                    key={tile.id}
                    title={tile.title}
                    subtitle={tile.subtitle}
                    icon={tile.icon}
                    disabled
                  />
                ))}
              </div>
            </div>
          </>
        )}

        {activeTab === 'settings' && (
          <div style={{ background: '#fff', border: '1px solid #d9dadb', padding: '24px' }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#32363a', marginBottom: 4 }}>System Settings</div>
            <div style={{ fontSize: 12, color: '#6a6d70' }}>
              Navigate to Quality Management → Settings to configure department targets and tolerances.
            </div>
          </div>
        )}

        {/* System footer */}
        <div style={{ marginTop: 48, display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, color: '#89919a', borderTop: '1px solid #d9dadb', paddingTop: 16 }}>
          <span>SVS Enterprise · SVS Branch · v2.0</span>
          <span style={{ fontFamily: 'var(--mono)' }}>:8000 backend · :5173 frontend</span>
        </div>
      </div>
    </div>
  )
}
