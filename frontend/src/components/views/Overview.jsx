import { useState, useEffect, useCallback, Suspense, lazy } from 'react'
import { getOverview, getSamples } from '../../api.js'
import { Spinner } from '../Primitives.jsx'

const ControlCharts = lazy(() => import('./ControlCharts.jsx'))

/* ── Time ranges ──────────────────────────────────────────────────────────── */
const RANGES = [
  { id: 'today', label: 'Today'     },
  { id: '7d',    label: '7 Days'    },
  { id: '30d',   label: '30 Days'   },
  { id: '90d',   label: '3 Months'  },
  { id: 'all',   label: 'All Time'  },
]

function todayMidnight() {
  const d = new Date(); d.setHours(0, 0, 0, 0); return d
}

function rangeParams(id) {
  if (id === 'today') return { date_from: todayMidnight().toISOString() }
  if (id === '7d')    return { date_from: new Date(Date.now() - 7  * 86400000).toISOString() }
  if (id === '30d')   return { date_from: new Date(Date.now() - 30 * 86400000).toISOString() }
  if (id === '90d')   return { date_from: new Date(Date.now() - 90 * 86400000).toISOString() }
  return {}
}

const FMT = { day: 'numeric', month: 'short' }
function rangeSub(id) {
  if (id === 'today') {
    const t = new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    return `${todayMidnight().toLocaleDateString(undefined, FMT)} · 00:00 – ${t}`
  }
  const days = id === '7d' ? 7 : id === '30d' ? 30 : id === '90d' ? 90 : null
  if (days) return `${new Date(Date.now() - days * 86400000).toLocaleDateString(undefined, FMT)} – Today`
  return 'All historical data'
}

/* ── Sparkline ────────────────────────────────────────────────────────────── */
function Sparkline({ values }) {
  if (!values || values.length < 2) {
    return (
      <svg viewBox="0 0 200 40" width="100%" height="40" preserveAspectRatio="none" style={{ display: 'block' }}>
        <line x1="0" y1="20" x2="200" y2="20" stroke="#e2e8f0" strokeWidth="1" />
      </svg>
    )
  }
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const pad = 4
  const W = 200, H = 40
  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (W - pad * 2)
    const y = (H - pad) - ((v - min) / span) * (H - pad * 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="40" preserveAspectRatio="none" style={{ display: 'block' }}>
      <polyline points={pts} fill="none" stroke="#94a3b8" strokeWidth="1.8"
        strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

/* ── Department tile ──────────────────────────────────────────────────────── */
function DeptTile({ d, sparkValues, onClick }) {
  const [hov, setHov] = useState(false)
  const p = d.target >= 10 ? 2 : 4
  const qColor = d.quality === 'ok' ? 'var(--ok)' : d.quality === 'warn' ? 'var(--warn)' : d.quality === 'bad' ? 'var(--bad)' : 'var(--tx-3)'

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: '#fff',
        border: `1px solid ${hov ? 'rgba(10,110,209,0.18)' : '#d1d5db'}`,
        cursor: 'pointer',
        padding: '14px 16px 12px',
        display: 'flex', flexDirection: 'column', gap: 10,
        transition: 'border-color .18s',
        userSelect: 'none',
      }}
    >
      {/* Department name */}
      <div style={{
        fontSize: 11, fontWeight: 500, color: 'var(--tx-2)',
        letterSpacing: '.03em', textTransform: 'uppercase',
      }}>
        {d.name}
      </div>

      {/* Sparkline */}
      <div style={{ overflow: 'hidden', opacity: d.n === 0 ? 0.35 : 1 }}>
        <Sparkline values={sparkValues} />
      </div>

      {/* KPIs */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <TileKPI label="Mean" value={d.n > 0 ? d.mean?.toFixed(p) : '—'} unit={d.unit} />
        <TileKPI
          label="CV%"
          value={d.n > 0 && d.cv != null ? `${d.cv.toFixed(2)}%` : '—'}
          color={d.n > 0 ? qColor : undefined}
          bold
        />
        <TileKPI label="Target" value={`${d.target}`} unit={d.unit} />
      </div>
    </div>
  )
}

function TileKPI({ label, value, unit, color, bold }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{
        fontSize: 9, fontWeight: 600, letterSpacing: '.07em',
        textTransform: 'uppercase', color: 'var(--tx-4)',
      }}>
        {label}
      </span>
      <span style={{
        fontSize: 13, fontWeight: bold ? 600 : 400,
        color: color ?? 'var(--tx)',
        fontVariantNumeric: 'tabular-nums',
        lineHeight: 1.2,
      }}>
        {value}
        {unit && value !== '—' && (
          <span style={{ fontSize: 10, color: 'var(--tx-4)', marginLeft: 2, fontWeight: 400 }}>{unit}</span>
        )}
      </span>
    </div>
  )
}

/* ── Chart modal ──────────────────────────────────────────────────────────── */
function ChartModal({ deptId, depts, overview, machineFilter, onClose }) {
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const deptName = depts.find(d => d.id === deptId)?.name ?? deptId

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 600,
        background: 'rgba(15,23,42,0.4)',
        backdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 28,
      }}
    >
      <div style={{
        width: '90%', height: '90%',
        background: 'var(--bg)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: '0 24px 64px rgba(0,0,0,0.18), 0 4px 16px rgba(0,0,0,0.1)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '11px 20px', borderBottom: '1px solid var(--bd)', flexShrink: 0,
        }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--tx)' }}>
            {deptName} — Control Charts
          </span>
          <button
            onClick={onClose}
            title="Close (Esc)"
            style={{
              width: 28, height: 28,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '1px solid var(--bd)', background: 'transparent',
              cursor: 'pointer', color: 'var(--tx-3)',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-2)'; e.currentTarget.style.color = 'var(--tx)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--tx-3)' }}
          >
            <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M3 3l10 10M13 3L3 13" />
            </svg>
          </button>
        </div>

        {/* Lazy-loaded control charts */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <Suspense fallback={
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 10, color: 'var(--tx-3)', fontSize: 12 }}>
              <Spinner /> Loading charts…
            </div>
          }>
            <ControlCharts
              overview={overview}
              currentDept={deptId}
              depts={depts}
              machineFilter={machineFilter}
            />
          </Suspense>
        </div>
      </div>
    </div>
  )
}

/* ── Department summary table ─────────────────────────────────────────────── */
function SummaryTable({ overview, currentDept, setCurrentDept }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          {['Department', 'Samples', 'Mean', 'CV%', 'Cpk', 'Cp', ''].map((h, i) => (
            <th key={i} style={{
              padding: '7px 14px',
              textAlign: i === 0 ? 'left' : i === 6 ? 'center' : 'right',
              fontSize: 10, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase',
              color: 'var(--tx-4)', background: 'var(--bg-3)',
              borderBottom: '1px solid var(--bd)',
              whiteSpace: 'nowrap',
            }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {overview.map((d, i) => {
          const active = d.dept_id === currentDept
          const pp = d.target >= 10 ? 2 : 4
          const qCol = d.quality === 'ok' ? 'var(--ok)' : d.quality === 'warn' ? 'var(--warn)' : d.quality === 'bad' ? 'var(--bad)' : null
          const baseBg = active ? 'var(--bg-active)' : i % 2 === 0 ? '#fff' : '#fafafa'
          const C = {
            padding: '8px 14px', fontSize: 12, color: 'var(--tx)',
            borderBottom: '1px solid #f0f0f0', background: baseBg,
          }
          return (
            <tr
              key={d.dept_id}
              onClick={() => setCurrentDept(d.dept_id)}
              style={{ cursor: 'pointer' }}
              onMouseEnter={e => Array.from(e.currentTarget.cells).forEach(c => c.style.background = 'var(--bg-hover)')}
              onMouseLeave={e => Array.from(e.currentTarget.cells).forEach(c => c.style.background = baseBg)}
            >
              <td style={{
                ...C,
                borderLeft: active ? '2px solid var(--claude)' : '2px solid transparent',
                fontWeight: active ? 500 : 400,
                color: active ? 'var(--claude)' : 'var(--tx)',
              }}>
                {d.name}
              </td>
              {d.n === 0 ? (
                <td colSpan={5} style={{ ...C, color: 'var(--tx-4)', fontStyle: 'italic', fontSize: 11 }}>
                  No data in range
                </td>
              ) : (
                <>
                  <td style={{ ...C, textAlign: 'right', color: 'var(--tx-3)', fontVariantNumeric: 'tabular-nums' }}>{d.n}</td>
                  <td style={{ ...C, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{d.mean?.toFixed(pp)}</td>
                  <td style={{ ...C, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 500, color: qCol ?? 'var(--tx)' }}>
                    {d.cv != null ? `${d.cv.toFixed(2)}%` : '—'}
                  </td>
                  <td style={{ ...C, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{d.cpk?.toFixed(2) ?? '—'}</td>
                  <td style={{ ...C, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--tx-3)' }}>{d.cp?.toFixed(2) ?? '—'}</td>
                </>
              )}
              <td style={{ ...C, textAlign: 'center', width: 32, paddingLeft: 0, paddingRight: 0 }}>
                {d.quality && d.n > 0 && qCol && (
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: qCol, display: 'inline-block' }} />
                )}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

/* ══════════════════════════════════════════════════════════════════════════ */
export default function Overview({ overview: propOverview, currentDept, setCurrentDept, depts, machineFilter }) {
  const [range,    setRange]    = useState(() => localStorage.getItem('spinqms_ov_range') || 'all')
  const [overview, setOverview] = useState(propOverview)
  const [loading,  setLoading]  = useState(false)
  const [sparks,   setSparks]   = useState({})   // dept_id → cv_pct[]
  const [modalDept, setModalDept] = useState(null)

  /* ── Fetch overview (KPIs + table data) ── */
  const fetchOverview = useCallback(r => {
    setLoading(true)
    getOverview(rangeParams(r))
      .then(data => setOverview(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetchOverview(range) }, [range, fetchOverview])
  useEffect(() => { if (range === 'all') setOverview(propOverview) }, [propOverview, range])

  /* ── Fetch sparkline data for all depts once on mount ── */
  useEffect(() => {
    if (!depts?.length) return
    depts.forEach(d => {
      getSamples(d.id)
        .then(samples => {
          const vals = samples
            .filter(s => s.cv_pct != null)
            .slice(-30)
            .map(s => parseFloat(s.cv_pct))
          setSparks(prev => ({ ...prev, [d.id]: vals }))
        })
        .catch(() => {})
    })
  }, [depts])

  const handleRange = id => {
    setRange(id)
    localStorage.setItem('spinqms_ov_range', id)
  }

  return (
    <div style={{ background: '#f0f4f8', minHeight: '100%', display: 'flex', flexDirection: 'column' }}>

      {/* ── Period selector ── */}
      <div style={{
        background: '#fff', borderBottom: '1px solid var(--bd)',
        padding: '0 20px', display: 'flex', alignItems: 'center', flexShrink: 0,
      }}>
        <span style={{
          fontSize: 10, fontWeight: 600, letterSpacing: '.08em',
          textTransform: 'uppercase', color: 'var(--tx-4)',
          marginRight: 10, flexShrink: 0,
        }}>
          Period
        </span>
        {RANGES.map(r => (
          <button key={r.id} onClick={() => handleRange(r.id)} style={{
            height: 36, padding: '0 12px', fontSize: 12,
            fontWeight: range === r.id ? 500 : 400,
            border: 'none',
            borderBottom: range === r.id ? '2px solid var(--claude)' : '2px solid transparent',
            background: 'transparent',
            color: range === r.id ? 'var(--claude)' : 'var(--tx-3)',
            cursor: 'pointer', fontFamily: 'var(--font)',
            transition: 'color .12s',
          }}>
            {r.label}
          </button>
        ))}
        <span style={{ fontSize: 11, color: 'var(--tx-4)', marginLeft: 10, fontVariantNumeric: 'tabular-nums' }}>
          {rangeSub(range)}
          {loading && <span style={{ marginLeft: 6, fontStyle: 'italic' }}>· updating</span>}
        </span>
      </div>

      {/* ── Department tiles ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 1,
        padding: 1,
        background: '#d1d5db',
        flexShrink: 0,
      }}>
        {overview.map(d => (
          <DeptTile
            key={d.dept_id}
            d={d}
            sparkValues={sparks[d.dept_id] ?? []}
            onClick={() => setModalDept(d.dept_id)}
          />
        ))}
      </div>

      {/* ── Department summary table ── */}
      <div style={{ flex: 1, padding: '20px 0 0', background: '#f0f4f8' }}>
        <div style={{
          fontSize: 10, fontWeight: 600, letterSpacing: '.08em',
          textTransform: 'uppercase', color: 'var(--tx-4)',
          padding: '0 20px 10px',
        }}>
          Department Summary
        </div>
        <div style={{ background: '#fff', borderTop: '1px solid var(--bd)', borderBottom: '1px solid var(--bd)' }}>
          <SummaryTable
            overview={overview}
            currentDept={currentDept}
            setCurrentDept={setCurrentDept}
          />
        </div>
      </div>

      {/* ── Chart modal ── */}
      {modalDept && (
        <ChartModal
          deptId={modalDept}
          depts={depts}
          overview={overview}
          machineFilter={machineFilter}
          onClose={() => setModalDept(null)}
        />
      )}
    </div>
  )
}
