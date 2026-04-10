import { useState } from 'react'
import { Card, LabelCaps, Badge, FmlBox, TblWrap, Btn, Empty } from '../Primitives.jsx'
import { calcIrregularity, predictRF } from '../../api.js'

export default function UsterBenchmarks({ usterData }) {
  const [iiCv, setIiCv]   = useState('')
  const [iiNe, setIiNe]   = useState('47')
  const [iiFl, setIiFl]   = useState('28')
  const [iiRes, setIiRes] = useState(null)

  const [predCv, setPredCv]  = useState('')
  const [predRes, setPredRes] = useState(null)

  const handleCalcII = async () => {
    if (!iiCv) return
    try {
      const r = await calcIrregularity({ cv_actual: parseFloat(iiCv), ne: parseFloat(iiNe), fibre_length_mm: parseFloat(iiFl) })
      setIiRes(r)
    } catch {}
  }

  const handlePredictRF = async () => {
    if (!predCv) return
    try {
      const r = await predictRF({ cv_carding: parseFloat(predCv) })
      setPredRes(r)
    } catch {}
  }

  return (
    <>
      <Card sm>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:8, marginBottom:14 }}>
          <LabelCaps className="!mb-0">Uster Statistics 2023 — Ne 47 weft benchmarks</LabelCaps>
          <Badge variant="purple">★ Target: Uster 25th percentile</Badge>
        </div>
        <TblWrap>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead>
              <tr>
                {['Stage','5% (Best)','25% ★','50% Median','75%','95%','Your CV%','Rank'].map(h => (
                  <th key={h} style={{ padding:'8px 12px', textAlign:'left', fontSize:10, fontWeight:600, color:'var(--tx-3)', letterSpacing:'.05em', textTransform:'uppercase', borderBottom:'1px solid var(--bd-md)', whiteSpace:'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {usterData.map(row => (
                <tr key={row.dept_id}>
                  <td style={{ padding:'9px 12px', borderBottom:'1px solid var(--bd)' }}>{row.name}</td>
                  <td style={{ padding:'9px 12px', borderBottom:'1px solid var(--bd)', fontFamily:'var(--mono)', fontSize:12 }}>{row.uster.p5}%</td>
                  <td style={{ padding:'9px 12px', borderBottom:'1px solid var(--bd)', fontFamily:'var(--mono)', fontSize:12 }}>{row.uster.p25}%</td>
                  <td style={{ padding:'9px 12px', borderBottom:'1px solid var(--bd)', fontFamily:'var(--mono)', fontSize:12 }}>{row.uster.p50}%</td>
                  <td style={{ padding:'9px 12px', borderBottom:'1px solid var(--bd)', fontFamily:'var(--mono)', fontSize:12 }}>{row.uster.p75}%</td>
                  <td style={{ padding:'9px 12px', borderBottom:'1px solid var(--bd)', fontFamily:'var(--mono)', fontSize:12 }}>{row.uster.p95}%</td>
                  <td style={{ padding:'9px 12px', borderBottom:'1px solid var(--bd)', fontFamily:'var(--mono)', fontSize:12 }}>
                    {row.cv != null ? `${row.cv.toFixed(2)}%` : '—'}
                  </td>
                  <td style={{ padding:'9px 12px', borderBottom:'1px solid var(--bd)' }}>
                    {row.rank ? <Badge variant={row.quality}>{row.rank}</Badge> : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TblWrap>
      </Card>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }} className="max-[720px]:!grid-cols-1">
        {/* Index of Irregularity */}
        <Card sm>
          <LabelCaps>Index of Irregularity (I)</LabelCaps>
          <FmlBox className="mb-3.5">
            {`I = CV_actual / CV_theoretical\nCV_th = 100 / √(2 · Ne · L(cm) · ρ)\nρ = 1.52 g/cm³ (cotton fibre density)\n──────────────────────────────\nI < 1.1  → Excellent (near ideal)\nI 1.1–1.3 → Acceptable\nI > 1.3  → Machine irregularity`}
          </FmlBox>
          <div style={{ display:'flex', alignItems:'flex-end', gap:10, flexWrap:'wrap' }}>
            <Field label="CV actual %"   value={iiCv} onChange={setIiCv} width={90} />
            <Field label="Ne count"      value={iiNe} onChange={setIiNe} width={72} />
            <Field label="Fibre L (mm)"  value={iiFl} onChange={setIiFl} width={80} />
            <Btn onClick={handleCalcII}>Calculate</Btn>
          </div>
          {iiRes && (
            <div style={{ marginTop:12, display:'flex', alignItems:'center', gap:10, flexWrap:'wrap', fontSize:13 }}>
              <span style={{ color:'var(--tx-2)', fontSize:12 }}>CV theoretical = {iiRes.cv_theoretical.toFixed(2)}%</span>
              <Badge variant={iiRes.status} className="text-[12px] px-3 py-1">I = {iiRes.ii.toFixed(3)}</Badge>
              <span style={{ color:'var(--tx-2)', fontSize:12 }}>{iiRes.msg}</span>
            </div>
          )}
        </Card>

        {/* Upstream prediction */}
        <Card sm>
          <LabelCaps>Upstream → Ring Frame prediction</LabelCaps>
          <FmlBox className="mb-3">
            {`CV_RF ≈ √(CV_card² + CV_draw² + CV_simp²)\n[Root Sum of Squares — variance additive model]`}
          </FmlBox>
          <div style={{ display:'flex', alignItems:'flex-end', gap:10, flexWrap:'wrap' }}>
            <Field label="Carding CV%" value={predCv} onChange={setPredCv} width={90} />
            <Btn onClick={handlePredictRF}>Predict →</Btn>
          </div>
          {predRes && (
            <div style={{ marginTop:12, display:'flex', alignItems:'center', gap:10, flexWrap:'wrap', fontSize:13 }}>
              <Badge variant={predRes.quality} className="text-[12px] px-3 py-1">Predicted CV%: {predRes.predicted_cv.toFixed(2)}%</Badge>
              <span style={{ color:'var(--tx-2)', fontSize:12 }}>
                Drawing: {predRes.cv_drawing.toFixed(1)}% · Simplex: {predRes.cv_simplex.toFixed(1)}% · Target (Uster 25th): {predRes.target_p25}%
              </span>
            </div>
          )}
        </Card>
      </div>
    </>
  )
}

function Field({ label, value, onChange, width }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
      <label style={{ fontSize:12, color:'var(--tx-2)' }}>{label}</label>
      <input
        type="number" value={value} onChange={e => onChange(e.target.value)}
        style={{ width, padding:'7px 10px', border:'1px solid var(--bd-md)', borderRadius:'var(--r)', fontSize:13, fontFamily:'var(--font)', background:'var(--bg)', color:'var(--tx)' }}
      />
    </div>
  )
}
