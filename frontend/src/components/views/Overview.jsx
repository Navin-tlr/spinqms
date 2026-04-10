import { useState, useEffect, useCallback } from 'react'
import { Card, LabelCaps, Badge, Alert, Metric, TblWrap, Empty, qualityLabel } from '../Primitives.jsx'
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

export default function Overview({ overview: propOverview, alerts, currentDept, setCurrentDept }) {
  const [range,    setRange]    = useState(() => localStorage.getItem('spinqms_ov_range') || 'all')
  const [overview, setOverview] = useState(propOverview)
  const [loading,  setLoading]  = useState(false)

  /* Re-fetch when range changes */
  const fetchOverview = useCallback((r) => {
    setLoading(true)
    getOverview(rangeParams(r))
      .then(data => setOverview(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    fetchOverview(range)
  }, [range, fetchOverview])

  /* Sync prop changes (e.g. after a new save triggers parent refresh) */
  useEffect(() => {
    if (range === 'all') setOverview(propOverview)
  }, [propOverview, range])

  const handleRange = (id) => {
    setRange(id)
    localStorage.setItem('spinqms_ov_range', id)
  }

  const icons  = { ok: '✓', warn: '⚠', bad: '✕', info: 'ℹ' }

  return (
    <>
      {/* ── Time Range Selector ── */}
      <div style={{
        display:'flex', alignItems:'center', gap:6, flexWrap:'wrap',
        padding:'10px 16px',
        background:'var(--bg)', border:'1px solid var(--bd)', borderRadius:'var(--r-lg)',
      }}>
        <span style={{ fontSize:10, fontWeight:600, letterSpacing:'.08em', textTransform:'uppercase', color:'var(--tx-3)', marginRight:4, flexShrink:0 }}>
          Time range
        </span>
        {RANGES.map(r => (
          <button key={r.id} onClick={() => handleRange(r.id)} style={{
            padding:'4px 14px', fontSize:11, fontWeight: range === r.id ? 600 : 400,
            border:'1.5px solid', borderRadius:20, cursor:'pointer',
            fontFamily:'var(--font)', transition:'all .12s', lineHeight:1,
            background:   range === r.id ? 'var(--claude)' : 'transparent',
            color:        range === r.id ? '#fff' : 'var(--tx-2)',
            borderColor:  range === r.id ? 'var(--claude)' : 'var(--bd-md)',
          }}>
            {r.label}
          </button>
        ))}
        {loading && (
          <span style={{ fontSize:11, color:'var(--tx-4)', marginLeft:4, fontStyle:'italic' }}>Updating…</span>
        )}
        {range !== 'all' && (
          <span style={{ fontSize:11, color:'var(--tx-3)', marginLeft:'auto' }}>
            Showing data from {RANGES.find(r => r.id === range)?.label.toLowerCase()}
          </span>
        )}
      </div>

      {/* Process flow */}
      <Card sm>
        <LabelCaps>Process flow · live status</LabelCaps>
        <div style={{ display:'flex', alignItems:'center', overflowX:'auto', paddingBottom:8, gap:0, scrollbarWidth:'none', WebkitOverflowScrolling:'touch' }}>
          {overview.map((d, i) => {
            const active = d.dept_id === currentDept
            const col = d.quality === 'ok' ? 'var(--ok)' : d.quality === 'warn' ? 'var(--warn)' : d.quality === 'bad' ? 'var(--bad)' : 'var(--tx-4)'
            return (
              <>
                <div
                  key={d.dept_id}
                  onClick={() => setCurrentDept(d.dept_id)}
                  style={{
                    display:'flex', flexDirection:'column', alignItems:'center', textAlign:'center',
                    padding:'10px 13px', minWidth:90,
                    border:`1px solid ${active ? 'var(--tx)' : 'var(--bd)'}`,
                    borderRadius:'var(--r)', cursor:'pointer',
                    background: active ? 'var(--bg-2)' : 'var(--bg)',
                    transition:'all .12s',
                  }}
                >
                  <div style={{ fontSize:12, fontWeight:500 }}>{d.short}</div>
                  <div style={{ fontSize:10, color:'var(--tx-3)', marginTop:2 }}>{d.target} {d.unit}</div>
                  <div style={{ fontSize:11, marginTop:3, fontWeight:500, color:col }}>
                    {d.cv != null ? `${d.cv.toFixed(1)}%` : '—'}
                  </div>
                </div>
                {i < overview.length - 1 && (
                  <span key={`arr-${i}`} style={{ padding:'0 5px', color:'var(--tx-4)', fontSize:12, flexShrink:0 }}>→</span>
                )}
              </>
            )
          })}
        </div>
      </Card>

      {/* KPI grid */}
      {(() => {
        const d = overview.find(o => o.dept_id === currentDept)
        if (!d || d.n === 0) return (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(130px,1fr))', gap:10 }}>
            <Metric label={`No data for ${d?.name ?? '—'}`} value="—" />
          </div>
        )
        const p = d.target >= 10 ? 2 : 4
        return (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(130px,1fr))', gap:10 }}>
            <Metric label={`CV% (n=${d.n})`}  value={`${d.cv?.toFixed(2)}%`}           quality={d.quality} />
            <Metric label="Cpk"                value={d.cpk?.toFixed(2) ?? '—'}          quality={d.cpk >= 1.33 ? 'ok' : d.cpk >= 1 ? 'warn' : d.cpk != null ? 'bad' : null} />
            <Metric label={`Mean (${d.unit})`} value={d.mean?.toFixed(p)}                />
            <Metric label="Std dev σ"          value={d.sd?.toFixed(p+1)}               />
            <Metric label="Cp"                 value={d.cp?.toFixed(2) ?? '—'}          />
            <Metric label="UCL (3σ)"           value={d.ucl?.toFixed(p)} large />
            <Metric label="LCL (3σ)"           value={d.lcl?.toFixed(p)} large />
            <Metric label="Warn + (2σ)"        value={d.wul?.toFixed(p)} large />
            <Metric label="Warn − (2σ)"        value={d.wll?.toFixed(p)} large />
            <Metric label={`Target ${d.unit}`} value={d.target} />
          </div>
        )
      })()}

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }} className="max-[720px]:!grid-cols-1">
        {/* Alerts */}
        <Card sm>
          <LabelCaps>Active alerts · Western Electric Rules</LabelCaps>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {alerts.length === 0 ? (
              <Alert variant="info">All departments in control — no active alerts</Alert>
            ) : alerts.map((a, i) => (
              <Alert key={i} variant={a.severity}>{a.message}</Alert>
            ))}
          </div>
        </Card>

        {/* Summary table */}
        <Card sm>
          <LabelCaps>Department summary</LabelCaps>
          <TblWrap>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
              <thead>
                <tr>
                  {['Department','n','Mean hank','CV%','Cpk','Status'].map(h => (
                    <th key={h} style={{ padding:'8px 12px', textAlign:'left', fontSize:10, fontWeight:600, color:'var(--tx-3)', letterSpacing:'.05em', textTransform:'uppercase', borderBottom:'1px solid var(--bd-md)', whiteSpace:'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {overview.map(d => {
                  if (d.n === 0) return (
                    <tr key={d.dept_id}>
                      <td style={{ padding:'9px 12px', borderBottom:'1px solid var(--bd)' }}>{d.name}</td>
                      <td colSpan={5} style={{ padding:'9px 12px', color:'var(--tx-3)', fontSize:12, borderBottom:'1px solid var(--bd)' }}>No data</td>
                    </tr>
                  )
                  const p = d.target >= 10 ? 2 : 4
                  const qCol = d.quality === 'ok' ? 'var(--ok)' : d.quality === 'warn' ? 'var(--warn)' : 'var(--bad)'
                  return (
                    <tr key={d.dept_id} style={{ cursor:'pointer' }} onClick={() => setCurrentDept(d.dept_id)}>
                      <td style={{ padding:'9px 12px', borderBottom:'1px solid var(--bd)' }}>{d.name}</td>
                      <td style={{ padding:'9px 12px', fontFamily:'var(--mono)', fontSize:12, borderBottom:'1px solid var(--bd)' }}>{d.n}</td>
                      <td style={{ padding:'9px 12px', fontFamily:'var(--mono)', fontSize:12, borderBottom:'1px solid var(--bd)' }}>{d.mean?.toFixed(p)}</td>
                      <td style={{ padding:'9px 12px', borderBottom:'1px solid var(--bd)' }}>{d.cv?.toFixed(2)}%</td>
                      <td style={{ padding:'9px 12px', fontFamily:'var(--mono)', fontSize:12, borderBottom:'1px solid var(--bd)' }}>{d.cpk?.toFixed(2) ?? '—'}</td>
                      <td style={{ padding:'9px 12px', borderBottom:'1px solid var(--bd)' }}>
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
    </>
  )
}
