import { useState, useEffect, useMemo } from 'react'
import { Badge, Alert, Btn } from '../Primitives.jsx'
import { createSample, weightToHank, hankToWeight, decimalPlaces } from '../../api.js'

/* ── Machine number config per department ──────────────────────────────── */
const MACHINE_CONFIG = {
  ringframe: { max: 25, label: 'Frame #',    hint: 'Frames 1–25' },
  carding:   { max: 3,  label: 'Card #',     hint: 'Cards 1–3'   },
  simplex:   { max: 3,  label: 'Simplex #',  hint: 'Units 1–3'   },
}

/* ── Local stat helpers ───────────────────────────────────────────────── */
function calcStats(arr) {
  if (!arr || arr.length < 2) return null
  const n = arr.length, mean = arr.reduce((a,b) => a+b, 0) / n
  const sd = Math.sqrt(arr.reduce((a,b) => a + (b-mean)**2, 0) / (n-1))
  if (mean === 0) return null
  return { n, mean, sd, cv: (sd/mean)*100 }
}

const Q_C  = { ok:'var(--ok)',    warn:'var(--warn)',    bad:'var(--bad)'    }
const Q_BG = { ok:'var(--ok-bg)', warn:'var(--warn-bg)', bad:'var(--bad-bg)' }
const Q_BD = { ok:'var(--ok-bd)', warn:'var(--warn-bd)', bad:'var(--bad-bd)' }

/* ══════════════════════════════════════════════════════════════════════════
   DataEntry — main component
═══════════════════════════════════════════════════════════════════════════ */
export default function DataEntry({ depts, currentDept, setCurrentDept, onSaved }) {
  const [shift,        setShift]        = useState('A')
  const [mode,         setMode]         = useState('direct')
  const [sampleLen,    setSampleLen]    = useState(6)
  const [readings,     setReadings]     = useState(Array(9).fill(''))
  const [frameNum,     setFrameNum]     = useState('')
  const [result,       setResult]       = useState(null)
  const [loading,      setLoading]      = useState(false)
  const [errMsg,       setErrMsg]       = useState('')
  const [historical,   setHistorical]   = useState(false)     // historical entry mode
  const [historicalTs, setHistoricalTs] = useState('')        // datetime-local value

  const dept       = depts.find(d => d.id === currentDept) ?? depts[0]
  const target     = dept?.target ?? 0
  const usl        = dept?.usl ?? 0
  const lsl        = dept?.lsl ?? 0
  const p          = decimalPlaces(target)
  const machineConf = MACHINE_CONFIG[currentDept] ?? null   // null = no machine tracking
  const isRF       = currentDept === 'ringframe'             // kept for result callout label

  useEffect(() => { if (dept) setSampleLen(dept.def_len) }, [currentDept])

  const liveHanks = useMemo(() => readings
    .map(v => parseFloat(v)).filter(v => !isNaN(v) && v > 0)
    .map(v => mode === 'weight' ? weightToHank(v, sampleLen) : v),
    [readings, mode, sampleLen])
  const liveStats = useMemo(() => calcStats(liveHanks), [liveHanks])

  const placeholder = mode === 'weight'
    ? hankToWeight(target, sampleLen).toFixed(2) : target.toFixed(p)

  const inputStatus = v => {
    const num = parseFloat(v)
    if (!v || isNaN(num) || num <= 0) return 'empty'
    const h = mode === 'weight' ? weightToHank(num, sampleLen) : num
    return (h > usl || h < lsl) ? 'bad' : 'ok'
  }

  const expW    = hankToWeight(target, sampleLen)
  const expWMax = hankToWeight(lsl, sampleLen)
  const expWMin = hankToWeight(usl, sampleLen)

  const handleSave = async () => {
    const raw = readings.map(v => parseFloat(v)).filter(v => !isNaN(v) && v > 0)
    if (raw.length < 3) { setErrMsg('Enter at least 3 readings.'); return }
    if (machineConf && frameNum) {
      const fn = parseInt(frameNum)
      if (fn < 1 || fn > machineConf.max) {
        setErrMsg(`${machineConf.label} must be 1–${machineConf.max}.`); return
      }
    }
    if (historical && !historicalTs) { setErrMsg('Select a date and time for the historical entry.'); return }
    if (historical && historicalTs) {
      const ts = new Date(historicalTs)
      if (ts > new Date()) { setErrMsg('Historical timestamp cannot be in the future.'); return }
    }
    setErrMsg('')
    const hanks     = mode === 'weight' ? raw.map(w => weightToHank(w, sampleLen)) : raw
    const avgWeight = mode === 'weight' ? raw.reduce((a,b) => a+b, 0) / raw.length : null
    try {
      setLoading(true)
      const body = {
        dept_id: currentDept, shift,
        readings: hanks, avg_weight: avgWeight, sample_length: sampleLen,
      }
      if (machineConf && frameNum) body.frame_number = parseInt(frameNum)
      // datetime-local gives local time — append offset so backend receives unambiguous ISO-8601
      if (historical && historicalTs) {
        body.recorded_at = new Date(historicalTs).toISOString()
      }
      const saved = await createSample(body)
      setResult(saved)
      setReadings(Array(9).fill(''))
      setFrameNum('')
      onSaved()
    } catch (e) {
      setErrMsg(e.response?.data?.detail ?? 'Save failed')
    } finally { setLoading(false) }
  }

  const handleClear = () => {
    setReadings(Array(9).fill(''))
    setResult(null)
    setErrMsg('')
    setFrameNum('')
    setHistoricalTs('')
  }

  return (
    <>
      {/* ── Session ─── */}
      <Sect>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:10 }}>
          <div>
            <MicroLabel>Active shift</MicroLabel>
            <div style={{ fontSize:13, color:'var(--tx-3)', marginTop:2 }}>
              {dept?.name} · {dept?.frequency}
            </div>
          </div>
          <div style={{ display:'flex', gap:6 }}>
            {['A','B','C'].map(s => (
              <button key={s} onClick={() => setShift(s)} style={{
                padding:'5px 18px', fontSize:12, fontWeight: shift===s ? 600 : 400,
                border:'1.5px solid', borderRadius:20, cursor:'pointer', fontFamily:'var(--font)',
                transition:'all .12s',
                background: shift===s ? 'var(--claude)' : 'transparent',
                color:      shift===s ? '#fff' : 'var(--tx-2)',
                borderColor: shift===s ? 'var(--claude)' : 'var(--bd-md)',
              }}>Shift {s}</button>
            ))}
          </div>
        </div>

        {/* ── Historical entry toggle ── */}
        <div style={{ marginTop:12, paddingTop:12, borderTop:'1px solid var(--bd)', display:'flex', alignItems:'flex-start', justifyContent:'space-between', flexWrap:'wrap', gap:10 }}>
          <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', userSelect:'none' }}>
            <input
              type="checkbox"
              checked={historical}
              onChange={e => { setHistorical(e.target.checked); if (!e.target.checked) setHistoricalTs('') }}
              style={{ width:15, height:15, accentColor:'var(--claude)', cursor:'pointer' }}
            />
            <span style={{ fontSize:12, fontWeight:500, color:'var(--tx-2)' }}>Enter historical data</span>
            <span style={{ fontSize:11, color:'var(--tx-4)' }}>Record a batch from a past date &amp; time</span>
          </label>

          {historical && (
            <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
              <span style={ML}>Batch date &amp; time</span>
              <input
                type="datetime-local"
                value={historicalTs}
                max={new Date(Date.now() - 60000).toISOString().slice(0,16)}
                onChange={e => setHistoricalTs(e.target.value)}
                style={{
                  padding:'7px 10px', border:'1.5px solid var(--bd-md)', borderRadius:'var(--r)',
                  fontSize:13, fontFamily:'var(--mono)', background:'var(--bg)', color:'var(--tx)',
                  minWidth:210,
                }}
              />
              {historicalTs && (
                <span style={{ fontSize:10, color:'var(--claude)', fontWeight:500 }}>
                  Will be recorded as {new Date(historicalTs).toLocaleString()}
                </span>
              )}
            </div>
          )}
        </div>
      </Sect>

      {/* ── Measurement settings ─── */}
      <Sect>
        <MicroLabel>Measurement settings</MicroLabel>
        <div style={{ display:'grid', gridTemplateColumns: machineConf ? '1fr 1fr 1fr' : '1fr 1fr', gap:14, padding:'14px 16px', background:'var(--bg-2)', borderRadius:'var(--r)', border:'1px solid var(--bd)' }}>
          {/* Sample length */}
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            <span style={ML}>Sample length</span>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <input type="number" min="1" max="240" step="0.5" value={sampleLen}
                onChange={e => setSampleLen(parseFloat(e.target.value) || dept.def_len)}
                style={{ width:72, padding:'8px 10px', border:'1px solid var(--bd-md)', borderRadius:'var(--r)', fontSize:18, fontWeight:600, fontFamily:'var(--mono)', background:'var(--bg)', color:'var(--tx)', textAlign:'center' }} />
              <span style={{ fontSize:13, color:'var(--tx-2)', fontWeight:500 }}>yards</span>
            </div>
            <span style={{ fontSize:11, color:'var(--tx-4)' }}>Default {dept?.def_len} yd</span>
          </div>

          {/* Entry mode */}
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            <span style={ML}>Entry mode</span>
            <SegCtrl opts={[['direct','Hank'],['weight','Grams']]} value={mode} onChange={setMode} />
            <span style={{ fontSize:11, color:'var(--tx-4)' }}>
              {mode === 'direct' ? 'Hank count' : 'Grams → Ne = L×0.54/W'}
            </span>
          </div>

          {/* Machine number — ringframe (1-25), carding (1-3), simplex (1-3) */}
          {machineConf && (
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              <span style={ML}>{machineConf.label}</span>
              <input type="number" min="1" max={machineConf.max} value={frameNum}
                onChange={e => setFrameNum(e.target.value)}
                placeholder={`1–${machineConf.max}`}
                style={{ width:72, padding:'8px 10px', border:'1px solid var(--bd-md)', borderRadius:'var(--r)', fontSize:18, fontWeight:600, fontFamily:'var(--mono)', background:'var(--bg)', color:'var(--tx)', textAlign:'center' }} />
              <span style={{ fontSize:11, color:'var(--tx-4)' }}>{machineConf.hint}</span>
            </div>
          )}
        </div>

        {mode === 'weight' && (
          <div style={{ marginTop:10, display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8 }}>
            {[
              { l:'Target weight',  v:`${expW.toFixed(2)} g`,    c:'var(--claude)' },
              { l:'Min acceptable', v:`${expWMin.toFixed(2)} g`, c:'var(--ok)'     },
              { l:'Max acceptable', v:`${expWMax.toFixed(2)} g`, c:'var(--warn)'   },
            ].map(({l,v,c}) => (
              <div key={l} style={{ padding:'9px 12px', textAlign:'center', background:'var(--bg)', border:'1px solid var(--bd)', borderRadius:'var(--r)' }}>
                <div style={{ fontSize:15, fontWeight:600, fontFamily:'var(--mono)', color:c }}>{v}</div>
                <div style={{ fontSize:10, color:'var(--tx-3)', marginTop:3 }}>{l}</div>
              </div>
            ))}
          </div>
        )}
      </Sect>

      {/* ── Readings grid ─── */}
      <Sect>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', flexWrap:'wrap', gap:8, marginBottom:14 }}>
          <div>
            <MicroLabel>Readings</MicroLabel>
            <div style={{ fontSize:12, color:'var(--tx-3)', marginTop:1 }}>
              {mode === 'weight' ? 'Grams → auto-converted to hank' : 'Enter hank count directly'}
            </div>
          </div>
          <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:4 }}>
            <span style={{ fontSize:12, fontFamily:'var(--mono)', color:'var(--tx-2)', fontWeight:500 }}>
              Target {target} {dept?.unit}
            </span>
            {machineConf && frameNum && (
              <span style={{ fontSize:10, fontWeight:600, padding:'3px 10px', borderRadius:20, background:'var(--claude-bg)', color:'var(--claude)', border:'1px solid var(--claude-bd)' }}>
                {machineConf.label} {frameNum}
              </span>
            )}
          </div>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8 }}>
          {readings.map((v, i) => {
            const st = inputStatus(v)
            return (
              <div key={i} style={{ display:'flex', flexDirection:'column', gap:4 }}>
                <label style={{ fontSize:10, fontWeight:600, letterSpacing:'.07em', color:'var(--tx-4)', textAlign:'center' }}>R{i+1}</label>
                <input type="number" step={mode==='weight' ? 0.001 : 0.0001}
                  placeholder={placeholder} value={v}
                  onChange={e => { const n=[...readings]; n[i]=e.target.value; setReadings(n) }}
                  style={{
                    padding:'10px 6px',
                    border:`1.5px solid ${st==='ok' ? 'var(--ok-bd)' : st==='bad' ? 'var(--bad-bd)' : 'var(--bd)'}`,
                    borderRadius:'var(--r)', fontSize:14, fontFamily:'var(--mono)', fontWeight:500,
                    background: st==='ok' ? 'var(--ok-bg)' : st==='bad' ? 'var(--bad-bg)' : v ? 'var(--bg-2)' : 'var(--bg)',
                    color:'var(--tx)', textAlign:'center', transition:'border-color .12s, background .12s', width:'100%',
                  }} />
              </div>
            )
          })}
        </div>

        {liveStats && (
          <div style={{
            marginTop:12,
            padding:'11px 16px',
            background:'var(--bg-2)',
            borderRadius:'var(--r)',
            border:'1px solid var(--bd-md)',
            display:'flex', gap:0, flexWrap:'wrap', alignItems:'stretch',
          }}>
            {/* "LIVE" badge */}
            <div style={{
              display:'flex', alignItems:'center',
              paddingRight:16, marginRight:16,
              borderRight:'1px solid var(--bd-md)',
            }}>
              <span style={{
                fontSize:9, fontWeight:700, letterSpacing:'.12em',
                textTransform:'uppercase', color:'var(--claude)',
                fontFamily:'var(--font)',
              }}>Live</span>
            </div>

            {/* Stats — label above, value below */}
            {[
              { l:'n',   v: String(liveHanks.length),        mono: false },
              { l:'x̄',   v: liveStats.mean.toFixed(p + 2),  mono: true  },
              { l:'σ',   v: liveStats.sd.toFixed(p + 3),    mono: true  },
              { l:'CV%', v: `${liveStats.cv.toFixed(2)}%`,  mono: true  },
            ].map(({ l, v, mono }, i, arr) => (
              <div key={l} style={{
                display:'flex', flexDirection:'column', gap:2,
                paddingLeft: i === 0 ? 0 : 16, paddingRight:16,
                borderRight: i < arr.length - 1 ? '1px solid var(--bd)' : 'none',
              }}>
                {/* Label — Styrene B Medium, muted but legible */}
                <span style={{
                  fontSize:9, fontWeight:500, letterSpacing:'.12em',
                  textTransform:'uppercase', color:'var(--tx-2)',
                  fontFamily:'var(--font)', lineHeight:1,
                }}>
                  {l}
                </span>
                {/* Value — JetBrains Mono for numerics, Styrene B Black (900) for n */}
                <span style={{
                  fontSize:14, fontWeight: mono ? 700 : 900, lineHeight:1,
                  color:'#1a1a18',
                  fontFamily: mono ? 'var(--mono)' : 'var(--font)',
                  letterSpacing: mono ? '-.02em' : '.01em',
                }}>
                  {v}
                </span>
              </div>
            ))}
          </div>
        )}

        <div style={{ display:'flex', gap:8, alignItems:'center', marginTop:14, flexWrap:'wrap' }}>
          <Btn variant="primary" onClick={handleSave} disabled={loading}>
            {loading ? 'Saving…' : 'Calculate & save'}
          </Btn>
          <Btn onClick={handleClear}>Clear</Btn>
          {liveHanks.length > 0 && (
            <span style={{ fontSize:12, color:'var(--tx-3)', marginLeft:4 }}>
              {liveHanks.length} of {readings.length} filled
            </span>
          )}
        </div>
      </Sect>

      {errMsg && <Alert variant="warn">{errMsg}</Alert>}

      {result && <ResultCallout result={result} sampleLen={sampleLen} mode={mode} deptName={dept?.name} machineConf={machineConf} wasHistorical={historical && !!historicalTs} />}
    </>
  )
}

/* ══════════════════════════════════════════════════════════════════════════
   ResultCallout — Claude-style animated callout block
   Layout mirrors the reference image:
     Left:  Measurement stats (Avg weight, Mean hank, SD, CV%, Cpk/Cp)
     Right: Control Limits table (UCL, WUL, Target, WLL, LCL, Cp)
═══════════════════════════════════════════════════════════════════════════ */
function ResultCallout({ result, sampleLen, mode, deptName, machineConf, wasHistorical }) {
  const isRF = result.dept_id === 'ringframe'  // kept for formula footer label only
  const p     = decimalPlaces(result.target_value)
  const q     = result.quality
  const stats = useMemo(() => calcStats(result.readings), [result.readings])
  if (!stats) return null

  const { mean, sd, cv } = stats
  const n   = result.readings.length
  const sqn = Math.sqrt(n)
  const ucl = mean + 3*sd/sqn, lcl = mean - 3*sd/sqn
  const wul = mean + 2*sd/sqn, wll = mean - 2*sd/sqn
  const cpk = result.cpk, cp = result.cp
  const target = result.target_value

  const tsStr = result.timestamp ?? ''
  const ts = new Date(tsStr.endsWith('Z') || tsStr.includes('+') ? tsStr : tsStr+'Z')

  const qLabel  = { ok:'In control', warn:'Warning', bad:'Action required' }[q] ?? ''
  const qAccent = Q_C[q] ?? 'var(--tx-3)'
  const frameLabel = machineConf && result.frame_number ? ` · ${machineConf.label} ${result.frame_number}` : ''

  return (
    <div style={{
      border:'1px solid var(--bd)', borderRadius:'var(--r-lg)',
      background:'var(--bg)', overflow:'hidden',
      animation:'callout .35s cubic-bezier(.22,.68,0,1.1)',
      boxShadow:'var(--shadow-md)',
    }}>
      {/* Accent stripe */}
      <div style={{ height:3, background: qAccent }} />

      {/* Header */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', padding:'14px 20px 12px', borderBottom:'1px solid var(--bd)', background:'var(--bg-2)', flexWrap:'wrap', gap:10 }}>
        <div>
          <div style={{ fontSize:15, fontWeight:600, letterSpacing:'-.02em', lineHeight:1.25, color:'var(--tx)' }}>
            {deptName ?? result.dept_id}
            <span style={{ fontWeight:400, color:'var(--tx-3)', fontSize:13 }}> — batch result · Shift {result.shift}</span>
          </div>
          <div style={{ fontSize:12, color:'var(--tx-3)', marginTop:4, display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
            <span>{n} readings added{frameLabel} · {ts.toLocaleString(undefined,{month:'short',day:'numeric',year:'numeric',hour:'2-digit',minute:'2-digit'})}</span>
            {wasHistorical && (
              <span style={{ fontSize:10, fontWeight:600, padding:'2px 8px', borderRadius:20, background:'var(--info-bg)', color:'var(--info)', border:'1px solid var(--info-bd)' }}>
                Historical entry
              </span>
            )}
          </div>
        </div>
        <Badge variant={q}>{qLabel}</Badge>
      </div>

      {/* Two-column layout matching reference image */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr' }}
           className="max-[600px]:!grid-cols-1">
        {/* ── Left: MEASUREMENT ── */}
        <div style={{ padding:'18px 20px', borderRight:'1px solid var(--bd)' }}
             className="max-[600px]:!border-r-0 max-[600px]:!border-b max-[600px]:!border-[var(--bd)]">
          <PanelHead>Measurement</PanelHead>
          {result.avg_weight != null && <>
            <Row k="Avg weight (μ)"      v={`${result.avg_weight.toFixed(3)} g`} />
            <Row k="Hank from avg weight" v={`${(sampleLen*0.54/result.avg_weight).toFixed(p+2)} ${result.unit}`} />
          </>}
          <Row k="Mean hank (x̄)"        v={`${mean.toFixed(p+3)} ${result.unit}`} bold />
          <Row k="Std deviation (σ)"     v={sd.toFixed(p+4)} />
          <Row k="CV%"                   v={`${cv.toFixed(3)}%`} q={q} />
          <Row k="Cpk / Cp"             v={`${cpk?.toFixed(3) ?? '—'} / ${cp?.toFixed(3) ?? '—'}`} q={q} />
        </div>

        {/* ── Right: CONTROL LIMITS ── */}
        <div style={{ padding:'18px 20px' }}
             className="max-[600px]:!pt-4">
          <PanelHead>Control limits</PanelHead>
          <Row k="UCL (3σ)"           v={ucl.toFixed(p+3)} />
          <Row k="Warn + (2σ)"        v={wul.toFixed(p+3)} />
          <Row k="Target"             v={`${target} ${result.unit}`} />
          <Row k="Warn − (2σ)"        v={wll.toFixed(p+3)} />
          <Row k="LCL (3σ)"           v={lcl.toFixed(p+3)} />
          <Row k="Cp (process width)" v={cp?.toFixed(3) ?? '—'} />
        </div>
      </div>

      {/* Machine summary table — shown for any dept with frame tracking */}
      {machineConf && result.frame_number && (
        <div style={{ padding:'14px 20px', borderTop:'1px solid var(--bd)', background:'var(--bg-2)' }}>
          <PanelHead>{deptName} — {machineConf.label} {result.frame_number} Summary</PanelHead>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12, fontFamily:'var(--mono)' }}>
            <thead>
              <tr>
                {[machineConf?.label ?? 'Machine','Shift', result.unit === 'Ne' ? 'Ne (x̄)' : 'Hank (x̄)','σ','CV%','Cpk','UCL','LCL','Status'].map(h => (
                  <th key={h} style={{ padding:'6px 8px', textAlign:'left', fontSize:10, fontWeight:600, color:'var(--tx-3)', letterSpacing:'.06em', textTransform:'uppercase', borderBottom:'1px solid var(--bd)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={TC}>{machineConf?.label} {result.frame_number}</td>
                <td style={TC}>{result.shift}</td>
                <td style={TC}>{mean.toFixed(p+2)}</td>
                <td style={TC}>{sd.toFixed(p+3)}</td>
                <td style={{...TC, color:Q_C[q]}}>{cv.toFixed(2)}%</td>
                <td style={{...TC, fontWeight:600, color: cpk!=null && cpk>=1.33 ? Q_C.ok : Q_C.warn }}>{cpk?.toFixed(3) ?? '—'}</td>
                <td style={TC}>{ucl.toFixed(p+2)}</td>
                <td style={TC}>{lcl.toFixed(p+2)}</td>
                <td style={TC}><Badge variant={q}>{qLabel}</Badge></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Formula footer (weight mode) */}
      {mode === 'weight' && (
        <div style={{ padding:'9px 20px', borderTop:'1px solid var(--bd)', background:'var(--bg-2)', fontSize:11, color:'var(--tx-3)', fontFamily:'var(--mono)' }}>
          Formula: Ne = ({sampleLen} × 0.54) / W_grams = {(sampleLen*0.54).toFixed(4)} / W
          &ensp;·&ensp;{n} weight readings converted to hank counts
        </div>
      )}
    </div>
  )
}

/* ── Row — stat row matching reference image layout ───────────────────── */
function Row({ k, v, q, bold }) {
  const qCol = q ? Q_C[q] : null
  return (
    <div style={{ display:'flex', alignItems:'baseline', justifyContent:'space-between', gap:10, padding:'6px 0', borderBottom:'1px solid var(--bd)' }}>
      <span style={{ fontSize:12.5, color:'var(--tx-2)', flexShrink:0 }}>{k}</span>
      <span style={{ fontSize:12.5, fontWeight: bold ? 600 : 500, fontFamily:'var(--mono)', color: qCol ?? 'var(--tx)', textAlign:'right' }}>{v}</span>
    </div>
  )
}

/* ── Micro layout atoms ──────────────────────────────────────────────── */
function Sect({ children }) {
  return <div style={{ background:'var(--bg)', border:'1px solid var(--bd)', borderRadius:'var(--r-lg)', padding:'14px 16px' }}>{children}</div>
}

function MicroLabel({ children }) {
  return <div style={{ fontSize:11, fontWeight:600, letterSpacing:'.07em', textTransform:'uppercase', color:'var(--tx-3)', marginBottom:6 }}>{children}</div>
}

function PanelHead({ children }) {
  return <div style={{ fontSize:10, fontWeight:600, letterSpacing:'.1em', textTransform:'uppercase', color:'var(--tx-3)', marginBottom:10 }}>{children}</div>
}

function SegCtrl({ opts, value, onChange }) {
  return (
    <div style={{ display:'inline-flex', border:'1.5px solid var(--bd-md)', borderRadius:'var(--r)', overflow:'hidden', alignSelf:'flex-start' }}>
      {opts.map(([val, label], i) => (
        <button key={val} onClick={() => onChange(val)} style={{
          padding:'7px 18px', fontSize:12, fontFamily:'var(--font)', fontWeight: value===val ? 600 : 400,
          background: value===val ? 'var(--claude)' : 'transparent',
          color:      value===val ? '#fff' : 'var(--tx-2)',
          border:'none', cursor:'pointer', transition:'all .12s', lineHeight:1,
          borderRight: i < opts.length-1 ? '1.5px solid var(--bd-md)' : 'none',
        }}>{label}</button>
      ))}
    </div>
  )
}

const ML = { fontSize:10, fontWeight:600, letterSpacing:'.08em', textTransform:'uppercase', color:'var(--tx-3)' }
const TC = { padding:'7px 8px', borderBottom:'1px solid var(--bd)', fontSize:12 }
