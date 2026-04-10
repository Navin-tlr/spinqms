import { Card, CardHeader, LabelCaps, Badge, Alert, Metric, TblWrap, Empty, qualityLabel } from '../Primitives.jsx'

export default function Overview({ overview, alerts, currentDept, setCurrentDept }) {
  const hasBad = alerts.some(a => a.severity === 'bad')
  const icons = { ok: '✓', warn: '⚠', bad: '✕', info: 'ℹ' }

  return (
    <>
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
