import { useState, useEffect, useCallback } from 'react'
import { Card, LabelCaps, Badge, Metric, qualityLabel } from '../Primitives.jsx'
import { getOverview } from '../../api.js'

/* ── Time range config ──────────────────────────────────────────────────── */
const RANGES = [
  { id: 'shift',  label: 'Past Shift',  hours: 8    },
  { id: '24h',    label: 'Past 24 h',   hours: 24   },
  { id: 'week',   label: 'Past Week',   hours: 168  },
  { id: 'month',  label: 'Past Month',  hours: 720  },
  { id: 'all',    label: 'All Time',    hours: null  },
]

function rangeParams(id) {
  const r = RANGES.find(x => x.id === id)
  if (!r || r.hours == null) return {}
  return { date_from: new Date(Date.now() - r.hours * 3600 * 1000).toISOString() }
}

/* ── Table header cell ──────────────────────────────────────────────────── */
function TH({ children, right }) {
  return (
    <th style={{
      padding: right ? '0 0 10px 12px' : '0 0 10px',
      textAlign: right ? 'right' : 'left',
      fontSize: 10, fontWeight: 600,
      color: 'var(--tx-4)',
      letterSpacing: '.08em', textTransform: 'uppercase',
      borderBottom: '1px solid var(--bd-md)',
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* ── Time range selector ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
        padding: '9px 14px',
        background: 'var(--bg)',
        border: '1px solid var(--bd-md)',
        borderRadius: 'var(--r-lg)',
      }}>
        <span style={{
          fontSize: 10, fontWeight: 600, letterSpacing: '.08em',
          textTransform: 'uppercase', color: 'var(--tx-4)',
          marginRight: 6, flexShrink: 0,
        }}>
          Time range
        </span>
        {RANGES.map(r => (
          <button key={r.id} onClick={() => handleRange(r.id)} style={{
            padding: '3px 12px', fontSize: 11, fontWeight: range === r.id ? 600 : 400,
            border: '1px solid', borderRadius: 20, cursor: 'pointer',
            fontFamily: 'var(--font)', transition: 'all .12s', lineHeight: 1.6,
            background:  range === r.id ? 'var(--tx)' : 'transparent',
            color:       range === r.id ? 'var(--bg)' : 'var(--tx-2)',
            borderColor: range === r.id ? 'var(--tx)' : 'var(--bd-md)',
          }}>
            {r.label}
          </button>
        ))}
        {loading && (
          <span style={{ fontSize: 11, color: 'var(--tx-4)', marginLeft: 4, fontStyle: 'italic' }}>Updating…</span>
        )}
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
                    border: `1px solid ${active ? 'var(--bd-hv)' : 'var(--bd)'}`,
                    borderRadius: 'var(--r)', cursor: 'pointer',
                    background: active ? 'var(--bg-active)' : 'transparent',
                    transition: 'all .12s',
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: active ? 500 : 400, color: active ? 'var(--tx)' : 'var(--tx-2)' }}>{d.short}</div>
                  <div style={{ fontSize: 10, color: 'var(--tx-4)', marginTop: 2 }}>{d.target} {d.unit}</div>
                  <div style={{ fontSize: 11.5, marginTop: 4, fontWeight: 600, color: col }}>
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

              const rowStyle = {
                cursor: 'pointer',
                background: isActive ? 'var(--bg-active)' : 'transparent',
                transition: 'background .1s',
                borderRadius: 'var(--r)',
              }
              const hoverOn  = e => { if (!isActive) e.currentTarget.style.background = 'var(--bg-hover)' }
              const hoverOff = e => { if (!isActive) e.currentTarget.style.background = 'transparent' }

              if (d.n === 0) return (
                <tr key={d.dept_id} onClick={() => setCurrentDept(d.dept_id)}
                  style={rowStyle} onMouseEnter={hoverOn} onMouseLeave={hoverOff}>
                  <td style={{ padding: '9px 0', borderBottom: rowBd }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--tx-4)', flexShrink: 0 }} />
                      <span style={{ fontSize: 13, color: 'var(--tx-3)', fontWeight: isActive ? 500 : 400 }}>{d.name}</span>
                    </div>
                  </td>
                  <td colSpan={6} style={{ padding: '9px 0', borderBottom: rowBd, color: 'var(--tx-4)', fontSize: 11.5, fontStyle: 'italic', paddingLeft: 12 }}>
                    No data
                  </td>
                </tr>
              )

              const pp = d.target >= 10 ? 2 : 4
              return (
                <tr key={d.dept_id} onClick={() => setCurrentDept(d.dept_id)}
                  style={rowStyle} onMouseEnter={hoverOn} onMouseLeave={hoverOff}>
                  {/* Department name + quality dot */}
                  <td style={{ padding: '10px 0', borderBottom: rowBd }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: qDot, flexShrink: 0 }} />
                      <span style={{ fontSize: 13, fontWeight: isActive ? 500 : 400 }}>{d.name}</span>
                    </div>
                  </td>
                  {/* Numeric columns — monospace, right-aligned */}
                  <td style={{ padding: '10px 0 10px 12px', borderBottom: rowBd, fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--tx-3)', textAlign: 'right' }}>{d.n}</td>
                  <td style={{ padding: '10px 0 10px 12px', borderBottom: rowBd, fontFamily: 'var(--mono)', fontSize: 12, textAlign: 'right' }}>{d.mean?.toFixed(pp)}</td>
                  <td style={{ padding: '10px 0 10px 12px', borderBottom: rowBd, fontFamily: 'var(--mono)', fontSize: 12.5, color: qCol ?? 'var(--tx)', fontWeight: 600, textAlign: 'right' }}>
                    {d.cv != null ? `${d.cv.toFixed(2)}%` : '—'}
                  </td>
                  <td style={{ padding: '10px 0 10px 12px', borderBottom: rowBd, fontFamily: 'var(--mono)', fontSize: 12, textAlign: 'right' }}>{d.cpk?.toFixed(2) ?? '—'}</td>
                  <td style={{ padding: '10px 0 10px 12px', borderBottom: rowBd, fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--tx-3)', textAlign: 'right' }}>{d.cp?.toFixed(2) ?? '—'}</td>
                  {/* Status badge */}
                  <td style={{ padding: '10px 0 10px 14px', borderBottom: rowBd }}>
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
