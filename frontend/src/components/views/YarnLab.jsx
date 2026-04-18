import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  getLabTrials, createLabTrial, updateLabTrial, deleteLabTrial,
  setLabBenchmarks, addLabSample, deleteLabSample, getLabDashboard,
  getLabFlow, saveLabRSB,
  createSimplexBobbin, updateSimplexBobbin, deleteSimplexBobbin,
  createRingframeCop, updateRingframeCop, deleteRingframeCop,
  getInteractionReport,
} from '../../api.js'
import { Spinner, Badge } from '../Primitives.jsx'
import { decimalPlaces, weightToHank, hankToWeight } from '../../api.js'

/* ── Colour maps ──────────────────────────────────────────────────────────── */
const V_COLOR = { pass: 'var(--ok)', warn: 'var(--warn)', fail: 'var(--bad)', pending: 'var(--tx-4)' }
const V_BG = { pass: 'var(--ok-bg)', warn: 'var(--warn-bg)', fail: 'var(--bad-bg)', pending: 'var(--bg-3)' }
const V_BD = { pass: 'var(--ok-bd)', warn: 'var(--warn-bd)', fail: 'var(--bad-bd)', pending: 'var(--bd)' }
const V_LABEL = { pass: 'PASS', warn: 'MARGINAL', fail: 'FAIL', pending: 'PENDING' }
const V_ICON = { pass: '✓', warn: '▲', fail: '✕', pending: '…' }

/* ── Ordered dept list ───────────────────────────────────────────────────── */
const DEPT_ORDER = ['rsb', 'simplex', 'ringframe']
const RSB_READING_COUNT = 3
const SIMPLEX_READING_COUNT = 3
const RING_READING_COUNT = 5
const DEFAULT_LENGTHS = {
  rsb: 6,
  simplex: 6,
  ringframe: 120,
}
const STATUS_BG = {
  perfect: 'var(--ok-bg)',
  faulty: 'var(--bad-bg)',
  pending: 'var(--bg-2)',
}
const STATUS_BORDER = {
  perfect: 'var(--ok-bd)',
  faulty: 'var(--bad-bd)',
  pending: 'var(--bd)',
}
const STATUS_META = {
  perfect: { label: 'Perfect', color: 'var(--ok)' },
  faulty: { label: 'Faulty', color: 'var(--bad)' },
  pending: { label: 'Pending', color: 'var(--tx-3)' },
}
const STAGE_LABEL = {
  rsb: 'RSB',
  simplex: 'Simplex',
  ringframe: 'Ring Frame',
}

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
    day: '2-digit', month: 'short', year: 'numeric',
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
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--bd)'; e.currentTarget.style.boxShadow = 'none' }}
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
            color: trial.status === 'complete' ? 'var(--ok)' : 'var(--tx-3)',
            border: `1px solid ${trial.status === 'complete' ? 'var(--ok-bd)' : 'var(--bd)'}`,
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
      dept_id: d.dept_id,
      dept_name: d.dept_name,
      target: String(d.benchmark.target),
      tolerance: String(d.benchmark.tolerance),
    }))
  )
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

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
        dept_id: r.dept_id,
        target: parseFloat(r.target),
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
  const [deptId, setDeptId] = useState(depts[0]?.dept_id ?? '')
  const [readings, setReadings] = useState(Array(9).fill(''))
  const [mode, setMode] = useState('direct')
  const [sampleLen, setSampleLen] = useState(6)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const dept = depts.find(d => d.dept_id === deptId)
  const target = dept?.benchmark?.target ?? 1
  const p = decimalPlaces(target)
  const usl = dept?.benchmark?.usl ?? (target + 0.1)
  const lsl = dept?.benchmark?.lsl ?? (target - 0.1)

  const liveHanks = readings
    .map(v => parseFloat(v)).filter(v => !isNaN(v) && v > 0)
    .map(v => mode === 'weight' ? weightToHank(v, sampleLen) : v)

  const liveN = liveHanks.length
  const liveMean = liveN >= 1 ? liveHanks.reduce((a, b) => a + b, 0) / liveN : null
  const inSpec = liveMean != null ? liveMean >= lsl && liveMean <= usl : null

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
              background: deptId === d.dept_id ? 'var(--claude)' : 'transparent',
              color: deptId === d.dept_id ? '#fff' : 'var(--tx-2)',
              borderColor: deptId === d.dept_id ? 'var(--claude)' : 'var(--bd-md)',
            }}>{d.dept_name}</button>
        ))}
      </div>

      {/* Mode + length */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <SegCtrl
          opts={[['direct', 'Direct Hank'], ['weight', 'By Weight']]}
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
          const h = !isNaN(num) && num > 0 ? (mode === 'weight' ? weightToHank(num, sampleLen) : num) : null
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
                  background: bad ? 'var(--bad-bg)' : h != null ? 'var(--ok-bg)' : 'var(--bg)',
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
  const v = dept.verdict
  const bench = dept.benchmark
  const result = dept.result
  const p = decimalPlaces(bench.target)
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
                {new Date(s.timestamp).toLocaleString('en-GB', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })}
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
   FlowBoard — simple drag-and-drop with connection identifiers
══════════════════════════════════════════════════════════════════════════════ */
function FlowBoard({ trialId, flow, loading, refreshFlow }) {
  useEffect(() => {
    const handleDragOver = (e) => {
      const edge = 100;
      const container = document.getElementById('main-scroll-container') || window;
      if (e.clientY < edge) {
        container.scrollBy(0, -15);
      } else if (window.innerHeight - e.clientY < edge) {
        container.scrollBy(0, 15);
      }
    };
    window.addEventListener('dragover', handleDragOver);
    return () => window.removeEventListener('dragover', handleDragOver);
  }, []);

  // Hooks must run every render — never place these after a conditional return.
  // refreshFlow() toggles loading; skipping useMemo on the loading frame used to
  // change hook order and crash React ("Rendered more hooks than previous render").
  const rootCause = useMemo(
    () => (flow ? findRootCause(flow) : null),
    [flow],
  )

  const { canFeedsTo, bobbinFeedsTo } = useMemo(() => {
    const canMap = new Map()
    const bobbinMap = new Map()
    const bobbins = flow?.simplex?.bobbins
    const cops = flow?.ringframe?.cops
    if (!Array.isArray(bobbins) || !Array.isArray(cops)) {
      return { canFeedsTo: canMap, bobbinFeedsTo: bobbinMap }
    }
    for (const bobbin of bobbins) {
      for (const can of (bobbin.rsb_cans || [])) {
        if (!canMap.has(can.id)) canMap.set(can.id, [])
        canMap.get(can.id).push(bobbin.label)
      }
    }
    for (const cop of cops) {
      for (const bobbin of (cop.simplex_bobbins || [])) {
        if (!bobbinMap.has(bobbin.id)) bobbinMap.set(bobbin.id, [])
        bobbinMap.get(bobbin.id).push(cop.label)
      }
    }
    return { canFeedsTo: canMap, bobbinFeedsTo: bobbinMap }
  }, [flow])

  // Keep the board mounted during background refreshes.
  // Unmounting here can destroy child component state mid-interaction.
  if (!flow) {
    return (
      <div style={{
        border: '1px solid var(--bd)', borderRadius: 'var(--r-lg)',
        padding: 24, background: 'var(--bg-2)', display: 'flex', justifyContent: 'center',
      }}>
        <Spinner />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <SectionHead>RSB → Simplex → Ring Frame Traceability</SectionHead>
      <p style={{ margin: 0, fontSize: 12, color: 'var(--tx-3)' }}>
        Complete the full flow within a shift by sampling five cans, verifying simplex bobbins (3-reading parity),
        and linking ring frame cops. Drag cans onto bobbins, then bobbins onto cops for full lineage.
      </p>
      {loading && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          fontSize: 11, color: 'var(--tx-4)',
          padding: '6px 10px', borderRadius: 'var(--r)',
          border: '1px solid var(--bd)', background: 'var(--bg-2)',
          width: 'fit-content',
        }}>
          <span style={{ display: 'inline-flex' }}><Spinner /></span>
          Refreshing…
        </div>
      )}
      <RootCauseBanner alert={rootCause} />
      <div style={{
        display: 'grid', gap: 12,
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
      }}>
        <RSBPanel trialId={trialId} cans={flow.rsb?.cans ?? []} refreshFlow={refreshFlow} canFeedsTo={canFeedsTo} />
        <SimplexPanel
          trialId={trialId}
          bobbins={flow.simplex?.bobbins ?? []}
          refreshFlow={refreshFlow}
          bobbinFeedsTo={bobbinFeedsTo}
        />
        <RingFramePanel
          trialId={trialId}
          cops={flow.ringframe?.cops ?? []}
          refreshFlow={refreshFlow}
        />
      </div>
    </div>
  )
}

/* ── Connection badge ── */
function ConnectionTag({ direction, items, color }) {
  if (!items || items.length === 0) return null
  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center',
      padding: '4px 0',
    }}>
      <span style={{ fontSize: 10, fontWeight: 600, color: color || 'var(--tx-3)' }}>
        {direction}
      </span>
      {items.map((label, i) => (
        <span key={i} style={{
          display: 'inline-flex', alignItems: 'center', gap: 2,
          padding: '1px 7px', borderRadius: 10, fontSize: 10, fontWeight: 600,
          background: 'var(--claude-bg)', border: '1px solid var(--claude-bd)',
          color: 'var(--claude)',
        }}>
          {label}
        </span>
      ))}
    </div>
  )
}





function findRootCause(flow) {
  if (!flow?.simplex?.bobbins || !flow?.ringframe?.cops || !flow?.rsb?.cans) return null
  const simplexMap = new Map(flow.simplex.bobbins.map(b => [b.id, b]))

  for (const cop of flow.ringframe.cops) {
    if (cop.status !== 'faulty') continue
    const linkedBobbins = (cop.simplex_bobbin_ids || [])
      .map(id => simplexMap.get(id))
      .filter(Boolean)
    const incomingBobbinsCv = linkedBobbins.length ?
      linkedBobbins.reduce((a, b) => a + (b.cv_pct || 0), 0) / linkedBobbins.length : 0

    const upstreamCans = linkedBobbins.flatMap(b => b?.rsb_cans ?? [])
    const incomingCansCv = upstreamCans.length ?
      upstreamCans.reduce((a, b) => a + (b.cv_pct || 0), 0) / upstreamCans.length : 0

    const addedSimplex = Math.sqrt(Math.max(0, Math.pow(incomingBobbinsCv, 2) - Math.pow(incomingCansCv, 2)))
    const addedRingFrame = Math.sqrt(Math.max(0, Math.pow(cop.cv_pct || 0, 2) - Math.pow(incomingBobbinsCv, 2)))

    if (addedSimplex > addedRingFrame && addedSimplex > 1.5) {
      return {
        stage: 'simplex',
        message: `Variation originated at Simplex. It added a massive variation of ${addedSimplex.toFixed(2)}%.`,
        context: `Calculated Added Irregularity: sqrt(${incomingBobbinsCv.toFixed(2)}^2 - ${incomingCansCv.toFixed(2)}^2) = ${addedSimplex.toFixed(2)}%. Fix simplex settings.`,
      }
    } else if (addedRingFrame >= addedSimplex && addedRingFrame > 1.5) {
      return {
        stage: 'ringframe',
        message: `Variation originated at Ring Frame. It added a massive variation of ${addedRingFrame.toFixed(2)}%.`,
        context: `Calculated Added Irregularity: sqrt(${(cop.cv_pct || 0).toFixed(2)}^2 - ${incomingBobbinsCv.toFixed(2)}^2) = ${addedRingFrame.toFixed(2)}%. Check ring frame components.`,
      }
    } else {
      const faultyCan = upstreamCans.find(can => can.status === 'faulty')
      if (faultyCan) {
        return {
          stage: 'rsb',
          message: `Variation drifted down from RSB. ${faultyCan.label} caused downstream failures.`,
          context: `${cop.label} inherited bad sliver directly from ${faultyCan.label}.`,
        }
      }
      return {
        stage: 'ringframe',
        message: `Variation originated at Ring Frame. ${cop.label} deviated without massive single-stage drift.`,
        context: linkedBobbins.length ? `Linked bobbins: ${linkedBobbins.map(b => b.label).join(', ')}` : null,
      }
    }
  }

  const faultyBobbin = flow.simplex.bobbins.find(b => b.status === 'faulty')
  if (faultyBobbin) {
    const incomingCansCv = faultyBobbin.rsb_cans?.length ?
      faultyBobbin.rsb_cans.reduce((a, b) => a + (b.cv_pct || 0), 0) / faultyBobbin.rsb_cans.length : 0
    const addedSimplex = Math.sqrt(Math.max(0, Math.pow(faultyBobbin.cv_pct || 0, 2) - Math.pow(incomingCansCv, 2)))

    if (addedSimplex > 1.5) {
      return {
        stage: 'simplex',
        message: `Variation originated at Simplex. Added variation of ${addedSimplex.toFixed(2)}%.`,
        context: `Calculated Added Irregularity vs RSB is massive. Check drafting settings.`,
      }
    }

    const faultyCan = faultyBobbin.rsb_cans?.find(c => c.status === 'faulty')
    if (faultyCan) {
      return {
        stage: 'rsb',
        message: `Variation originated at RSB. ${faultyCan.label} is red feeding ${faultyBobbin.label}.`,
        context: 'Fix the sliver source before restarting the simplex run.',
      }
    }
    return {
      stage: 'simplex',
      message: `Variation originated at Simplex. Incoming sliver is perfect but ${faultyBobbin.label} is red.`,
      context: 'Check drafting settings / hank parity before moving to ring frame.',
    }
  }

  const faultyCan = flow.rsb.cans.find(c => c.status === 'faulty')
  if (faultyCan) {
    return {
      stage: 'rsb',
      message: `Variation originated at RSB. ${faultyCan.label} is out of tolerance.`,
      context: 'Downstream machines cannot start until all sampled cans are green.',
    }
  }

  return null
}

function RootCauseBanner({ alert }) {
  if (!alert) return null
  return (
    <div style={{
      border: '1.5px solid var(--bad-bd)',
      background: 'var(--bad-bg)',
      borderRadius: 'var(--r)',
      padding: '10px 14px',
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--bad)' }}>
        Root Cause Alert · {STAGE_LABEL[alert.stage] ?? alert.stage?.toUpperCase()}
      </div>
      <div style={{ fontSize: 13, color: 'var(--tx)' }}>{alert.message}</div>
      {alert.context && <div style={{ fontSize: 11, color: 'var(--tx-3)' }}>{alert.context}</div>}
    </div>
  )
}

const buildReadings = (source = [], count) => {
  const arr = Array(count).fill('')
  if (Array.isArray(source)) {
    source.slice(0, count).forEach((val, idx) => { arr[idx] = val ?? '' })
  }
  return arr
}

const toHanks = (weights, sampleLength) =>
  weights
    .map(v => parseFloat(v))
    .filter(v => !Number.isNaN(v) && v > 0)
    .map(weight => weightToHank(weight, sampleLength))

function normalizeCan(can) {
  const readings = buildReadings(can.readings, RSB_READING_COUNT)
  return {
    ...can,
    notes: can.notes ?? '',
    readings,
    status: can.status ?? 'pending',
    readings_count: can.readings_count ?? can.readings?.length ?? 0,
    mean_hank: can.mean_hank ?? null,
    cv_pct: can.cv_pct ?? null,
  }
}

function calcReadingPreview(weights, sampleLength) {
  const weightNums = weights.map(v => parseFloat(v)).filter(v => !Number.isNaN(v) && v > 0)
  const nums = toHanks(weights, sampleLength)
  if (nums.length < 1) return null
  const avgWeight = weightNums.length > 0 ? weightNums.reduce((a, b) => a + b, 0) / weightNums.length : 0
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length
  if (mean <= 0) return null
  const variance = nums.length >= 2 ? nums.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (nums.length - 1) : 0
  const sd = Math.sqrt(variance)
  const cv = (sd / mean) * 100
  return { mean, cv, avgWeight }
}

function RSBPanel({ trialId, cans, refreshFlow, canFeedsTo }) {
  const [draft, setDraft] = useState(() => cans.map(normalizeCan))
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    setDraft(cans.map(normalizeCan))
    setDirty(false)
    setErr('')
  }, [cans])

  const update = (slot, field, value) => {
    setDraft(rows => rows.map(r => (r.slot === slot ? { ...r, [field]: value } : r)))
    setDirty(true)
  }

  const updateReading = (slot, idx, value) => {
    setDraft(rows => rows.map(r => {
      if (r.slot !== slot) return r
      const readings = r.readings.slice()
      readings[idx] = value
      return { ...r, readings }
    }))
    setDirty(true)
  }

  const handleAddCan = () => {
    // Backend currently auto-ensures slots 1..5 for each trial.
    // So "Add" means re-introducing a removed slot (up to 5 total).
    const used = new Set(draft.map(c => c.slot))
    const nextSlot = Array.from({ length: 10 }, (_, i) => i + 1).find(s => !used.has(s))
    if (!nextSlot) return
    setDraft(rows => ([
      ...rows,
      normalizeCan({
        id: `new-slot-${nextSlot}`,
        slot: nextSlot,
        label: `Can ${nextSlot}`,
        is_perfect: false,
        sample_length: DEFAULT_LENGTHS.rsb,
        readings: [],
        readings_count: 0,
        mean_hank: null,
        cv_pct: null,
        notes: '',
        status: 'pending',
      }),
    ].sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0))))
    setDirty(true)
  }

  const handleDeleteCanLocal = (slot) => {
    setDraft(rows => rows.filter(r => r.slot !== slot))
    setDirty(true)
  }

  const handleSave = async () => {
    const invalid = draft.some(can => {
      const filled = can.readings.filter(v => v !== '' && !Number.isNaN(parseFloat(v)))
      return filled.length !== 0 && filled.length !== 3
    })
    if (invalid) {
      setErr('Enter exactly 3 readings per can (or clear all inputs).')
      return
    }
    setErr('')
    setSaving(true)
    try {
      const payload = draft.map(c => {
        const weights = c.readings
          .map(v => parseFloat(v))
          .filter(v => !Number.isNaN(v) && v > 0)
        return {
          slot: c.slot,
          notes: c.notes ? c.notes.trim() : null,
          is_perfect: Boolean(c.is_perfect),
          sample_length: c.sample_length || 6,
          readings: weights.length === RSB_READING_COUNT ? weights : [],
        }
      })
      await saveLabRSB(trialId, payload)
      await refreshFlow()
      setDirty(false)
    } catch (e) {
      setErr(e?.response?.data?.detail || e.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleDrag = (e, id) => {
    e.dataTransfer.setData('application/x-rsb-can', String(id))
    e.dataTransfer.effectAllowed = 'copy'
  }

  return (
    <div style={{ border: '1.5px solid var(--bd)', borderRadius: 'var(--r-lg)', padding: 16, background: 'var(--bg)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx)' }}>RSB Sampling</div>
          <div style={{ fontSize: 11, color: 'var(--tx-4)' }}>{draft.length} cans · ~{draft.length * 7} minutes total</div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <SmBtn onClick={handleAddCan} disabled={saving || draft.length >= 10}>+ Add Can</SmBtn>
          <SmBtn primary onClick={handleSave} disabled={saving || !dirty}>
            {saving ? 'Saving…' : 'Save'}
          </SmBtn>
        </div>
      </div>
      <FormulaNote length={DEFAULT_LENGTHS.rsb} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {draft.map(can => {
          const status = can.status ?? 'pending'
          return (
            <div key={can.id}
              style={{
                border: `1px solid ${STATUS_BORDER[status] ?? 'var(--bd)'}`,
                borderRadius: 'var(--r)',
                padding: 10,
                background: STATUS_BG[status] ?? 'var(--bg-2)',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx)' }}>
                  Can {can.slot}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button
                    onClick={() => handleDeleteCanLocal(can.slot)}
                    title="Remove this can from the batch (local only)"
                    style={{
                      border: 'none',
                      background: 'transparent',
                      cursor: 'pointer',
                      color: 'var(--tx-4)',
                      fontSize: 12,
                      padding: '2px 6px',
                      borderRadius: 6,
                    }}
                  >
                    ✕
                  </button>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--tx-3)' }}>
                    <input type="checkbox" checked={!!can.is_perfect}
                      onChange={e => update(can.slot, 'is_perfect', e.target.checked)}
                    />
                    Perfect
                  </label>
                  <span
                    draggable
                    onDragStart={e => handleDrag(e, can.id)}
                    style={{ cursor: 'grab', fontSize: 12, color: 'var(--tx-4)' }}
                    title="Drag to Simplex"
                  >
                    ⇄
                  </span>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                {can.readings.map((val, idx) => {
                  const weight = parseFloat(val)
                  const hank = !Number.isNaN(weight) && weight > 0
                    ? weightToHank(weight, can.sample_length || DEFAULT_LENGTHS.rsb)
                    : null
                  return (
                    <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <input
                        type="number" step="any" placeholder={`Weight ${idx + 1} (g)`}
                        value={val}
                        onChange={e => updateReading(can.slot, idx, e.target.value)}
                        style={{ ...inputStyle, background: 'var(--bg)' }}
                      />
                      <span style={{ fontSize: 10, color: 'var(--tx-3)' }}>
                        → Hank {hank ? hank.toFixed(4) : '—'}
                      </span>
                    </div>
                  )
                })}
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  type="number" step="any" placeholder="Sample length (yds)"
                  value={can.sample_length ?? 6}
                  onChange={e => {
                    const val = parseFloat(e.target.value)
                    update(can.slot, 'sample_length', Number.isNaN(val) ? 6 : val)
                  }}
                  style={{ ...inputStyle, width: 130 }}
                />
                <input
                  type="text" placeholder="Notes"
                  value={can.notes ?? ''}
                  onChange={e => update(can.slot, 'notes', e.target.value)}
                  style={{ ...inputStyle, background: 'var(--bg)', flex: 1 }}
                />
              </div>
              <ReadingSummary can={can} />
              <span style={{ fontSize: 10, color: 'var(--tx-4)' }}>Drag to Simplex once readings are saved</span>
              <ConnectionTag direction="Feeds →" items={canFeedsTo?.get(can.id)} color="var(--ok)" />
            </div>
          )
        })}
        {err && <div style={{ fontSize: 12, color: 'var(--bad)' }}>{err}</div>}
      </div>
    </div>
  )
}

function ReadingSummary({ can }) {
  const preview = calcReadingPreview(can.readings, can.sample_length ?? DEFAULT_LENGTHS.rsb)
  if (!preview && !can.mean_hank) return null
  const mean = preview?.mean ?? can.mean_hank
  const cv = preview?.cv ?? can.cv_pct
  const avgW = preview?.avgWeight
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap',
      fontSize: 11, padding: '6px 8px', borderRadius: 'var(--r)',
      background: 'var(--ok-bg)', border: '1px solid var(--ok-bd)', color: 'var(--ok)'
    }}>
      <span style={{ fontWeight: 600 }}>Live Hank (x̄): {mean ? mean.toFixed(4) : '—'}</span>
      {avgW ? <span style={{ fontWeight: 600 }}>Avg Weight: {avgW.toFixed(3)}g</span> : null}
      <span>CV: {cv != null ? cv.toFixed(2) : '—'}%</span>
      <span>Len: {can.sample_length ?? 6} yds</span>
      <span style={{ color: 'var(--ok-bg)', padding: '0 4px', background: 'var(--ok)', borderRadius: 12 }}>
        {can.readings_count ?? can.readings.filter(v => v).length}/{RSB_READING_COUNT}
      </span>
    </div>
  )
}



function MiniSummary({ readings, savedMean, savedCv, expected, sampleLength }) {
  const preview = calcReadingPreview(readings, sampleLength ?? DEFAULT_LENGTHS.rsb)
  if (!preview && !savedMean) return null
  const mean = preview?.mean ?? savedMean
  const cv = preview?.cv ?? savedCv
  const avgW = preview?.avgWeight
  const len = sampleLength ? parseFloat(sampleLength) : null
  return (
    <div style={{
      display: 'flex', gap: 8, fontSize: 11, flexWrap: 'wrap',
      border: '1px solid var(--ok-bd)', borderRadius: 'var(--r)',
      padding: '6px 8px', background: 'var(--ok-bg)', color: 'var(--ok)'
    }}>
      <span style={{ fontWeight: 600 }}> Live Hank (x̄): {mean ? mean.toFixed(4) : '—'} </span>
      {avgW ? <span style={{ fontWeight: 600 }}> Avg Weight: {avgW.toFixed(3)}g </span> : null}
      <span> CV: {cv != null ? cv.toFixed(2) : '—'}% </span>
      {len ? <span> Len: {len} yds </span> : null}
      <span style={{ color: 'var(--ok-bg)', padding: '0 4px', background: 'var(--ok)', borderRadius: 12 }}>
        {(readings?.filter(v => v !== '').length ?? 0)}/{expected}
      </span>
    </div>
  )
}

function FormulaNote({ length }) {
  return (
    <div style={{
      fontSize: 11, color: 'var(--tx-3)', padding: '6px 8px',
      border: '1px dashed var(--bd)', borderRadius: 'var(--r)', marginBottom: 8,
    }}>
      Formula: Ne = (L × 0.54) / W &nbsp;·&nbsp; default L = {length} yds
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════════════
   SimplexPanel — groups bobbins by Simplex machine number (1–3 + Unassigned)
══════════════════════════════════════════════════════════════════════════════ */
function SimplexPanel({ trialId, bobbins, refreshFlow, bobbinFeedsTo }) {
  const [busyId, setBusyId] = useState(null)

  // Group bobbins by machine_number (null → unassigned)
  const groups = useMemo(() => {
    const map = new Map([[1, []], [2, []], [3, []], [null, []]])
    for (const b of bobbins) {
      const key = b.machine_number ?? null
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(b)
    }
    return map
  }, [bobbins])

  const handleAdd = async (machineNum) => {
    const key = `new-${machineNum}`
    setBusyId(key)
    try {
      await createSimplexBobbin(trialId, {
        label: 'Bobbin ' + (bobbins.length + 1),
        sample_length: DEFAULT_LENGTHS.simplex,
        readings: [],
        rsb_can_ids: [],
        machine_number: machineNum,
      })
      await refreshFlow()
    } finally {
      setBusyId(null)
    }
  }

  const handleAddWithCan = async (machineNum, canId) => {
    try {
      await createSimplexBobbin(trialId, {
        label: 'Bobbin ' + (bobbins.length + 1),
        sample_length: DEFAULT_LENGTHS.simplex,
        readings: [],
        rsb_can_ids: canId ? [canId] : [],
        machine_number: machineNum,
      })
      await refreshFlow()
    } catch { /* swallow — parent rerenders on next refresh */ }
  }

  const handleUpdate = async (id, body) => {
    setBusyId(id)
    try {
      await updateSimplexBobbin(id, body)
      await refreshFlow()
    } finally {
      setBusyId(null)
    }
  }

  const handleDelete = async (id) => {
    setBusyId(id)
    try {
      await deleteSimplexBobbin(id)
      await refreshFlow()
    } finally {
      setBusyId(null)
    }
  }

  const hasUnassigned = (groups.get(null) ?? []).length > 0

  return (
    <div style={{ border: '1.5px solid var(--bd)', borderRadius: 'var(--r-lg)', padding: 16, background: 'var(--bg)' }}>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx)' }}>Simplex</div>
        <div style={{ fontSize: 11, color: 'var(--tx-4)' }}>Grouped by machine · 3 readings per bobbin</div>
      </div>
      <FormulaNote length={DEFAULT_LENGTHS.simplex} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[1, 2, 3].map(mn => (
          <SimplexMachineCard
            key={mn}
            machineNum={mn}
            bobbins={groups.get(mn) ?? []}
            busyId={busyId}
            trialId={trialId}
            onAdd={() => handleAdd(mn)}
            onAddWithCan={(canId) => handleAddWithCan(mn, canId)}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
            bobbinFeedsTo={bobbinFeedsTo}
          />
        ))}
        {hasUnassigned && (
          <SimplexMachineCard
            machineNum={null}
            bobbins={groups.get(null) ?? []}
            busyId={busyId}
            trialId={trialId}
            onAdd={() => handleAdd(null)}
            onAddWithCan={(canId) => handleAddWithCan(null, canId)}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
            bobbinFeedsTo={bobbinFeedsTo}
          />
        )}
      </div>
    </div>
  )
}

function SimplexMachineCard({ machineNum, bobbins, busyId, trialId, onAdd, onAddWithCan, onUpdate, onDelete, bobbinFeedsTo }) {
  const [collapsed, setCollapsed] = useState(false)
  const newKey = `new-${machineNum}`
  const machineLabel = machineNum != null ? `Simplex M/c #${machineNum}` : 'Unassigned'

  const handleMachineDrop = async (e) => {
    e.preventDefault()
    const canId = parseInt(e.dataTransfer.getData('application/x-rsb-can'), 10)
    if (!canId) return
    await onAddWithCan(canId)
  }

  return (
    <div style={{
      border: '1px solid var(--bd-md)', borderRadius: 'var(--r)',
      background: 'var(--bg-2)', overflow: 'hidden',
    }}>
      {/* Collapsible header */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 12px', cursor: 'pointer',
          borderBottom: collapsed ? 'none' : '1px solid var(--bd)',
        }}
        onClick={() => setCollapsed(c => !c)}
      >
        <span style={{ fontSize: 10, color: 'var(--tx-4)', userSelect: 'none' }}>
          {collapsed ? '▶' : '▼'}
        </span>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx)', flex: 1 }}>{machineLabel}</span>
        <span style={{ fontSize: 11, color: 'var(--tx-4)' }}>
          {bobbins.length} {bobbins.length === 1 ? 'bobbin' : 'bobbins'}
        </span>
        <SmBtn primary onClick={e => { e.stopPropagation(); onAdd() }} disabled={busyId === newKey}>
          {busyId === newKey ? 'Adding…' : '+ Add Bobbin'}
        </SmBtn>
      </div>

      {!collapsed && (
        <div style={{ padding: 10 }}>
          {/* RSB can drop zone — creates a new bobbin for this machine, pre-linked to the dropped can */}
          <div
            onDragOver={e => e.preventDefault()}
            onDrop={handleMachineDrop}
            style={{
              border: '1px dashed var(--bd)', borderRadius: 'var(--r)',
              padding: '6px 10px', marginBottom: 8,
              fontSize: 11, color: 'var(--tx-4)', textAlign: 'center',
              background: 'var(--bg)',
            }}
          >
            Drop RSB can here to add a new bobbin to {machineLabel}
          </div>

          {bobbins.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--tx-3)', textAlign: 'center', padding: '8px 0' }}>
              No bobbins yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {bobbins.map(b => (
                <SimplexCard
                  key={b.id}
                  bobbin={b}
                  machineNum={machineNum}
                  busy={busyId === b.id}
                  onUpdate={onUpdate}
                  onDelete={onDelete}
                  bobbinFeedsTo={bobbinFeedsTo}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function SimplexCard({ bobbin, machineNum, busy, onUpdate, onDelete, bobbinFeedsTo }) {
  const [form, setForm] = useState(() => ({
    notes: bobbin.notes ?? '',
    verified: bobbin.verified_same_hank,
    sampleLength: bobbin.sample_length ?? DEFAULT_LENGTHS.simplex,
    readings: buildReadings(bobbin.readings, SIMPLEX_READING_COUNT),
  }))

  useEffect(() => {
    setForm({
      notes: bobbin.notes ?? '',
      verified: bobbin.verified_same_hank,
      sampleLength: bobbin.sample_length ?? DEFAULT_LENGTHS.simplex,
      readings: buildReadings(bobbin.readings, SIMPLEX_READING_COUNT),
    })
  }, [bobbin])

  const status = bobbin.status ?? 'pending'
  const statusMeta = STATUS_META[status] ?? STATUS_META.pending

  const buildCompletePayload = (overrides = {}) => {
    const currentReadings = Array.isArray(bobbin.readings) ? bobbin.readings : []
    return {
      label: bobbin.label,
      hank_value: bobbin.hank_value ?? bobbin.mean_hank ?? null,
      notes: bobbin.notes ?? null,
      verified_same_hank: Boolean(bobbin.verified_same_hank),
      doff_minutes: bobbin.doff_minutes ?? 180,
      sample_length: bobbin.sample_length ?? DEFAULT_LENGTHS.simplex,
      readings: currentReadings,
      rsb_can_ids: bobbin.rsb_can_ids || (bobbin.rsb_cans || []).map(c => c.id),
      machine_number: machineNum ?? null,
      ...overrides,
    }
  }

  const handleSave = async () => {
    const weights = form.readings
      .map(v => parseFloat(v))
      .filter(v => !Number.isNaN(v) && v > 0)
    const validWeights = weights.length === SIMPLEX_READING_COUNT ? weights : []
    const hankReadings = validWeights.length
      ? toHanks(validWeights, form.sampleLength || DEFAULT_LENGTHS.simplex)
      : []
    await onUpdate(bobbin.id, buildCompletePayload({
      // Save is the only place we intentionally apply the in-progress form edits.
      hank_value: hankReadings.length ? hankReadings.reduce((a, b) => a + b, 0) / hankReadings.length : null,
      notes: form.notes ? form.notes.trim() : null,
      verified_same_hank: form.verified,
      sample_length: form.sampleLength || DEFAULT_LENGTHS.simplex,
      readings: validWeights,
    }))
  }

  const handleDrop = async (e) => {
    e.preventDefault()
    const id = parseInt(e.dataTransfer.getData('application/x-rsb-can'), 10)
    const existingIds = bobbin.rsb_can_ids || (bobbin.rsb_cans || []).map(c => c.id)
    if (!id || existingIds.includes(id)) return
    await onUpdate(bobbin.id, buildCompletePayload({ rsb_can_ids: [...existingIds, id] }))
  }

  const removeCan = async (id) => {
    const existingIds = bobbin.rsb_can_ids || (bobbin.rsb_cans || []).map(c => c.id)
    await onUpdate(bobbin.id, buildCompletePayload({ rsb_can_ids: existingIds.filter(cid => cid !== id) }))
  }

  const handleDragStart = (e) => {
    e.dataTransfer.setData('application/x-simplex-bobbin', String(bobbin.id))
    e.dataTransfer.setData('application/x-simplex-bobbin-label', String(bobbin.label || 'Bobbin'))
    e.dataTransfer.setData('application/x-simplex-bobbin-machine', String(machineNum ?? ''))
    e.dataTransfer.effectAllowed = 'copy'
  }


  return (
    <div
      style={{
        border: `1px solid ${STATUS_BORDER[status] ?? 'var(--bd)'}`,
        borderRadius: 'var(--r)',
        padding: 12,
        background: STATUS_BG[status] ?? 'var(--bg-2)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          draggable
          onDragStart={handleDragStart}
          style={{ cursor: 'grab', fontSize: 12, color: 'var(--tx-4)' }}
          title="Drag to Ring Frame"
        >
          ⇄
        </span>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx)' }}>{bobbin.label}</div>
        <span style={{
          fontSize: 10, fontWeight: 600, color: statusMeta.color,
          padding: '2px 6px', borderRadius: 12,
          border: `1px solid ${STATUS_BORDER[status] ?? 'var(--bd)'}`,
          background: 'var(--bg)',
        }}>
          {statusMeta.label}
        </span>
        {bobbin.verified_same_hank && <Badge variant="ok">Hank ok</Badge>}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <SmBtn onClick={() => onDelete(bobbin.id)} disabled={busy}>✕</SmBtn>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
        {form.readings.map((v, idx) => {
          const weight = parseFloat(v)
          const hank = !Number.isNaN(weight) && weight > 0
            ? weightToHank(weight, form.sampleLength || DEFAULT_LENGTHS.simplex)
            : null
          return (
            <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <input
                type="number" step="any" placeholder={`Weight ${idx + 1} (g)`}
                value={v}
                onChange={e => setForm(f => {
                  const arr = f.readings.slice()
                  arr[idx] = e.target.value
                  return { ...f, readings: arr }
                })}
                style={{ ...inputStyle }}
              />
              <span style={{ fontSize: 10, color: 'var(--tx-3)' }}>→ Hank {hank ? hank.toFixed(4) : '—'}</span>
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 10, color: 'var(--tx-4)', fontWeight: 600 }}>Sample length (yds)</span>
            <input
              type="number" step="0.1" min="1"
              value={form.sampleLength}
              onChange={e => {
                const val = parseFloat(e.target.value)
                setForm(f => ({ ...f, sampleLength: Number.isNaN(val) || val <= 0 ? DEFAULT_LENGTHS.simplex : val }))
              }}
              style={{ ...inputStyle, width: 120 }}
            />
          </div>
          <span style={{ fontSize: 11, color: 'var(--tx-4)' }}>Ne = (L × 0.54) / W</span>
        </div>
      </div>
      <textarea
        rows={2}
        placeholder="Internal notes"
        value={form.notes}
        onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
        style={{ ...inputStyle, resize: 'none' }}
      />
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--tx-3)' }}>
        <input type="checkbox" checked={form.verified}
          onChange={e => setForm(f => ({ ...f, verified: e.target.checked }))}
        />
        Output matches RSB hank
      </label>
      <div
        onDragOver={e => e.preventDefault()}
        onDrop={handleDrop}
        style={{
          border: '1px dashed var(--bd)', borderRadius: 'var(--r)', padding: 8,
          minHeight: 46, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center',
          background: 'var(--bg)',
        }}>
        {(bobbin.rsb_cans || []).length === 0 ? (
          <span style={{ fontSize: 11, color: 'var(--tx-4)' }}>Drop RSB cans here</span>
        ) : (bobbin.rsb_cans || []).map(can => (
          <span key={can.id} style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '2px 6px', borderRadius: 12, background: 'var(--bg-2)',
            border: '1px solid var(--bd)', fontSize: 11,
          }}>
            {can.slot ? `Can ${can.slot}` : can.label}
            <button onClick={() => removeCan(can.id)}
              style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--tx-4)' }}>
              ×
            </button>
          </span>
        ))}
      </div>
      <MiniSummary
        readings={form.readings}
        savedMean={bobbin.mean_hank}
        savedCv={bobbin.cv_pct}
        expected={SIMPLEX_READING_COUNT}
        sampleLength={form.sampleLength || DEFAULT_LENGTHS.simplex}
      />
      <ConnectionTag direction="Fed by ←" items={(bobbin.rsb_cans || []).map(c => c.slot ? `Can ${c.slot}` : c.label)} color="var(--tx-3)" />
      <ConnectionTag direction="Feeds →" items={bobbinFeedsTo?.get(bobbin.id)} color="var(--ok)" />
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <SmBtn primary onClick={handleSave} disabled={busy}>
          {busy ? 'Saving…' : 'Save Bobbin'}
        </SmBtn>
      </div>
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════════════
   RingFramePanel — groups cops into collapsible FrameCards (one per machine)
══════════════════════════════════════════════════════════════════════════════ */
function RingFramePanel({ trialId, cops, refreshFlow }) {
  const [busyId, setBusyId] = useState(null)
  // localFrames tracks freshly-added UI frames that have no cops yet
  const [localFrames, setLocalFrames] = useState([])

  // Group existing cops by frame_number key
  const copsByFrame = useMemo(() => {
    const groups = new Map()
    for (const cop of cops) {
      const key = cop.frame_number != null ? cop.frame_number : '__none__'
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(cop)
    }
    return groups
  }, [cops])

  // Merge backend groups with locally-added empty frames
  const frames = useMemo(() => {
    const result = []
    for (const [key, frameCops] of copsByFrame.entries()) {
      result.push({
        key,
        frameNumber: key === '__none__' ? null : Number(key),
        cops: frameCops,
        isLocal: false,
      })
    }
    result.sort((a, b) => (a.frameNumber ?? 9999) - (b.frameNumber ?? 9999))
    for (const lf of localFrames) {
      const alreadyBacked = result.some(
        f => lf.frameNumber !== '' && String(f.frameNumber) === String(lf.frameNumber)
      )
      if (!alreadyBacked) {
        result.push({ key: `local-${lf.id}`, frameNumber: lf.frameNumber, cops: [], isLocal: true, localId: lf.id })
      }
    }
    return result
  }, [copsByFrame, localFrames])

  const addFrame = () => setLocalFrames(lf => [...lf, { id: Date.now(), frameNumber: '', expanded: true }])

  const handleCreateCop = async (frameNumber, body) => {
    setBusyId('new')
    try {
      await createRingframeCop(trialId, { ...body, frame_number: frameNumber != null ? frameNumber : null })
      // Once a cop lands in this frame, drop the local placeholder
      if (frameNumber != null) {
        setLocalFrames(lf => lf.filter(f => String(f.frameNumber) !== String(frameNumber)))
      }
      await refreshFlow()
    } finally { setBusyId(null) }
  }

  const handleUpdateCop = async (id, body) => {
    setBusyId(id)
    try { await updateRingframeCop(id, body); await refreshFlow() }
    finally { setBusyId(null) }
  }

  const handleDeleteCop = async (id) => {
    setBusyId(id)
    try { await deleteRingframeCop(id); await refreshFlow() }
    finally { setBusyId(null) }
  }

  return (
    <div style={{ border: '1.5px solid var(--bd)', borderRadius: 'var(--r-lg)', padding: 16, background: 'var(--bg)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx)' }}>Ring Frame</div>
          <div style={{ fontSize: 11, color: 'var(--tx-4)' }}>
            {frames.length} frame{frames.length !== 1 ? 's' : ''} · drop bobbins → cops (up to 9 per frame, 5 relays each)
          </div>
        </div>
        <SmBtn primary onClick={addFrame} disabled={busyId === 'new'}>
          {busyId === 'new' ? 'Adding…' : '+ Add Frame'}
        </SmBtn>
      </div>
      <FormulaNote length={DEFAULT_LENGTHS.ringframe} />
      {frames.length === 0 ? (
        <div style={{
          border: '1px dashed var(--bd)', borderRadius: 'var(--r)', padding: 20,
          fontSize: 12, color: 'var(--tx-3)', textAlign: 'center',
        }}>
          Click "+ Add Frame" then drag simplex bobbins into it to start logging cops.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {frames.map(frame => (
            <FrameCard
              key={frame.key}
              initialFrameNumber={frame.frameNumber}
              cops={frame.cops}
              isLocal={frame.isLocal}
              busy={busyId}
              onCreateCop={handleCreateCop}
              onUpdateCop={handleUpdateCop}
              onDeleteCop={handleDeleteCop}
              onRemoveLocal={() => setLocalFrames(lf => lf.filter(f => f.id !== frame.localId))}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════════════
   FrameCard — one ring-frame machine container
   • Starts expanded; collapses on "Save Frame"
   • Up to 9 cops per frame, each cop has 5 relay readings
   • Bobbins from Simplex can be dropped onto the frame → creates a new cop
   • A single bobbin can also be linked to multiple frames
══════════════════════════════════════════════════════════════════════════════ */
function FrameCard({ initialFrameNumber, cops, isLocal, busy, onCreateCop, onUpdateCop, onDeleteCop, onRemoveLocal }) {
  const [isExpanded, setIsExpanded] = useState(true)
  const [frameNum, setFrameNum] = useState(
    initialFrameNumber != null ? String(initialFrameNumber) : ''
  )

  // Lifted cop form state — keyed by cop.id — so Save Frame can write all at once
  const [copForms, setCopForms] = useState(() => {
    const init = {}
    for (const cop of cops) {
      init[cop.id] = {
        notes: cop.notes ?? '',
        sampleLength: cop.sample_length ?? DEFAULT_LENGTHS.ringframe,
        readings: buildReadings(cop.readings, RING_READING_COUNT),
      }
    }
    return init
  })

  // Sync copForms when cops array changes (new cop added or deleted from backend)
  useEffect(() => {
    setCopForms(prev => {
      const next = { ...prev }
      for (const cop of cops) {
        if (!next[cop.id]) {
          next[cop.id] = {
            notes: cop.notes ?? '',
            sampleLength: cop.sample_length ?? DEFAULT_LENGTHS.ringframe,
            readings: buildReadings(cop.readings, RING_READING_COUNT),
          }
        }
      }
      // Prune stale keys
      for (const id of Object.keys(next)) {
        if (!cops.find(c => String(c.id) === String(id))) delete next[id]
      }
      return next
    })
  }, [cops])

  // Compute overall frame verdict from cop statuses
  const frameVerdict = useMemo(() => {
    if (cops.length === 0) return 'pending'
    const statuses = cops.map(c => c.status ?? 'pending')
    if (statuses.some(s => s === 'faulty')) return 'fail'
    if (statuses.every(s => s === 'perfect')) return 'pass'
    if (statuses.some(s => s === 'perfect')) return 'warn'
    return 'pending'
  }, [cops])

  // Drop a bobbin onto the frame → create a new cop associated with this frame
  const handleFrameDrop = async (e) => {
    e.preventDefault()
    if (cops.length >= 9) return
    const bobbinId = parseInt(e.dataTransfer.getData('application/x-simplex-bobbin'), 10)
    const bobbinLabel = e.dataTransfer.getData('application/x-simplex-bobbin-label') || 'Bobbin'
    if (!bobbinId) return
    const fn = frameNum !== '' ? parseInt(frameNum, 10) : null
    await onCreateCop(fn, {
      label: `Cop from ${bobbinLabel}`,
      sample_length: DEFAULT_LENGTHS.ringframe,
      readings: [],
      simplex_bobbin_ids: [bobbinId],
    })
  }

  // Also allow dropping a bobbin onto an existing cop to link it (multi-frame bobbin support)
  const handleCopDrop = async (e, cop) => {
    e.preventDefault()
    e.stopPropagation()
    const bobbinId = parseInt(e.dataTransfer.getData('application/x-simplex-bobbin'), 10)
    if (!bobbinId) return
    const existingIds = cop.simplex_bobbin_ids || (cop.simplex_bobbins || []).map(b => b.id)
    if (existingIds.includes(bobbinId)) return
    const fn = frameNum !== '' ? parseInt(frameNum, 10) : (cop.frame_number ?? null)
    await onUpdateCop(cop.id, {
      label: cop.label,
      hank_value: cop.hank_value ?? cop.mean_hank ?? null,
      notes: cop.notes ?? null,
      frame_number: fn,
      sample_length: cop.sample_length ?? DEFAULT_LENGTHS.ringframe,
      readings: Array.isArray(cop.readings) ? cop.readings : [],
      simplex_bobbin_ids: [...existingIds, bobbinId],
    })
  }

  const removeBobbin = async (cop, bobbinId) => {
    const existingIds = cop.simplex_bobbin_ids || (cop.simplex_bobbins || []).map(b => b.id)
    await onUpdateCop(cop.id, {
      label: cop.label,
      hank_value: cop.hank_value ?? cop.mean_hank ?? null,
      notes: cop.notes ?? null,
      frame_number: cop.frame_number ?? null,
      sample_length: cop.sample_length ?? DEFAULT_LENGTHS.ringframe,
      readings: Array.isArray(cop.readings) ? cop.readings : [],
      simplex_bobbin_ids: existingIds.filter(id => id !== bobbinId),
    })
  }

  // Save all cop forms at once, then collapse
  const handleSaveFrame = async () => {
    const fn = frameNum !== '' ? parseInt(frameNum, 10) : null
    for (const cop of cops) {
      const form = copForms[cop.id]
      if (!form) continue
      const weights = form.readings.map(v => parseFloat(v)).filter(v => !isNaN(v) && v > 0)
      const validWeights = weights.length >= 2 ? weights : []
      const hankReadings = validWeights.length ? toHanks(validWeights, form.sampleLength || DEFAULT_LENGTHS.ringframe) : []
      await onUpdateCop(cop.id, {
        label: cop.label,
        hank_value: hankReadings.length
          ? hankReadings.reduce((a, b) => a + b, 0) / hankReadings.length
          : (cop.hank_value ?? cop.mean_hank ?? null),
        notes: form.notes ? form.notes.trim() : null,
        frame_number: fn,
        sample_length: form.sampleLength || DEFAULT_LENGTHS.ringframe,
        readings: validWeights,
        simplex_bobbin_ids: cop.simplex_bobbin_ids || (cop.simplex_bobbins || []).map(b => b.id),
      })
    }
    setIsExpanded(false)
  }

  const vColor  = V_COLOR[frameVerdict]  ?? 'var(--tx-4)'
  const vBg     = V_BG[frameVerdict]     ?? 'var(--bg-3)'
  const vBd     = V_BD[frameVerdict]     ?? 'var(--bd)'
  const vLabel  = V_LABEL[frameVerdict]  ?? 'PENDING'

  /* ── Collapsed view ──────────────────────────────────────────────────── */
  if (!isExpanded) {
    return (
      <div style={{
        border: `1.5px solid ${vBd}`, borderRadius: 'var(--r)',
        padding: '10px 16px', background: vBg,
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--tx)', minWidth: 90 }}>
          Frame {frameNum || '?'}
        </span>
        <span style={{ fontSize: 12, color: 'var(--tx-3)' }}>{cops.length}/9 Cops Logged</span>
        <span style={{
          padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700,
          background: vColor, color: '#fff', letterSpacing: '.04em',
        }}>{vLabel}</span>
        <button onClick={() => setIsExpanded(true)} style={{
          marginLeft: 'auto', border: '1px solid var(--bd-md)', background: 'var(--bg)',
          borderRadius: 'var(--r)', padding: '5px 12px', fontSize: 12, cursor: 'pointer',
          color: 'var(--tx-2)', fontFamily: 'var(--font)', fontWeight: 500,
        }}>▼ Expand</button>
      </div>
    )
  }

  /* ── Expanded view ───────────────────────────────────────────────────── */
  return (
    <div style={{ border: '1.5px solid var(--bd-md)', borderRadius: 'var(--r)', background: 'var(--bg)', overflow: 'hidden' }}>

      {/* Frame header bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        padding: '10px 14px', borderBottom: '1px solid var(--bd)', background: 'var(--bg-2)',
      }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx-3)', flexShrink: 0 }}>Frame #</span>
        <input
          type="number" min="1" max="25" step="1"
          value={frameNum} placeholder="1–25"
          onChange={e => {
            const raw = e.target.value
            if (raw === '') { setFrameNum(''); return }
            const n = parseInt(raw, 10)
            setFrameNum(String(isNaN(n) ? '' : Math.max(1, Math.min(25, n))))
          }}
          style={{ ...inputStyle, width: 80 }}
        />
        <span style={{ fontSize: 11, color: 'var(--tx-4)' }}>{cops.length} / 9 Cops</span>
        {isLocal && cops.length === 0 && (
          <button onClick={onRemoveLocal} style={{
            marginLeft: 'auto', border: 'none', background: 'transparent',
            cursor: 'pointer', color: 'var(--tx-4)', fontSize: 11, padding: '2px 6px',
          }}>✕ Remove</button>
        )}
      </div>

      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>

        {/* Drop zone — accept bobbin drops to create new cops */}
        <div
          onDragOver={e => e.preventDefault()}
          onDrop={handleFrameDrop}
          style={{
            border: `1.5px dashed ${cops.length >= 9 ? 'var(--bd)' : 'var(--bd-md)'}`,
            borderRadius: 'var(--r)', background: 'var(--bg-2)',
            padding: cops.length === 0 ? '18px 14px' : '8px 12px',
            minHeight: 52, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center',
            opacity: cops.length >= 9 ? .5 : 1,
            transition: 'opacity .15s',
          }}>
          {cops.length === 0 ? (
            <span style={{ fontSize: 12, color: 'var(--tx-3)', width: '100%', textAlign: 'center' }}>
              Drop simplex bobbins here — each bobbin creates one cop (up to 9)
            </span>
          ) : cops.length < 9 ? (
            <span style={{ fontSize: 11, color: 'var(--tx-4)' }}>
              + Drop another bobbin ({9 - cops.length} slot{9 - cops.length !== 1 ? 's' : ''} remaining)
            </span>
          ) : (
            <span style={{ fontSize: 11, color: 'var(--tx-4)' }}>Frame full — 9/9 cops</span>
          )}
        </div>

        {/* Individual cop entries */}
        {cops.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {cops.map((cop, idx) => {
              const form = copForms[cop.id] ?? {
                notes: cop.notes ?? '',
                sampleLength: cop.sample_length ?? DEFAULT_LENGTHS.ringframe,
                readings: buildReadings(cop.readings, RING_READING_COUNT),
              }
              const status = cop.status ?? 'pending'
              const updateForm = (field, value) =>
                setCopForms(f => ({ ...f, [cop.id]: { ...(f[cop.id] ?? form), [field]: value } }))

              return (
                <div key={cop.id} style={{
                  border: `1px solid ${STATUS_BORDER[status] ?? 'var(--bd)'}`,
                  borderRadius: 'var(--r)', padding: 10,
                  background: STATUS_BG[status] ?? 'var(--bg-3)',
                  display: 'flex', flexDirection: 'column', gap: 8,
                }}>
                  {/* Cop header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--tx)' }}>Cop {idx + 1}</span>
                    {(cop.simplex_bobbins || []).length > 0 && (
                      <span style={{ fontSize: 10, color: 'var(--tx-3)' }}>
                        ← {(cop.simplex_bobbins || []).map(b =>
                          b.machine_number != null
                            ? `${b.label} (Sx ${b.machine_number})`
                            : b.label
                        ).join(', ')}
                      </span>
                    )}
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 8,
                      border: `1px solid ${STATUS_BORDER[status] ?? 'var(--bd)'}`,
                      background: 'var(--bg)', color: STATUS_META[status]?.color ?? 'var(--tx-4)',
                    }}>{STATUS_META[status]?.label ?? 'Pending'}</span>
                    <button onClick={() => onDeleteCop(cop.id)} style={{
                      marginLeft: 'auto', border: 'none', background: 'transparent',
                      cursor: 'pointer', color: 'var(--tx-4)', fontSize: 11, padding: '2px 6px',
                    }}>✕</button>
                  </div>

                  {/* 5 relay readings in a 5-col grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 5 }}>
                    {form.readings.map((v, ridx) => {
                      const weight = parseFloat(v)
                      const hank = !isNaN(weight) && weight > 0
                        ? weightToHank(weight, form.sampleLength || DEFAULT_LENGTHS.ringframe)
                        : null
                      return (
                        <div key={ridx} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <input
                            type="number" step="any"
                            placeholder={`Relay ${ridx + 1}`}
                            value={v}
                            onChange={e => {
                              const arr = form.readings.slice()
                              arr[ridx] = e.target.value
                              updateForm('readings', arr)
                            }}
                            style={inputStyle}
                          />
                          <span style={{ fontSize: 9, color: 'var(--tx-3)', textAlign: 'center' }}>
                            {hank ? hank.toFixed(2) : '—'}
                          </span>
                        </div>
                      )
                    })}
                  </div>

                  {/* Sample length + formula hint */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 10, color: 'var(--tx-4)', fontWeight: 600 }}>Length</span>
                    <input
                      type="number" step="1" min="10"
                      value={form.sampleLength}
                      onChange={e => {
                        const val = parseFloat(e.target.value)
                        updateForm('sampleLength', isNaN(val) || val <= 0 ? DEFAULT_LENGTHS.ringframe : val)
                      }}
                      style={{ ...inputStyle, width: 90 }}
                    />
                    <span style={{ fontSize: 10, color: 'var(--tx-4)' }}>yds · Ne = (L × 0.54) / W</span>
                  </div>

                  {/* Live hank summary */}
                  <MiniSummary
                    readings={form.readings}
                    savedMean={cop.mean_hank}
                    savedCv={cop.cv_pct}
                    expected={RING_READING_COUNT}
                    sampleLength={form.sampleLength || DEFAULT_LENGTHS.ringframe}
                  />

                  {/* Notes */}
                  <input
                    type="text" placeholder="Notes (optional)"
                    value={form.notes}
                    onChange={e => updateForm('notes', e.target.value)}
                    style={{ ...inputStyle }}
                  />

                  {/* Bobbin drop zone for linking additional bobbins (multi-frame support) */}
                  <div
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => handleCopDrop(e, cop)}
                    style={{
                      border: '1px dashed var(--bd)', borderRadius: 'var(--r)', padding: '5px 8px',
                      minHeight: 34, display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center',
                      background: 'var(--bg)',
                    }}>
                    {(cop.simplex_bobbins || []).length === 0 ? (
                      <span style={{ fontSize: 10, color: 'var(--tx-4)' }}>Drop another bobbin to link it here</span>
                    ) : (cop.simplex_bobbins || []).map(b => (
                      <span key={b.id} style={{
                        display: 'inline-flex', alignItems: 'center', gap: 3,
                        padding: '1px 6px', borderRadius: 10, background: 'var(--claude-bg)',
                        border: '1px solid var(--claude-bd)', fontSize: 10, color: 'var(--claude)',
                      }}>
                        {b.label}
                        {b.machine_number != null && (
                          <span style={{
                            fontSize: 9, fontWeight: 700, color: 'var(--tx-3)',
                            background: 'var(--bg-3)', borderRadius: 6,
                            padding: '0px 4px', marginLeft: 2, border: '1px solid var(--bd)',
                          }}>
                            Sx {b.machine_number}
                          </span>
                        )}
                        <button onClick={() => removeBobbin(cop, b.id)} style={{
                          border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--claude)', fontSize: 10,
                        }}>×</button>
                      </span>
                    ))}
                  </div>

                  {/* RSB upstream trace */}
                  {(cop.rsb_cans || []).length > 0 && (
                    <ConnectionTag
                      direction="Upstream RSB ←"
                      items={(cop.rsb_cans || []).map(c => c.slot ? `Can ${c.slot}` : c.label)}
                      color="var(--tx-4)"
                    />
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Frame footer actions */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 4 }}>
          <button onClick={() => setIsExpanded(false)} style={{
            padding: '6px 14px', fontSize: 12, fontWeight: 500,
            border: '1px solid var(--bd-md)', borderRadius: 'var(--r)',
            background: 'var(--bg)', color: 'var(--tx-2)', cursor: 'pointer',
            fontFamily: 'var(--font)',
          }}>Collapse ▲</button>
          <button
            onClick={handleSaveFrame}
            disabled={!!busy}
            style={{
              padding: '6px 16px', fontSize: 12, fontWeight: 600,
              border: '1px solid var(--claude)', borderRadius: 'var(--r)',
              background: 'var(--claude)', color: '#fff',
              cursor: busy ? 'default' : 'pointer',
              fontFamily: 'var(--font)', opacity: busy ? .6 : 1, transition: 'opacity .15s',
            }}
          >{busy ? 'Saving…' : 'Save Frame'}</button>
        </div>
      </div>
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════════════
   Bobbin–Frame Interaction Report
══════════════════════════════════════════════════════════════════════════════ */

/**
 * buildInteractionReport — pure function. No side-effects, no React.
 *
 * Variable naming mirrors the spec:
 *   H_target   = ringframe target count
 *   H_b_target = simplex target count
 *   H_b_i      = bobbin hank (simplex output for bobbin i)
 *   H_c_ij     = cop hank (ring frame output from bobbin i on frame j)
 *   CV_b_i     = bobbin CV%
 *   CV_c_ij    = cop CV%
 */
function buildInteractionReport(raw) {
  const { bobbins: _rawBobbins, frames, cells, benchmarks, anova } = raw
  // TASK 01 — sort bobbins chronologically by the numeric portion of their label
  const bobbins = [..._rawBobbins].sort((a, b) => {
    const na = parseInt((a.label ?? '').replace(/\D/g, ''), 10) || 0
    const nb = parseInt((b.label ?? '').replace(/\D/g, ''), 10) || 0
    return na - nb
  })
  const H_target   = benchmarks.ringframe.target
  const H_b_target = benchmarks.simplex.target
  const nominalDraft = H_target / H_b_target

  // Cell lookup: `${bobbin_id}_${frame_number}` → cell
  const cellMap = {}
  cells.forEach(c => {
    if (c.bobbin_id != null && c.frame_number != null)
      cellMap[`${c.bobbin_id}_${c.frame_number}`] = c
  })

  // Compute every bobbin × frame interaction that has data
  const interactions = []
  bobbins.forEach(bobbin => {
    const H_b_i  = bobbin.bobbin_hank
    const CV_b_i = bobbin.bobbin_cv
    frames.forEach(frame => {
      const cell   = cellMap[`${bobbin.id}_${frame}`]
      if (!cell || cell.cop_hank == null) return
      const H_c_ij  = cell.cop_hank
      const CV_c_ij = cell.cop_cv
      interactions.push({
        bobbinId:      bobbin.id,
        bobbinLabel:   bobbin.label,
        bobbinHank:    H_b_i,
        bobbinMachine: bobbin.machine_number ?? null,
        frame,
        copHank:     H_c_ij,
        copCv:       CV_c_ij,
        countDev:    H_c_ij - H_target,
        countDevPct: ((H_c_ij - H_target) / H_target) * 100,
        actualDraft: H_b_i    != null ? H_c_ij / H_b_i                       : null,
        draftError:  H_b_i    != null ? (H_c_ij / H_b_i) - nominalDraft      : null,
        cvAdded:     CV_c_ij != null && CV_b_i != null
                       ? Math.sqrt(Math.max(0, CV_c_ij ** 2 - CV_b_i ** 2))
                       : null,
      })
    })
  })

  // Group by frame (Table 1) and by bobbin (Table 2)
  const byFrame  = {}
  frames.forEach(f => { byFrame[f] = [] })
  interactions.forEach(r => byFrame[r.frame].push(r))

  const byBobbin = {}
  bobbins.forEach(b => { byBobbin[b.id] = { label: b.label, bobbinHank: b.bobbin_hank, machineNumber: b.machine_number ?? null, rsbCans: b.rsb_cans ?? [], rows: [] } })
  interactions.forEach(r => byBobbin[r.bobbinId].rows.push(r))

  const _avg    = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null
  const _maxAbs = arr => arr.length ? arr.reduce((a, b) => Math.abs(b) > Math.abs(a) ? b : a, 0) : null

  // Table 3: Frame Summary
  const frameSummary = frames.map(f => {
    const rows = byFrame[f] ?? []
    if (!rows.length) return { frame: f, count: 0, machines: [], avgCopHank: null, avgCountDev: null, maxCountDev: null, avgDraftError: null, avgCvAdded: null }
    // Collect unique Simplex machine numbers that fed this frame (sorted, nulls excluded)
    const machines = [...new Set(rows.map(r => r.bobbinMachine).filter(m => m != null))].sort((a, b) => a - b)
    return {
      frame:         f,
      count:         rows.length,
      machines,
      avgCopHank:    _avg(rows.map(r => r.copHank)),
      avgCountDev:   _avg(rows.map(r => r.countDev)),
      maxCountDev:   _maxAbs(rows.map(r => r.countDev)),
      avgDraftError: _avg(rows.filter(r => r.draftError != null).map(r => r.draftError)),
      avgCvAdded:    _avg(rows.filter(r => r.cvAdded    != null).map(r => r.cvAdded)),
    }
  })

  // Table 4: Bobbin Summary
  const bobbinSummary = bobbins.map(b => {
    const rows = byBobbin[b.id]?.rows ?? []
    const machineNumber = b.machine_number ?? null
    if (!rows.length) return { bobbinId: b.id, label: b.label, machineNumber, count: 0, avgOutputHank: null, spread: null, avgCopCv: null }
    const hanks = rows.map(r => r.copHank)
    return {
      bobbinId:      b.id,
      label:         b.label,
      machineNumber,
      count:         rows.length,
      avgOutputHank: _avg(hanks),
      spread:        Math.max(...hanks) - Math.min(...hanks),
      avgCopCv:      _avg(rows.filter(r => r.copCv != null).map(r => r.copCv)),
    }
  })

  return {
    interactions, byFrame, byBobbin,
    frameSummary, bobbinSummary,
    frames, bobbins,
    nominalDraft, H_target, H_b_target,
    rfTol: benchmarks.ringframe.tolerance,
    anova: anova ?? null,
  }
}

/* ── Colour helpers (text-only, no cell fills) ──────────────────────────────── */
const _devColor    = (val, tol) => {
  if (val == null) return 'var(--tx-4)'
  const a = Math.abs(val)
  if (a > tol)       return 'var(--bad)'
  if (a > tol * 0.5) return 'var(--warn)'
  return 'var(--tx)'
}
const _draftColor  = val => {
  if (val == null) return 'var(--tx-4)'
  const a = Math.abs(val)
  if (a > 0.05) return 'var(--bad)'
  if (a > 0.02) return 'var(--warn)'
  return 'var(--tx)'
}
const _cvAddColor  = val => {
  if (val == null || val < 0.01) return 'var(--tx-4)'
  if (val > 1.5) return 'var(--bad)'
  if (val > 0.5) return 'var(--warn)'
  return 'var(--tx-3)'
}
const _copCvColor  = val => {
  if (val == null) return 'var(--tx-4)'
  if (val > 3.0)  return 'var(--bad)'
  if (val > 2.0)  return 'var(--warn)'
  return 'var(--tx)'
}
const _signed = (val, dp) => val != null ? `${val > 0 ? '+' : ''}${val.toFixed(dp)}` : '—'
const _fmt    = (val, dp) => val != null ? val.toFixed(dp) : '—'

/* ── InfoTip — inline ? tooltip for jargon column headers ──────────────────── */
function InfoTip({ formula, explain }) {
  const [open, setOpen] = useState(false)
  return (
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 3, verticalAlign: 'middle' }}>
      <button
        onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
        style={{
          width: 13, height: 13, borderRadius: '50%',
          border: '1px solid var(--bd-md)',
          background: open ? 'var(--claude)' : 'var(--bg-3)',
          color: open ? '#fff' : 'var(--tx-4)',
          fontSize: 8, fontWeight: 700, lineHeight: 1,
          cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--font)', padding: 0, flexShrink: 0,
        }}
      >?</button>
      {open && (
        <div
          style={{
            position: 'absolute', top: 18, left: 0, zIndex: 300,
            width: 220, padding: '8px 10px',
            background: 'var(--bg)', border: '1px solid var(--bd-md)',
            borderRadius: 'var(--r)', boxShadow: '0 4px 16px rgba(0,0,0,.18)',
          }}
          onMouseLeave={() => setOpen(false)}
        >
          <code style={{ display: 'block', fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--claude)', marginBottom: 5 }}>{formula}</code>
          <div style={{ fontSize: 11, color: 'var(--tx-2)', lineHeight: 1.55, fontFamily: 'var(--font)', fontWeight: 400 }}>{explain}</div>
        </div>
      )}
    </span>
  )
}

/* ── Shared table style atoms ───────────────────────────────────────────────── */
const IR_TH = ({ children, right, left }) => (
  <th style={{
    padding: '7px 10px',
    textAlign: right ? 'right' : 'left',
    fontSize: 11, fontWeight: 600,
    color: 'var(--tx-3)',
    borderBottom: '2px solid var(--bd-md)',
    whiteSpace: 'nowrap',
    background: 'transparent',
    position: 'relative',
  }}>{children}</th>
)
const IR_TD = ({ children, right, color, mono, dim }) => (
  <td style={{
    padding: '6px 10px',
    textAlign: right ? 'right' : 'left',
    fontSize: 12,
    color: color ?? (dim ? 'var(--tx-3)' : 'var(--tx)'),
    fontFamily: mono ? 'var(--mono)' : 'inherit',
    borderBottom: '1px solid var(--bd)',
  }}>{children ?? '—'}</td>
)

/* ── Table 1: Frame-wise Interaction ────────────────────────────────────────── */
function FrameInteractionTable({ frame, rows, dp, rfTol, H_target }) {
  const tolPct = (rfTol / H_target) * 100
  if (!rows.length) return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--tx)', marginBottom: 6 }}>Frame {frame}</div>
      <p style={{ fontSize: 12, color: 'var(--tx-4)', margin: 0 }}>No interactions logged for this frame.</p>
    </div>
  )
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--tx)', marginBottom: 8 }}>Frame {frame}</div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              <IR_TH>Bobbin</IR_TH>
              <IR_TH right>Bobbin Hank</IR_TH>
              <IR_TH right>Cop Hank</IR_TH>
              <IR_TH right>Count Dev <InfoTip formula="Cop Hank − Target" explain="Absolute deviation from target count. Positive = coarser yarn; negative = finer yarn. Zero is ideal." /></IR_TH>
              <IR_TH right>Count Dev % <InfoTip formula="(Count Dev ÷ Target) × 100" explain="Percentage deviation from target count. ±1% is the typical industry tolerance." /></IR_TH>
              <IR_TH right>Draft Error <InfoTip formula="Actual Draft − Nominal Draft" explain="Nominal draft = RF target ÷ Simplex target. Negative = under-drafting (yarn too coarse); positive = over-drafting (yarn too fine)." /></IR_TH>
              <IR_TH right>Cop CV%</IR_TH>
              <IR_TH right>CV Added <InfoTip formula="√(CV_cop² − CV_bobbin²)" explain="Extra unevenness introduced by the ring frame itself. Large values point to worn rollers or tension problems at the frame." /></IR_TH>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <IR_TD>
                  {r.bobbinLabel}
                  {r.bobbinMachine != null && (
                    <span style={{ fontSize: 10, color: 'var(--tx-3)', marginLeft: 7, fontWeight: 400, letterSpacing: 0 }}>
                      Sx&nbsp;{r.bobbinMachine}
                    </span>
                  )}
                </IR_TD>
                <IR_TD right mono dim>{_fmt(r.bobbinHank, dp)}</IR_TD>
                <IR_TD right mono>{_fmt(r.copHank, dp)}</IR_TD>
                <IR_TD right mono color={_devColor(r.countDev, rfTol)}>{_signed(r.countDev, dp)}</IR_TD>
                <IR_TD right mono color={_devColor(r.countDevPct, tolPct)}>{_signed(r.countDevPct, 2)}%</IR_TD>
                <IR_TD right mono color={_draftColor(r.draftError)}>{_signed(r.draftError, 4)}</IR_TD>
                <IR_TD right mono color={_copCvColor(r.copCv)}>{_fmt(r.copCv, 2)}{r.copCv != null ? '%' : ''}</IR_TD>
                <IR_TD right mono color={_cvAddColor(r.cvAdded)}>{r.cvAdded != null ? `+${r.cvAdded.toFixed(2)}%` : '—'}</IR_TD>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ── Table 2: Bobbin-wise Interaction ───────────────────────────────────────── */
function BobbinInteractionTable({ bobbinId, label, bobbinHank, machineNumber, rows, dp, rfTol, H_target }) {
  const tolPct = (rfTol / H_target) * 100
  if (!rows.length) return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--tx)', marginBottom: 6 }}>{label}</div>
      <p style={{ fontSize: 12, color: 'var(--tx-4)', margin: 0 }}>No interactions logged for this bobbin.</p>
    </div>
  )
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--tx)' }}>{label}</div>
        {machineNumber != null && (
          <span style={{ fontSize: 11, color: 'var(--tx-3)', fontWeight: 400 }}>Sx&nbsp;{machineNumber}</span>
        )}
        {bobbinHank != null && (
          <div style={{ fontSize: 11, color: 'var(--tx-3)', fontFamily: 'var(--mono)' }}>
            Bobbin hank: {bobbinHank.toFixed(dp)}
          </div>
        )}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              <IR_TH>Frame</IR_TH>
              <IR_TH right>Cop Hank</IR_TH>
              <IR_TH right>Count Dev <InfoTip formula="Cop Hank − Target" explain="Absolute deviation from target count. Positive = coarser yarn; negative = finer yarn." /></IR_TH>
              <IR_TH right>Count Dev % <InfoTip formula="(Count Dev ÷ Target) × 100" explain="Percentage deviation from target count. ±1% is the typical industry tolerance." /></IR_TH>
              <IR_TH right>Draft Error <InfoTip formula="Actual Draft − Nominal Draft" explain="Nominal draft = RF target ÷ Simplex target. Negative = under-drafting; positive = over-drafting." /></IR_TH>
              <IR_TH right>Cop CV%</IR_TH>
              <IR_TH right>CV Added <InfoTip formula="√(CV_cop² − CV_bobbin²)" explain="Extra unevenness introduced by the ring frame itself. Large values point to worn rollers or tension problems." /></IR_TH>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <IR_TD>Frame {r.frame}</IR_TD>
                <IR_TD right mono>{_fmt(r.copHank, dp)}</IR_TD>
                <IR_TD right mono color={_devColor(r.countDev, rfTol)}>{_signed(r.countDev, dp)}</IR_TD>
                <IR_TD right mono color={_devColor(r.countDevPct, tolPct)}>{_signed(r.countDevPct, 2)}%</IR_TD>
                <IR_TD right mono color={_draftColor(r.draftError)}>{_signed(r.draftError, 4)}</IR_TD>
                <IR_TD right mono color={_copCvColor(r.copCv)}>{_fmt(r.copCv, 2)}{r.copCv != null ? '%' : ''}</IR_TD>
                <IR_TD right mono color={_cvAddColor(r.cvAdded)}>{r.cvAdded != null ? `+${r.cvAdded.toFixed(2)}%` : '—'}</IR_TD>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ── Table 3: Frame Summary ─────────────────────────────────────────────────── */
function FrameSummaryTable({ frameSummary, dp, rfTol, H_target }) {
  const tolPct = (rfTol / H_target) * 100
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>
            <IR_TH>Frame</IR_TH>
            <IR_TH>Simplex Sources</IR_TH>
            <IR_TH right>Cops</IR_TH>
            <IR_TH right>Avg Cop Hank</IR_TH>
            <IR_TH right>Avg Count Dev <InfoTip formula="mean(Cop Hank − Target)" explain="Average absolute deviation from target count across all bobbins that ran through this frame." /></IR_TH>
            <IR_TH right>Max |Count Dev| <InfoTip formula="max(|Cop Hank − Target|)" explain="Worst-case single deviation seen for this frame. Flags outlier batches even when the average looks acceptable." /></IR_TH>
            <IR_TH right>Avg Draft Error <InfoTip formula="mean(Actual Draft − Nominal Draft)" explain="Average draft ratio error across all cops from this frame. Consistent non-zero values indicate a frame setting issue." /></IR_TH>
            <IR_TH right>Avg CV Added <InfoTip formula="mean(√(CV_cop² − CV_bobbin²))" explain="Average unevenness introduced by this frame. Elevated values suggest worn drafting rollers or inconsistent tension." /></IR_TH>
          </tr>
        </thead>
        <tbody>
          {frameSummary.map((r, i) => (
            <tr key={i}>
              <IR_TD>Frame {r.frame}</IR_TD>
              <IR_TD>
                {(r.machines ?? []).length === 0
                  ? <span style={{ color: 'var(--tx-4)' }}>—</span>
                  : (r.machines ?? []).map(m => (
                    <span key={m} style={{
                      display: 'inline-block', marginRight: 4,
                      fontSize: 10, fontWeight: 700,
                      padding: '1px 6px', borderRadius: 8,
                      background: 'var(--bg-3)', border: '1px solid var(--bd)',
                      color: 'var(--tx-2)',
                    }}>Sx {m}</span>
                  ))
                }
              </IR_TD>
              <IR_TD right dim>{r.count}</IR_TD>
              <IR_TD right mono>{_fmt(r.avgCopHank, dp)}</IR_TD>
              <IR_TD right mono color={_devColor(r.avgCountDev, rfTol)}>{_signed(r.avgCountDev, dp)}</IR_TD>
              <IR_TD right mono color={_devColor(r.maxCountDev, rfTol)}>{r.maxCountDev != null ? Math.abs(r.maxCountDev).toFixed(dp) : '—'}</IR_TD>
              <IR_TD right mono color={_draftColor(r.avgDraftError)}>{_signed(r.avgDraftError, 4)}</IR_TD>
              <IR_TD right mono color={_cvAddColor(r.avgCvAdded)}>{r.avgCvAdded != null ? `+${r.avgCvAdded.toFixed(2)}%` : '—'}</IR_TD>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ── Table 4: Bobbin Summary ────────────────────────────────────────────────── */
function BobbinSummaryTable({ bobbinSummary, dp }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>
            <IR_TH>Bobbin</IR_TH>
            <IR_TH>Simplex M/c</IR_TH>
            <IR_TH right>Cops Run</IR_TH>
            <IR_TH right>Avg Output Hank</IR_TH>
            <IR_TH right>Spread (Max − Min) <InfoTip formula="max(cop hank) − min(cop hank)" explain="Range of cop counts produced from this bobbin. High spread means this bobbin's yarn count varies depending on which frame it goes to." /></IR_TH>
            <IR_TH right>Avg Cop CV% <InfoTip formula="mean(CV%) across all cops from this bobbin" explain="Average unevenness of cops produced from this bobbin. High values indicate the upstream roving (simplex output) may itself be uneven." /></IR_TH>
          </tr>
        </thead>
        <tbody>
          {bobbinSummary.map((r, i) => (
            <tr key={i}>
              <IR_TD>{r.label}</IR_TD>
              <IR_TD>
                {r.machineNumber != null
                  ? <span style={{
                      fontSize: 10, fontWeight: 700,
                      padding: '1px 6px', borderRadius: 8,
                      background: 'var(--bg-3)', border: '1px solid var(--bd)',
                      color: 'var(--tx-2)',
                    }}>Sx {r.machineNumber}</span>
                  : <span style={{ color: 'var(--tx-4)' }}>—</span>
                }
              </IR_TD>
              <IR_TD right dim>{r.count > 0 ? r.count : '—'}</IR_TD>
              <IR_TD right mono>{_fmt(r.avgOutputHank, dp)}</IR_TD>
              <IR_TD right mono color={r.spread != null && r.spread > 0.1 ? 'var(--warn)' : 'var(--tx)'}>{_fmt(r.spread, dp)}</IR_TD>
              <IR_TD right mono color={_copCvColor(r.avgCopCv)}>{_fmt(r.avgCopCv, 2)}{r.avgCopCv != null ? '%' : ''}</IR_TD>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ── Section divider ────────────────────────────────────────────────────────── */
function IrSection({ title, subtitle, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ borderBottom: '2px solid var(--bd-md)', paddingBottom: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--tx)' }}>{title}</div>
        {subtitle && <div style={{ fontSize: 11, color: 'var(--tx-3)', marginTop: 3 }}>{subtitle}</div>}
      </div>
      {children}
    </div>
  )
}

/* ── Phase 5: Statistical Alert Banner ──────────────────────────────────────── */
function AnovaAlertBanner({ anova }) {
  if (!anova || anova.status !== 'ok') return null
  const alerts = []
  if (anova.frame_effect?.significant)   alerts.push('Frame effect is statistically significant (p=' + anova.frame_effect.p.toFixed(4) + '). Cop hank varies systematically by frame — investigate frame calibration.')
  if (anova.machine_effect?.significant) alerts.push('Machine effect is statistically significant (p=' + anova.machine_effect.p.toFixed(4) + '). Cop hank differs between Simplex machines — check roving count consistency across machines.')
  if (anova.interaction?.significant)    alerts.push('Machine–frame interaction is statistically significant (p=' + anova.interaction.p.toFixed(4) + '). Certain machine–frame combinations are systematically off — identify specific pairings from Table 1.')
  if (alerts.length === 0) return null
  return (
    <div style={{
      border: '1px solid var(--warn-bd)', borderRadius: 'var(--r)',
      background: 'var(--warn-bg)', padding: '12px 16px',
      display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--warn)', marginBottom: 2 }}>
        Statistical Analysis — Significant Effects Detected
      </div>
      {alerts.map((msg, i) => (
        <div key={i} style={{ fontSize: 12, color: 'var(--tx-2)', lineHeight: 1.6 }}>
          {msg}
        </div>
      ))}
    </div>
  )
}

/* ── Phase 5: ANOVA P-value Metrics Row ─────────────────────────────────────── */
function AnovaPvalueRow({ anova }) {
  if (!anova) return null

  const insufficient = anova.status === 'insufficient_data'

  const MetricCell = ({ label, val, sig }) => (
    <div style={{
      flex: 1, minWidth: 140,
      border: '1px solid var(--bd)', borderRadius: 'var(--r)',
      padding: '10px 14px', background: 'var(--bg)',
    }}>
      <div style={{ fontSize: 10, color: 'var(--tx-4)', fontWeight: 600, marginBottom: 4 }}>{label}</div>
      {val == null ? (
        <div style={{ fontSize: 11, color: 'var(--tx-4)', fontFamily: 'var(--mono)' }}>
          {insufficient ? 'Insufficient data' : 'N/A'}
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{
            fontSize: 14, fontFamily: 'var(--mono)', fontWeight: 600,
            color: sig ? 'var(--warn)' : 'var(--ok)',
          }}>
            p = {val.toFixed(4)}
          </span>
          <span style={{ fontSize: 10, color: sig ? 'var(--warn)' : 'var(--ok)', fontWeight: 600 }}>
            {sig ? 'significant' : 'not significant'}
          </span>
        </div>
      )}
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--tx-3)' }}>
        ANOVA Results
        {anova.status === 'ok' && (
          <span style={{ fontWeight: 400, marginLeft: 8, fontFamily: 'var(--mono)' }}>
            {anova.mode === 'two_way' ? 'Two-Way' : 'One-Way'} · n = {anova.n}
          </span>
        )}
      </div>
      {insufficient ? (
        <div style={{
          fontSize: 12, color: 'var(--tx-3)', padding: '10px 14px',
          border: '1px solid var(--bd)', borderRadius: 'var(--r)', background: 'var(--bg)',
        }}>
          {anova.reason ?? 'Insufficient data for ANOVA. Log more cops with frame and machine numbers assigned.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <MetricCell
            label="Frame Effect"
            val={anova.frame_effect?.p}
            sig={anova.frame_effect?.significant}
          />
          <MetricCell
            label="Machine Effect"
            val={anova.machine_effect?.p ?? null}
            sig={anova.machine_effect?.significant}
          />
          <MetricCell
            label="Machine × Frame Interaction"
            val={anova.interaction?.p ?? null}
            sig={anova.interaction?.significant}
          />
        </div>
      )}
    </div>
  )
}

/* ── Phase 5: Diagnostic Heatmap ─────────────────────────────────────────────── */
function DiagnosticHeatmap({ report }) {
  const { bobbins, frames, byBobbin, H_target, rfTol } = report
  if (!bobbins.length || !frames.length) return null

  // Precompute per-cell cop hank
  const cellHank = {}
  report.interactions.forEach(r => {
    cellHank[`${r.bobbinId}_${r.frame}`] = r.copHank
  })

  const dp = H_target >= 10 ? 2 : 4

  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--tx-3)', marginBottom: 6 }}>
        Diagnostic Heatmap — Cop Hank by Bobbin × Frame
        <span style={{ fontWeight: 400, marginLeft: 8, color: 'var(--tx-4)' }}>
          Target {_fmt(H_target, dp)} · text colour = deviation
        </span>
      </div>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 11, fontFamily: 'var(--mono)' }}>
        <thead>
          <tr>
            <IR_TH style={{ textAlign: 'left' }}>Bobbin</IR_TH>
            {frames.map(f => (
              <IR_TH key={f} style={{ textAlign: 'center', minWidth: 64 }}>Fr {f}</IR_TH>
            ))}
          </tr>
        </thead>
        <tbody>
          {bobbins.map(b => {
            const info = byBobbin[b.id]
            const machineSuffix = info?.machineNumber != null ? ` [Sx ${info.machineNumber}]` : ''
            return (
              <tr key={b.id}>
                <IR_TD style={{ textAlign: 'left', whiteSpace: 'nowrap' }}>
                  {b.label}{machineSuffix}
                </IR_TD>
                {frames.map(f => {
                  const hank = cellHank[`${b.id}_${f}`]
                  return (
                    <IR_TD key={f} style={{ textAlign: 'center', color: _devColor(hank != null ? hank - H_target : null, rfTol) }}>
                      {hank != null ? hank.toFixed(dp) : '—'}
                    </IR_TD>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/* ── InteractionReport — main component ─────────────────────────────────────── */
/* ── Math Glossary ───────────────────────────────────────────────────────────── */
function MathGlossary({ dp, nominalDraft, H_target, H_b_target }) {
  const [open, setOpen] = useState(false)
  const terms = [
    {
      term: 'Count Deviation',
      formula: 'Cop Hank − Target Hank',
      explain: `How far the actual yarn count (Ne) is from the target. Positive = yarn is coarser than target (higher Ne number = finer yarn). Zero is ideal. Tolerance is ±${H_target !== null ? (H_target * 0).toFixed(2) : '?'} set in benchmarks.`,
      example: `Cop hank 47.82, target ${H_target?.toFixed(dp) ?? '—'} → deviation = +${H_target != null ? (47.82 - H_target).toFixed(dp) : '?'}`,
    },
    {
      term: 'Count Dev %',
      formula: '(Count Deviation / Target Hank) × 100',
      explain: 'Percentage deviation from target count. Makes deviation comparable across different yarn counts. ±1% is the typical industry tolerance.',
      example: `+0.32 deviation on target ${H_target?.toFixed(dp) ?? '—'} → ${H_target != null ? ((0.32 / H_target) * 100).toFixed(2) : '?'}%`,
    },
    {
      term: 'Draft Error',
      formula: 'Actual Draft − Nominal Draft',
      explain: `The ring frame must draft the roving by a precise ratio to produce the target count. Nominal draft = Target RF hank ÷ Target Simplex hank = ${nominalDraft?.toFixed(3) ?? '—'}×. If the actual draft (Cop Hank ÷ Bobbin Hank) differs from this, the frame is mis-set. Negative = under-drafting (yarn too coarse). Positive = over-drafting (yarn too fine).`,
      example: `Bobbin hank 1.20, cop hank 47.82 → actual draft = ${(47.82 / 1.20).toFixed(3)}×. Nominal ${nominalDraft?.toFixed(3) ?? '—'}× → error = ${nominalDraft != null ? ((47.82 / 1.20) - nominalDraft).toFixed(4) : '?'}`,
    },
    {
      term: 'CV Added',
      formula: '√(CV_cop² − CV_bobbin²)',
      explain: 'The extra variation introduced by the ring frame process itself. CV (Coefficient of Variation) measures how uneven the yarn is. If the cop CV is higher than the bobbin CV, the ring frame added unevenness. Zero means the frame added no new variation. Large positive values indicate a mechanical problem at the frame (worn drafting rollers, tension issues).',
      example: 'Bobbin CV 0.5%, Cop CV 1.0% → CV Added = √(1.0² − 0.5²) = √0.75 = 0.87%',
    },
  ]
  return (
    <div style={{ border: '1px solid var(--bd)', borderRadius: 'var(--r)', overflow: 'hidden' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, width: '100%',
          padding: '10px 14px', background: 'var(--bg-2)', border: 'none',
          cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font)',
          borderBottom: open ? '1px solid var(--bd)' : 'none',
        }}
      >
        <span style={{ fontSize: 11, color: 'var(--tx-4)', userSelect: 'none' }}>{open ? '▼' : '▶'}</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx-2)' }}>How the metrics are calculated</span>
        <span style={{ fontSize: 11, color: 'var(--tx-4)', marginLeft: 4 }}>Count Deviation · Draft Error · CV Added · explained</span>
      </button>
      {open && (
        <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 16, background: 'var(--bg)' }}>
          {terms.map(t => (
            <div key={t.term} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--tx)' }}>{t.term}</span>
                <code style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--claude)', background: 'var(--claude-bg)', padding: '1px 6px', borderRadius: 4 }}>{t.formula}</code>
              </div>
              <div style={{ fontSize: 12, color: 'var(--tx-2)', lineHeight: 1.65 }}>{t.explain}</div>
              <div style={{ fontSize: 11, color: 'var(--tx-4)', fontFamily: 'var(--mono)', padding: '4px 8px', background: 'var(--bg-2)', borderRadius: 4 }}>eg: {t.example}</div>
            </div>
          ))}
          <div style={{ fontSize: 11, color: 'var(--tx-3)', paddingTop: 4, borderTop: '1px solid var(--bd)' }}>
            <strong>Full chain:</strong> RSB can (sliver ~{H_b_target != null ? (H_b_target / (nominalDraft ?? 10)).toFixed(4) : '0.12'} Ne)
            → Simplex drafts to roving ({H_b_target?.toFixed(4) ?? '—'} Ne target)
            → Ring Frame drafts {nominalDraft?.toFixed(1) ?? '—'}× to yarn ({H_target?.toFixed(dp) ?? '—'} Ne target)
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Lineage Trace: visual chain Can → Bobbin → Cop ─────────────────────────── */
function LineageTraceTable({ report, machineFilter }) {
  const [frameFilter, setFrameFilter] = useState(null)

  const { bobbins, byBobbin, H_target, H_b_target, rfTol } = report
  const dp   = H_target   >= 10 ? 2 : 4
  const b_dp = H_b_target >= 10 ? 2 : 4

  const visible = bobbins.filter(b =>
    machineFilter == null || b.machine_number === machineFilter
  )

  // All unique frame numbers that appear in the visible bobbin data
  const allFrames = [...new Set(
    visible.flatMap(b => (byBobbin[b.id]?.rows ?? []).map(r => r.frame))
  )].sort((a, b) => a - b)

  if (!visible.length) return (
    <div style={{ fontSize: 12, color: 'var(--tx-4)', padding: '10px 0' }}>No bobbins match the current filter.</div>
  )

  const nodeBase = {
    display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start',
    padding: '8px 12px', borderRadius: 'var(--r)',
    minWidth: 82, flexShrink: 0,
  }
  const nodeStyle       = { ...nodeBase, background: 'var(--bg)',        border: '1px solid var(--bd)' }
  const nodeHighlight   = { ...nodeBase, background: 'var(--claude-bg)', border: '1px solid var(--claude-bd)' }
  const nodeLabel = (accent) => ({
    fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em',
    color: accent ? 'var(--claude)' : 'var(--tx-4)', marginBottom: 2,
  })
  const arrow = (
    <div style={{ display: 'flex', alignItems: 'center', alignSelf: 'center', padding: '0 3px', color: 'var(--tx-4)', fontSize: 20, userSelect: 'none', flexShrink: 0 }}>→</div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Frame filter bar */}
      {allFrames.length > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: 'var(--tx-4)', fontWeight: 600 }}>Frame:</span>
          {[null, ...allFrames].map(f => (
            <button
              key={f ?? 'all'}
              onClick={() => setFrameFilter(prev => prev === f ? null : f)}
              style={{
                padding: '3px 10px', fontSize: 11, fontWeight: 600, borderRadius: 'var(--r)',
                border: `1px solid ${frameFilter === f ? 'var(--claude)' : 'var(--bd)'}`,
                background: frameFilter === f ? 'var(--claude)' : 'var(--bg)',
                color: frameFilter === f ? '#fff' : 'var(--tx-3)',
                cursor: 'pointer', fontFamily: 'var(--font)', transition: 'all .1s',
              }}
            >{f == null ? 'All' : `Fr ${f}`}</button>
          ))}
        </div>
      )}

      {/* One card per visible bobbin */}
      {visible.map(b => {
        const info       = byBobbin[b.id]
        const allCops    = info?.rows ?? []
        const cops       = frameFilter == null ? allCops : allCops.filter(r => r.frame === frameFilter)
        const cans       = b.rsb_cans ?? []
        const validCans  = cans.filter(c => c.can_hank != null)
        const avgCanHank = validCans.length ? validCans.reduce((s, c) => s + c.can_hank, 0) / validCans.length : null
        const avgCopHank = cops.length ? cops.reduce((s, r) => s + r.copHank, 0) / cops.length : null
        const sxDraft    = avgCanHank && b.bobbin_hank ? b.bobbin_hank / avgCanHank : null
        const rfDraft    = b.bobbin_hank && avgCopHank  ? avgCopHank / b.bobbin_hank : null

        // If frame filter is active and this bobbin has no cops on that frame, skip
        if (frameFilter != null && !cops.length) return null

        return (
          <div key={b.id} style={{
            border: '1px solid var(--bd)', borderRadius: 'var(--r)',
            padding: '12px 14px', background: 'var(--bg-2)',
          }}>
            {/* Card header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--tx)' }}>{b.label}</span>
              {b.machine_number != null && (
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 8,
                  background: 'var(--bg-3)', border: '1px solid var(--bd)', color: 'var(--tx-2)',
                }}>Sx {b.machine_number}</span>
              )}
            </div>

            {/* Visual chain */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 2, overflowX: 'auto', paddingBottom: 2 }}>

              {/* RSB Can(s) node */}
              <div style={nodeStyle}>
                <span style={nodeLabel(false)}>RSB Can{cans.length !== 1 ? 's' : ''}</span>
                {cans.length === 0
                  ? <span style={{ fontSize: 11, color: 'var(--tx-4)' }}>—</span>
                  : cans.map(c => (
                    <div key={c.can_id} style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx)', whiteSpace: 'nowrap' }}>Can {c.can_slot}</span>
                      <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--tx-3)', whiteSpace: 'nowrap' }}>
                        {c.can_hank != null ? c.can_hank.toFixed(b_dp) : '—'}
                      </span>
                    </div>
                  ))
                }
              </div>

              {arrow}

              {/* Bobbin node */}
              <div style={nodeHighlight}>
                <span style={nodeLabel(true)}>Bobbin</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--tx)' }}>{b.label}</span>
                <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: b.bobbin_hank != null ? 'var(--tx-2)' : 'var(--tx-4)', whiteSpace: 'nowrap' }}>
                  {b.bobbin_hank != null ? b.bobbin_hank.toFixed(b_dp) : 'No reading'}
                </span>
              </div>

              {arrow}

              {/* Cop(s) node */}
              <div style={nodeStyle}>
                <span style={nodeLabel(false)}>Ring Frame</span>
                {cops.length === 0
                  ? <span style={{ fontSize: 11, color: 'var(--tx-4)' }}>
                      {frameFilter != null ? `No cop on Fr ${frameFilter}` : 'No cops logged'}
                    </span>
                  : cops.map((r, ci) => (
                    <div key={ci} style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--tx-3)', whiteSpace: 'nowrap' }}>Fr {r.frame}</span>
                      <span style={{ fontSize: 12, fontFamily: 'var(--mono)', fontWeight: 600, whiteSpace: 'nowrap', color: _devColor(r.copHank - H_target, rfTol) }}>
                        {r.copHank.toFixed(dp)}
                      </span>
                    </div>
                  ))
                }
              </div>
            </div>

            {/* Secondary metrics row */}
            <div style={{ display: 'flex', gap: 20, marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--bd)', flexWrap: 'wrap' }}>
              {[
                { label: 'Sx Draft', val: sxDraft != null ? sxDraft.toFixed(3) + '×' : '—' },
                { label: 'RF Draft', val: rfDraft != null ? rfDraft.toFixed(3) + '×' : '—' },
                { label: 'Cops shown', val: String(cops.length) + (frameFilter != null ? '' : ` / ${allCops.length}`) },
              ].map(m => (
                <div key={m.label} style={{ display: 'flex', gap: 5, alignItems: 'baseline' }}>
                  <span style={{ fontSize: 10, color: 'var(--tx-4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em' }}>{m.label}</span>
                  <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--tx-2)', fontWeight: 600 }}>{m.val}</span>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ── Machine filter bar ──────────────────────────────────────────────────────── */
function MachineFilerBar({ report, machineFilter, setMachineFilter }) {
  const machines = useMemo(() => {
    const s = new Set(report.bobbins.map(b => b.machine_number).filter(m => m != null))
    return [...s].sort((a, b) => a - b)
  }, [report])

  if (!machines.length) return null

  const btnStyle = (active) => ({
    padding: '4px 12px', fontSize: 11, fontWeight: 600, borderRadius: 'var(--r)',
    border: `1px solid ${active ? 'var(--claude)' : 'var(--bd)'}`,
    background: active ? 'var(--claude)' : 'var(--bg)',
    color: active ? '#fff' : 'var(--tx-3)',
    cursor: 'pointer', fontFamily: 'var(--font)', transition: 'all .12s',
  })

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 11, color: 'var(--tx-4)', fontWeight: 600 }}>Filter by Simplex M/c:</span>
      <button style={btnStyle(machineFilter == null)} onClick={() => setMachineFilter(null)}>All</button>
      {machines.map(m => (
        <button key={m} style={btnStyle(machineFilter === m)} onClick={() => setMachineFilter(machineFilter === m ? null : m)}>
          Sx {m}
        </button>
      ))}
    </div>
  )
}

function InteractionReport({ trialId }) {
  const [report,        setReport]        = useState(null)
  const [generating,    setGenerating]    = useState(false)
  const [error,         setError]         = useState(null)
  const [machineFilter, setMachineFilter] = useState(null)  // null = All, 1|2|3 = filter

  const handleGenerate = async () => {
    setGenerating(true)
    setError(null)
    try {
      const raw    = await getInteractionReport(trialId)
      const result = buildInteractionReport(raw)
      setReport(result)
      setMachineFilter(null)
    } catch (e) {
      setError(e?.response?.data?.detail ?? 'Failed to generate. Ensure benchmarks are set and cops have been logged.')
    } finally {
      setGenerating(false)
    }
  }

  /* ── Placeholder ────────────────────────────────────────────────────────── */
  if (!report) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 16, padding: '60px 24px',
        border: '1.5px dashed var(--bd-md)', borderRadius: 'var(--r-lg)',
        background: 'var(--bg-2)',
      }}>
        <span style={{ fontSize: 32, lineHeight: 1, color: 'var(--tx-3)' }}>⊞</span>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--tx-2)', textAlign: 'center' }}>
          Bobbin–Frame Interaction Report
        </div>
        <div style={{ fontSize: 12, color: 'var(--tx-3)', textAlign: 'center', maxWidth: 420, lineHeight: 1.65 }}>
          Runs ANOVA and generates: machine filter, lineage trace (Can→Bobbin→Cop),
          diagnostic heatmap, and four analysis tables.
          No data is loaded or computed until you click below.
        </div>
        {error && (
          <div style={{ fontSize: 12, color: 'var(--bad)', padding: '8px 14px', maxWidth: 420, textAlign: 'center', background: 'var(--bad-bg)', borderRadius: 'var(--r)', border: '1px solid var(--bad-bd)' }}>
            {error}
          </div>
        )}
        <button
          onClick={handleGenerate} disabled={generating}
          style={{
            padding: '10px 24px', fontSize: 13, fontWeight: 600,
            background: 'var(--claude)', color: '#fff',
            border: '1px solid var(--claude)', borderRadius: 'var(--r)',
            cursor: generating ? 'default' : 'pointer', opacity: generating ? .7 : 1,
            transition: 'opacity .15s', fontFamily: 'var(--font)',
          }}
        >
          {generating ? 'Generating…' : 'Generate Interaction Report'}
        </button>
      </div>
    )
  }

  /* ── Derived filtered views ─────────────────────────────────────────────── */
  const { byBobbin, frameSummary, bobbinSummary, frames, bobbins, nominalDraft, H_target, H_b_target, rfTol } = report
  const dp = H_target >= 10 ? 2 : 4

  // Apply machine filter to all tables
  const visibleBobbinIds = new Set(
    bobbins
      .filter(b => machineFilter == null || b.machine_number === machineFilter)
      .map(b => b.id)
  )
  const filteredInteractions = report.interactions.filter(r => visibleBobbinIds.has(r.bobbinId))
  const filteredBobbins      = bobbins.filter(b => visibleBobbinIds.has(b.id))

  const filteredByFrame = {}
  frames.forEach(f => {
    filteredByFrame[f] = (report.byFrame[f] ?? []).filter(r => visibleBobbinIds.has(r.bobbinId))
  })
  const filteredFrameSummary = frames.map(f => {
    const rows = filteredByFrame[f]
    if (!rows.length) return null
    const _avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null
    const _maxAbs = arr => arr.length ? arr.reduce((a, b) => Math.abs(b) > Math.abs(a) ? b : a, 0) : null
    const machines = [...new Set(rows.map(r => r.bobbinMachine).filter(m => m != null))].sort((a,b) => a-b)
    return { frame: f, count: rows.length, machines, avgCopHank: _avg(rows.map(r=>r.copHank)), avgCountDev: _avg(rows.map(r=>r.countDev)), maxCountDev: _maxAbs(rows.map(r=>r.countDev)), avgDraftError: _avg(rows.filter(r=>r.draftError!=null).map(r=>r.draftError)), avgCvAdded: _avg(rows.filter(r=>r.cvAdded!=null).map(r=>r.cvAdded)) }
  }).filter(Boolean)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>

      {/* Report meta bar */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, paddingBottom: 12, borderBottom: '1px solid var(--bd)' }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--tx)' }}>Bobbin–Frame Interaction Report</div>
          <div style={{ fontSize: 11, color: 'var(--tx-3)', marginTop: 3, fontFamily: 'var(--mono)' }}>
            RF target {_fmt(H_target, dp)} &nbsp;·&nbsp;
            Simplex target {_fmt(H_b_target, 4)} &nbsp;·&nbsp;
            Nominal RF draft {nominalDraft.toFixed(3)}× &nbsp;·&nbsp;
            {filteredInteractions.length} interaction{filteredInteractions.length !== 1 ? 's' : ''} shown
          </div>
        </div>
        <button onClick={() => setReport(null)} style={{ padding: '5px 12px', fontSize: 11, fontWeight: 500, border: '1px solid var(--bd)', borderRadius: 'var(--r)', background: 'var(--bg)', color: 'var(--tx-3)', cursor: 'pointer', fontFamily: 'var(--font)' }}>
          ↻ Regenerate
        </button>
      </div>

      {/* Machine filter buttons */}
      <MachineFilerBar report={report} machineFilter={machineFilter} setMachineFilter={setMachineFilter} />

      {/* Math glossary */}
      <MathGlossary dp={dp} nominalDraft={nominalDraft} H_target={H_target} H_b_target={H_b_target} />

      {/* Statistical Alert Banner */}
      <AnovaAlertBanner anova={report.anova} />

      {/* ANOVA P-value metrics */}
      <AnovaPvalueRow anova={report.anova} />

      {filteredInteractions.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--tx-3)', fontSize: 13 }}>
          {machineFilter != null ? `No interactions logged for Simplex M/c #${machineFilter}.` : 'No bobbin–cop interactions found. Log ring frame cops with bobbin links via the Flow Board.'}
        </div>
      ) : (<>

        {/* Diagnostic Heatmap — filtered */}
        <IrSection title="Diagnostic Heatmap" subtitle="Cop hank at each bobbin–frame intersection. Text colour indicates deviation from target.">
          <DiagnosticHeatmap report={{ ...report, bobbins: filteredBobbins, interactions: filteredInteractions }} />
        </IrSection>

        {/* Lineage Trace: Can → Bobbin → Cop */}
        <IrSection
          title="Lineage Trace — Can → Bobbin → Cop"
          subtitle="Visual flow chain showing which RSB cans fed each Simplex bobbin, and which cops each bobbin produced. Filter by frame to isolate specific frame interactions. Sx Draft and RF Draft are shown as secondary metrics."
        >
          <LineageTraceTable report={report} machineFilter={machineFilter} />
        </IrSection>

        {/* Table 1: Frame-wise */}
        <IrSection title="Table 1 — Frame-wise Interaction" subtitle="How each frame performs across all bobbins it received. Consistent count deviation within a frame indicates a frame calibration issue.">
          {frames.map(f => filteredByFrame[f]?.length ? (
            <FrameInteractionTable key={f} frame={f} rows={filteredByFrame[f]} dp={dp} rfTol={rfTol} H_target={H_target} />
          ) : null)}
        </IrSection>

        {/* Table 2: Bobbin-wise */}
        <IrSection title="Table 2 — Bobbin-wise Interaction" subtitle="How each bobbin performs across every frame it fed. Consistent count deviation for one bobbin across frames indicates an upstream roving quality issue.">
          {filteredBobbins.map(b => (
            <BobbinInteractionTable
              key={b.id} bobbinId={b.id}
              label={byBobbin[b.id]?.label ?? b.label}
              bobbinHank={byBobbin[b.id]?.bobbinHank}
              machineNumber={byBobbin[b.id]?.machineNumber ?? null}
              rows={byBobbin[b.id]?.rows ?? []}
              dp={dp} rfTol={rfTol} H_target={H_target}
            />
          ))}
        </IrSection>

        {/* Table 3: Frame Summary */}
        <IrSection title="Table 3 — Frame Summary" subtitle="Aggregated metrics per frame across all bobbins it processed.">
          <FrameSummaryTable frameSummary={filteredFrameSummary} dp={dp} rfTol={rfTol} H_target={H_target} />
        </IrSection>

        {/* Table 4: Bobbin Summary */}
        <IrSection title="Table 4 — Bobbin Summary" subtitle="Aggregated output metrics per bobbin across all frames it fed.">
          <BobbinSummaryTable bobbinSummary={bobbinSummary.filter(r => visibleBobbinIds.has(r.bobbinId))} dp={dp} />
        </IrSection>

      </>)}
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════════════
   TrialDashboard — full view of a single trial
══════════════════════════════════════════════════════════════════════════════ */
function TrialDashboard({ trialId, depts, onBack }) {
  const [dashboard,   setDashboard]   = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [panel,       setPanel]       = useState(null)   // 'benchmarks' | 'log'
  const [saving,      setSaving]      = useState(false)
  const [flow,        setFlow]        = useState(null)
  const [flowLoading, setFlowLoading] = useState(true)
  const [flowError,   setFlowError]   = useState(null)
  const [boardView,   setBoardView]   = useState('flow')  // 'flow' | 'matrix'

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const d = await getLabDashboard(trialId)
      setDashboard(d)
    } finally {
      setLoading(false)
    }
  }, [trialId])

  const loadFlow = useCallback(async () => {
    setFlowLoading(true)
    setFlowError(null)
    try {
      const data = await getLabFlow(trialId)
      setFlow(data)
    } catch (e) {
      setFlowError(e?.response?.data?.detail || e.message || 'Failed to load flow board.')
    } finally {
      setFlowLoading(false)
    }
  }, [trialId])

  useEffect(() => { reload(); loadFlow() }, [reload, loadFlow])

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

      {/* View toggle: Flow Board | Analysis Matrix */}
      <div style={{ display: 'flex', gap: 0, borderRadius: 'var(--r)', overflow: 'hidden', border: '1px solid var(--bd)', alignSelf: 'flex-start' }}>
        {[
          { key: 'flow',   label: '⊡ Flow Board'      },
          { key: 'matrix', label: '⊞ Interaction Report' },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setBoardView(key)}
            style={{
              padding: '6px 16px', fontSize: 12, fontWeight: boardView === key ? 700 : 500,
              border: 'none', cursor: 'pointer', fontFamily: 'var(--font)',
              background: boardView === key ? 'var(--claude)'   : 'var(--bg)',
              color:      boardView === key ? '#fff'            : 'var(--tx-3)',
              transition: 'background .15s, color .15s',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {boardView === 'flow' ? (
        flowError ? (
          <div style={{
            border: '1px solid var(--bad-bd)', borderRadius: 'var(--r-lg)',
            padding: 24, background: 'var(--bad-bg)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--bad)' }}>Flow Board failed to load</div>
            <div style={{ fontSize: 12, color: 'var(--tx-2)', textAlign: 'center', maxWidth: 420 }}>{flowError}</div>
            <button
              onClick={loadFlow}
              style={{
                padding: '7px 18px', fontSize: 12, fontWeight: 600,
                border: '1px solid var(--bd)', borderRadius: 'var(--r)',
                background: 'var(--bg)', color: 'var(--tx)', cursor: 'pointer',
                fontFamily: 'var(--font)',
              }}
            >↻ Retry</button>
          </div>
        ) : (
          <FlowBoard
            trialId={trialId}
            flow={flow}
            loading={flowLoading}
            refreshFlow={loadFlow}
          />
        )
      ) : (
        <InteractionReport trialId={trialId} />
      )}

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
  const [trials, setTrials] = useState([])
  const [loading, setLoading] = useState(true)
  const [openTrial, setOpenTrial] = useState(null)   // trial id currently open
  const [showNew, setShowNew] = useState(false)

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
            color: value === v ? 'var(--tx)' : 'var(--tx-3)',
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
        color: primary ? '#fff' : danger ? 'var(--bad)' : 'var(--tx-2)',
        opacity: disabled ? .5 : 1,
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
