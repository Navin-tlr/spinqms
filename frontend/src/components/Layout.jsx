import { useState, useEffect, useRef, useCallback } from 'react'

/* ──────────────────────────────────────────────────────────────────────────
   Navigation manifest — default order, user can drag-reorder modules.
   Icons use thin-stroke hand-drawn-feel SVG paths (slightly imperfect
   curves, organic line quality — Anthropic aesthetic).
────────────────────────────────────────────────────────────────────────── */
const DEFAULT_NAV = [
  { id:'overview', label:'Overview'        },
  { id:'entry',    label:'Data Entry'      },
  { id:'charts',   label:'Control Charts'  },
  { id:'uster',    label:'Uster Benchmarks'},
  { id:'report',   label:'Shift Report'    },
  { id:'log',      label:'Data Log'        },
  { id:'lab',      label:'YarnLAB'         },
  { id:'settings', label:'Settings'        },
  { id:'guide',    label:'Operator Guide'  },
]
const BOTTOM_NAV = ['overview','entry','charts','report']

const ICONS = {
  overview: 'M3 12.5c1-2.2 2.5-4 4-3.5s2 2 3-1c1.2-3.5 2.5-4 4-3M2.5 14h11',
  entry:    'M4 3.5h8M4 6.5h5M4 9.5h3.5M11 9l2 2-3 .5.5-3z',
  charts:   'M2.5 13.5l3-5 2.5 2 3-5 3 2M2.5 2.5v11.5h11.5',
  uster:    'M8 14c-3.5 0-6-2.5-6-6s2.5-6 6-6 6 2.5 6 6-2.5 6-6 6M8 5v3.5l2.5 1',
  report:   'M4.5 2h7l2 2v9.5c0 .5-.5 1-1 1H3.5c-.5 0-1-.5-1-1V3c0-.5.5-1 1-1zM5.5 7h5M5.5 9.5h3.5',
  log:      'M2.5 4.5h11M2.5 8h11M2.5 11.5h7',
  settings: 'M8 5.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5zM8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.5 3.5l1.5 1.5M11 11l1.5 1.5M3.5 12.5l1.5-1.5M11 5l1.5-1.5',
  lab:      'M3 13.5h10M4.5 13.5V9a1 1 0 011-1h5a1 1 0 011 1v4.5M6 8V5.5h4V8M8 2.5v2M6 2.5h4',
  guide:    'M8 2.5c-2.2 0-4 1.8-4 4 0 2.5 4 7.5 4 7.5s4-5 4-7.5c0-2.2-1.8-4-4-4zM8 5v2.5M8 9v.5',
}

/* ── Layout ───────────────────────────────────────────────────────────── */
export default function Layout({
  view, setView,
  currentDept, setCurrentDept,
  depts, alerts, statusTxt, lastSaved,
  children,
}) {
  const [menuOpen,  setMenuOpen]  = useState(false)
  const [isMobile,  setIsMobile]  = useState(window.innerWidth <= 768)
  const [navOrder,  setNavOrder]  = useState(() => {
    try { return JSON.parse(localStorage.getItem('spinqms_nav_order')) || DEFAULT_NAV.map(n => n.id) }
    catch { return DEFAULT_NAV.map(n => n.id) }
  })
  const [dragIdx,   setDragIdx]   = useState(null)
  const [dropIdx,   setDropIdx]   = useState(null)

  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth <= 768)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])

  const hasBad   = alerts.some(a => a.severity === 'bad')
  const hasWarn  = alerts.some(a => a.severity === 'warn')
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
    <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : 'var(--sidebar) 1fr', height:'100vh' }}>
      {isMobile && <div className={`mob-overlay ${menuOpen ? 'open' : ''}`} onClick={() => setMenuOpen(false)} />}

      {/* ── Sidebar ── */}
      <aside style={{
        display:'flex', flexDirection:'column',
        borderRight:'1px solid var(--bd)', background:'var(--bg-2)',
        overflowY:'auto', overflowX:'hidden', flexShrink:0,
        ...(isMobile ? {
          position:'fixed', top:0, left:0, bottom:0,
          width:'min(280px, 85vw)', zIndex:210,
          transform: menuOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition:'transform .22s cubic-bezier(.4,0,.2,1)',
          boxShadow: menuOpen ? 'var(--shadow-md)' : 'none',
        } : {}),
      }}>
        {isMobile && (
          <button onClick={() => setMenuOpen(false)}
            style={{ position:'absolute', top:12, right:12, width:28, height:28, border:'none', background:'transparent', cursor:'pointer', color:'var(--tx-2)', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center', borderRadius:'var(--r)' }}>
            ×
          </button>
        )}

        {/* Brand */}
        <div style={{ display:'flex', alignItems:'center', gap:11, padding:'15px 16px 13px', borderBottom:'1px solid var(--bd)', flexShrink:0 }}>
          <div style={{ width:32, height:32, background:'var(--claude)', borderRadius:9, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round">
              <circle cx="10" cy="10" r="7"/>
              <circle cx="10" cy="10" r="2.5"/>
              <line x1="10" y1="2.5" x2="10" y2="7"/><line x1="10" y1="13" x2="10" y2="17.5"/>
              <line x1="2.5" y1="10" x2="7" y2="10"/><line x1="13" y1="10" x2="17.5" y2="10"/>
            </svg>
          </div>
          <div>
            <div style={{ fontSize:14.5, fontWeight:600, letterSpacing:'-.02em', lineHeight:1.2, color:'var(--tx)' }}>SpinQMS</div>
            <div style={{ fontSize:10, color:'var(--tx-3)', marginTop:1.5, letterSpacing:'.04em', fontWeight:500 }}>Ne 47 Weft · SQC</div>
          </div>
        </div>

        {/* Departments */}
        <div style={{ padding:'4px 8px 2px' }}>
          <SideLabel>Departments</SideLabel>
          {depts.map(d => {
            const active = d.id === currentDept
            const qC = d.quality === 'ok' ? 'var(--ok)' : d.quality === 'warn' ? 'var(--warn)' : d.quality === 'bad' ? 'var(--bad)' : null
            return (
              <div key={d.id} onClick={() => { setCurrentDept(d.id); if(isMobile) setMenuOpen(false) }}
                style={{
                  display:'flex', alignItems:'center', gap:9, padding:'7px 10px',
                  borderRadius:'var(--r)', cursor:'pointer', fontSize:13,
                  fontWeight: active ? 600 : 400,
                  color: active ? 'var(--tx)' : 'var(--tx-2)',
                  background: active ? 'var(--bg-active)' : 'transparent',
                  userSelect:'none', transition:'all .12s', position:'relative',
                }}>
                {active && <div style={{ position:'absolute', left:0, top:5, bottom:5, width:2.5, borderRadius:2, background:'var(--claude)' }} />}
                <span style={{ fontSize:11, color: active ? 'var(--claude)' : 'var(--tx-4)', width:16, textAlign:'center', flexShrink:0 }}>
                  {active ? '›' : '·'}
                </span>
                <span style={{ flex:1 }}>{d.name}</span>
                {qC && <span style={{ width:6, height:6, borderRadius:'50%', flexShrink:0, background:qC }} />}
              </div>
            )
          })}
        </div>

        <div style={{ height:1, background:'var(--bd)', margin:'6px 10px' }} />

        {/* Modules — draggable */}
        <div style={{ padding:'4px 8px 4px' }}>
          <SideLabel>Modules</SideLabel>
          {navItems.map((item, idx) => {
            const active = view === item.id
            const isDropTarget = dropIdx === idx && dragIdx !== idx
            return (
              <div key={item.id}
                draggable
                onDragStart={e => handleDragStart(e, idx)}
                onDragOver={e => handleDragOver(e, idx)}
                onDragEnd={handleDragEnd}
                onClick={() => navigate(item.id)}
                style={{
                  display:'flex', alignItems:'center', gap:6, padding:'7px 8px 7px 10px',
                  borderRadius:'var(--r)', cursor:'pointer', fontSize:13,
                  fontWeight: active ? 600 : 400,
                  color: active ? 'var(--tx)' : 'var(--tx-2)',
                  background: active ? 'var(--bg-active)' : 'transparent',
                  userSelect:'none', transition:'all .12s', position:'relative',
                  borderTop: isDropTarget ? '2px solid var(--claude)' : '2px solid transparent',
                }}>
                {active && <div style={{ position:'absolute', left:0, top:4, bottom:4, width:2.5, borderRadius:2, background:'var(--claude)' }} />}
                {/* Drag handle — 6 dots, visible on hover */}
                <div className="drag-handle">
                  <span><i/><i/></span><span><i/><i/></span><span><i/><i/></span>
                </div>
                <span style={{ width:18, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <HandIcon d={ICONS[item.id]} active={active} />
                </span>
                <span style={{ flex:1 }}>{item.label}</span>
                {item.id === 'lab' && (
                  <span style={{
                    fontSize: 9, fontWeight: 700, letterSpacing: '.06em',
                    padding: '1px 5px', borderRadius: 4,
                    background: active ? 'rgba(255,255,255,.18)' : 'var(--claude-bg)',
                    color: active ? '#fff' : 'var(--claude)',
                    border: `1px solid ${active ? 'rgba(255,255,255,.3)' : 'var(--claude-bd)'}`,
                    lineHeight: 1.6,
                  }}>NEW</span>
                )}
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div style={{ marginTop:'auto', padding:'12px 14px', borderTop:'1px solid var(--bd)', flexShrink:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:12 }}>
            <div style={{ width:7, height:7, borderRadius:'50%', flexShrink:0, background:dotColor, boxShadow:`0 0 0 2.5px color-mix(in srgb, ${dotColor} 20%, transparent)`, animation:'pulse 2.5s ease-in-out infinite' }} />
            <span style={{ color:'var(--tx-2)', fontWeight:500 }}>{statusTxt}</span>
          </div>
          <div style={{ fontSize:11, color:'var(--tx-4)', marginTop:4 }}>{lastSaved}</div>
        </div>
      </aside>

      {/* ── Main ── */}
      <div style={{ display:'flex', flexDirection:'column', overflow:'hidden' }}>
        <div style={{
          height:'var(--hdr)', display:'flex', alignItems:'center',
          justifyContent:'space-between', padding:'0 24px',
          borderBottom:'1px solid var(--bd)', flexShrink:0, gap:12,
          background:'var(--bg)',
          ...(isMobile ? { padding:'0 12px', position:'sticky', top:0, zIndex:100 } : {}),
        }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            {isMobile && (
              <button onClick={() => setMenuOpen(true)}
                style={{ width:38, height:38, border:'none', background:'transparent', cursor:'pointer', color:'var(--tx)', fontSize:22, display:'flex', alignItems:'center', justifyContent:'center', borderRadius:'var(--r)', flexShrink:0 }}>
                ☰
              </button>
            )}
            <span style={{ fontSize:15, fontWeight:600, letterSpacing:'-.02em' }}>{currentLabel}</span>
          </div>
          {!isMobile && (
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <HeaderBtn onClick={() => window.open('/api/export/csv','_blank')}>↓ Export CSV</HeaderBtn>
              <HeaderBtn onClick={() => window.print()}>⎙ Print</HeaderBtn>
            </div>
          )}
        </div>

        <div style={{
          flex:1, overflowY:'auto', padding:'22px 24px',
          display:'flex', flexDirection:'column', gap:14,
          ...(isMobile ? { padding:'14px 12px calc(68px + env(safe-area-inset-bottom,0px)) 12px' } : {}),
        }}>
          {children}
        </div>
      </div>

      {/* ── Bottom nav (mobile) ── */}
      {isMobile && (
        <nav style={{
          position:'fixed', bottom:0, left:0, right:0,
          height:'calc(58px + env(safe-area-inset-bottom,0px))',
          paddingBottom:'env(safe-area-inset-bottom,0px)',
          zIndex:150, background:'var(--bg)',
          borderTop:'1px solid var(--bd-md)', display:'flex',
        }}>
          {BOTTOM_NAV.map(id => {
            const item = DEFAULT_NAV.find(n => n.id === id)
            const active = view === id
            return (
              <button key={id} onClick={() => navigate(id)}
                style={{
                  flex:1, display:'flex', flexDirection:'column', alignItems:'center',
                  justifyContent:'center', gap:3, border:'none', background:'transparent',
                  color: active ? 'var(--claude)' : 'var(--tx-3)',
                  fontSize:10, fontWeight: active ? 600 : 400,
                  fontFamily:'var(--font)', cursor:'pointer', transition:'color .12s',
                }}>
                <HandIcon d={ICONS[id]} size={18} active={active} />
                {item.label.split(' ')[0]}
              </button>
            )
          })}
          <button onClick={() => setMenuOpen(true)}
            style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:3, border:'none', background:'transparent', color:'var(--tx-3)', fontSize:10, fontFamily:'var(--font)', cursor:'pointer' }}>
            <HandIcon d="M3 8h.01M8 8h.01M13 8h.01" size={18} />
            More
          </button>
        </nav>
      )}
    </div>
  )
}

/* ── Hand-drawn-feel SVG icon ──────────────────────────────────────────── */
function HandIcon({ d, size = 15, active }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} fill="none"
      stroke={active ? 'var(--claude)' : 'currentColor'}
      strokeWidth={active ? 1.6 : 1.3}
      strokeLinecap="round" strokeLinejoin="round"
      style={{ opacity: active ? 1 : .75 }}>
      <path d={d} />
    </svg>
  )
}

function HeaderBtn({ children, onClick }) {
  return (
    <button onClick={onClick}
      style={{
        display:'inline-flex', alignItems:'center', gap:5,
        padding:'5px 12px', fontSize:12, fontWeight:500,
        border:'1px solid var(--bd-md)', borderRadius:'var(--r)',
        background:'var(--bg)', color:'var(--tx-2)', cursor:'pointer',
        fontFamily:'var(--font)', transition:'all .1s',
      }}
      onMouseEnter={e => { e.currentTarget.style.background='var(--bg-2)'; e.currentTarget.style.borderColor='var(--bd-hv)'; e.currentTarget.style.color='var(--tx)' }}
      onMouseLeave={e => { e.currentTarget.style.background='var(--bg)';   e.currentTarget.style.borderColor='var(--bd-md)'; e.currentTarget.style.color='var(--tx-2)' }}>
      {children}
    </button>
  )
}

function SideLabel({ children }) {
  return <div style={{ fontSize:10, fontWeight:600, letterSpacing:'.1em', textTransform:'uppercase', color:'var(--tx-4)', padding:'10px 10px 5px' }}>{children}</div>
}
