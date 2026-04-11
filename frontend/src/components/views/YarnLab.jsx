import { useState, useEffect, useCallback } from 'react'
import {
  getLabTrials, createLabTrial, updateLabTrial, deleteLabTrial,
  setLabBenchmarks, addLabSample, deleteLabSample, getLabDashboard,
} from '../../api.js'
import { Spinner, Btn, Badge } from '../Primitives.jsx'
import { decimalPlaces, weightToHank, hankToWeight } from '../../api.js'

/* ── Colour maps ──────────────────────────────────────────────────────────── */
const V_COLOR  = { pass:'var(--ok)',    warn:'var(--warn)',    fail:'var(--bad)',    pending:'var(--tx-4)'  }
const V_BG     = { pass:'var(--ok-bg)', warn:'var(--warn-bg)', fail:'var(--bad-bg)', pending:'var(--bg-3)'  }
const V_BD     = { pass:'var(--ok-bd)', warn:'var(--warn-bd)', fail:'var(--bad-bd)', pending:'var(--bd)'    }
const V_LABEL  = { pass:'PASS',         warn:'MARGINAL',       fail:'FAIL',          pending:'PENDING'      }
const V_ICON   = { pass:'✓',            warn:'▲',              fail:'✕',             pending:'…'            }

/* ── Ordered dept list ───────────────────────────────────────────────────── */
const DEPT_ORDER = ['carding','breaker','rsb','simplex','ringframe','autoconer']

/* ── Small helpers ───────────────────────────────────────────────────────── */
function fmt(v, dp = 4) {
  if (v == null) return '—'
  return typeof v === 'number' ? v.toFixed(dp) : v
}
function fmtTarget(v, target) {
  if (v == null) return '—'
  return v.toFixed(decimalPlaces(target ?? v))
}

/* ════════════════════════════════════════════════════════════════════════════
   TrialCard — one entry in the trials list
══════════════════════════════════════════════════════════════════════════════ */
function TrialCard({ trial, onOpen, onDelete }) {
  const [confirming, setConfirming] = useState(false)
  const created = new Date(trial.created_at).toLocaleDateString('en-GB', {
    day:'2-digit', month:'short', year:'numeric',
  })
  return (
    <div style={{
      border: '1px solid var(--bd)', borderRadius: 'var(--r-lg)',
      background: 'var(--bg)', padding: '14px 16px',
      display: 'flex', alignItems: 'center', gap: 14,
      cursor: 'pointer', transition: 'border-color .12s, box-shadow .12s',
    }}
      onClick={() => onOpen(trial.id)}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--bd-hv)'; e.currentTarget.style.boxShadow = 'var(--shadow-sm)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--bd)';    e.currentTarget.style.boxShadow = 'none' }}
    >
      {/* Flask icon */}
      <div style={{
        width: 40, height: 40, borderRadius: 10, flexShrink: 0,
        background: 'var(--claude-bg)', border: '1px solid var(--claude-bd)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <FlaskIcon />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--tx)', lineHeight: 1.3 }}>{trial.name}</div>
        {trial.description && (
          <div style={{ fontSize: 12, color: 'var(--tx-3)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {trial.description}
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, marginTop: 5, flexWrap: 'wrap' }}>
          <Chip>{trial.dept_count} depts</Chip>
          <Chip>{trial.sample_count} samples</Chip>
          <Chip>{created}</Chip>
          <span style={{
            fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 5, lineHeight: 1.6,
            background: trial.status === 'complete' ? 'var(--ok-bg)' : 'var(--info-bg, var(--bg-3))',
            color:      trial.status === 'complete' ? 'var(--ok)'    : 'var(--tx-3)',
            border:     `1px solid ${trial.status === 'complete' ? 'var(--ok-bd)' : 'var(--bd)'}`,
          }}>{trial.status.toUpperCase()}</span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
        <SmBtn onClick={() => onOpen(trial.id)}>Open →</SmBtn>
        {confirming
          ? <>
              <SmBtn danger onClick={() => onDelete(trial.id)}>Confirm</SmBtn>
              <SmBtn onClick={() => setConfirming(false)}>Cancel</SmBtn>
            </>
          : <SmBtn danger onClick={() => setConfirming(true)}>Delete</SmBtn>
        }
      </div>
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════════════
   BenchmarkEditor — set gold standard targets per dept
══════════════════════════════════════════════════════════════════════════════ */
function BenchmarkEditor({ dashboard, onSave, onCancel }) {
  const [rows, setRows] = useState(() =>
    dashboard.departments.map(d => ({
      dept_id:   d.dept_id,
      dept_name: d.dept_name,
      target:    String(d.benchmark.target),
      tolerance: String(d.benchmark.tolerance),
    }))
  )
  const [saving, setSaving] = useState(false)
  const [err,    setErr]    = useState('')

  const update = (i, field, val) =>
    setRows(r => r.map((row, idx) => idx === i ? { ...row, [field]: val } : row))

  const handleSave = async () => {
    for (const r of rows) {
      if (!parseFloat(r.target) || !parseFloat(r.tolerance)) {
        setErr('All targets and tolerances must be positive numbers.'); return
      }
    }
    setSaving(true)
    try {
      await onSave(rows.map(r => ({
        dept_id:   r.dept_id,
        target:    parseFloat(r.target),
        tolerance: parseFloat(r.tolerance),
      })))
    } catch (e) {
      setErr(e?.response?.data?.detail ?? 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <SectionHead>Gold Standard Benchmarks</SectionHead>
      <p style={{ fontSize: 12, color: 'var(--tx-3)', margin: 0 }}>
        Set the ideal target and ±tolerance for each department. Cpk will be evaluated against these limits.
      </p>

      <div style={{ display: 'grid', gap: 6 }}>
        {/* Header */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 130px 130px', gap: 8, padding: '0 4px' }}>
          {['Department', 'Target', '± Tolerance'].map(h => (
            <span key={h} style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--tx-4)' }}>{h}</span>
          ))}
        </div>
        {rows.map((row, i) => (
          <div key={row.dept_id} style={{
            display: 'grid', gridTemplateColumns: '1fr 130px 130px', gap: 8, alignItems: 'center',
            padding: '8px 10px', borderRadius: 'var(--r)',
            background: 'var(--bg-2)', border: '1px solid var(--bd)',
          }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--tx)' }}>{row.dept_name}</span>
            <input
              type="number" step="any" value={row.target}
              onChange={e => update(i, 'target', e.target.value)}
              style={inputStyle}
            />
            <input
              type="number" step="any" value={row.tolerance}
              onChange={e => update(i, 'tolerance', e.target.value)}
              style={inputStyle}
            />
          </div>
        ))}
      </div>

      {err && <div style={{ fontSize: 12, color: 'var(--bad)', padding: '6px 10px', background: 'var(--bad-bg)', borderRadius: 'var(--r)', border: '1px solid var(--bad-bd)' }}>{err}</div>}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
        <SmBtn onClick={onCancel}>Cancel</SmBtn>
        <SmBtn primary onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save Benchmarks'}</SmBtn>
      </div>
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════════════
   SampleLogger — log a batch reading into this trial
══════════════════════════════════════════════════════════════════════════════ */
function SampleLogger({ dashboard, onSaved, onCancel }) {
  const depts = dashboard.departments
  const [deptId,     setDeptId]     = useState(depts[0]?.dept_id ?? '')
  const [readings,   setReadings]   = useState(Array(9).fill(''))
  const [mode,       setMode]       = useState('direct')
  const [sampleLen,  setSampleLen]  = useState(6)
  const [notes,      setNotes]      = useState('')
  const [saving,     setSaving]     = useState(false)
  const [err,        setErr]        = useState('')

  const dept    = depts.find(d => d.dept_id === deptId)
  const target  = dept?.benchmark?.target ?? 1
  const p       = decimalPlaces(target)
  const usl     = dept?.benchmark?.usl ?? (target + 0.1)
  const lsl     = dept?.benchmark?.lsl ?? (target - 0.1)

  const liveHanks = readings
    .map(v => parseFloat(v)).filter(v => !isNaN(v) && v > 0)
    .map(v => mode === 'weight' ? weightToHank(v, sampleLen) : v)

  const liveN    = liveHanks.length
  const liveMean = liveN >= 1 ? liveHanks.reduce((a, b) => a + b, 0) / liveN : null
  const inSpec   = liveMean != null ? liveMean >= lsl && liveMean <= usl : null

  const handleSave = async () => {
    const raw = readings.map(v => parseFloat(v)).filter(v => !isNaN(v) && v > 0)
    if (raw.length < 3) { setErr('Enter at least 3 readings.'); return }
    const hanks = mode === 'weight' ? raw.map(w => weightToHank(w, sampleLen)) : raw
    setSaving(true)
    try {
      await onSaved(deptId, { readings: hanks, sample_length: sampleLen, notes: notes || null, avg_weight: mode === 'weight' ? raw[0] : null })
      setReadings(Array(9).fill(''))
      setNotes('')
      setErr('')
    } catch (e) {
      setErr(e?.response?.data?.detail ?? 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <SectionHead>Log Trial Reading</SectionHead>

      {/* Dept selector */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {depts.map(d => (
          <button key={d.dept_id} onClick={() => setDeptId(d.dept_id)}
            style={{
              padding: '5px 12px', fontSize: 12, borderRadius: 20,
              border: '1.5px solid', cursor: 'pointer', fontFamily: 'var(--font)', fontWeight: deptId === d.dept_id ? 600 : 400, lineHeight: 1,
              background:  deptId === d.dept_id ? 'var(--claude)' : 'transparent',
              color:       deptId === d.dept_id ? '#fff' : 'var(--tx-2)',
              borderColor: deptId === d.dept_id ? 'var(--claude)' : 'var(--bd-md)',
            }}>{d.dept_name}</button>
        ))}
      </div>

      {/* Mode + length */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <SegCtrl
          opts={[['direct','Direct Hank'],['weight','By Weight']]}
          value={mode} onChange={setMode}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, color: 'var(--tx-3)' }}>Length</span>
          <input type="number" step="any" value={sampleLen}
            onChange={e => setSampleLen(parseFloat(e.target.value) || 6)}
            style={{ ...inputStyle, width: 70 }} />
          <span style={{ fontSize: 11, color: 'var(--tx-4)' }}>yds</span>
        </div>
      </div>

      {/* Reading grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
        {readings.map((v, i) => {
          const num = parseFloat(v)
          const h   = !isNaN(num) && num > 0 ? (mode === 'weight' ? weightToHank(num, sampleLen) : num) : null
          const bad = h != null && (h > usl || h < lsl)
          return (
            <div key={i}>
              <input
                type="number" step="any" value={v}
                placeholder={mode === 'weight' ? hankToWeight(target, sampleLen).toFixed(2) : target.toFixed(p)}
                onChange={e => setReadings(r => r.map((x, j) => j === i ? e.target.value : x))}
                style={{
                  ...inputStyle,
                  borderColor: bad ? 'var(--bad-bd)' : h != null ? 'var(--ok-bd)' : 'var(--bd)',
                  background:  bad ? 'var(--bad-bg)' : h != null ? 'var(--ok-bg)' : 'var(--bg)',
                }}
              />
            </div>
          )
        })}
      </div>

      {/* Live preview */}
      {liveN >= 1 && (
        <div style={{
          display: 'flex', gap: 12, padding: '8px 12px',
          background: inSpec ? 'var(--ok-bg)' : 'var(--bad-bg)',
          border: `1px solid ${inSpec ? 'var(--ok-bd)' : 'var(--bad-bd)'}`,
          borderRadius: 'var(--r)', alignItems: 'center',
        }}>
          <span style={{ fontSize: 12, color: 'var(--tx-3)' }}>{liveN} readings</span>
          <span style={{ fontSize: 13, fontFamily: 'var(--mono)', fontWeight: 600, color: inSpec ? 'var(--ok)' : 'var(--bad)' }}>
            x̄ = {liveMean.toFixed(p)}
          </span>
          <span style={{ fontSize: 11, color: 'var(--tx-3)' }}>
            Benchmark: {lsl.toFixed(p)} – {usl.toFixed(p)}
          </span>
          <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 600, color: inSpec ? 'var(--ok)' : 'var(--bad)' }}>
            {inSpec ? '✓ In spec' : '✕ Out of spec'}
          </span>
        </div>
      )}

      {/* Notes */}
      <input
        type="text" value={notes} placeholder="Notes (optional)"
        onChange={e => setNotes(e.target.value)}
        style={{ ...inputStyle, width: '100%' }}
      />

      {err && <div style={{ fontSize: 12, color: 'var(--bad)' }}>{err}</div>}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <SmBtn onClick={onCancel}>Cancel</SmBtn>
        <SmBtn primary onClick={handleSave} disabled={saving || liveN < 3}>
          {saving ? 'Saving…' : `Log ${liveN} Readings`}
        </SmBtn>
      </div>
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════════════
   DeptVerdictCard — one department row in the validation dashboard
══════════════════════════════════════════════════════════════════════════════ */
function DeptVerdictCard({ dept, onDeleteSample }) {
  const v       = dept.verdict
  const bench   = dept.benchmark
  const result  = dept.result
  const p       = decimalPlaces(bench.target)
  const [expanded, setExpanded] = useState(false)

  return (
    <div style={{
      border: `1.5px solid ${V_BD[v]}`,
      borderRadius: 'var(--r-lg)',
      background: 'var(--bg)',
      overflow: 'hidden',
      transition: 'box-shadow .12s',
    }}>
      {/* Main row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '2fr 1.5fr 1.5fr 90px',
        gap: 8, alignItems: 'center',
        padding: '12px 16px',
        background: V_BG[v],
        cursor: dept.samples.length > 0 ? 'pointer' : 'default',
      }} onClick={() => dept.samples.length > 0 && setExpanded(x => !x)}>

        {/* Dept name + verdict badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            width: 28, height: 28, borderRadius: 7, flexShrink: 0,
            background: V_COLOR[v], display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: 13, color: '#fff', fontWeight: 700,
          }}>{V_ICON[v]}</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx)' }}>{dept.dept_name}</div>
            <div style={{ fontSize: 10, color: 'var(--tx-4)', marginTop: 1 }}>
              {result.n} {result.n === 1 ? 'sample' : 'samples'}
            </div>
          </div>
        </div>

        {/* Gold standard */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--tx-4)', marginBottom: 3 }}>Gold Standard</div>
          <div style={{ fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--tx-2)' }}>
            {bench.target.toFixed(p)} ± {bench.tolerance.toFixed(p)}
          </div>
          <div style={{ fontSize: 11, color: 'var(--tx-4)' }}>
            [{bench.lsl.toFixed(p)} – {bench.usl.toFixed(p)}]
          </div>
        </div>

        {/* Actual result */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--tx-4)', marginBottom: 3 }}>Actual Result</div>
          {result.n === 0
            ? <span style={{ fontSize: 12, color: 'var(--tx-4)', fontStyle: 'italic' }}>No data yet</span>
            : <>
                <div style={{ fontSize: 12, fontFamily: 'var(--mono)', fontWeight: 600, color: V_COLOR[v] }}>
                  x̄ = {fmtTarget(result.mean, bench.target)}
                </div>
                <div style={{ fontSize: 11, color: 'var(--tx-3)' }}>
                  CV {fmt(result.cv, 2)}%
                  {result.cpk != null && <> · Cpk {fmt(result.cpk, 3)}</>}
                </div>
              </>
          }
        </div>

        {/* Verdict pill */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
          <span style={{
            padding: '5px 10px', borderRadius: 20,
            fontSize: 11, fontWeight: 700, letterSpacing: '.05em',
            background: V_COLOR[v], color: '#fff',
          }}>{V_LABEL[v]}</span>
          {dept.samples.length > 0 && (
            <span style={{ fontSize: 11, color: 'var(--tx-4)', marginLeft: 8 }}>
              {expanded ? '▲' : '▼'}
            </span>
          )}
        </div>
      </div>

      {/* Expanded sample log */}
      {expanded && (
        <div style={{ borderTop: '1px solid var(--bd)', padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {dept.samples.map(s => (
            <div key={s.id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '5px 8px', borderRadius: 'var(--r)', background: 'var(--bg-2)',
              fontSize: 12,
            }}>
              <span style={{ fontFamily: 'var(--mono)', color: 'var(--tx)', fontWeight: 500 }}>
                {s.mean_hank.toFixed(p)}
              </span>
              <span style={{ color: 'var(--tx-3)' }}>CV {s.cv_pct?.toFixed(2) ?? '—'}%</span>
              <span style={{ color: 'var(--tx-4)', fontSize: 11 }}>
                {new Date(s.timestamp).toLocaleString('en-GB', { hour:'2-digit', minute:'2-digit', day:'2-digit', month:'short' })}
              </span>
              {s.notes && <span style={{ color: 'var(--tx-3)', fontStyle: 'italic', flex: 1 }}>{s.notes}</span>}
              <button onClick={() => onDeleteSample(s.id)}
                style={{ marginLeft: 'auto', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--tx-4)', fontSize: 11, padding: '2px 6px', borderRadius: 4 }}>
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════════════
   TrialDashboard — full view of a single trial
══════════════════════════════════════════════════════════════════════════════ */
function TrialDashboard({ trialId, depts, onBack }) {
  const [dashboard, setDashboard] = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [panel,     setPanel]     = useState(null)   // 'benchmarks' | 'log'
  const [saving,    setSaving]    = useState(false)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const d = await getLabDashboard(trialId)
      setDashboard(d)
    } finally {
      setLoading(false)
    }
  }, [trialId])

  useEffect(() => { reload() }, [reload])

  const handleSaveBenchmarks = async (items) => {
    await setLabBenchmarks(trialId, items)
    setPanel(null)
    await reload()
  }

  const handleLogSample = async (deptId, body) => {
    await addLabSample(trialId, { dept_id: deptId, ...body })
    setPanel(null)
    await reload()
  }

  const handleDeleteSample = async (sampleId) => {
    const deptRow = dashboard.departments.find(d => d.samples.some(s => s.id === sampleId))
    await deleteLabSample(trialId, sampleId)
    await reload()
  }

  const handleMarkComplete = async () => {
    setSaving(true)
    await updateLabTrial(trialId, { status: dashboard.trial.status === 'complete' ? 'active' : 'complete' })
    await reload()
    setSaving(false)
  }

  if (loading || !dashboard) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner /></div>
  }

  const ov = dashboard.overall
  const { pass, warn, fail, pending } = dashboard.counts

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Back + header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button onClick={onBack}
          style={{ border: '1px solid var(--bd)', background: 'var(--bg)', borderRadius: 'var(--r)', padding: '5px 12px', fontSize: 12, cursor: 'pointer', color: 'var(--tx-2)', fontFamily: 'var(--font)' }}>
          ← Trials
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--tx)' }}>{dashboard.trial.name}</h2>
          {dashboard.trial.description && (
            <span style={{ fontSize: 12, color: 'var(--tx-3)' }}>{dashboard.trial.description}</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <SmBtn onClick={() => setPanel(panel === 'benchmarks' ? null : 'benchmarks')}>
            {panel === 'benchmarks' ? 'Close' : '⚙ Benchmarks'}
          </SmBtn>
          <SmBtn onClick={() => setPanel(panel === 'log' ? null : 'log')}>
            {panel === 'log' ? 'Close' : '+ Log Reading'}
          </SmBtn>
          <SmBtn primary={dashboard.trial.status !== 'complete'} onClick={handleMarkComplete} disabled={saving}>
            {saving ? '…' : dashboard.trial.status === 'complete' ? 'Reopen' : '✓ Mark Complete'}
          </SmBtn>
        </div>
      </div>

      {/* Overall verdict banner */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16, padding: '14px 20px',
        borderRadius: 'var(--r-lg)',
        background: V_BG[ov], border: `1.5px solid ${V_BD[ov]}`,
        flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 24, fontWeight: 800, color: V_COLOR[ov] }}>
          {V_ICON[ov]}
        </span>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: V_COLOR[ov] }}>
            Overall: {ov === 'pending' ? 'Awaiting Data' : ov === 'pass' ? 'All Departments PASS' : ov === 'warn' ? 'Marginal — Review Required' : 'FAILING — Machine Tuning Needed'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--tx-3)', marginTop: 2 }}>
            {pass > 0 && <span style={{ color: 'var(--ok)', marginRight: 10 }}>✓ {pass} pass</span>}
            {warn > 0 && <span style={{ color: 'var(--warn)', marginRight: 10 }}>▲ {warn} marginal</span>}
            {fail > 0 && <span style={{ color: 'var(--bad)', marginRight: 10 }}>✕ {fail} fail</span>}
            {pending > 0 && <span style={{ color: 'var(--tx-4)' }}>… {pending} pending</span>}
          </div>
        </div>
        {ov === 'pass' && (
          <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--ok)', fontWeight: 600 }}>
            ✓ Ready for mass production
          </div>
        )}
        {ov === 'fail' && (
          <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--bad)', fontWeight: 600 }}>
            ✕ Do NOT start mass production
          </div>
        )}
      </div>

      {/* Panel */}
      {panel === 'benchmarks' && (
        <div style={{ padding: 16, border: '1px solid var(--bd)', borderRadius: 'var(--r-lg)', background: 'var(--bg-2)' }}>
          <BenchmarkEditor dashboard={dashboard} onSave={handleSaveBenchmarks} onCancel={() => setPanel(null)} />
        </div>
      )}
      {panel === 'log' && (
        <div style={{ padding: 16, border: '1px solid var(--bd)', borderRadius: 'var(--r-lg)', background: 'var(--bg-2)' }}>
          <SampleLogger dashboard={dashboard} onSaved={handleLogSample} onCancel={() => setPanel(null)} />
        </div>
      )}

      {/* Department cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {dashboard.departments.map(dept => (
          <DeptVerdictCard key={dept.dept_id} dept={dept} onDeleteSample={handleDeleteSample} />
        ))}
      </div>
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════════════
   NewTrialModal — create a trial
══════════════════════════════════════════════════════════════════════════════ */
function NewTrialModal({ onCreated, onCancel }) {
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const handleCreate = async () => {
    if (!name.trim()) { setErr('Trial name is required.'); return }
    setSaving(true)
    try {
      const t = await createLabTrial({ name: name.trim(), description: desc.trim() || null })
      onCreated(t.id)
    } catch (e) {
      setErr(e?.response?.data?.detail ?? 'Create failed')
      setSaving(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 300,
      background: 'rgba(0,0,0,.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20,
    }} onClick={onCancel}>
      <div style={{
        background: 'var(--bg)', borderRadius: 'var(--r-lg)',
        padding: 24, width: '100%', maxWidth: 420,
        border: '1px solid var(--bd)', boxShadow: 'var(--shadow-md)',
        display: 'flex', flexDirection: 'column', gap: 14,
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <FlaskIcon size={20} color="var(--claude)" />
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>New Trial Run</h3>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 12, color: 'var(--tx-3)', fontWeight: 500 }}>Trial Name *</label>
          <input
            autoFocus type="text" value={name}
            placeholder="e.g. Testing Ne 30 Weft"
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
            style={{ ...inputStyle, width: '100%' }}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 12, color: 'var(--tx-3)', fontWeight: 500 }}>Description (optional)</label>
          <input
            type="text" value={desc}
            placeholder="Short description"
            onChange={e => setDesc(e.target.value)}
            style={{ ...inputStyle, width: '100%' }}
          />
        </div>

        <p style={{ fontSize: 12, color: 'var(--tx-4)', margin: 0 }}>
          Benchmarks will be pre-filled from current production settings. You can edit them after creation.
        </p>

        {err && <div style={{ fontSize: 12, color: 'var(--bad)' }}>{err}</div>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <SmBtn onClick={onCancel}>Cancel</SmBtn>
          <SmBtn primary onClick={handleCreate} disabled={saving}>{saving ? 'Creating…' : 'Create Trial'}</SmBtn>
        </div>
      </div>
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════════════
   YarnLab — root component
══════════════════════════════════════════════════════════════════════════════ */
export default function YarnLab({ depts }) {
  const [trials,     setTrials]     = useState([])
  const [loading,    setLoading]    = useState(true)
  const [openTrial,  setOpenTrial]  = useState(null)   // trial id currently open
  const [showNew,    setShowNew]    = useState(false)

  const loadTrials = useCallback(async () => {
    setLoading(true)
    try {
      setTrials(await getLabTrials())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadTrials() }, [loadTrials])

  const handleDelete = async (id) => {
    await deleteLabTrial(id)
    await loadTrials()
  }

  if (openTrial !== null) {
    return (
      <TrialDashboard
        trialId={openTrial}
        depts={depts}
        onBack={() => { setOpenTrial(null); loadTrials() }}
      />
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 860, margin: '0 auto', width: '100%' }}>
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: 'var(--claude-bg)', border: '1.5px solid var(--claude-bd)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <FlaskIcon size={22} color="var(--claude)" />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: '-.02em' }}>YarnLAB</h2>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--tx-3)' }}>
              New Count Trial &amp; Quality Sandbox
            </p>
          </div>
        </div>
        <SmBtn primary onClick={() => setShowNew(true)}>+ New Trial Run</SmBtn>
      </div>

      {/* Explainer card */}
      <div style={{
        padding: '12px 16px', borderRadius: 'var(--r-lg)',
        background: 'var(--claude-bg)', border: '1px solid var(--claude-bd)',
        fontSize: 12, color: 'var(--tx-2)', lineHeight: 1.7,
      }}>
        YarnLAB is an isolated sandbox for validating machine readiness before starting mass production of a new yarn count.
        Create a trial, set gold standard benchmarks per department, log test batch readings, and get an instant pass/fail verdict on every machine in the pipeline.
      </div>

      {/* Trials list */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner /></div>
      ) : trials.length === 0 ? (
        <EmptyState onNew={() => setShowNew(true)} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {trials.map(t => (
            <TrialCard key={t.id} trial={t} onOpen={setOpenTrial} onDelete={handleDelete} />
          ))}
        </div>
      )}

      {showNew && (
        <NewTrialModal
          onCreated={id => { setShowNew(false); setOpenTrial(id) }}
          onCancel={() => setShowNew(false)}
        />
      )}
    </div>
  )
}

/* ── Sub-components & atoms ────────────────────────────────────────────────── */
function EmptyState({ onNew }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
      padding: '48px 24px', border: '2px dashed var(--bd)', borderRadius: 'var(--r-lg)',
      color: 'var(--tx-3)', textAlign: 'center',
    }}>
      <FlaskIcon size={36} color="var(--tx-4)" />
      <div>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--tx-2)', marginBottom: 6 }}>No trials yet</div>
        <div style={{ fontSize: 13 }}>Create a trial to begin testing a new yarn count.</div>
      </div>
      <SmBtn primary onClick={onNew}>+ New Trial Run</SmBtn>
    </div>
  )
}

function SectionHead({ children }) {
  return <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--tx)', letterSpacing: '-.01em' }}>{children}</div>
}

function Chip({ children }) {
  return (
    <span style={{
      fontSize: 10, padding: '2px 7px', borderRadius: 4, lineHeight: 1.7,
      background: 'var(--bg-3)', border: '1px solid var(--bd)', color: 'var(--tx-3)',
    }}>{children}</span>
  )
}

function SegCtrl({ opts, value, onChange }) {
  return (
    <div style={{
      display: 'inline-flex', border: '1px solid var(--bd-md)',
      borderRadius: 'var(--r)', overflow: 'hidden',
    }}>
      {opts.map(([v, label]) => (
        <button key={v} onClick={() => onChange(v)}
          style={{
            padding: '5px 12px', fontSize: 12, border: 'none', cursor: 'pointer',
            fontFamily: 'var(--font)', fontWeight: value === v ? 600 : 400, lineHeight: 1,
            background: value === v ? 'var(--bg-active)' : 'var(--bg)',
            color:      value === v ? 'var(--tx)' : 'var(--tx-3)',
            transition: 'all .1s',
          }}>{label}</button>
      ))}
    </div>
  )
}

function SmBtn({ children, onClick, primary, danger, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{
        padding: '6px 14px', fontSize: 12, fontWeight: 500,
        border: `1px solid ${primary ? 'var(--claude)' : danger ? 'var(--bad-bd)' : 'var(--bd-md)'}`,
        borderRadius: 'var(--r)', cursor: disabled ? 'default' : 'pointer',
        fontFamily: 'var(--font)', lineHeight: 1, whiteSpace: 'nowrap',
        background: primary ? 'var(--claude)' : danger ? 'var(--bad-bg)' : 'var(--bg)',
        color:      primary ? '#fff'          : danger ? 'var(--bad)'   : 'var(--tx-2)',
        opacity:    disabled ? .5 : 1,
        transition: 'all .1s',
      }}>
      {children}
    </button>
  )
}

const inputStyle = {
  padding: '6px 10px', fontSize: 12, fontFamily: 'var(--mono)',
  border: '1px solid var(--bd)', borderRadius: 'var(--r)',
  background: 'var(--bg)', color: 'var(--tx)',
  outline: 'none', width: '100%', boxSizing: 'border-box',
  transition: 'border-color .1s',
}

function FlaskIcon({ size = 16, color = 'var(--claude)' }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none"
      stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 3h6M9 3v7L4 18a2 2 0 001.8 2.9h12.4A2 2 0 0020 18l-5-8V3" />
      <circle cx="8" cy="17" r=".8" fill={color} stroke="none" />
      <circle cx="12" cy="15.5" r=".6" fill={color} stroke="none" />
      <circle cx="15.5" cy="18" r=".7" fill={color} stroke="none" />
    </svg>
  )
}
