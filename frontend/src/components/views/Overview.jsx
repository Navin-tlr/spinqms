import { useState, useEffect, useCallback } from 'react'
import { Card, LabelCaps, Badge, Metric, qualityLabel } from '../Primitives.jsx'
import { getOverview } from '../../api.js'

/* ── Time range config ──────────────────────────────────────────────────── */
const RANGES = [
  { id: 'today',  label: 'Today'        },
  { id: '7d',     label: '7 Days'       },
  { id: '30d',    label: '30 Days'      },
  { id: '90d',    label: '3 Months'     },
  { id: 'all',    label: 'All Time'     },
]

function todayMidnight() {
  const d = new Date(); d.setHours(0, 0, 0, 0); return d
}

function rangeParams(id) {
  if (id === 'today') return { date_from: todayMidnight().toISOString() }
  if (id === '7d')    return { date_from: new Date(Date.now() - 7  * 86400000).toISOString() }
  if (id === '30d')   return { date_from: new Date(Date.now() - 30 * 86400000).toISOString() }
  if (id === '90d')   return { date_from: new Date(Date.now() - 90 * 86400000).toISOString() }
  return {} // all time
}

const FMT_D = { day: 'numeric', month: 'short', year: 'numeric' }
function rangeLabel(id) {
  const now = new Date()
  if (id === 'today') {
    const m = now.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
    const t = now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    return `${m} · 00:00 – ${t}`
  }
  const days = id === '7d' ? 7 : id === '30d' ? 30 : id === '90d' ? 90 : null
  if (days) {
    const from = new Date(Date.now() - days * 86400000)
    return `${from.toLocaleDateString(undefined, FMT_D)} – Today`
  }
  return 'All historical records'
}

/* ── Table header cell ──────────────────────────────────────────────────── */
function TH({ children, right }) {
  return (
    <th style={{
      padding: '5px 8px',
      textAlign: right ? 'right' : 'left',
      fontSize: 11, fontWeight: 700,
      color: '#1d1d1d',
      letterSpacing: '.05em', textTransform: 'uppercase',
      background: '#e8e8e8',
      border: '1px solid #cccccc',
      whiteSpace: 'nowrap',
    }}>{children}</th>
  )
}

export default function Overview({ overview: propOverview, currentDept, setCurrentDept }) {
  const [range,    setRange]    = useState(() => localStorage.getItem('spinqms_ov_range') || 'all')
  const [overview, setOverview] = useState(propOverview)
  const [loading,  setLoading]  = useState(false)

  const fetchOverview = useCallback((r) => {
    setLoading(true)
    getOverview(rangeParams(r))
      .then(data => setOverview(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetchOverview(range) }, [range, fetchOverview])
  useEffect(() => { if (range === 'all') setOverview(propOverview) }, [propOverview, range])

  const handleRange = (id) => {
    setRange(id)
    localStorage.setItem('spinqms_ov_range', id)
  }

  const dept = overview.find(o => o.dept_id === currentDept)
  const p    = dept?.target >= 10 ? 2 : 4

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, background: '#f2f6fa', padding: 16 }}>

      {/* ── Time range selector ── */}
      <div style={{
        background: '#fff',
        border: '1px solid var(--bd)',
        padding: '10px 16px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{
            fontSize: 10, fontWeight: 600, letterSpacing: '.08em',
            textTransform: 'uppercase', color: 'var(--tx-4)',
            marginRight: 4, flexShrink: 0,
          }}>
            Period
          </span>
          {RANGES.map(r => (
            <button key={r.id} onClick={() => handleRange(r.id)} style={{
              padding: '4px 14px', fontSize: 12, fontWeight: range === r.id ? 600 : 400,
              border: '1px solid', borderRadius: 0, cursor: 'pointer',
              fontFamily: 'var(--font)', lineHeight: 1.6,
              background:  range === r.id ? 'var(--claude)' : '#fff',
              color:       range === r.id ? '#fff' : 'var(--tx)',
              borderColor: range === r.id ? 'var(--claude)' : 'var(--bd)',
              transition: 'all .1s',
            }}>
              {r.label}
            </button>
          ))}
          {loading && (
            <span style={{ fontSize: 11, color: 'var(--tx-4)', marginLeft: 4, fontStyle: 'italic' }}>Updating…</span>
          )}
        </div>
        <div style={{ marginTop: 6, fontSize: 11, color: 'var(--tx-3)', fontVariantNumeric: 'tabular-nums' }}>
          {rangeLabel(range)}
        </div>
      </div>

      {/* ── Process flow bar ── */}
      <Card sm>
        <LabelCaps>Process flow · live status</LabelCaps>
        <div style={{
          display: 'flex', alignItems: 'center', overflowX: 'auto',
          paddingBottom: 2, gap: 0, scrollbarWidth: 'none',
        }}>
          {overview.map((d, i) => {
            const active = d.dept_id === currentDept
            const col = d.quality === 'ok' ? 'var(--ok)' : d.quality === 'warn' ? 'var(--warn)' : d.quality === 'bad' ? 'var(--bad)' : 'var(--tx-4)'
            return (
              <div key={d.dept_id} style={{ display: 'flex', alignItems: 'center' }}>
                <div
                  onClick={() => setCurrentDept(d.dept_id)}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    textAlign: 'center', padding: '9px 12px', minWidth: 86,
                    border: `1px solid ${active ? 'var(--claude)' : 'var(--bd)'}`,
                    borderRadius: 0, cursor: 'pointer',
                    background: active ? 'var(--bg-active)' : 'transparent',
                    transition: 'all .12s',
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: active ? 500 : 400, color: active ? 'var(--claude)' : 'var(--tx-2)' }}>{d.short}</div>
                  <div style={{ fontSize: 10, color: 'var(--tx-4)', marginTop: 2 }}>{d.target} {d.unit}</div>
                  <div style={{ fontSize: 11, marginTop: 4, fontWeight: 500, color: col }}>
                    {d.cv != null ? `${d.cv.toFixed(1)}%` : '—'}
                  </div>
                </div>
                {i < overview.length - 1 && (
                  <span style={{ padding: '0 4px', color: 'var(--tx-4)', fontSize: 11, flexShrink: 0 }}>›</span>
                )}
              </div>
            )
          })}
        </div>
      </Card>

      {/* ── Selected dept KPIs ── */}
      {dept && dept.n > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Primary metrics */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(126px, 1fr))', gap: 8 }}>
            <Metric label={`CV% (n=${dept.n})`}     value={`${dept.cv?.toFixed(2)}%`}  quality={dept.quality} />
            <Metric label="Cpk"                      value={dept.cpk?.toFixed(2) ?? '—'} quality={dept.cpk >= 1.33 ? 'ok' : dept.cpk >= 1 ? 'warn' : dept.cpk != null ? 'bad' : null} />
            <Metric label={`Mean (${dept.unit})`}    value={dept.mean?.toFixed(p)} />
            <Metric label="Cp"                       value={dept.cp?.toFixed(2) ?? '—'} />
            <Metric label="Std dev σ"                value={dept.sd?.toFixed(p + 1)} />
            <Metric label={`Target (${dept.unit})`}  value={dept.target} />
          </div>
          {/* Control limits — subdued row */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(126px, 1fr))', gap: 8,
            padding: '12px 14px',
            background: 'var(--bg)',
            border: '1px solid var(--bd)',
            borderRadius: 'var(--r-lg)',
          }}>
            <div style={{ gridColumn: '1 / -1', fontSize: 10, fontWeight: 600, color: 'var(--tx-4)', letterSpacing: '.07em', textTransform: 'uppercase', marginBottom: 6 }}>
              Control limits
            </div>
            <Metric label="UCL (3σ)"    value={dept.ucl?.toFixed(p)} large />
            <Metric label="LCL (3σ)"    value={dept.lcl?.toFixed(p)} large />
            <Metric label="Warn + (2σ)" value={dept.wul?.toFixed(p)} large />
            <Metric label="Warn − (2σ)" value={dept.wll?.toFixed(p)} large />
          </div>
        </div>
      ) : (
        <div style={{
          padding: '18px 20px',
          border: '1px solid var(--bd)',
          borderRadius: 'var(--r-lg)',
          background: 'var(--bg)',
          color: 'var(--tx-4)', fontSize: 13, textAlign: 'center',
        }}>
          No data for <strong style={{ fontWeight: 500, color: 'var(--tx-3)' }}>{dept?.name ?? '—'}</strong> in the selected time range.
        </div>
      )}

      {/* ── Department summary — Notion-style database table ── */}
      <Card sm>
        <LabelCaps style={{ marginBottom: 12 }}>Department summary</LabelCaps>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <TH>Department</TH>
              <TH right>Samples</TH>
              <TH right>Mean</TH>
              <TH right>CV%</TH>
              <TH right>Cpk</TH>
              <TH right>Cp</TH>
              <TH>Status</TH>
            </tr>
          </thead>
          <tbody>
            {overview.map((d, i) => {
              const isActive  = d.dept_id === currentDept
              const isLast    = i === overview.length - 1
              const rowBd     = isLast ? 'none' : '1px solid var(--bd)'
              const qDot      = d.quality === 'ok' ? 'var(--ok)' : d.quality === 'warn' ? 'var(--warn)' : d.quality === 'bad' ? 'var(--bad)' : 'var(--tx-4)'
              const qCol      = d.quality === 'ok' ? 'var(--ok)' : d.quality === 'warn' ? 'var(--warn)' : d.quality === 'bad' ? 'var(--bad)' : null

              const rowBgBase = i % 2 === 0 ? '#fff' : '#fafafa'
              const rowStyle = {
                cursor: 'pointer',
                background: isActive ? '#f0f4ff' : rowBgBase,
                transition: 'background .1s',
              }
              const hoverOn  = e => { if (!isActive) e.currentTarget.style.background = '#f0f4ff' }
              const hoverOff = e => { if (!isActive) e.currentTarget.style.background = rowBgBase }

              if (d.n === 0) return (
                <tr key={d.dept_id} onClick={() => setCurrentDept(d.dept_id)}
                  style={rowStyle} onMouseEnter={hoverOn} onMouseLeave={hoverOff}>
                  <td style={{ padding: '5px 8px', borderBottom: '1px solid #eaeaea', borderRight: '1px solid #eaeaea', borderLeft: isActive ? '3px solid var(--claude)' : '3px solid transparent', fontSize: 12, color: '#1d1d1d', fontWeight: isActive ? 500 : 400 }}>
                    {d.name}
                  </td>
                  <td colSpan={6} style={{ padding: '5px 8px', borderBottom: '1px solid #eaeaea', color: '#8c8c8c', fontSize: 12, fontStyle: 'italic' }}>
                    No data recorded
                  </td>
                </tr>
              )

              const pp = d.target >= 10 ? 2 : 4
              return (
                <tr key={d.dept_id} onClick={() => setCurrentDept(d.dept_id)}
                  style={rowStyle} onMouseEnter={hoverOn} onMouseLeave={hoverOff}>
                  {/* Department name — left border indicates active */}
                  <td style={{ padding: '5px 8px', borderBottom: '1px solid #eaeaea', borderRight: '1px solid #eaeaea', borderLeft: isActive ? '3px solid var(--claude)' : '3px solid transparent', fontSize: 12, fontWeight: isActive ? 500 : 400, color: isActive ? 'var(--claude)' : '#1d1d1d' }}>
                    {d.name}
                  </td>
                  {/* Numeric columns — monospace, right-aligned, regular weight */}
                  <td style={{ padding: '5px 8px', borderBottom: '1px solid #eaeaea', borderRight: '1px solid #eaeaea', fontFamily: 'var(--mono)', fontSize: 12, color: '#5a5a5a', textAlign: 'right' }}>{d.n}</td>
                  <td style={{ padding: '5px 8px', borderBottom: '1px solid #eaeaea', borderRight: '1px solid #eaeaea', fontFamily: 'var(--mono)', fontSize: 12, textAlign: 'right' }}>{d.mean?.toFixed(pp)}</td>
                  <td style={{ padding: '5px 8px', borderBottom: '1px solid #eaeaea', borderRight: '1px solid #eaeaea', fontFamily: 'var(--mono)', fontSize: 12, color: qCol ?? '#1d1d1d', fontWeight: 500, textAlign: 'right' }}>
                    {d.cv != null ? `${d.cv.toFixed(2)}%` : '—'}
                  </td>
                  <td style={{ padding: '5px 8px', borderBottom: '1px solid #eaeaea', borderRight: '1px solid #eaeaea', fontFamily: 'var(--mono)', fontSize: 12, textAlign: 'right' }}>{d.cpk?.toFixed(2) ?? '—'}</td>
                  <td style={{ padding: '5px 8px', borderBottom: '1px solid #eaeaea', borderRight: '1px solid #eaeaea', fontFamily: 'var(--mono)', fontSize: 12, color: '#5a5a5a', textAlign: 'right' }}>{d.cp?.toFixed(2) ?? '—'}</td>
                  {/* Status badge */}
                  <td style={{ padding: '5px 8px', borderBottom: '1px solid #eaeaea' }}>
                    {d.quality && <Badge variant={d.quality}>{qualityLabel[d.quality]}</Badge>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Card>

    </div>
  )
}
