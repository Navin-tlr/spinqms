/* ──────────────────────────────────────────────────────────────────────────
   SAP Fiori–style Launchpad — module tile navigation
────────────────────────────────────────────────────────────────────────── */

const MODULES = [
  {
    id: 'quality',
    title: 'Quality Management',
    subtitle: 'SQC · Control Charts · Uster Benchmarks · Yarn Lab',
    desc: 'Monitor spinning quality KPIs, analyse control charts, manage alerts, and capture batch readings across all departments.',
    color: '#0064d9',
    colorBg: '#ebf4ff',
    icon: (
      <svg viewBox="0 0 40 40" width="40" height="40" fill="none" stroke="#0064d9" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="5" y="5"  width="13" height="13" rx="2" />
        <rect x="22" y="5"  width="13" height="13" rx="2" />
        <rect x="5" y="22" width="13" height="13" rx="2" />
        <rect x="22" y="22" width="13" height="13" rx="2" />
        {/* chart spark in bottom-right tile */}
        <polyline points="24,31 27,27.5 30,29.5 33,25" />
      </svg>
    ),
    badge: 'ACTIVE',
    badgeColor: '#188f36',
    badgeBg: '#f0faf2',
    badgeBd: '#abe2bc',
  },
  {
    id: 'production',
    title: 'Production & Inventory',
    subtitle: 'Shift Output · Efficiency · Hank Meter · Machine-wise Log',
    desc: 'Record and review daily production output per department and shift. Supports efficiency-based and hank-meter calculation methods.',
    color: '#0e7a4a',
    colorBg: '#f0faf5',
    icon: (
      <svg viewBox="0 0 40 40" width="40" height="40" fill="none" stroke="#0e7a4a" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        {/* factory / machine icon */}
        <rect x="6" y="18" width="10" height="16" rx="1.5" />
        <rect x="20" y="12" width="14" height="22" rx="1.5" />
        {/* chimney */}
        <line x1="10" y1="18" x2="10" y2="13" />
        <line x1="14" y1="18" x2="14" y2="15" />
        {/* speed lines */}
        <line x1="23" y1="20" x2="31" y2="20" />
        <line x1="23" y1="24" x2="31" y2="24" />
        <line x1="23" y1="28" x2="28" y2="28" />
      </svg>
    ),
    badge: 'ACTIVE',
    badgeColor: '#188f36',
    badgeBg: '#f0faf2',
    badgeBd: '#abe2bc',
  },
]

/* ── future placeholder tiles ─────────────────────────────────────────── */
const FUTURE_MODULES = [
  {
    id: 'maintenance',
    title: 'Maintenance',
    subtitle: 'Preventive · Breakdown · Lubrication',
    color: '#6d2ac4',
    colorBg: '#f3ecfb',
    icon: (
      <svg viewBox="0 0 40 40" width="40" height="40" fill="none" stroke="#6d2ac4" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M30 10l-4 4-3-3 4-4a6 6 0 00-8 8L8 26a3 3 0 004 4l11-11a6 6 0 008-8z" />
      </svg>
    ),
    badge: 'COMING SOON',
    badgeColor: '#6d2ac4',
    badgeBg: '#f3ecfb',
    badgeBd: '#c4a4e6',
  },
  {
    id: 'hr',
    title: 'Human Resources',
    subtitle: 'Attendance · Shifts · Payroll',
    color: '#b45309',
    colorBg: '#fff8f0',
    icon: (
      <svg viewBox="0 0 40 40" width="40" height="40" fill="none" stroke="#b45309" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="20" cy="14" r="6" />
        <path d="M8 34a12 12 0 0124 0" />
      </svg>
    ),
    badge: 'COMING SOON',
    badgeColor: '#b45309',
    badgeBg: '#fff8f0',
    badgeBd: '#fec27c',
  },
]

/* ── ModuleTile ───────────────────────────────────────────────────────── */
function ModuleTile({ mod, onClick, disabled }) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
        gap: 14,
        background: '#fff',
        border: `1px solid #e8eaed`,
        borderRadius: 8,
        padding: '24px 24px 20px',
        cursor: disabled ? 'default' : 'pointer',
        textAlign: 'left',
        fontFamily: 'var(--font)',
        transition: 'box-shadow .15s, border-color .15s, transform .12s',
        boxShadow: '0 1px 4px rgba(0,0,0,.07)',
        opacity: disabled ? .6 : 1,
        position: 'relative',
        overflow: 'hidden',
      }}
      onMouseEnter={e => {
        if (disabled) return
        e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,100,217,.12), 0 1px 4px rgba(0,0,0,.08)'
        e.currentTarget.style.borderColor = mod.color + '80'
        e.currentTarget.style.transform = 'translateY(-1px)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,.07)'
        e.currentTarget.style.borderColor = '#e8eaed'
        e.currentTarget.style.transform = 'translateY(0)'
      }}
    >
      {/* Colour accent strip */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        height: 3, background: mod.color, borderRadius: '8px 8px 0 0',
      }} />

      {/* Icon */}
      <div style={{
        width: 56, height: 56,
        background: mod.colorBg,
        borderRadius: 10,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        {mod.icon}
      </div>

      {/* Title + subtitle */}
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: '#32363a', letterSpacing: '-.01em', lineHeight: 1.3 }}>
          {mod.title}
        </div>
        <div style={{ fontSize: 11, color: '#6a6d70', marginTop: 4, lineHeight: 1.5 }}>
          {mod.subtitle}
        </div>
      </div>

      {/* Desc */}
      {mod.desc && (
        <div style={{ fontSize: 12, color: '#6a6d70', lineHeight: 1.6, borderTop: '1px solid #f0f0f0', paddingTop: 12, width: '100%' }}>
          {mod.desc}
        </div>
      )}

      {/* Badge + arrow */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
        <span style={{
          fontSize: 10, fontWeight: 600, letterSpacing: '.06em',
          padding: '2px 8px', borderRadius: 4,
          color: mod.badgeColor, background: mod.badgeBg,
          border: `1px solid ${mod.badgeBd}`,
        }}>
          {mod.badge}
        </span>
        {!disabled && (
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke={mod.color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: .7 }}>
            <path d="M3 8h10M9 4l4 4-4 4" />
          </svg>
        )}
      </div>
    </button>
  )
}

/* ── Stat chip ──────────────────────────────────────────────────────────── */
function StatChip({ label, value, color }) {
  return (
    <div style={{
      background: '#fff', border: '1px solid #e8eaed',
      borderRadius: 6, padding: '10px 16px',
      display: 'flex', alignItems: 'center', gap: 10,
      boxShadow: '0 1px 3px rgba(0,0,0,.06)',
    }}>
      <div style={{ width: 3, height: 24, borderRadius: 2, background: color, flexShrink: 0 }} />
      <div>
        <div style={{ fontSize: 11, color: '#6a6d70', lineHeight: 1 }}>{label}</div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 600, color: '#32363a', marginTop: 3, lineHeight: 1 }}>{value}</div>
      </div>
    </div>
  )
}

/* ── LandingPage ────────────────────────────────────────────────────────── */
export default function LandingPage({ setCurrentModule, overview, alerts, depts }) {
  const hour    = new Date().getHours()
  const greeting = hour < 5 ? 'Good night' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const dateStr  = new Date().toLocaleDateString('en-IN', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })

  const hasBad  = alerts.some(a => a.severity === 'bad')
  const hasWarn = alerts.some(a => a.severity === 'warn')
  const alertCount = alerts.filter(a => a.severity === 'bad' || a.severity === 'warn').length

  const totalDepts = depts.length
  const goodDepts  = depts.filter(d => d.quality === 'ok').length

  return (
    <div style={{ minHeight: '100%', background: '#f5f6f8' }}>

      {/* ── Shell / top bar ─────────────────────────────────────────────── */}
      <div style={{
        height: 40, background: '#354a5e',
        display: 'flex', alignItems: 'center',
        padding: '0 24px', gap: 0, flexShrink: 0,
      }}>
        <div style={{
          fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,.55)',
          letterSpacing: '.06em', textTransform: 'uppercase',
          paddingRight: 20, borderRight: '1px solid rgba(255,255,255,.12)', marginRight: 16,
        }}>SpinQMS</div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,.8)', fontWeight: 500 }}>
          Home
        </div>
      </div>

      {/* ── Hero band ──────────────────────────────────────────────────── */}
      <div style={{
        background: 'linear-gradient(135deg, #354a5e 0%, #27384a 100%)',
        padding: '36px 48px 40px',
        color: '#fff',
      }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,.5)', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 8 }}>
            {dateStr}
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-.02em', lineHeight: 1.2 }}>
            {greeting}
          </div>
          <div style={{ fontSize: 14, color: 'rgba(255,255,255,.65)', marginTop: 6 }}>
            SpinQMS Enterprise · Textile Mill Management Platform
          </div>

          {/* Quick status row */}
          <div style={{ display: 'flex', gap: 16, marginTop: 24, flexWrap: 'wrap' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'rgba(255,255,255,.1)', borderRadius: 6,
              padding: '8px 14px', fontSize: 12,
            }}>
              <span style={{
                width: 7, height: 7, borderRadius: '50%',
                background: hasBad ? '#ff6b6b' : hasWarn ? '#ff8f3c' : '#3dd68c',
                flexShrink: 0,
              }} />
              <span style={{ color: 'rgba(255,255,255,.85)' }}>
                {hasBad ? 'Action required' : hasWarn ? `${alertCount} warning${alertCount !== 1 ? 's' : ''}` : 'All systems normal'}
              </span>
            </div>
            <div style={{
              background: 'rgba(255,255,255,.1)', borderRadius: 6,
              padding: '8px 14px', fontSize: 12, color: 'rgba(255,255,255,.85)',
            }}>
              {goodDepts}/{totalDepts} depts in control
            </div>
          </div>
        </div>
      </div>

      {/* ── Content ────────────────────────────────────────────────────── */}
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 48px 48px' }}>

        {/* ── Overview stats strip ─────────────────────────────────────── */}
        {overview.length > 0 && (
          <div style={{ display: 'flex', gap: 12, marginBottom: 36, flexWrap: 'wrap' }}>
            {overview.slice(0, 4).map(ov => {
              const dept = depts.find(d => d.id === ov.dept_id)
              if (!ov.last_mean_hank) return null
              return (
                <StatChip
                  key={ov.dept_id}
                  label={dept?.name ?? ov.dept_id}
                  value={ov.last_mean_hank?.toFixed(ov.last_mean_hank >= 10 ? 1 : 3) ?? '—'}
                  color={ov.quality === 'ok' ? '#188f36' : ov.quality === 'warn' ? '#e6600d' : ov.quality === 'bad' ? '#bb0000' : '#0064d9'}
                />
              )
            })}
          </div>
        )}

        {/* ── Active Applications ──────────────────────────────────────── */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.08em', color: '#6a6d70', marginBottom: 14 }}>
            My Applications
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
            {MODULES.map(mod => (
              <ModuleTile
                key={mod.id}
                mod={mod}
                onClick={() => setCurrentModule(mod.id)}
              />
            ))}
          </div>
        </div>

        {/* ── Upcoming / future modules ────────────────────────────────── */}
        <div style={{ marginTop: 32 }}>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.08em', color: '#6a6d70', marginBottom: 14 }}>
            Planned Modules
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {FUTURE_MODULES.map(mod => (
              <ModuleTile key={mod.id} mod={mod} disabled />
            ))}
          </div>
        </div>

        {/* ── System info footer ──────────────────────────────────────── */}
        <div style={{
          marginTop: 48, paddingTop: 20, borderTop: '1px solid #e8eaed',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: 8,
        }}>
          <div style={{ fontSize: 11, color: '#a9abad' }}>
            SpinQMS Enterprise v2.0 · SVS Branch
          </div>
          <div style={{ fontSize: 11, color: '#a9abad', fontFamily: 'var(--mono)' }}>
            backend: localhost:8000 · frontend: localhost:5173
          </div>
        </div>
      </div>
    </div>
  )
}
