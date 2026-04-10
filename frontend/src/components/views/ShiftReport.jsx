import { useState, useEffect } from 'react'
import { Card, LabelCaps, Badge, TblWrap, FmlBox, Empty } from '../Primitives.jsx'
import { getOverview } from '../../api.js'

export default function ShiftReport() {
  const [shift, setShift] = useState('A')
  const [data, setData]   = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    getOverview(shift === 'ALL' ? null : shift).then(setData).finally(() => setLoading(false))
  }, [shift])

  return (
    <>
      <Card sm>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:8, marginBottom:14 }}>
          <LabelCaps className="!mb-0">Shift quality report</LabelCaps>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            {['A','B','C','ALL'].map(s => (
              <button key={s}
                onClick={() => setShift(s)}
                style={{
                  padding:'5px 14px', fontSize:12, border:'1px solid', borderRadius:20, cursor:'pointer',
                  background: shift===s ? 'var(--tx)' : 'transparent',
                  color: shift===s ? 'var(--bg)' : 'var(--tx-2)',
                  borderColor: shift===s ? 'var(--tx)' : 'var(--bd-md)',
                  fontFamily:'var(--font)',
                }}
              >{s === 'ALL' ? 'All Shifts' : `Shift ${s}`}</button>
            ))}
          </div>
        </div>
        <TblWrap>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead>
              <tr>
                {['Department','n','Avg weight','Mean hank (x̄)','σ','CV%','Cpk','Cp','UCL (3σ)','LCL (3σ)','Status'].map(h => (
                  <th key={h} style={{ padding:'8px 12px', textAlign:'left', fontSize:10, fontWeight:600, color:'var(--tx-3)', letterSpacing:'.05em', textTransform:'uppercase', borderBottom:'1px solid var(--bd-md)', whiteSpace:'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map(d => {
                if (d.n === 0) return (
                  <tr key={d.dept_id}>
                    <td style={{ padding:'9px 12px', borderBottom:'1px solid var(--bd)' }}>{d.name}</td>
                    <td colSpan={10} style={{ padding:'9px 12px', color:'var(--tx-3)', fontSize:12, borderBottom:'1px solid var(--bd)' }}>No data for selected shift</td>
                  </tr>
                )
                const p = d.target >= 10 ? 2 : 4
                const qCol = d.quality === 'ok' ? 'var(--ok)' : d.quality === 'warn' ? 'var(--warn)' : 'var(--bad)'
                const avgW = d.mean ? ((d.target >= 10 ? 120 : 6) * 0.54 / d.mean).toFixed(2) : '—'
                return (
                  <tr key={d.dept_id}>
                    <td style={{ padding:'9px 12px', borderBottom:'1px solid var(--bd)' }}>{d.name}</td>
                    <td style={{ padding:'9px 12px', fontFamily:'var(--mono)', fontSize:12, borderBottom:'1px solid var(--bd)' }}>{d.n}</td>
                    <td style={{ padding:'9px 12px', fontFamily:'var(--mono)', fontSize:12, borderBottom:'1px solid var(--bd)' }}>{avgW} g*</td>
                    <td style={{ padding:'9px 12px', fontFamily:'var(--mono)', fontSize:12, borderBottom:'1px solid var(--bd)' }}>{d.mean?.toFixed(p+2)}</td>
                    <td style={{ padding:'9px 12px', fontFamily:'var(--mono)', fontSize:12, borderBottom:'1px solid var(--bd)' }}>{d.sd?.toFixed(p+3)}</td>
                    <td style={{ padding:'9px 12px', fontWeight:500, borderBottom:'1px solid var(--bd)', color:qCol }}>{d.cv?.toFixed(3)}%</td>
                    <td style={{ padding:'9px 12px', fontFamily:'var(--mono)', fontSize:12, borderBottom:'1px solid var(--bd)', color:qCol }}>{d.cpk?.toFixed(3) ?? '—'}</td>
                    <td style={{ padding:'9px 12px', fontFamily:'var(--mono)', fontSize:12, borderBottom:'1px solid var(--bd)' }}>{d.cp?.toFixed(3) ?? '—'}</td>
                    <td style={{ padding:'9px 12px', fontFamily:'var(--mono)', fontSize:12, borderBottom:'1px solid var(--bd)' }}>{d.ucl?.toFixed(p+2)}</td>
                    <td style={{ padding:'9px 12px', fontFamily:'var(--mono)', fontSize:12, borderBottom:'1px solid var(--bd)' }}>{d.lcl?.toFixed(p+2)}</td>
                    <td style={{ padding:'9px 12px', borderBottom:'1px solid var(--bd)' }}>
                      <Badge variant={d.quality}>{d.quality === 'ok' ? 'In control' : d.quality === 'warn' ? 'Warning' : 'Action'}</Badge>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </TblWrap>
      </Card>

      <Card sm>
        <LabelCaps>Formula reference — ISO 11462-1 validated</LabelCaps>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }} className="max-[720px]:!grid-cols-1">
          <FmlBox>{`Ne (hank count) = (L × 0.54) / W_grams\nwhere L = sample length (yards)\n      W = weight (grams)\nDerivation: Ne = L / (840 × W_lbs)\n           = L × 453.592 / (840 × W_g)\n           = L × 0.5400 / W_g  ✓`}</FmlBox>
          <FmlBox>{`CV%  = (σ / x̄) × 100\nσ    = √[Σ(xᵢ-x̄)²/(n-1)]   [sample]\nCpk  = min[(USL-x̄)/3σ, (x̄-LSL)/3σ]\nCp   = (USL-LSL) / 6σ\nUCL  = x̄ + 3σ/√n\nLCL  = x̄ - 3σ/√n\nWL±  = x̄ ± 2σ/√n`}</FmlBox>
        </div>
      </Card>
    </>
  )
}
