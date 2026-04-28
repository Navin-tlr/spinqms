import { useEffect, useState, useMemo } from 'react'
import { Card, LabelCaps, Empty, Badge } from '../Primitives.jsx'
import { getSamples } from '../../api.js'
import { MACHINE_CONFIG } from '../../App.jsx'
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement,
  LineElement, Title, Tooltip, Legend, Filler,
} from 'chart.js'
import { Line } from 'react-chartjs-2'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler)

/* ═══════════════════════════════════════════════════════════════════════════
   UTILITARIAN COLOUR PALETTE
   Follows ISO/ANSI SPC chart conventions:
     • Action limits (3σ) — green solid    — process boundary, must stop if breached
     • Warning limits (2σ) — amber dashed  — investigate if points cluster here
     • Centreline          — slate dashed  — running mean, should be near target
     • Target              — red dotted    — specified aim value
     • Data line           — dark charcoal — high-contrast on parchment
     • OOC points          — red fill      — immediate action required
     • Warning points      — amber fill    — investigate
═══════════════════════════════════════════════════════════════════════════ */
const C = {
  data:    '#1e293b',   // slate-800  — data line
  ucl:     '#15803d',   // green-700  — UCL/LCL solid
  warn:    '#b45309',   // amber-700  — WUL/WLL dashed
  cl:      '#64748b',   // slate-500  — centreline dashed
  target:  '#b91c1c',   // red-700    — target dotted
  ooc:     '#dc2626',   // red-600    — out-of-control points
  warnPt:  '#d97706',   // amber-600  — warning-zone points
  normal:  '#1e293b',   // slate-800  — in-control points
  grid:    'rgba(0,0,0,0.05)',
  gridX:   'rgba(0,0,0,0.03)',
}

/* ── Time-range options ──────────────────────────────────────────────────── */
const RANGES = [
  { id: 'shift', label: 'Past Shift',   hours: 8    },
  { id: '24h',   label: 'Past 24 h',    hours: 24   },
  { id: '7d',    label: 'Past 7 Days',  hours: 168  },
  { id: 'month', label: 'Past Month',   hours: 720  },
  { id: 'all',   label: 'All Data',     hours: null },
]

function cutoffFor(rangeId) {
  const r = RANGES.find(x => x.id === rangeId)
  if (!r || !r.hours) return null
  return new Date(Date.now() - r.hours * 3_600_000)
}

/* ── Small stat pill ─────────────────────────────────────────────────────── */
function StatPill({ label, value }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:2, padding:'8px 14px', background:'var(--bg-2)', border:'1px solid var(--bd)', borderRadius:'var(--r)' }}>
      <span style={{ fontSize:13, fontWeight:600, fontFamily:'var(--mono)', color:'var(--tx)', lineHeight:1 }}>{value}</span>
      <span style={{ fontSize:10, color:'var(--tx-3)', fontWeight:500, whiteSpace:'nowrap' }}>{label}</span>
    </div>
  )
}

/* ── Legend item ─────────────────────────────────────────────────────────── */
function LegendItem({ color, dash, label }) {
  const style = dash === 'solid'
    ? { background: color }
    : dash === 'dashed'
      ? { background:'transparent', borderTop:`2px dashed ${color}` }
      : { background:'transparent', borderTop:`2px dotted ${color}` }
  return (
    <span style={{ display:'flex', alignItems:'center', gap:5, fontSize:11, color:'var(--tx-2)' }}>
      <span style={{ display:'inline-block', width:18, height:2, ...style }} />
      {label}
    </span>
  )
}

/* ── Range pill button ───────────────────────────────────────────────────── */
function RangePill({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      padding:'4px 12px', fontSize:11, fontWeight: active ? 600 : 400,
      border:'1.5px solid', borderRadius:20, cursor:'pointer', fontFamily:'var(--font)',
      transition:'all .12s', lineHeight:1, whiteSpace:'nowrap',
      background: active ? 'var(--claude)' : 'transparent',
      color:      active ? '#fff' : 'var(--tx-2)',
      borderColor: active ? 'var(--claude)' : 'var(--bd-md)',
    }}>{children}</button>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   Main component
═══════════════════════════════════════════════════════════════════════════ */
export default function ControlCharts({ overview, currentDept, depts, machineFilter }) {
  const kpi  = overview.find(o => o.dept_id === currentDept)
  const dept = depts.find(d => d.id === currentDept)
  const machineConf = MACHINE_CONFIG[currentDept] ?? null

  const [allSamples, setAllSamples] = useState([])
  const [range, setRange] = useState(() => {
    try { return localStorage.getItem('spinqms_chart_range') || '7d' } catch { return '7d' }
  })

  useEffect(() => {
    try { localStorage.setItem('spinqms_chart_range', range) } catch {}
  }, [range])

  /* Fetch — re-run when dept or machineFilter changes */
  useEffect(() => {
    getSamples(currentDept, null, machineFilter ?? undefined)
      .then(setAllSamples)
      .catch(() => {})
  }, [currentDept, machineFilter])

  /* Filter by time range */
  const filtered = useMemo(() => {
    const cutoff = cutoffFor(range)
    if (!cutoff) return allSamples
    return allSamples.filter(s => {
      const t = new Date(s.timestamp.endsWith('Z') ? s.timestamp : s.timestamp + 'Z')
      return t >= cutoff
    })
  }, [allSamples, range])

  /* Flatten readings + build x-axis labels (oldest → newest = left → right) */
  const { arr, labels } = useMemo(() => {
    const arr = [], labels = []
    const ordered = [...filtered].reverse()   // API returns newest-first; flip to oldest-first
    ordered.forEach(s => {
      const d = new Date(s.timestamp.endsWith('Z') ? s.timestamp : s.timestamp + 'Z')
      const lbl = range === 'shift' || range === '24h'
        ? d.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })
        : d.toLocaleDateString([], { month:'short', day:'numeric' })
      s.readings.forEach((v, ri) => {
        arr.push(v)
        labels.push(ri === 0 ? lbl : '')
      })
    })
    return { arr, labels }
  }, [filtered, range])

  /* ── target & p must be computed before filteredStats hook ─────────────── */
  /* kpi may be undefined or have n=0; guard with ?. and fallback to 0      */
  const target = dept?.target ?? kpi?.mean ?? 0
  const p      = target >= 10 ? 2 : 4

  /* ── Compute stats from the time-filtered readings (arr) ─────────────────
     IMPORTANT: this useMemo hook MUST be called before any conditional
     return — React's Rules of Hooks forbid hooks after early returns.
     Fall back to kpi (all-time) values only when arr is empty.            */
  const filteredStats = useMemo(() => {
    if (arr.length === 0) return null
    const n    = arr.length
    const mean = arr.reduce((a, b) => a + b, 0) / n
    const sd   = Math.sqrt(arr.reduce((s, v) => s + (v - mean) ** 2, 0) / n)
    const ucl  = mean + 3 * sd
    const lcl  = mean - 3 * sd
    const wul  = mean + 2 * sd
    const wll  = mean - 2 * sd
    const cv   = sd / mean * 100
    const usl  = dept?.usl ?? (target + 3 * sd)
    const lsl  = dept?.lsl ?? (target - 3 * sd)
    const cpk  = sd > 0 ? Math.min((usl - mean) / (3 * sd), (mean - lsl) / (3 * sd)) : null
    const cp   = sd > 0 ? (usl - lsl) / (6 * sd) : null
    return { mean, sd, ucl, lcl, wul, wll, cv, cpk, cp }
  }, [arr, dept, target])

  /* ── Early return for empty depts — AFTER all hooks ─────────────────────
     Returning here is now safe: every hook above has already been called   */
  if (!kpi || kpi.n === 0) {
    return <Card sm><Empty>Enter samples to see control chart</Empty></Card>
  }

  const { mean, sd, ucl, lcl, wul, wll } = filteredStats ?? kpi
  const flat   = v => arr.map(() => v)

  /* Per-point colours based on zone */
  const ptColor = arr.map(v => {
    if (v > ucl || v < lcl) return C.ooc
    if (v > wul || v < wll) return C.warnPt
    return C.normal
  })

  const oocCount  = arr.filter(v => v > ucl || v < lcl).length
  const warnCount = arr.filter(v => (v > wul && v <= ucl) || (v < wll && v >= lcl)).length
  const rangeObj  = RANGES.find(r => r.id === range)

  const chartData = {
    labels,
    datasets: [
      /* ── Data line ── */
      {
        label: 'Reading', data: arr, order: 1,
        borderColor: C.data,
        backgroundColor: 'transparent',
        pointRadius: arr.length > 100 ? 1.5 : 3.5,
        pointHoverRadius: 5,
        pointBackgroundColor: ptColor,
        pointBorderColor:     ptColor,
        pointBorderWidth: 1,
        tension: 0.15,
        borderWidth: 1.5,
      },
      /* ── Control limits — solid green ── */
      {
        label: 'UCL (3σ)', data: flat(ucl), order: 2,
        borderColor: C.ucl, borderWidth: 1.5, pointRadius: 0, tension: 0,
        backgroundColor: 'transparent',
      },
      {
        label: 'LCL (3σ)', data: flat(lcl), order: 2,
        borderColor: C.ucl, borderWidth: 1.5, pointRadius: 0, tension: 0,
        backgroundColor: 'transparent',
      },
      /* ── Warning limits — amber dashed ── */
      {
        label: 'WUL (2σ)', data: flat(wul), order: 2,
        borderColor: C.warn, borderWidth: 1, borderDash: [6, 3],
        pointRadius: 0, tension: 0, backgroundColor: 'transparent',
      },
      {
        label: 'WLL (2σ)', data: flat(wll), order: 2,
        borderColor: C.warn, borderWidth: 1, borderDash: [6, 3],
        pointRadius: 0, tension: 0, backgroundColor: 'transparent',
      },
      /* ── Centreline — slate dashed ── */
      {
        label: 'Mean', data: flat(mean), order: 2,
        borderColor: C.cl, borderWidth: 1, borderDash: [4, 3],
        pointRadius: 0, tension: 0, backgroundColor: 'transparent',
      },
      /* ── Target — red dotted ── */
      {
        label: 'Target', data: flat(target), order: 2,
        borderColor: C.target, borderWidth: 1.5, borderDash: [2, 4],
        pointRadius: 0, tension: 0, backgroundColor: 'transparent',
      },
    ],
  }

  const opts = {
    responsive: true, maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    animation: { duration: 250 },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(255,255,255,0.97)',
        titleColor: '#1e293b',
        bodyColor: '#475569',
        borderColor: '#e2e8f0',
        borderWidth: 1,
        cornerRadius: 6,
        padding: 10,
        titleFont: { size: 11, weight: 600 },
        bodyFont: { size: 11, family: 'JetBrains Mono, monospace' },
        filter: item => item.datasetIndex === 0,   // only show the Reading point
        callbacks: {
          label: ctx => ` ${ctx.parsed.y?.toFixed(p + 2)}`,
        },
      },
    },
    scales: {
      x: {
        grid: { color: C.gridX, drawBorder: false },
        ticks: {
          color: '#94a3b8',
          font: { size: 10 },
          maxRotation: 45,
          autoSkip: true,
          maxTicksLimit: 20,
        },
      },
      y: {
        grid: { color: C.grid, drawBorder: false },
        title: {
          display: true,
          text: dept?.unit === 'Ne' ? 'Ne count' : 'Hank count',
          color: '#94a3b8',
          font: { size: 11, weight: 500 },
        },
        ticks: {
          color: '#94a3b8',
          font: { size: 10, family: 'JetBrains Mono, monospace' },
        },
      },
    },
  }

  /* ── Histogram ──────────────────────────────────────────────────────────── */
  const mn = Math.min(...arr), mx = Math.max(...arr)
  const bins = 7, bw = (mx - mn) / bins || 0.001
  const hist = Array(bins).fill(0)
  arr.forEach(v => { hist[Math.min(Math.floor((v - mn) / bw), bins - 1)]++ })
  const maxH = Math.max(...hist) || 1
  const usl = dept?.usl ?? mx, lsl = dept?.lsl ?? mn
  const inSpecCount = arr.filter(v => v >= lsl && v <= usl).length

  return (
    <>
      {/* ═══════════════════════ X-bar Control Chart ═══════════════════════ */}
      <Card sm>
        {/* Header row */}
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', flexWrap:'wrap', gap:10, marginBottom:14 }}>
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
              <LabelCaps className="!mb-0">
                X-bar Control Chart — {dept?.name}
                {machineFilter != null && machineConf && (
                  <span style={{ fontWeight:400, color:'var(--tx-3)', textTransform:'none', letterSpacing:0 }}> · {machineConf.label} #{machineFilter}</span>
                )}
              </LabelCaps>
              <Badge variant={kpi.quality === 'ok' ? 'ok' : kpi.quality === 'warn' ? 'warn' : 'bad'}>
                {kpi.quality === 'ok' ? 'In control' : kpi.quality === 'warn' ? 'Warning' : 'Action needed'}
              </Badge>
              {oocCount > 0  && <Badge variant="bad">{oocCount} OOC</Badge>}
              {warnCount > 0 && <Badge variant="warn">{warnCount} warning</Badge>}
            </div>
            <span style={{ fontSize:11, color:'var(--tx-3)' }}>
              {filtered.length} batch{filtered.length !== 1 ? 'es' : ''} · {arr.length} readings
            </span>
          </div>

          {/* Time range pills */}
          <div style={{ display:'flex', gap:5, flexWrap:'wrap', alignItems:'center' }}>
            {RANGES.map(r => (
              <RangePill key={r.id} active={range === r.id} onClick={() => setRange(r.id)}>
                {r.label}
              </RangePill>
            ))}
          </div>
        </div>

        {/* Legend */}
        <div style={{ display:'flex', flexWrap:'wrap', gap:'8px 18px', marginBottom:12, padding:'8px 12px', background:'var(--bg-2)', borderRadius:'var(--r)', border:'1px solid var(--bd)' }}>
          <LegendItem color={C.data}   dash="solid"  label="Reading" />
          <LegendItem color={C.ucl}    dash="solid"  label="Action limit (3σ)" />
          <LegendItem color={C.warn}   dash="dashed" label="Warning limit (2σ)" />
          <LegendItem color={C.cl}     dash="dashed" label="Centreline (x̄)" />
          <LegendItem color={C.target} dash="dotted" label="Target" />
          <span style={{ display:'flex', alignItems:'center', gap:5, fontSize:11, color:'var(--tx-2)' }}>
            <span style={{ display:'inline-block', width:9, height:9, borderRadius:'50%', background:C.ooc }} />
            Out-of-control
          </span>
          <span style={{ display:'flex', alignItems:'center', gap:5, fontSize:11, color:'var(--tx-2)' }}>
            <span style={{ display:'inline-block', width:9, height:9, borderRadius:'50%', background:C.warnPt }} />
            Warning zone
          </span>
        </div>

        {/* Chart */}
        <div style={{ position:'relative', width:'100%', height:260 }}>
          {arr.length === 0
            ? <Empty>No data in {rangeObj?.label?.toLowerCase() ?? 'selected range'}</Empty>
            : <Line data={chartData} options={opts} />
          }
        </div>
      </Card>

      {/* ═══════════════════════ Statistical Summary ═══════════════════════ */}
      <Card sm>
        <LabelCaps>Statistical summary — {rangeObj?.label ?? 'All data'} · {arr.length} readings</LabelCaps>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(90px, 1fr))', gap:8 }}>
          <StatPill label="Mean (x̄)"   value={mean?.toFixed(p)                                        ?? '—'} />
          <StatPill label="Std Dev (σ)" value={sd?.toFixed(p + 1)                                      ?? '—'} />
          <StatPill label="CV%"         value={filteredStats?.cv != null ? `${filteredStats.cv.toFixed(2)}%` : kpi.cv != null ? `${kpi.cv.toFixed(2)}%` : '—'} />
          <StatPill label="Cpk"         value={(filteredStats?.cpk ?? kpi.cpk)?.toFixed(3)             ?? '—'} />
          <StatPill label="UCL (3σ)"    value={ucl?.toFixed(p)                                         ?? '—'} />
          <StatPill label="LCL (3σ)"    value={lcl?.toFixed(p)                                         ?? '—'} />
          <StatPill label="Target"      value={target?.toFixed(p)                                      ?? '—'} />
        </div>
      </Card>

      {/* ═══════════════════════ Distribution Histogram ════════════════════ */}
      <Card sm>
        <div style={{ display:'flex', alignItems:'baseline', justifyContent:'space-between', marginBottom:12, flexWrap:'wrap', gap:6 }}>
          <LabelCaps className="!mb-0">Distribution histogram</LabelCaps>
          {arr.length > 0 && (
            <span style={{ fontSize:11, color:'var(--tx-3)' }}>
              {inSpecCount}/{arr.length} in spec ({((inSpecCount / arr.length) * 100).toFixed(1)}%)
              &ensp;·&ensp;spec: {lsl.toFixed(p)} – {usl.toFixed(p)} {dept?.unit}
            </span>
          )}
        </div>

        {arr.length === 0
          ? <Empty>No data in selected range</Empty>
          : (
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {hist.map((c, i) => {
                const lo     = mn + i * bw, hi = mn + (i + 1) * bw
                const inSpec = lo >= lsl && hi <= usl
                const pct    = (c / maxH * 100).toFixed(0)
                return (
                  <div key={i} style={{ display:'flex', alignItems:'center', gap:10 }}>
                    <span style={{ width:120, textAlign:'right', fontFamily:'var(--mono)', fontSize:10, color:'var(--tx-3)', flexShrink:0 }}>
                      {lo.toFixed(p)} – {hi.toFixed(p)}
                    </span>
                    <div style={{ flex:1, height:20, background:'var(--bg-2)', borderRadius:3, overflow:'hidden', border:'1px solid var(--bd)' }}>
                      <div style={{
                        height:'100%', borderRadius:2, transition:'width .35s ease',
                        width:`${pct}%`,
                        background: inSpec ? C.ucl : C.ooc,
                        opacity: 0.75,
                      }} />
                    </div>
                    <span style={{ width:22, textAlign:'right', fontFamily:'var(--mono)', fontSize:11, color:'var(--tx-2)', flexShrink:0 }}>{c}</span>
                    <span style={{ width:72, fontSize:10, flexShrink:0, color: inSpec ? 'var(--tx-4)' : C.ooc, fontWeight: inSpec ? 400 : 600 }}>
                      {inSpec ? 'in spec' : '⚠ out of spec'}
                    </span>
                  </div>
                )
              })}
            </div>
          )
        }
      </Card>
    </>
  )
}
