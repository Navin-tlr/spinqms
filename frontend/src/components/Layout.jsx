import { useState, useEffect, useCallback } from 'react'

/* ──────────────────────────────────────────────────────────────────────────
   Layout — SAP Fiori shell with collapsible side navigation
   Shell bar:  muted structural navy (#1e2e4a), not the full brand colour
   Sidebar:    compact by default (48 px), expands to 220 px on demand
   Branding:   "SVS" appears exactly once — top-left of shell bar
────────────────────────────────────────────────────────────────────────── */

/* ── SVS Yarn-ball logo — faithful recreation of the brand mark ──────────
   Diagonal-stripe sphere referencing yarn wound on a bobbin.
   size: rendered px square (default 22)
   light: render in white (for dark shell bar) vs. dark (#1e2e4a)         */
function YarnLogo({ size = 22, light = true }) {
  const r  = size / 2
  const cx = r, cy = r
  const fill   = light ? 'rgba(255,255,255,0.92)' : '#1e2e4a'
  const stripe = light ? 'rgba(30,46,74,0.55)'    : 'rgba(255,255,255,0.55)'
  /* Generate ~11 diagonal stripes clipped to the circle */
  const lines = []
  const step  = size * 0.092
  for (let i = -4; i <= 7; i++) {
    const x0 = i * step
    lines.push(
      <line
        key={i}
        x1={x0}           y1={size + 4}
        x2={x0 + size}    y2={-4}
        stroke={stripe}
        strokeWidth={size * 0.066}
        strokeLinecap="round"
      />
    )
  }
  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width={size} height={size}
      style={{ display: 'block', flexShrink: 0 }}
    >
      <defs>
        <clipPath id={`svs-yarn-clip-${size}`}>
          <circle cx={cx} cy={cy} r={r - 0.5} />
        </clipPath>
      </defs>
      {/* Filled sphere base */}
      <circle cx={cx} cy={cy} r={r - 0.5} fill={fill} />
      {/* Diagonal stripe winding — clipped to sphere */}
      <g clipPath={`url(#svs-yarn-clip-${size})`}>
        {lines}
      </g>
    </svg>
  )
}

/* ── shell bar background — muted dark navy, structurally anchoring ─────── */
const SHELL = '#1e2e4a'

/* ── Navigation manifest ─────────────────────────────────────────────────── */
const DEFAULT_NAV = [
  { id: 'overview', label: 'Overview',         abbr: 'OV' },
  { id: 'entry',    label: 'Data Entry',        abbr: 'DE' },
  { id: 'charts',   label: 'Control Charts',    abbr: 'CC' },
  { id: 'uster',    label: 'Uster Benchmarks',  abbr: 'UB' },
  { id: 'report',   label: 'Shift Report',      abbr: 'SR' },
  { id: 'log',      label: 'Data Log',          abbr: 'DL' },
  { id: 'lab',      label: 'YarnLAB',           abbr: 'YL' },
  { id: 'settings', label: 'Settings',          abbr: 'ST' },
  { id: 'guide',    label: 'Operator Guide',    abbr: 'OG' },
]
const BOTTOM_NAV = ['overview', 'entry', 'charts', 'report']

/* ── SVG icon paths (16×16 viewBox) ─────────────────────────────────────── */
const ICONS = {
  overview: 'M2 2h5.5v5.5H2V2zM8.5 2H14v5.5H8.5V2zM2 8.5h5.5V14H2V8.5zM8.5 8.5H14V14H8.5V8.5z',
  entry:    'M3 13h2.6L13 5.6 10.4 3 3 10.4V13zm8.8-9.5L13.5 5.2a.6.6 0 000 .9L12 7.5',
  charts:   'M2.5 2v11.5H14M4.5 11 7 7.5l2.5 2L13 4',
  uster:    'M8 13.5A5.5 5.5 0 108 2.5a5.5 5.5 0 000 11zM8 10.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM8 9a1 1 0 100-2 1 1 0 000 2z',
  report:   'M4 2h6l3 3v9a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1zm6 0v3h3M5.5 7.5h5M5.5 10h5M5.5 12.5h3',
  log:      'M2 4h12M2 4v8a1 1 0 001 1h10a1 1 0 001-1V4M2 8.5h12M6 4v9M10 4v9',
  settings: 'M3 4.5h4m0 0a2 2 0 004 0m0 0h2M3 8h2m0 0a2 2 0 004 0m0 0h4M3 11.5h6m0 0a2 2 0 004 0m0 0h.5',
  lab:      'M6.5 2.5h3M8 2.5v4L5 12a.75.75 0 00.7 1.5h4.6A.75.75 0 0011 12L8 6.5v-4M5.5 10h5',
  guide:    'M4 2h8a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1zM8 2v12M4 6h4M4 9h4',
}

/* ── Operations module navigation ───────────────────────────────────────── */
const OPERATIONS_NAV = [
  {
    label: 'Inventory / MRP',
    items: [
      { id: 'inventory-stock',        label: 'Stock Overview',       abbr: 'SO', icon: 'M2 2h5.5v5.5H2V2zM8.5 2H14v5.5H8.5V2zM2 8.5h5.5V14H2V8.5zM8.5 8.5H14V14H8.5V8.5z' },
      { id: 'inventory-receipt',      label: 'Material Receipt',     abbr: 'GR', icon: 'M3 3h10v3H3V3zm0 5h10v5H3V8zm7.5-1.5v5m-2.5-2.5h5' },
      { id: 'inventory-issue',        label: 'Material Issue',       abbr: 'GI', icon: 'M3 3h10v3H3V3zm0 5h10v5H3V8zm2-3.5h6M5 10.5h3' },
      { id: 'inventory-movements',    label: 'Material Movements',   abbr: 'LG', icon: 'M2 4h12M2 4v8a1 1 0 001 1h10a1 1 0 001-1V4M2 8.5h12M6 4v9M10 4v9' },
      { id: 'inventory-planning',     label: 'Planning (MRP)',       abbr: 'MR', icon: 'M2.5 2v11.5H14M4.5 11 7 7.5l2.5 2L13 4' },
      { id: 'inventory-admin-reset',  label: 'Data Reset',           abbr: '⚠', icon: 'M2 7.5A5.5 5.5 0 0112.5 5M14 2v4h-4M14 8.5A5.5 5.5 0 013.5 11M2 14v-4h4' },
    ],
  },
  {
    label: 'Production',
    items: [
      { id: 'production-entry', label: 'Enter Output',   abbr: 'EO', icon: 'M3 13h2.6L13 5.6 10.4 3 3 10.4V13zm8.8-9.5L13.5 5.2a.6.6 0 000 .9L12 7.5' },
      { id: 'production-log',   label: 'Production Log', abbr: 'PL', icon: 'M2 4h12M2 4v8a1 1 0 001 1h10a1 1 0 001-1V4M2 8.5h12M6 4v9M10 4v9' },
    ],
  },
  {
    label: 'Purchasing',
    items: [
      { id: 'purchase-requisitions', label: 'Requisitions', abbr: 'PR', icon: 'M4 2h6l3 3v9a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1zm6 0v3h3M5.5 7.5h5M5.5 10h5M5.5 12.5h3' },
      { id: 'purchase-orders',       label: 'Orders',       abbr: 'PO', icon: 'M3 3h10v10H3V3zm2 3h6M5 8h6M5 10h3' },
    ],
  },
]
const OPERATIONS_NAV_ITEMS = OPERATIONS_NAV.flatMap(group => group.items)

/* ── Master Data module navigation ──────────────────────────────────────── */
const MASTERDATA_NAV = [
  { id: 'masterdata-bp',        label: 'Business Partners', abbr: 'BP', icon: 'M9 2a2 2 0 100 4 2 2 0 000-4zM5 8a4 4 0 018 0v1H5V8zM2 13h12M2 11h12' },
  { id: 'masterdata-materials', label: 'Material Master',   abbr: 'MM', icon: 'M2 3h12v2H2V3zm0 4h12v2H2V7zm0 4h8v2H2v-2z' },
]

/* ── Dept abbreviation (2 chars) ─────────────────────────────────────────── */
function deptAbbr(name = '') {
  const words = name.trim().split(/\s+/)
  return words.length >= 2
    ? (words[0][0] + words[1][0]).toUpperCase()
    : name.substring(0, 2).toUpperCase()
}

/* ══════════════════════════════════════════════════════════════════════════ */
export default function Layout({
  view, setView,
  currentDept, setCurrentDept,
  depts, alerts, statusTxt, lastSaved,
  currentModule, setCurrentModule,
  productionView, setProductionView,
  masterdataView, setMasterdataView,
  children,
}) {
  const goHome = () => setCurrentModule && setCurrentModule(null)

  /* ── Sidebar collapse state — compact (true) by default ── */
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('svs_sidebar_collapsed') !== 'false' }
    catch { return true }
  })
  const toggleCollapse = () => {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem('svs_sidebar_collapsed', String(next))
  }

  /* ── Mobile state ── */
  const [menuOpen, setMenuOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768)
  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth <= 768)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])

  /* ── Drag-to-reorder quality nav ── */
  const [navOrder, setNavOrder] = useState(() => {
    try { return JSON.parse(localStorage.getItem('spinqms_nav_order')) || DEFAULT_NAV.map(n => n.id) }
    catch { return DEFAULT_NAV.map(n => n.id) }
  })
  const [dragIdx, setDragIdx] = useState(null)
  const [dropIdx, setDropIdx] = useState(null)

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

  /* ── Status dot ── */
  const hasBad  = alerts.some(a => a.severity === 'bad')
  const hasWarn = alerts.some(a => a.severity === 'warn')
  const dotColor = hasBad ? 'var(--bad)' : hasWarn ? 'var(--warn)' : 'var(--ok)'

  const navigate = id => { setView(id); setMenuOpen(false) }
  const navItems = navOrder.map(id => DEFAULT_NAV.find(n => n.id === id)).filter(Boolean)
  const currentLabel = DEFAULT_NAV.find(n => n.id === view)?.label ?? ''

  /* ── Sidebar width ── */
  const sideW = isMobile ? 0 : (collapsed ? 48 : 220)

  /* ── Grid columns string ── */
  const gridCols = isMobile ? '1fr' : `${sideW}px 1fr`

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: gridCols,
      height: '100vh',
      transition: isMobile ? 'none' : 'grid-template-columns .18s ease',
    }}>
      {isMobile && (
        <div
          className={`mob-overlay ${menuOpen ? 'open' : ''}`}
          onClick={() => setMenuOpen(false)}
        />
      )}

      {/* ════════════════════════════════════════════════════
          SIDEBAR
      ════════════════════════════════════════════════════ */}
      <aside style={{
        display: 'flex',
        flexDirection: 'column',
        width: isMobile ? 'min(260px, 85vw)' : sideW,
        background: 'var(--sidebar-bg)',
        borderRight: '1px solid var(--bd)',
        overflowY: 'auto',
        overflowX: 'hidden',
        flexShrink: 0,
        transition: 'width .18s ease',
        ...(isMobile ? {
          position: 'fixed', top: 0, left: 0, bottom: 0,
          zIndex: 210,
          transform: menuOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform .2s cubic-bezier(.4,0,.2,1)',
          boxShadow: menuOpen ? 'var(--shadow-md)' : 'none',
          width: 'min(260px, 85vw)',
        } : {}),
      }}>

        {/* ── Sidebar collapse toggle ─────────────────────────────────── */}
        <div style={{
          height: 44,
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed && !isMobile ? 'center' : 'flex-end',
          padding: collapsed && !isMobile ? 0 : '0 8px',
          borderBottom: '1px solid var(--bd)',
          flexShrink: 0,
        }}>
          {isMobile ? (
            /* Mobile: close button */
            <button
              onClick={() => setMenuOpen(false)}
              title="Close menu"
              style={btnReset}
            >
              <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="var(--tx-3)" strokeWidth="1.5" strokeLinecap="round">
                <path d="M3 3l10 10M13 3L3 13" />
              </svg>
            </button>
          ) : (
            /* Desktop: collapse/expand toggle */
            <button
              onClick={toggleCollapse}
              title={collapsed ? 'Expand navigation' : 'Collapse navigation'}
              style={btnReset}
            >
              <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="var(--tx-3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                {collapsed
                  ? <path d="M3 4h10M3 8h10M3 12h10" />          /* hamburger = expand */
                  : <path d="M3 4h10M3 8h7M3 12h10" />}           /* partial = collapse  */
              </svg>
            </button>
          )}
        </div>

        {/* ── Operations nav ─────────────────────────────────────────── */}
        {currentModule === 'production' && (
          <div style={{ padding: collapsed && !isMobile ? '8px 0' : '8px 6px', flex: 1 }}>
            {OPERATIONS_NAV.map(group => (
              <div key={group.label} style={{ marginBottom: (!collapsed || isMobile) ? 10 : 4 }}>
                {(!collapsed || isMobile) && <SideLabel>{group.label}</SideLabel>}
                {group.items.map(item => {
                  const active = productionView === item.id
                  return (
                    <SideItem
                      key={item.id}
                      active={active}
                      collapsed={collapsed && !isMobile}
                      title={`${group.label} · ${item.label}`}
                      onClick={() => { setProductionView && setProductionView(item.id); if (isMobile) setMenuOpen(false) }}
                    >
                      <NavIcon d={item.icon} active={active} />
                      {(!collapsed || isMobile) && <span style={{ fontSize: 12 }}>{item.label}</span>}
                      {(collapsed && !isMobile) && (
                        <span style={{ fontSize: 9, fontWeight: 600, color: active ? 'var(--claude)' : 'var(--tx-3)', letterSpacing: '.03em' }}>
                          {item.abbr}
                        </span>
                      )}
                    </SideItem>
                  )
                })}
              </div>
            ))}
          </div>
        )}

        {/* ── Master Data nav ────────────────────────────────────────── */}
        {currentModule === 'masterdata' && (
          <div style={{ padding: collapsed && !isMobile ? '8px 0' : '8px 6px', flex: 1 }}>
            {(!collapsed || isMobile) && <SideLabel>Master Data</SideLabel>}
            {MASTERDATA_NAV.map(item => {
              const active = masterdataView === item.id
              return (
                <SideItem
                  key={item.id}
                  active={active}
                  collapsed={collapsed && !isMobile}
                  title={item.label}
                  onClick={() => { setMasterdataView && setMasterdataView(item.id); if (isMobile) setMenuOpen(false) }}
                >
                  <NavIcon d={item.icon} active={active} />
                  {(!collapsed || isMobile) && <span style={{ fontSize: 12 }}>{item.label}</span>}
                  {(collapsed && !isMobile) && (
                    <span style={{ fontSize: 9, fontWeight: 600, color: active ? 'var(--claude)' : 'var(--tx-3)', letterSpacing: '.03em' }}>
                      {item.abbr}
                    </span>
                  )}
                </SideItem>
              )
            })}
          </div>
        )}

        {/* ── Quality nav ────────────────────────────────────────────── */}
        {currentModule !== 'production' && currentModule !== 'masterdata' && (
          <>
            {/* Departments */}
            <div style={{ padding: collapsed && !isMobile ? '8px 0' : '8px 6px 4px' }}>
              {(!collapsed || isMobile) && <SideLabel>Departments</SideLabel>}
              {depts.map(d => {
                const active = d.id === currentDept
                const abbr   = deptAbbr(d.name)
                return (
                  <SideItem
                    key={d.id}
                    active={active}
                    collapsed={collapsed && !isMobile}
                    title={d.name}
                    onClick={() => { setCurrentDept(d.id); if (isMobile) setMenuOpen(false) }}
                    isButton
                  >
                    {(collapsed && !isMobile) ? (
                      <span style={{
                        fontSize: 10, fontWeight: active ? 600 : 500,
                        color: active ? 'var(--claude)' : 'var(--tx-2)',
                        letterSpacing: '.03em',
                      }}>{abbr}</span>
                    ) : (
                      <span style={{ fontSize: 12, flex: 1 }}>{d.name}</span>
                    )}
                  </SideItem>
                )
              })}
            </div>

            {/* Divider */}
            {(!collapsed || isMobile) && (
              <div style={{ height: 1, background: 'var(--bd)', margin: '4px 10px' }} />
            )}

            {/* Modules */}
            <div style={{ padding: collapsed && !isMobile ? '4px 0' : '0 6px 8px', flex: 1 }}>
              {(!collapsed || isMobile) && <SideLabel>Modules</SideLabel>}
              {navItems.map((item, idx) => {
                const active       = view === item.id
                const isDropTarget = dropIdx === idx && dragIdx !== idx
                return (
                  <div
                    key={item.id}
                    draggable
                    onDragStart={e => handleDragStart(e, idx)}
                    onDragOver={e => handleDragOver(e, idx)}
                    onDragEnd={handleDragEnd}
                    onClick={() => navigate(item.id)}
                    title={item.label}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: collapsed && !isMobile ? 'center' : 'flex-start',
                      gap: 7,
                      padding: collapsed && !isMobile ? '9px 0' : '7px 8px 7px 10px',
                      borderLeft: active
                        ? '3px solid var(--claude)'
                        : isDropTarget
                          ? '3px solid var(--claude)'
                          : '3px solid transparent',
                      cursor: 'pointer',
                      color: active ? 'var(--claude)' : 'var(--tx-2)',
                      background: active ? 'var(--bg-active)' : 'transparent',
                      userSelect: 'none',
                      transition: 'background .1s, color .1s',
                    }}
                    onMouseEnter={e => { if (!active) { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--tx)' } }}
                    onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--tx-2)' } }}
                  >
                    {/* Drag handle — only in expanded mode */}
                    {(!collapsed || isMobile) && (
                      <div className="drag-handle" style={{ flexShrink: 0 }}>
                        <span><i /><i /></span><span><i /><i /></span><span><i /><i /></span>
                      </div>
                    )}

                    {/* Icon */}
                    <span style={{ width: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <NavIcon d={ICONS[item.id]} active={active} />
                    </span>

                    {/* Label — hidden when collapsed */}
                    {(!collapsed || isMobile) && (
                      <>
                        <span style={{ flex: 1, fontSize: 12, fontWeight: active ? 500 : 400 }}>{item.label}</span>
                        {item.id === 'lab' && (
                          <span style={{
                            fontSize: 9, fontWeight: 600, letterSpacing: '.04em',
                            padding: '1px 5px',
                            background: 'var(--claude-bg)', color: 'var(--claude)',
                            border: '1px solid var(--claude-bd)',
                            lineHeight: 1.6,
                          }}>NEW</span>
                        )}
                      </>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Footer — status ── */}
            <div style={{
              padding: collapsed && !isMobile ? '10px 0' : '10px 14px 14px',
              borderTop: '1px solid var(--bd)',
              flexShrink: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: collapsed && !isMobile ? 'center' : 'flex-start',
              gap: 3,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{
                  width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                  background: dotColor,
                  boxShadow: `0 0 0 3px color-mix(in srgb, ${dotColor} 18%, transparent)`,
                  animation: 'pulse 2.5s ease-in-out infinite',
                }} />
                {(!collapsed || isMobile) && (
                  <span style={{ fontSize: 11, color: 'var(--tx-2)' }}>{statusTxt}</span>
                )}
              </div>
              {(!collapsed || isMobile) && (
                <div style={{ fontSize: 10, color: 'var(--tx-4)', fontVariantNumeric: 'tabular-nums', letterSpacing: '.01em' }}>
                  {lastSaved}
                </div>
              )}
            </div>
          </>
        )}
      </aside>

      {/* ════════════════════════════════════════════════════
          MAIN AREA
      ════════════════════════════════════════════════════ */}
      <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-2)' }}>

        {/* ── Shell Bar ─────────────────────────────────────────────── */}
        <div style={{
          height: 44,
          background: SHELL,
          display: 'flex',
          alignItems: 'center',
          padding: '0 0 0 12px',
          flexShrink: 0,
          gap: 0,
        }}>
          {/* Mobile: hamburger to open sidebar */}
          {isMobile && (
            <button
              onClick={() => setMenuOpen(true)}
              style={{ ...shellBtn, marginRight: 6 }}
              title="Open navigation"
            >
              <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="rgba(255,255,255,.7)" strokeWidth="1.5" strokeLinecap="round">
                <path d="M2 4h12M2 8h12M2 12h12" />
              </svg>
            </button>
          )}

          {/* Brand — SVS (appears exactly once, top-left) */}
          <button
            onClick={goHome}
            title="Application Launchpad"
            style={{
              display: 'flex', alignItems: 'center', gap: 9,
              height: 44, padding: '0 14px 0 2px',
              background: 'transparent', border: 'none', cursor: 'pointer',
              borderRight: '1px solid rgba(255,255,255,.10)',
              marginRight: 2,
            }}
          >
            {/* SVS yarn-ball brand mark */}
            <YarnLogo size={22} light={true} />
            <span style={{
              fontSize: 12, fontWeight: 600, color: '#fff',
              letterSpacing: '.08em', textTransform: 'uppercase',
            }}>SVS</span>
          </button>

          {/* Module context label */}
          <span style={{
            fontSize: 11, color: 'rgba(255,255,255,.38)',
            padding: '0 14px',
            borderRight: '1px solid rgba(255,255,255,.08)',
            whiteSpace: 'nowrap',
          }}>
            {currentModule === 'quality'
              ? 'Quality Management'
              : currentModule === 'masterdata'
                ? 'Master Data'
                : 'Production & Inventory'}
          </span>

          {/* Module switcher tabs */}
          {[
            { id: 'quality',     label: 'Quality'     },
            { id: 'production',  label: 'Production'  },
            { id: 'masterdata',  label: 'Master Data' },
          ].map(mod => {
            const active = currentModule === mod.id
            return (
              <button
                key={mod.id}
                onClick={() => setCurrentModule && setCurrentModule(mod.id)}
                style={{
                  height: 44, padding: '0 15px',
                  fontSize: 12, fontWeight: active ? 500 : 400,
                  border: 'none',
                  borderBottom: active ? '2px solid rgba(255,255,255,.8)' : '2px solid transparent',
                  background: active ? 'rgba(255,255,255,.07)' : 'transparent',
                  color: active ? '#fff' : 'rgba(255,255,255,.48)',
                  cursor: 'pointer',
                  fontFamily: 'var(--font)',
                  transition: 'all .15s',
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={e => { if (!active) { e.currentTarget.style.color = 'rgba(255,255,255,.78)'; e.currentTarget.style.background = 'rgba(255,255,255,.04)' }}}
                onMouseLeave={e => { if (!active) { e.currentTarget.style.color = 'rgba(255,255,255,.48)'; e.currentTarget.style.background = 'transparent' }}}
              >
                {mod.label}
              </button>
            )
          })}

          {/* Right actions */}
          <div style={{ marginLeft: 'auto', marginRight: 10, display: 'flex', alignItems: 'center', gap: 4 }}>
            {!isMobile && currentModule === 'quality' && (
              <>
                <ShellActionBtn onClick={() => window.open('/api/export/csv', '_blank')} title="Export CSV">
                  <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8 2v8M5 7l3 3 3-3M2.5 11v1a1 1 0 001 1h9a1 1 0 001-1v-1" />
                  </svg>
                  <span>Export</span>
                </ShellActionBtn>
                <ShellActionBtn onClick={() => window.print()} title="Print">
                  <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 5V2h8v3M3 11H2a1 1 0 01-1-1V7a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-1 1h-1M4 9h8v5H4V9z" />
                  </svg>
                  <span>Print</span>
                </ShellActionBtn>
              </>
            )}
            {/* User icon — no text, no branding repetition */}
            <div style={{
              width: 28, height: 28,
              background: 'rgba(255,255,255,.1)',
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

        {/* ── Page header — breadcrumb + context ────────────────────── */}
        <header style={{
          height: 'var(--hdr)',
          display: 'flex', alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 20px',
          background: 'var(--bg)',
          borderBottom: '1px solid var(--bd)',
          flexShrink: 0,
          gap: 12,
        }}>
          <nav style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <button
              onClick={goHome}
              style={{
                background: 'none', border: 'none', padding: '2px 4px',
                fontSize: 11, color: 'var(--tx-3)', cursor: 'pointer',
                fontFamily: 'var(--font)', display: 'flex', alignItems: 'center', gap: 4,
              }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--claude)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--tx-3)'}
            >
              <svg viewBox="0 0 14 14" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 7L7 2l5 5M3.5 5.5V12h3V8.5h1V12h3V5.5" />
              </svg>
              Home
            </button>
            <Crumb />
            <span style={{ fontSize: 11, color: 'var(--tx-3)' }}>
              {currentModule === 'production' ? 'Operations' : currentModule === 'masterdata' ? 'Master Data' : 'Quality'}
            </span>
            <Crumb />
            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--tx)' }}>
              {currentModule === 'production'
                ? (OPERATIONS_NAV_ITEMS.find(n => n.id === productionView)?.label ?? 'Operations')
                : currentModule === 'masterdata'
                  ? (MASTERDATA_NAV.find(n => n.id === masterdataView)?.label ?? 'Master Data')
                  : currentLabel}
            </span>
          </nav>
        </header>

        {/* ── Scrollable content area ────────────────────────────────── */}
        <div
          id="main-scroll-container"
          style={{
            flex: 1, overflowY: 'auto',
            padding: isMobile
              ? '14px 12px calc(68px + env(safe-area-inset-bottom,0px)) 12px'
              : '20px 24px',
            display: 'flex', flexDirection: 'column', gap: 14,
          }}
        >
          {children}
        </div>
      </div>

      {/* ── Mobile bottom nav ────────────────────────────────────────── */}
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

/* ── Sub-components ──────────────────────────────────────────────────────── */

function NavIcon({ d, size = 15, active }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} fill="none"
      stroke={active ? 'var(--claude)' : 'currentColor'}
      strokeWidth="1.4"
      strokeLinecap="round" strokeLinejoin="round"
      style={{ opacity: active ? 1 : .6, flexShrink: 0 }}>
      <path d={d} />
    </svg>
  )
}

/* Generic sidebar item — handles both collapsed and expanded layouts */
function SideItem({ active, collapsed, title, onClick, children, isButton }) {
  const Tag = isButton ? 'button' : 'div'
  return (
    <Tag
      onClick={onClick}
      title={collapsed ? title : undefined}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'flex-start',
        gap: collapsed ? 0 : 7,
        padding: collapsed ? '9px 0' : '7px 8px 7px 10px',
        borderLeft: active ? '3px solid var(--claude)' : '3px solid transparent',
        border: isButton ? 'none' : undefined,
        cursor: 'pointer',
        fontFamily: 'var(--font)',
        fontWeight: active ? 500 : 400,
        color: active ? 'var(--claude)' : 'var(--tx-2)',
        background: active ? 'var(--bg-active)' : 'transparent',
        userSelect: 'none',
        transition: 'background .1s, color .1s',
        textAlign: 'left',
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--bg-hover)' }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
    >
      {children}
    </Tag>
  )
}

/* Breadcrumb separator */
function Crumb() {
  return <span style={{ fontSize: 10, color: 'var(--tx-4)', lineHeight: 1 }}>›</span>
}

/* Sidebar section label */
function SideLabel({ children }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 600,
      letterSpacing: '.09em', textTransform: 'uppercase',
      color: 'var(--tx-4)',
      padding: '4px 10px 5px',
    }}>
      {children}
    </div>
  )
}

/* Shell bar ghost action button */
function ShellActionBtn({ children, onClick, title }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        height: 28, padding: '0 10px',
        fontSize: 11, fontWeight: 400,
        border: '1px solid rgba(255,255,255,.16)',
        background: 'transparent',
        color: 'rgba(255,255,255,.65)',
        cursor: 'pointer',
        fontFamily: 'var(--font)',
        letterSpacing: '.01em',
        transition: 'all .12s',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,.08)'; e.currentTarget.style.color = '#fff' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,.65)' }}
    >
      {children}
    </button>
  )
}

/* Shared reset style for icon-only buttons */
const btnReset = {
  width: 32, height: 32,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  border: 'none', background: 'transparent', cursor: 'pointer',
  borderRadius: 2,
  flexShrink: 0,
}
