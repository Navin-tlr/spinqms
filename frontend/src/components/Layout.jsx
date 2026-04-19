import { useState, useEffect, useRef, useCallback } from 'react'

/* ──────────────────────────────────────────────────────────────────────────
   Navigation manifest — default order, user can drag-reorder modules.
   Icons: clean 16×16 geometric stroke icons (Lucide / Notion aesthetic).
────────────────────────────────────────────────────────────────────────── */
const DEFAULT_NAV = [
  { id: 'overview', label: 'Overview',          emoji: '📊' },
  { id: 'entry',    label: 'Data Entry',         emoji: '✏️' },
  { id: 'charts',   label: 'Control Charts',     emoji: '📈' },
  { id: 'uster',    label: 'Uster Benchmarks',   emoji: '🎯' },
  { id: 'report',   label: 'Shift Report',       emoji: '📋' },
  { id: 'log',      label: 'Data Log',           emoji: '🗂️' },
  { id: 'lab',      label: 'YarnLAB',            emoji: '🧪' },
  { id: 'settings', label: 'Settings',           emoji: '⚙️' },
  { id: 'guide',    label: 'Operator Guide',     emoji: '📖' },
]
const BOTTOM_NAV = ['overview', 'entry', 'charts', 'report']

/* ── Clean geometric SVG paths (16 × 16 viewBox) ──────────────────────── */
const ICONS = {
  overview: 'M2 2h5.5v5.5H2V2zM8.5 2H14v5.5H8.5V2zM2 8.5h5.5V14H2V8.5zM8.5 8.5H14V14H8.5V8.5z',
  entry:    'M3 13h2.6L13 5.6 10.4 3 3 10.4V13zm8.8-9.5L13.5 5.2a.6.6 0 000 .9L12 7.5M9 5l2 2',
  charts:   'M2.5 2v11.5H14M4.5 11 7 7.5l2.5 2L13 4',
  uster:    'M8 13.5A5.5 5.5 0 108 2.5a5.5 5.5 0 000 11zM8 10.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM8 9a1 1 0 100-2 1 1 0 000 2z',
  report:   'M4 2h6l3 3v9a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1zm6 0v3h3M5.5 7.5h5M5.5 10h5M5.5 12.5h3',
  log:      'M2 4h12M2 4v8a1 1 0 001 1h10a1 1 0 001-1V4M2 8.5h12M6 4v9M10 4v9',
  settings: 'M3 4.5h4m0 0a2 2 0 004 0m0 0h2M3 8h2m0 0a2 2 0 004 0m0 0h4M3 11.5h6m0 0a2 2 0 004 0m0 0h.5',
  lab:      'M6.5 2.5h3M8 2.5v4L5 12a.75.75 0 00.7 1.5h4.6A.75.75 0 0011 12L8 6.5v-4M5.5 10h5',
  guide:    'M4 2h8a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1zM8 2v12M4 6h4M4 9h4',
}

/* ── Layout ───────────────────────────────────────────────────────────── */
export default function Layout({
  view, setView,
  currentDept, setCurrentDept,
  depts, alerts, statusTxt, lastSaved,
  children,
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768)
  const [navOrder, setNavOrder] = useState(() => {
    try { return JSON.parse(localStorage.getItem('spinqms_nav_order')) || DEFAULT_NAV.map(n => n.id) }
    catch { return DEFAULT_NAV.map(n => n.id) }
  })
  const [dragIdx, setDragIdx] = useState(null)
  const [dropIdx, setDropIdx] = useState(null)

  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth <= 768)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])

  const hasBad  = alerts.some(a => a.severity === 'bad')
  const hasWarn = alerts.some(a => a.severity === 'warn')
  const dotColor = hasBad ? 'var(--bad)' : hasWarn ? 'var(--warn)' : 'var(--ok)'
  const navigate = id => { setView(id); setMenuOpen(false) }
  const navItems = navOrder.map(id => DEFAULT_NAV.find(n => n.id === id)).filter(Boolean)
  const currentLabel = DEFAULT_NAV.find(n => n.id === view)?.label ?? 'SpinQMS'

  /* ── Drag handlers ── */
  const handleDragStart = useCallback((e, idx) => {
    setDragIdx(idx)
    e.dataTransfer.effectAllowed = 'move'
    e.currentTarget.classList.add('nav-dragging')
  }, [])
  const handleDragOver = useCallback((e, idx) => {
    e.preventDefault(); e.dataTransfer.dropEffect = 'move'
    setDropIdx(idx)
  }, [])
  const handleDragEnd = useCallback(e => {
    e.currentTarget.classList.remove('nav-dragging')
    if (dragIdx !== null && dropIdx !== null && dragIdx !== dropIdx) {
      const next = [...navOrder]
      const [moved] = next.splice(dragIdx, 1)
      next.splice(dropIdx, 0, moved)
      setNavOrder(next)
      localStorage.setItem('spinqms_nav_order', JSON.stringify(next))
    }
    setDragIdx(null); setDropIdx(null)
  }, [dragIdx, dropIdx, navOrder])

  return (
    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'var(--sidebar) 1fr', height: '100vh' }}>
      {isMobile && <div className={`mob-overlay ${menuOpen ? 'open' : ''}`} onClick={() => setMenuOpen(false)} />}

      {/* ── Sidebar ── */}
      <aside style={{
        display: 'flex', flexDirection: 'column',
        background: 'var(--sidebar-bg)',
        borderRight: '1px solid var(--bd)',
        overflowY: 'auto', overflowX: 'hidden', flexShrink: 0,
        ...(isMobile ? {
          position: 'fixed', top: 0, left: 0, bottom: 0,
          width: 'min(260px, 85vw)', zIndex: 210,
          transform: menuOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform .2s cubic-bezier(.4,0,.2,1)',
          boxShadow: menuOpen ? 'var(--shadow-md)' : 'none',
        } : {}),
      }}>
        {isMobile && (
          <button onClick={() => setMenuOpen(false)}
            style={{ position: 'absolute', top: 12, right: 10, width: 26, height: 26, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--tx-3)', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--r)' }}>
            ×
          </button>
        )}

        {/* ── Brand ── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '14px 14px 12px',
          borderBottom: '1px solid var(--bd)',
          flexShrink: 0,
        }}>
          {/* Logo mark — spinning circle */}
          <div style={{
            width: 28, height: 28,
            background: 'var(--claude)', borderRadius: 7,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round">
              <circle cx="10" cy="10" r="6.5" />
              <line x1="10" y1="3.5" x2="10" y2="6.5" />
              <line x1="10" y1="13.5" x2="10" y2="16.5" />
              <line x1="3.5" y1="10" x2="6.5" y2="10" />
              <line x1="13.5" y1="10" x2="16.5" y2="10" />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 600, letterSpacing: '-.02em', lineHeight: 1.2, color: 'var(--tx)' }}>SpinQMS</div>
            <div style={{ fontSize: 10, color: 'var(--tx-3)', marginTop: 1, letterSpacing: '.03em' }}>Ne 47 Weft · SQC</div>
          </div>
        </div>

        {/* ── Departments ── */}
        <div style={{ padding: '12px 8px 4px' }}>
          <SideLabel>Departments</SideLabel>
          {depts.map(d => {
            const active = d.id === currentDept
            const qC = d.quality === 'ok' ? 'var(--ok)' : d.quality === 'warn' ? 'var(--warn)' : d.quality === 'bad' ? 'var(--bad)' : null
            return (
              <button key={d.id}
                onClick={() => { setCurrentDept(d.id); if (isMobile) setMenuOpen(false) }}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                  padding: '5px 8px',
                  borderRadius: 'var(--r)',
                  border: 'none',
                  cursor: 'pointer', fontSize: 13,
                  fontWeight: active ? 500 : 400,
                  fontFamily: 'var(--font)',
                  color: active ? 'var(--tx)' : 'var(--tx-2)',
                  background: active ? 'var(--bg-active)' : 'transparent',
                  userSelect: 'none', transition: 'background .1s, color .1s',
                  textAlign: 'left',
                }}>
                {/* Department quality dot */}
                <span style={{
                  width: 5, height: 5, borderRadius: '50%', flexShrink: 0,
                  background: qC ?? 'var(--tx-4)',
                }} />
                <span style={{ flex: 1 }}>{d.name}</span>
              </button>
            )
          })}
        </div>

        {/* ── Divider ── */}
        <div style={{ height: 1, background: 'var(--bd)', margin: '8px 10px' }} />

        {/* ── Modules — draggable ── */}
        <div style={{ padding: '0 8px 8px', flex: 1 }}>
          <SideLabel>Modules</SideLabel>
          {navItems.map((item, idx) => {
            const active      = view === item.id
            const isDropTarget = dropIdx === idx && dragIdx !== idx
            return (
              <div key={item.id}
                draggable
                onDragStart={e => handleDragStart(e, idx)}
                onDragOver={e => handleDragOver(e, idx)}
                onDragEnd={handleDragEnd}
                onClick={() => navigate(item.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  padding: '5px 8px',
                  borderRadius: 'var(--r)',
                  cursor: 'pointer', fontSize: 13,
                  fontWeight: active ? 500 : 400,
                  color: active ? 'var(--tx)' : 'var(--tx-2)',
                  background: active ? 'var(--bg-active)' : 'transparent',
                  userSelect: 'none',
                  transition: 'background .1s, color .1s',
                  borderTop: isDropTarget ? '2px solid var(--claude)' : '2px solid transparent',
                }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--tx)' }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = active ? 'var(--tx)' : 'var(--tx-2)' }}
              >
                {/* Drag handle */}
                <div className="drag-handle" style={{ flexShrink: 0 }}>
                  <span><i /><i /></span><span><i /><i /></span><span><i /><i /></span>
                </div>
                {/* Icon */}
                <span style={{ width: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <NavIcon d={ICONS[item.id]} active={active} />
                </span>
                <span style={{ flex: 1 }}>{item.label}</span>
                {item.id === 'lab' && (
                  <span style={{
                    fontSize: 9, fontWeight: 600, letterSpacing: '.04em',
                    padding: '1px 5px', borderRadius: 3,
                    background: 'var(--claude-bg)', color: 'var(--claude)',
                    border: '1px solid var(--claude-bd)',
                    lineHeight: 1.6,
                  }}>NEW</span>
                )}
              </div>
            )
          })}
        </div>

        {/* ── Footer ── */}
        <div style={{
          padding: '10px 14px 12px',
          borderTop: '1px solid var(--bd)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11.5 }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
              background: dotColor,
              boxShadow: `0 0 0 2px color-mix(in srgb, ${dotColor} 20%, transparent)`,
              animation: 'pulse 2.5s ease-in-out infinite',
            }} />
            <span style={{ color: 'var(--tx-2)', fontWeight: 500 }}>{statusTxt}</span>
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--tx-4)', marginTop: 3, fontFamily: 'var(--mono)' }}>{lastSaved}</div>
        </div>
      </aside>

      {/* ── Main area ── */}
      <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-2)' }}>

        {/* ── Header ── */}
        <header style={{
          height: 'var(--hdr)',
          display: 'flex', alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 20px',
          background: 'var(--bg)',
          borderBottom: '1px solid var(--bd)',
          flexShrink: 0,
          gap: 12,
          ...(isMobile ? { padding: '0 12px', position: 'sticky', top: 0, zIndex: 100 } : {}),
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {isMobile && (
              <button onClick={() => setMenuOpen(true)}
                style={{
                  width: 32, height: 32, border: 'none', background: 'transparent',
                  cursor: 'pointer', color: 'var(--tx-2)', fontSize: 18,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: 'var(--r)', flexShrink: 0,
                }}>☰</button>
            )}
            {/* Breadcrumb-style label */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, color: 'var(--tx-3)' }}>SpinQMS</span>
              <span style={{ fontSize: 11, color: 'var(--tx-4)' }}>/</span>
              <span style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--tx)', letterSpacing: '-.01em' }}>
                {currentLabel}
              </span>
            </div>
          </div>

          {!isMobile && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <HeaderBtn onClick={() => window.open('/api/export/csv', '_blank')}>
                <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 2v8M5 7l3 3 3-3M2.5 11v1a1 1 0 001 1h9a1 1 0 001-1v-1" />
                </svg>
                Export CSV
              </HeaderBtn>
              <HeaderBtn onClick={() => window.print()}>
                <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 5V2h8v3M3 11H2a1 1 0 01-1-1V7a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-1 1h-1M4 9h8v5H4V9z" />
                </svg>
                Print
              </HeaderBtn>
            </div>
          )}
        </header>

        {/* ── Page content ── */}
        <div id="main-scroll-container" style={{
          flex: 1, overflowY: 'auto',
          padding: '20px 24px',
          display: 'flex', flexDirection: 'column', gap: 14,
          ...(isMobile ? { padding: '14px 12px calc(68px + env(safe-area-inset-bottom,0px)) 12px' } : {}),
        }}>
          {children}
        </div>
      </div>

      {/* ── Mobile bottom nav ── */}
      {isMobile && (
        <nav style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          height: 'calc(56px + env(safe-area-inset-bottom,0px))',
          paddingBottom: 'env(safe-area-inset-bottom,0px)',
          zIndex: 150, background: 'var(--bg)',
          borderTop: '1px solid var(--bd)',
          display: 'flex',
        }}>
          {BOTTOM_NAV.map(id => {
            const item   = DEFAULT_NAV.find(n => n.id === id)
            const active = view === id
            return (
              <button key={id} onClick={() => navigate(id)}
                style={{
                  flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
                  justifyContent: 'center', gap: 3, border: 'none', background: 'transparent',
                  color: active ? 'var(--claude)' : 'var(--tx-3)',
                  fontSize: 10, fontWeight: active ? 500 : 400,
                  fontFamily: 'var(--font)', cursor: 'pointer', transition: 'color .12s',
                }}>
                <NavIcon d={ICONS[id]} size={17} active={active} />
                {item.label.split(' ')[0]}
              </button>
            )
          })}
          <button onClick={() => setMenuOpen(true)}
            style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', gap: 3, border: 'none', background: 'transparent',
              color: 'var(--tx-3)', fontSize: 10, fontFamily: 'var(--font)', cursor: 'pointer',
            }}>
            <svg viewBox="0 0 16 16" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <circle cx="4" cy="8" r="1"/><circle cx="8" cy="8" r="1"/><circle cx="12" cy="8" r="1"/>
            </svg>
            More
          </button>
        </nav>
      )}
    </div>
  )
}

/* ── Clean geometric nav icon ──────────────────────────────────────────── */
function NavIcon({ d, size = 15, active }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} fill="none"
      stroke={active ? 'var(--claude)' : 'currentColor'}
      strokeWidth="1.4"
      strokeLinecap="round" strokeLinejoin="round"
      style={{ opacity: active ? 1 : .65, flexShrink: 0 }}>
      <path d={d} />
    </svg>
  )
}

/* ── Header action button ──────────────────────────────────────────────── */
function HeaderBtn({ children, onClick }) {
  return (
    <button onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '4px 10px', fontSize: 12, fontWeight: 400,
        border: '1px solid var(--bd-md)', borderRadius: 'var(--r)',
        background: 'var(--bg)', color: 'var(--tx-2)',
        cursor: 'pointer', fontFamily: 'var(--font)',
        transition: 'all .1s',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = 'var(--bg-hover)'
        e.currentTarget.style.borderColor = 'var(--bd-hv)'
        e.currentTarget.style.color = 'var(--tx)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = 'var(--bg)'
        e.currentTarget.style.borderColor = 'var(--bd-md)'
        e.currentTarget.style.color = 'var(--tx-2)'
      }}>
      {children}
    </button>
  )
}

/* ── Section label ─────────────────────────────────────────────────────── */
function SideLabel({ children }) {
  return (
    <div style={{
      fontSize: 10.5, fontWeight: 500,
      letterSpacing: '.07em', textTransform: 'uppercase',
      color: 'var(--tx-4)',
      padding: '2px 8px 6px',
    }}>
      {children}
    </div>
  )
}
