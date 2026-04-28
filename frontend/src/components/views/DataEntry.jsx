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
  const n = arr.length, mean = arr.reduce((a, b) => a + b, 0) / n
  const sd = Math.sqrt(arr.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1))
  if (mean === 0) return null
  return { n, mean, sd, cv: (sd / mean) * 100 }
}

const Q_C  = { ok: 'var(--ok)',    warn: 'var(--warn)',    bad: 'var(--bad)'    }
const Q_BG = { ok: 'var(--ok-bg)', warn: 'var(--warn-bg)', bad: 'var(--bad-bg)' }
const Q_BD = { ok: 'var(--ok-bd)', warn: 'var(--warn-bd)', bad: 'var(--bad-bd)' }

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
  const [historical,   setHistorical]   = useState(false)
  const [historicalTs, setHistoricalTs] = useState('')
  const [simplexLane,  setSimplexLane]  = useState('front')
  const [bubbleType,   setBubbleType]   = useState('full_bubble')

  const dept        = depts.find(d => d.id === currentDept) ?? depts[0]
  const target      = dept?.target ?? 0
  const usl         = dept?.usl ?? 0
  const lsl         = dept?.lsl ?? 0
  const p           = decimalPlaces(target)
  const machineConf = MACHINE_CONFIG[currentDept] ?? null
  /* autoconer also uses Ne units — treat it the same as Ring Frame */
  const isRF        = dept?.unit === 'Ne'

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
    const avgWeight = mode === 'weight' ? raw.reduce((a, b) => a + b, 0) / raw.length : null
    try {
      setLoading(true)
      const body = {
        dept_id: currentDept, shift,
        readings: hanks, avg_weight: avgWeight, sample_length: sampleLen,
      }
      if (machineConf && frameNum) body.frame_number = parseInt(frameNum)
      if (currentDept === 'simplex') {
        body.simplex_lane = simplexLane
        body.measurement_type = bubbleType
      }
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

  const addReading    = () => setReadings(prev => [...prev, ''])
  const removeReading = (i) => {
    if (readings.length <= 3) return   // never drop below minimum
    setReadings(prev => prev.filter((_, idx) => idx !== i))
  }

  const handleClear = () => {
    setReadings(Array(9).fill(''))
    setResult(null)
    setErrMsg('')
    setFrameNum('')
    setHistoricalTs('')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

      {/* ══ Block 1: Session context ══════════════════════════════════════ */}
      <Block>
        {/* Dept info + shift selector */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <FieldLabel>Active session</FieldLabel>
            <div style={{ fontSize: 13, color: 'var(--tx-3)', marginTop: 3 }}>
              {dept?.name} · {dept?.frequency}
            </div>
          </div>
          {/* Shift pills */}
          <div style={{ display: 'flex', gap: 4 }}>
            {['A', 'B', 'C'].map(s => (
              <button key={s} onClick={() => setShift(s)} style={{
                padding: '5px 16px', fontSize: 12, fontWeight: shift === s ? 600 : 400,
                border: '1px solid', borderRadius: 20, cursor: 'pointer', fontFamily: 'var(--font)',
                transition: 'all .12s', lineHeight: 1.5,
                background:  shift === s ? 'var(--claude)' : 'transparent',
                color:       shift === s ? '#fff' : 'var(--tx-2)',
                borderColor: shift === s ? 'var(--claude)' : 'var(--bd-md)',
              }}>
                Shift {s}
              </button>
            ))}
          </div>
        </div>

        {/* Historical toggle */}
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--bd)' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none', width: 'fit-content' }}>
            <input
              type="checkbox" checked={historical}
              onChange={e => { setHistorical(e.target.checked); if (!e.target.checked) setHistoricalTs('') }}
              style={{ width: 14, height: 14, accentColor: 'var(--claude)', cursor: 'pointer' }}
            />
            <span style={{ fontSize: 12.5, color: 'var(--tx-2)' }}>Enter historical data</span>
            <span style={{ fontSize: 11, color: 'var(--tx-4)' }}>Record a batch from a past date &amp; time</span>
          </label>

          {historical && (
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <FieldLabel>Batch date &amp; time</FieldLabel>
              <input
                type="datetime-local"
                value={historicalTs}
                max={new Date(Date.now() - 60000).toISOString().slice(0, 16)}
                onChange={e => setHistoricalTs(e.target.value)}
                style={{
                  padding: '7px 10px', border: '1px solid var(--bd-md)', borderRadius: 'var(--r)',
                  fontSize: 13, fontFamily: 'var(--mono)', background: 'var(--bg)', color: 'var(--tx)',
                  minWidth: 210,
                }}
              />
              {historicalTs && (
                <span style={{ fontSize: 10, color: 'var(--claude)', fontWeight: 500 }}>
                  Will be recorded as {new Date(historicalTs).toLocaleString()}
                </span>
              )}
            </div>
          )}
        </div>
      </Block>

      {/* ══ Block 2: Measurement settings ════════════════════════════════ */}
      <Block>
        <FieldLabel style={{ marginBottom: 14 }}>Measurement settings</FieldLabel>

        {/* Inline settings row */}
        <div style={{ display: 'flex', gap: 0, flexWrap: 'wrap' }}>

          {/* Sample length */}
          <SettingField label="Sample length" hint={`Default ${dept?.def_len} yd`}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="number" min="1" max="240" step="0.5" value={sampleLen}
                onChange={e => setSampleLen(parseFloat(e.target.value) || dept.def_len)}
                style={{
                  width: 66, padding: '7px 8px', border: '1px solid var(--bd-md)',
                  borderRadius: 'var(--r)', fontSize: 17, fontWeight: 600, fontFamily: 'var(--mono)',
                  background: 'var(--bg-3)', color: 'var(--tx)', textAlign: 'center',
                }} />
              <span style={{ fontSize: 12, color: 'var(--tx-3)' }}>yards</span>
            </div>
          </SettingField>

          <FieldSep />

          {/* Entry mode */}
          <SettingField label="Entry mode" hint={mode === 'direct' ? 'Hank count' : 'Grams → Ne = L×0.54/W'}>
            <SegCtrl opts={[['direct', 'Hank'], ['weight', 'Grams']]} value={mode} onChange={setMode} />
          </SettingField>

          {/* Machine number */}
          {machineConf && (
            <>
              <FieldSep />
              <SettingField label={machineConf.label} hint={machineConf.hint}>
                <input type="number" min="1" max={machineConf.max} value={frameNum}
                  onChange={e => setFrameNum(e.target.value)}
                  placeholder={`1–${machineConf.max}`}
                  style={{
                    width: 66, padding: '7px 8px', border: '1px solid var(--bd-md)',
                    borderRadius: 'var(--r)', fontSize: 17, fontWeight: 600, fontFamily: 'var(--mono)',
                    background: 'var(--bg-3)', color: 'var(--tx)', textAlign: 'center',
                  }} />
              </SettingField>
            </>
          )}
        </div>

        {/* Simplex: Lane + Bubble type */}
        {currentDept === 'simplex' && (
          <div style={{
            marginTop: 14, paddingTop: 14, borderTop: '1px dashed var(--bd-md)',
            display: 'flex', gap: 0, flexWrap: 'wrap',
          }}>
            <SettingField label="Lane" hint="Front = standard count · Back = additional stretch">
              <SegCtrl opts={[['front', '⇑ Front'], ['back', '⇓ Back']]} value={simplexLane} onChange={setSimplexLane} />
            </SettingField>
            <FieldSep />
            <SettingField label="Bubble type" hint="Full = standard tension · Half = reduced">
              <SegCtrl opts={[['full_bubble', '⬤ Full'], ['half_bubble', '◐ Half']]} value={bubbleType} onChange={setBubbleType} />
            </SettingField>
          </div>
        )}

        {/* Weight mode hints */}
        {mode === 'weight' && (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--bd)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[
              { l: 'Target weight',   v: `${expW.toFixed(2)} g`,    c: 'var(--claude)' },
              { l: 'Min acceptable',  v: `${expWMin.toFixed(2)} g`, c: 'var(--ok)'     },
              { l: 'Max acceptable',  v: `${expWMax.toFixed(2)} g`, c: 'var(--warn)'   },
            ].map(({ l, v, c }) => (
              <div key={l} style={{
                flex: '1 1 100px', padding: '9px 12px', textAlign: 'center',
                background: 'var(--bg-3)', border: '1px solid var(--bd)', borderRadius: 'var(--r)',
              }}>
                <div style={{ fontSize: 15, fontWeight: 600, fontFamily: 'var(--mono)', color: c }}>{v}</div>
                <div style={{ fontSize: 10, color: 'var(--tx-3)', marginTop: 3 }}>{l}</div>
              </div>
            ))}
          </div>
        )}
      </Block>

      {/* ══ Block 3: Readings ════════════════════════════════════════════ */}
      <Block>
        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 16 }}>
          <div>
            <FieldLabel>Readings</FieldLabel>
            <div style={{ fontSize: 11.5, color: 'var(--tx-3)', marginTop: 3 }}>
              {mode === 'weight' ? 'Enter grams — auto-converted to hank' : 'Enter hank count directly'}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {machineConf && frameNum && (
              <span style={{
                fontSize: 10, fontWeight: 600, padding: '2px 9px', borderRadius: 20,
                background: 'var(--claude-bg)', color: 'var(--claude)', border: '1px solid var(--claude-bd)',
              }}>
                {machineConf.label} {frameNum}
              </span>
            )}
            <span style={{ fontSize: 11.5, fontFamily: 'var(--mono)', color: 'var(--tx-3)' }}>
              Target&nbsp;<strong style={{ color: 'var(--tx)', fontWeight: 600 }}>{target}</strong>&nbsp;{dept?.unit}
            </span>
          </div>
        </div>

        {/* Grid + Live stats — side-by-side */}
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>

          {/* Dynamic reading grid — 3 columns, endless rows via "+" */}
          <div style={{ flex: '0 0 auto', width: '100%', maxWidth: 360 }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 6,
            }}>
              {readings.map((v, i) => {
                const st      = inputStatus(v)
                const bdColor = st === 'ok'  ? 'var(--ok-bd)'  : st === 'bad' ? 'var(--bad-bd)' : 'var(--bd-md)'
                const bgColor = st === 'ok'  ? 'var(--ok-bg)'  : st === 'bad' ? 'var(--bad-bg)' : v ? 'var(--bg-3)' : 'var(--bg)'
                return (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {/* Row label + remove button */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 14 }}>
                      <label style={{
                        fontSize: 9, fontWeight: 600, letterSpacing: '.1em',
                        color: 'var(--tx-4)', textTransform: 'uppercase',
                      }}>
                        R{i + 1}
                      </label>
                      {readings.length > 3 && (
                        <button
                          onClick={() => removeReading(i)}
                          title="Remove reading"
                          style={{
                            width: 14, height: 14, borderRadius: '50%',
                            border: '1px solid var(--bd-md)', background: 'var(--bg-3)',
                            color: 'var(--tx-4)', fontSize: 10, lineHeight: 1,
                            cursor: 'pointer', display: 'flex', alignItems: 'center',
                            justifyContent: 'center', padding: 0, fontFamily: 'var(--font)',
                            transition: 'background .1s, color .1s',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'var(--bad-bg)'; e.currentTarget.style.color = 'var(--bad)' }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-3)';  e.currentTarget.style.color = 'var(--tx-4)' }}
                        >×</button>
                      )}
                    </div>
                    <input
                      type="number"
                      step={mode === 'weight' ? 0.001 : 0.0001}
                      placeholder={placeholder}
                      value={v}
                      onChange={e => { const n = [...readings]; n[i] = e.target.value; setReadings(n) }}
                      style={{
                        padding: '9px 4px',
                        border: `1px solid ${bdColor}`,
                        borderRadius: 'var(--r)',
                        fontSize: 13, fontFamily: 'var(--mono)', fontWeight: 500,
                        background: bgColor, color: 'var(--tx)',
                        textAlign: 'center', width: '100%',
                        transition: 'border-color .12s, background .12s',
                      }}
                    />
                  </div>
                )
              })}
            </div>

            {/* Add reading button */}
            <button
              onClick={addReading}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                gap: 5, width: '100%', marginTop: 8,
                padding: '7px 0',
                border: '1px dashed var(--bd-md)',
                borderRadius: 'var(--r)',
                background: 'transparent', color: 'var(--tx-3)',
                fontSize: 12, fontFamily: 'var(--font)', fontWeight: 500,
                cursor: 'pointer', transition: 'all .12s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--claude)'; e.currentTarget.style.color = 'var(--claude)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--bd-md)';  e.currentTarget.style.color = 'var(--tx-3)' }}
            >
              <span style={{ fontSize: 16, lineHeight: 1, fontWeight: 300 }}>+</span>
              Add reading
            </button>
          </div>

          {/* Live stats sidebar — appears as readings are entered */}
          <div style={{
            flex: '1 1 120px',
            alignSelf: 'stretch',
            border: liveStats ? '1px solid var(--bd-md)' : '1px dashed var(--bd)',
            borderRadius: 'var(--r-lg)',
            overflow: 'hidden',
            transition: 'border-color .2s',
          }}>
            {liveStats ? (
              <div style={{ padding: '12px 14px', height: '100%', display: 'flex', flexDirection: 'column', gap: 0 }}>
                {/* "LIVE" header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                  <span style={{
                    width: 5, height: 5, borderRadius: '50%',
                    background: 'var(--ok)', flexShrink: 0,
                    animation: 'pulse 2s ease-in-out infinite',
                  }} />
                  <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--tx-3)', fontFamily: 'var(--font)' }}>
                    Live preview
                  </span>
                </div>
                {/* Stat rows */}
                {[
                  { l: 'Readings',  v: `${liveHanks.length} / ${readings.length} slots`, mono: false },
                  { l: 'Mean (x̄)',   v: liveStats.mean.toFixed(p + 2),              mono: true  },
                  { l: 'Std dev σ',  v: liveStats.sd.toFixed(p + 3),                mono: true  },
                  { l: 'CV%',        v: `${liveStats.cv.toFixed(2)}%`,              mono: true  },
                ].map(({ l, v, mono }, idx, arr) => (
                  <div key={l} style={{
                    display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8,
                    padding: '6px 0',
                    borderBottom: idx < arr.length - 1 ? '1px solid var(--bd)' : 'none',
                  }}>
                    <span style={{ fontSize: 11, color: 'var(--tx-3)' }}>{l}</span>
                    <span style={{
                      fontSize: 12, fontWeight: 600, color: 'var(--tx)',
                      fontFamily: mono ? 'var(--mono)' : 'var(--font)',
                    }}>
                      {v}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{
                height: '100%', minHeight: 120,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                gap: 6, padding: 16,
              }}>
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="var(--tx-4)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 3v18h18M7 16l4-6 3 4 3-5" />
                </svg>
                <span style={{ fontSize: 11, color: 'var(--tx-4)', textAlign: 'center', lineHeight: 1.5 }}>
                  Enter 2+ readings<br />to see live stats
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Action row */}
        <div style={{
          display: 'flex', gap: 7, alignItems: 'center',
          marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--bd)',
          flexWrap: 'wrap',
        }}>
          <Btn variant="accent" onClick={handleSave} disabled={loading}>
            {loading ? 'Saving…' : 'Calculate & save'}
          </Btn>
          <Btn onClick={handleClear}>Clear</Btn>
          {liveHanks.length > 0 && (
            <span style={{ fontSize: 11, color: 'var(--tx-4)', marginLeft: 4 }}>
              {liveHanks.length} of {readings.length} filled · min 3 required
            </span>
          )}
        </div>
      </Block>

      {errMsg && <Alert variant="warn">{errMsg}</Alert>}

      {result && (
        <ResultCallout
          result={result} sampleLen={sampleLen} mode={mode}
          deptName={dept?.name} machineConf={machineConf}
          wasHistorical={historical && !!historicalTs}
        />
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════════
   ResultCallout — animated result card
═══════════════════════════════════════════════════════════════════════════ */
function ResultCallout({ result, sampleLen, mode, deptName, machineConf, wasHistorical }) {
  const p     = decimalPlaces(result.target_value)
  const q     = result.quality
  const stats = useMemo(() => calcStats(result.readings), [result.readings])
  if (!stats) return null

  const { mean, sd, cv } = stats
  const n   = result.readings.length
  const sqn = Math.sqrt(n)
  const ucl = mean + 3 * sd / sqn, lcl = mean - 3 * sd / sqn
  const wul = mean + 2 * sd / sqn, wll = mean - 2 * sd / sqn
  const cpk = result.cpk, cp = result.cp
  const target = result.target_value

  const tsStr = result.timestamp ?? ''
  const ts    = new Date(tsStr.endsWith('Z') || tsStr.includes('+') ? tsStr : tsStr + 'Z')

  const qLabel  = { ok: 'In control', warn: 'Warning', bad: 'Action required' }[q] ?? ''
  const qAccent = Q_C[q] ?? 'var(--tx-3)'
  const frameLabel = machineConf && result.frame_number ? ` · ${machineConf.label} ${result.frame_number}` : ''

  return (
    <div style={{
      border: '1px solid var(--bd-md)', borderRadius: 'var(--r-lg)',
      background: 'var(--bg)', overflow: 'hidden',
      animation: 'callout .35s cubic-bezier(.22,.68,0,1.1)',
    }}>
      {/* Quality accent stripe */}
      <div style={{ height: 3, background: qAccent }} />

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        padding: '14px 18px 12px', borderBottom: '1px solid var(--bd)',
        background: 'var(--bg-2)', flexWrap: 'wrap', gap: 10,
      }}>
        <div>
          <div style={{ fontSize: 14.5, fontWeight: 600, letterSpacing: '-.02em', lineHeight: 1.25, color: 'var(--tx)' }}>
            {deptName ?? result.dept_id}
            <span style={{ fontWeight: 400, color: 'var(--tx-3)', fontSize: 13 }}> — Shift {result.shift}</span>
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--tx-3)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span>{n} readings{frameLabel} · {ts.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
            {wasHistorical && (
              <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 20, background: 'var(--info-bg)', color: 'var(--info)', border: '1px solid var(--info-bd)' }}>
                Historical entry
              </span>
            )}
            {result.simplex_lane && (
              <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 20, background: 'var(--bg-3)', color: 'var(--tx-2)', border: '1px solid var(--bd-md)' }}>
                {result.simplex_lane === 'front' ? '⇑ Front Lane' : '⇓ Back Lane'} · {result.measurement_type === 'full_bubble' ? '⬤ Full' : '◐ Half'}
              </span>
            )}
          </div>
        </div>
        <Badge variant={q}>{qLabel}</Badge>
      </div>

      {/* Two-column body */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}
           className="max-[600px]:!grid-cols-1">
        {/* Left: Measurement */}
        <div style={{ padding: '16px 18px', borderRight: '1px solid var(--bd)' }}
             className="max-[600px]:!border-r-0 max-[600px]:!border-b max-[600px]:!border-[var(--bd)]">
          <PanelHead>Measurement</PanelHead>
          {result.avg_weight != null && <>
            <Row k="Avg weight (μ)"       v={`${result.avg_weight.toFixed(3)} g`} />
            <Row k="Hank from avg weight"  v={`${(sampleLen * 0.54 / result.avg_weight).toFixed(p + 2)} ${result.unit}`} />
          </>}
          <Row k="Mean hank (x̄)"         v={`${mean.toFixed(p + 3)} ${result.unit}`} bold />
          <Row k="Std deviation (σ)"      v={sd.toFixed(p + 4)} />
          <Row k="CV%"                    v={`${cv.toFixed(3)}%`} q={q} />
          <Row k="Cpk / Cp"              v={`${cpk?.toFixed(3) ?? '—'} / ${cp?.toFixed(3) ?? '—'}`} q={q} />
        </div>

        {/* Right: Control limits */}
        <div style={{ padding: '16px 18px' }}
             className="max-[600px]:!pt-4">
          <PanelHead>Control limits</PanelHead>
          <Row k="UCL (3σ)"           v={ucl.toFixed(p + 3)} />
          <Row k="Warn + (2σ)"        v={wul.toFixed(p + 3)} />
          <Row k="Target"             v={`${target} ${result.unit}`} />
          <Row k="Warn − (2σ)"        v={wll.toFixed(p + 3)} />
          <Row k="LCL (3σ)"           v={lcl.toFixed(p + 3)} />
          <Row k="Cp (process width)" v={cp?.toFixed(3) ?? '—'} />
        </div>
      </div>

      {/* Machine summary table */}
      {machineConf && result.frame_number && (
        <div style={{ padding: '12px 18px', borderTop: '1px solid var(--bd)', background: 'var(--bg-2)' }}>
          <PanelHead>{deptName} — {machineConf.label} {result.frame_number} Summary</PanelHead>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: 'var(--mono)' }}>
            <thead>
              <tr>
                {[machineConf?.label ?? 'Machine', 'Shift', result.unit === 'Ne' ? 'Ne (x̄)' : 'Hank (x̄)', 'σ', 'CV%', 'Cpk', 'UCL', 'LCL', 'Status'].map(h => (
                  <th key={h} style={{ padding: '5px 8px', textAlign: 'left', fontSize: 9.5, fontWeight: 600, color: 'var(--tx-4)', letterSpacing: '.06em', textTransform: 'uppercase', borderBottom: '1px solid var(--bd)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={TC}>{machineConf?.label} {result.frame_number}</td>
                <td style={TC}>{result.shift}</td>
                <td style={TC}>{mean.toFixed(p + 2)}</td>
                <td style={TC}>{sd.toFixed(p + 3)}</td>
                <td style={{ ...TC, color: Q_C[q] }}>{cv.toFixed(2)}%</td>
                <td style={{ ...TC, fontWeight: 600, color: cpk != null && cpk >= 1.33 ? Q_C.ok : Q_C.warn }}>{cpk?.toFixed(3) ?? '—'}</td>
                <td style={TC}>{ucl.toFixed(p + 2)}</td>
                <td style={TC}>{lcl.toFixed(p + 2)}</td>
                <td style={TC}><Badge variant={q}>{qLabel}</Badge></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Formula footer */}
      {mode === 'weight' && (
        <div style={{ padding: '8px 18px', borderTop: '1px solid var(--bd)', background: 'var(--bg-2)', fontSize: 10.5, color: 'var(--tx-3)', fontFamily: 'var(--mono)' }}>
          Ne = ({sampleLen} × 0.54) / W_grams = {(sampleLen * 0.54).toFixed(4)} / W · {n} weight readings converted
        </div>
      )}
    </div>
  )
}

/* ── Stat row ────────────────────────────────────────────────────────────── */
function Row({ k, v, q, bold }) {
  const qCol = q ? Q_C[q] : null
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--bd)' }}>
      <span style={{ fontSize: 12.5, color: 'var(--tx-2)', flexShrink: 0 }}>{k}</span>
      <span style={{ fontSize: 12.5, fontWeight: bold ? 600 : 500, fontFamily: 'var(--mono)', color: qCol ?? 'var(--tx)', textAlign: 'right' }}>{v}</span>
    </div>
  )
}

/* ── Layout atoms ────────────────────────────────────────────────────────── */

/* Block — Notion-style white block with clean border */
function Block({ children }) {
  return (
    <div style={{
      background: 'var(--bg)',
      border: '1px solid var(--bd-md)',
      borderRadius: 'var(--r-lg)',
      padding: '16px 18px',
    }}>
      {children}
    </div>
  )
}

/* Field section label */
function FieldLabel({ children, style = {} }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.09em', textTransform: 'uppercase', color: 'var(--tx-3)', ...style }}>
      {children}
    </div>
  )
}

/* Vertical separator between inline settings fields */
function FieldSep() {
  return <div style={{ width: 1, background: 'var(--bd)', margin: '0 20px', alignSelf: 'stretch', flexShrink: 0 }} />
}

/* Individual setting field with label + hint */
function SettingField({ label, hint, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 110, flex: '0 0 auto' }}>
      <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--tx-3)' }}>
        {label}
      </span>
      {children}
      {hint && <span style={{ fontSize: 10, color: 'var(--tx-4)' }}>{hint}</span>}
    </div>
  )
}

/* Panel section label */
function PanelHead({ children }) {
  return <div style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: '.09em', textTransform: 'uppercase', color: 'var(--tx-3)', marginBottom: 10 }}>{children}</div>
}

/* Segmented control */
function SegCtrl({ opts, value, onChange }) {
  return (
    <div style={{
      display: 'inline-flex', border: '1px solid var(--bd-md)',
      borderRadius: 'var(--r)', overflow: 'hidden', alignSelf: 'flex-start',
      background: 'var(--bg-3)',
    }}>
      {opts.map(([val, label], i) => (
        <button key={val} onClick={() => onChange(val)} style={{
          padding: '5px 13px', fontSize: 12, fontFamily: 'var(--font)',
          fontWeight: value === val ? 600 : 400,
          background: value === val ? 'var(--claude)' : 'transparent',
          color:      value === val ? '#fff' : 'var(--tx-2)',
          border: 'none', cursor: 'pointer', transition: 'all .12s', lineHeight: 1.4,
          borderRight: i < opts.length - 1 ? '1px solid var(--bd-md)' : 'none',
        }}>{label}</button>
      ))}
    </div>
  )
}

const TC = { padding: '6px 8px', borderBottom: '1px solid var(--bd)', fontSize: 12 }
