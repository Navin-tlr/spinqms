import { useState, useEffect, useCallback } from 'react'
import { Card, LabelCaps, Badge, Metric, TblWrap, qualityLabel } from '../Primitives.jsx'
import { getOverview } from '../../api.js'

/* ── Time range config ──────────────────────────────────────────────────── */
const RANGES = [
  { id: 'shift',   label: 'Past Shift',   hours: 8   },
  { id: '24h',     label: 'Past 24 h',    hours: 24  },
  { id: 'week',    label: 'Past Week',    hours: 168 },
  { id: 'month',   label: 'Past Month',   hours: 720 },
  { id: 'all',     label: 'All Time',     hours: null },
]

function rangeParams(id) {
  const r = RANGES.find(x => x.id === id)
  if (!r || r.hours == null) return {}
  const from = new Date(Date.now() - r.hours * 3600 * 1000).toISOString()
  return { date_from: from }
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

  useEffect(() => {
    if (range === 'all') setOverview(propOverview)
  }, [propOverview, range])

  const handleRange = (id) => {
    setRange(id)
    localStorage.setItem('spinqms_ov_range', id)
  }

  const dept = overview.find(o => o.dept_id === currentDept)
  const p    = dept?.target >= 10 ? 2 : 4

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Time range selector ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
        padding: '10px 16px',
        background: 'var(--bg)', border: '1px solid var(--bd)', borderRadius: 'var(--r-lg)',
      }}>
        <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--tx-3)', marginRight: 4, flexShrink: 0 }}>
          Time range
        </span>
        {RANGES.map(r => (
          <button key={r.id} onClick={() => handleRange(r.id)} style={{
            padding: '4px 14px', fontSize: 11, fontWeight: range === r.id ? 600 : 400,
            border: '1.5px solid', borderRadius: 20, cursor: 'pointer',
            fontFamily: 'var(--font)', transition: 'all .12s', lineHeight: 1,
            background:  range === r.id ? 'var(--claude)' : 'transparent',
            color:       range === r.id ? '#fff' : 'var(--tx-2)',
            borderColor: range === r.id ? 'var(--claude)' : 'var(--bd-md)',
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
        <div style={{ display: 'flex', alignItems: 'center', overflowX: 'auto', paddingBottom: 4, gap: 0, scrollbarWidth: 'none' }}>
          {overview.map((d, i) => {
            const active = d.dept_id === currentDept
            const col = d.quality === 'ok' ? 'var(--ok)' : d.quality === 'warn' ? 'var(--warn)' : d.quality === 'bad' ? 'var(--bad)' : 'var(--tx-4)'
            return (
              <div key={d.dept_id} style={{ display: 'flex', alignItems: 'center' }}>
                <div
                  onClick={() => setCurrentDept(d.dept_id)}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
                    padding: '10px 13px', minWidth: 90,
                    border: `1px solid ${active ? 'var(--tx)' : 'var(--bd)'}`,
                    borderRadius: 'var(--r)', cursor: 'pointer',
                    background: active ? 'var(--bg-2)' : 'var(--bg)',
                    transition: 'all .12s',
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 500 }}>{d.short}</div>
                  <div style={{ fontSize: 10, color: 'var(--tx-3)', marginTop: 2 }}>{d.target} {d.unit}</div>
                  <div style={{ fontSize: 11, marginTop: 3, fontWeight: 500, color: col }}>
                    {d.cv != null ? `${d.cv.toFixed(1)}%` : '—'}
                  </div>
                </div>
                {i < overview.length - 1 && (
                  <span style={{ padding: '0 5px', color: 'var(--tx-4)', fontSize: 12, flexShrink: 0 }}>→</span>
                )}
              </div>
            )
          })}
        </div>
      </Card>

      {/* ── Selected dept KPIs ── */}
      {dept && dept.n > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Row 1 — primary performance metrics */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10 }}>
            <Metric label={`CV% (n=${dept.n})`}    value={`${dept.cv?.toFixed(2)}%`}  quality={dept.quality} />
            <Metric label="Cpk"                     value={dept.cpk?.toFixed(2) ?? '—'} quality={dept.cpk >= 1.33 ? 'ok' : dept.cpk >= 1 ? 'warn' : dept.cpk != null ? 'bad' : null} />
            <Metric label={`Mean (${dept.unit})`}   value={dept.mean?.toFixed(p)} />
            <Metric label="Cp"                      value={dept.cp?.toFixed(2) ?? '—'} />
            <Metric label="Std dev σ"               value={dept.sd?.toFixed(p + 1)} />
            <Metric label={`Target (${dept.unit})`} value={dept.target} />
          </div>
          {/* Row 2 — control limits (collapsible-feel via subdued styling) */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10,
            padding: '10px 12px', background: 'var(--bg-2)',
            border: '1px solid var(--bd)', borderRadius: 'var(--r)',
          }}>
            <div style={{ gridColumn: '1 / -1', fontSize: 10, fontWeight: 700, color: 'var(--tx-4)', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 4 }}>
              Control limits
            </div>
            <Metric label="UCL (3σ)"   value={dept.ucl?.toFixed(p)} large />
            <Metric label="LCL (3σ)"   value={dept.lcl?.toFixed(p)} large />
            <Metric label="Warn + (2σ)" value={dept.wul?.toFixed(p)} large />
            <Metric label="Warn − (2σ)" value={dept.wll?.toFixed(p)} large />
          </div>
        </div>
      ) : (
        <div style={{
          padding: '20px 24px', border: '1px solid var(--bd)', borderRadius: 'var(--r)',
          background: 'var(--bg-2)', color: 'var(--tx-4)', fontSize: 13, textAlign: 'center',
        }}>
          No data for {dept?.name ?? '—'} in the selected time range.
        </div>
      )}

      {/* ── Department summary table ── */}
      <Card sm>
        <LabelCaps>Department summary</LabelCaps>
        <TblWrap>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {['Department', 'n', 'Mean', 'CV%', 'Cpk', 'Cp', 'Status'].map(h => (
                  <th key={h} style={{
                    padding: '8px 12px', textAlign: 'left', fontSize: 10, fontWeight: 600,
                    color: 'var(--tx-3)', letterSpacing: '.05em', textTransform: 'uppercase',
                    borderBottom: '2px solid var(--bd-md)', whiteSpace: 'nowrap',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {overview.map((d, i) => {
                const isActive = d.dept_id === currentDept
                if (d.n === 0) return (
                  <tr key={d.dept_id} onClick={() => setCurrentDept(d.dept_id)}
                    style={{ cursor: 'pointer', background: isActive ? 'var(--bg-active)' : i % 2 === 0 ? 'var(--bg)' : 'var(--bg-2)' }}>
                    <td style={{ padding: '9px 12px', borderBottom: '1px solid var(--bd)', fontWeight: isActive ? 600 : 400 }}>{d.name}</td>
                    <td colSpan={6} style={{ padding: '9px 12px', color: 'var(--tx-4)', fontSize: 12, borderBottom: '1px solid var(--bd)', fontStyle: 'italic' }}>No data</td>
                  </tr>
                )
                const pp = d.target >= 10 ? 2 : 4
                const qCol = d.quality === 'ok' ? 'var(--ok)' : d.quality === 'warn' ? 'var(--warn)' : 'var(--bad)'
                return (
                  <tr key={d.dept_id} onClick={() => setCurrentDept(d.dept_id)}
                    style={{ cursor: 'pointer', background: isActive ? 'var(--bg-active)' : i % 2 === 0 ? 'var(--bg)' : 'var(--bg-2)', transition: 'background .1s' }}>
                    <td style={{ padding: '9px 12px', borderBottom: '1px solid var(--bd)', fontWeight: isActive ? 700 : 400 }}>{d.name}</td>
                    <td style={{ padding: '9px 12px', fontFamily: 'var(--mono)', fontSize: 12, borderBottom: '1px solid var(--bd)', color: 'var(--tx-3)' }}>{d.n}</td>
                    <td style={{ padding: '9px 12px', fontFamily: 'var(--mono)', fontSize: 12, borderBottom: '1px solid var(--bd)' }}>{d.mean?.toFixed(pp)}</td>
                    <td style={{ padding: '9px 12px', fontFamily: 'var(--mono)', fontSize: 12, borderBottom: '1px solid var(--bd)', color: qCol, fontWeight: 600 }}>{d.cv?.toFixed(2)}%</td>
                    <td style={{ padding: '9px 12px', fontFamily: 'var(--mono)', fontSize: 12, borderBottom: '1px solid var(--bd)' }}>{d.cpk?.toFixed(2) ?? '—'}</td>
                    <td style={{ padding: '9px 12px', fontFamily: 'var(--mono)', fontSize: 12, borderBottom: '1px solid var(--bd)', color: 'var(--tx-3)' }}>{d.cp?.toFixed(2) ?? '—'}</td>
                    <td style={{ padding: '9px 12px', borderBottom: '1px solid var(--bd)' }}>
                      <Badge variant={d.quality}>{qualityLabel[d.quality]}</Badge>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </TblWrap>
      </Card>

    </div>
  )
}
