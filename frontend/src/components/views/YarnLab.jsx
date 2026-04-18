import { useState, useEffect, useCallback, useMemo, Fragment } from 'react'
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
        // No label — backend auto-generates a unique one
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
        // No label — backend derives from can slot and deduplicates
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
    spindleNumber: bobbin.spindle_number != null ? String(bobbin.spindle_number) : '',
  }))

  useEffect(() => {
    setForm({
      notes: bobbin.notes ?? '',
      verified: bobbin.verified_same_hank,
      sampleLength: bobbin.sample_length ?? DEFAULT_LENGTHS.simplex,
      readings: buildReadings(bobbin.readings, SIMPLEX_READING_COUNT),
      spindleNumber: bobbin.spindle_number != null ? String(bobbin.spindle_number) : '',
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
      spindle_number: bobbin.spindle_number ?? null,
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
      spindle_number: form.spindleNumber ? parseInt(form.spindleNumber, 10) : null,
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 10, color: 'var(--tx-4)', fontWeight: 600 }}>Spindle #</span>
            <input
              type="number" step="1" min="1" placeholder="e.g. 12"
              value={form.spindleNumber}
              onChange={e => setForm(f => ({ ...f, spindleNumber: e.target.value }))}
              style={{ ...inputStyle, width: 90 }}
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

  const [allFramesExpanded, setAllFramesExpanded] = useState(true)

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
            {frames.length} frame{frames.length !== 1 ? 's' : ''} · {cops.length} cop{cops.length !== 1 ? 's' : ''} total · drop bobbins to create cops
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {frames.length > 1 && (
            <SmBtn onClick={() => setAllFramesExpanded(v => !v)}>
              {allFramesExpanded ? '↑ Collapse Frames' : '↓ Expand Frames'}
            </SmBtn>
          )}
          <SmBtn primary onClick={addFrame} disabled={busyId === 'new'}>
            {busyId === 'new' ? 'Adding…' : '+ Add Frame'}
          </SmBtn>
        </div>
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
              forceExpanded={allFramesExpanded}
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
   CopAccordion — compact list of cop rows with per-cop expand/collapse
   Default: all collapsed → one 36px row per cop
   Click a row → expands inline to full reading form
   "Expand All" / "Collapse All" buttons in the header
══════════════════════════════════════════════════════════════════════════════ */
function CopAccordion({ cops, copForms, setCopForms, onDeleteCop, handleCopDrop, removeBobbin }) {
  const [openIds, setOpenIds] = useState(new Set())

  const toggleCop = (id) => setOpenIds(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })
  const expandAll  = () => setOpenIds(new Set(cops.map(c => c.id)))
  const collapseAll = () => setOpenIds(new Set())
  const allOpen = cops.length > 0 && cops.every(c => openIds.has(c.id))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, border: '1px solid var(--bd)', borderRadius: 'var(--r)', overflow: 'hidden' }}>
      {/* Accordion toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '5px 10px', background: 'var(--bg-2)', borderBottom: '1px solid var(--bd)',
      }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--tx-4)', letterSpacing: '.05em' }}>
          {cops.length} COP{cops.length !== 1 ? 'S' : ''} · {cops.filter(c => (c.status ?? 'pending') !== 'pending').length} saved
        </span>
        <button
          onClick={allOpen ? collapseAll : expandAll}
          style={{ fontSize: 10, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--claude)', fontWeight: 600, fontFamily: 'var(--font)', padding: '2px 6px' }}
        >
          {allOpen ? '↑ Collapse All' : '↓ Expand All'}
        </button>
      </div>

      {/* Cop rows */}
      {cops.map((cop, idx) => {
        const isOpen = openIds.has(cop.id)
        const status  = cop.status ?? 'pending'
        const statusColor = STATUS_META[status]?.color ?? 'var(--tx-4)'
        const form = copForms[cop.id] ?? {
          notes: cop.notes ?? '',
          sampleLength: cop.sample_length ?? DEFAULT_LENGTHS.ringframe,
          readings: buildReadings(cop.readings, RING_READING_COUNT),
          spindleNumber: cop.spindle_number != null ? String(cop.spindle_number) : '',
        }
        const updateForm = (field, value) =>
          setCopForms(f => ({ ...f, [cop.id]: { ...(f[cop.id] ?? form), [field]: value } }))

        const bobbinTag = (cop.simplex_bobbins || []).map(b =>
          b.machine_number != null
            ? `${b.label} Sx${b.machine_number}${b.spindle_number != null ? '/Sp' + b.spindle_number : ''}`
            : b.label
        ).join(', ')

        return (
          <div key={cop.id} style={{ borderTop: idx > 0 ? '1px solid var(--bd)' : undefined }}>

            {/* ── Compact row (always visible) ── */}
            <div
              onClick={() => toggleCop(cop.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '7px 10px', cursor: 'pointer',
                background: isOpen ? 'var(--bg-2)' : STATUS_BG[status] ?? 'var(--bg)',
                transition: 'background .1s',
                userSelect: 'none',
              }}
            >
              {/* Status dot */}
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: statusColor, flexShrink: 0 }} />

              {/* Label */}
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--tx)', minWidth: 56, flexShrink: 0 }}>
                {cop.label}
              </span>

              {/* Source bobbins */}
              {bobbinTag && (
                <span style={{ fontSize: 10, color: 'var(--tx-4)', flexShrink: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  ← {bobbinTag}
                </span>
              )}

              {/* Saved hank + CV */}
              {cop.mean_hank != null && (
                <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--tx-3)', marginLeft: 'auto', flexShrink: 0, whiteSpace: 'nowrap' }}>
                  Ne {cop.mean_hank.toFixed(2)}
                  {cop.cv_pct != null && (
                    <span style={{ color: cop.cv_pct > 3 ? 'var(--bad)' : cop.cv_pct > 1.5 ? 'var(--warn)' : 'var(--ok)', marginLeft: 5 }}>
                      CV {cop.cv_pct.toFixed(1)}%
                    </span>
                  )}
                </span>
              )}
              {cop.mean_hank == null && (
                <span style={{ fontSize: 10, color: 'var(--tx-4)', marginLeft: 'auto', fontStyle: 'italic' }}>no data</span>
              )}

              {/* Spindle badge if set */}
              {cop.spindle_number != null && (
                <span style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--tx-4)', flexShrink: 0 }}>
                  Sp{cop.spindle_number}
                </span>
              )}

              {/* Status badge */}
              <span style={{
                fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 8, flexShrink: 0,
                border: `1px solid ${STATUS_BORDER[status] ?? 'var(--bd)'}`,
                background: 'var(--bg)', color: statusColor,
              }}>{STATUS_META[status]?.label ?? 'PENDING'}</span>

              {/* Chevron */}
              <span style={{ fontSize: 10, color: 'var(--tx-4)', flexShrink: 0, transition: 'transform .15s', transform: isOpen ? 'rotate(180deg)' : 'none' }}>▼</span>
            </div>

            {/* ── Expanded form ── */}
            {isOpen && (
              <div style={{
                padding: 12, background: STATUS_BG[status] ?? 'var(--bg-3)',
                borderTop: '1px solid var(--bd)',
                display: 'flex', flexDirection: 'column', gap: 8,
              }}
                onClick={e => e.stopPropagation()}
              >
                {/* Spindle # + delete */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--tx)' }}>{cop.label}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 10, color: 'var(--tx-4)', fontWeight: 600 }}>Sp#</span>
                    <input
                      type="number" step="1" min="1" placeholder="spindle"
                      value={form.spindleNumber ?? ''}
                      onChange={e => updateForm('spindleNumber', e.target.value)}
                      style={{ ...inputStyle, width: 70, padding: '2px 6px', fontSize: 11 }}
                      title="Spindle number within this ring frame"
                    />
                  </div>
                  <button onClick={() => onDeleteCop(cop.id)} style={{
                    marginLeft: 'auto', border: 'none', background: 'transparent',
                    cursor: 'pointer', color: 'var(--tx-4)', fontSize: 11, padding: '2px 6px',
                  }}>✕ Delete</button>
                </div>

                {/* 5 relay readings */}
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

                {/* Sample length */}
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

                {/* Bobbin drop zone */}
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
                        }}>Sx {b.machine_number}</span>
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
            )}
          </div>
        )
      })}
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════════════
   FrameCard — one ring-frame machine container
   • Starts expanded; collapses on "Save Frame"
   • Up to 500 cops per frame, each cop has 5 relay readings
   • Bobbins from Simplex can be dropped onto the frame → creates a new cop
   • A single bobbin can also be linked to multiple frames
══════════════════════════════════════════════════════════════════════════════ */
function FrameCard({ initialFrameNumber, cops, isLocal, busy, forceExpanded, onCreateCop, onUpdateCop, onDeleteCop, onRemoveLocal }) {
  const [isExpanded, setIsExpanded] = useState(true)

  // Sync with panel-level expand/collapse toggle
  useEffect(() => { setIsExpanded(forceExpanded) }, [forceExpanded])
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
        spindleNumber: cop.spindle_number != null ? String(cop.spindle_number) : '',
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
            spindleNumber: cop.spindle_number != null ? String(cop.spindle_number) : '',
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
    if (cops.length >= 5000) return
    const bobbinId = parseInt(e.dataTransfer.getData('application/x-simplex-bobbin'), 10)
    const bobbinLabel = e.dataTransfer.getData('application/x-simplex-bobbin-label') || 'Bobbin'
    if (!bobbinId) return
    const fn = frameNum !== '' ? parseInt(frameNum, 10) : null
    // Derive cop label from bobbin: "Bobbin 1-2" → "Cop 1-2"
    const bobbinSuffix = bobbinLabel.replace(/^Bobbin\s+/i, '').trim()
    const copLabel = bobbinSuffix ? `Cop ${bobbinSuffix}` : 'Cop'
    await onCreateCop(fn, {
      label: copLabel,
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
        spindle_number: form.spindleNumber ? parseInt(form.spindleNumber, 10) : null,
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
        <span style={{ fontSize: 12, color: 'var(--tx-3)' }}>{cops.length} Cops Logged</span>
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
        <span style={{ fontSize: 11, color: 'var(--tx-4)' }}>{cops.length} Cops</span>
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
            border: `1.5px dashed ${cops.length >= 500 ? 'var(--bd)' : 'var(--bd-md)'}`,
            borderRadius: 'var(--r)', background: 'var(--bg-2)',
            padding: cops.length === 0 ? '18px 14px' : '8px 12px',
            minHeight: 52, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center',
            opacity: cops.length >= 500 ? .5 : 1,
            transition: 'opacity .15s',
          }}>
          {cops.length === 0 ? (
            <span style={{ fontSize: 12, color: 'var(--tx-3)', width: '100%', textAlign: 'center' }}>
              Drop simplex bobbins here — each bobbin creates one cop
            </span>
          ) : cops.length < 500 ? (
            <span style={{ fontSize: 11, color: 'var(--tx-4)' }}>
              + Drop another bobbin to add a cop
            </span>
          ) : (
            <span style={{ fontSize: 11, color: 'var(--tx-4)' }}>Frame full — 500 cops max</span>
          )}
        </div>

        {/* Individual cop entries — two-level accordion */}
        {cops.length > 0 && (
          <CopAccordion
            cops={cops}
            copForms={copForms}
            setCopForms={setCopForms}
            onDeleteCop={onDeleteCop}
            handleCopDrop={handleCopDrop}
            removeBobbin={removeBobbin}
          />
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
  const { bobbins: _rawBobbins, frames, cells, benchmarks, anova,
          hierarchy = [], variation = null } = raw
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
    hierarchy,
    variation,
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
/* Renders at position:fixed so it NEVER clips inside table overflow contexts  */
function InfoTip({ formula, explain }) {
  const [tipPos, setTipPos] = useState(null)

  const handleClick = (e) => {
    e.stopPropagation()
    if (tipPos) { setTipPos(null); return }
    const rect = e.currentTarget.getBoundingClientRect()
    const tipW = 290
    // use clientWidth to exclude scrollbar from measurement
    const viewW = document.documentElement.clientWidth
    let left = Math.round(rect.left)
    if (left + tipW > viewW - 10) left = Math.max(10, viewW - tipW - 10)
    setTipPos({ top: Math.round(rect.bottom + 6), left })
  }

  useEffect(() => {
    if (!tipPos) return
    const hide = () => setTipPos(null)
    // capture phase so it fires before any stopPropagation in child elements
    window.addEventListener('click', hide, { capture: true, once: true })
    return () => window.removeEventListener('click', hide, { capture: true })
  }, [tipPos])

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, verticalAlign: 'middle' }}>
      <button
        onClick={handleClick}
        style={{
          width: 13, height: 13, borderRadius: '50%',
          border: `1px solid ${tipPos ? 'var(--claude)' : 'var(--bd-md)'}`,
          background: tipPos ? 'var(--claude)' : 'var(--bg-3)',
          color: tipPos ? '#fff' : 'var(--tx-4)',
          fontSize: 8, fontWeight: 700, lineHeight: 1,
          cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--font)', padding: 0, flexShrink: 0,
        }}
      >?</button>
      {tipPos && (
        <div style={{
          position: 'fixed', top: tipPos.top, left: tipPos.left, zIndex: 9999,
          width: 290,
          background: 'var(--bg)', border: '1px solid var(--bd-md)',
          borderRadius: 'var(--r)', boxShadow: '0 6px 24px rgba(0,0,0,.18)',
          overflow: 'hidden',
          pointerEvents: 'none',
        }}>
          <div style={{ padding: '6px 10px', background: 'var(--bg-2)', borderBottom: '1px solid var(--bd)' }}>
            <code style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--claude)', wordBreak: 'break-all' }}>{formula}</code>
          </div>
          <div style={{ padding: '7px 10px', fontSize: 11, color: 'var(--tx-2)', lineHeight: 1.6, fontFamily: 'var(--font)', fontWeight: 400, wordWrap: 'break-word', whiteSpace: 'normal' }}>
            {explain}
          </div>
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

/* ── Lineage Trace: frame-first causal grid ──────────────────────────────────── */
/*                                                                               */
/*  Design principles:                                                           */
/*  • Default: ONE frame shown — clean horizontal path per bobbin                */
/*  • Select multiple frames → cop columns branch side-by-side                  */
/*  • Color only on DATA values that deviate (never on containers)               */
/*  • Uniform column widths — ERP-style grid, not decorated cards                */
/*                                                                               */
function LineageTraceTable({ report, machineFilter }) {
  const [selectedFrames, setSelectedFrames] = useState([])

  const { bobbins, byBobbin, H_target, H_b_target, rfTol } = report
  const dp   = H_target   >= 10 ? 2 : 4
  const b_dp = H_b_target >= 10 ? 2 : 4

  const visible = bobbins.filter(b =>
    machineFilter == null || b.machine_number === machineFilter
  )
  const allFrames = [...new Set(
    visible.flatMap(b => (byBobbin[b.id]?.rows ?? []).map(r => r.frame))
  )].sort((a, b) => a - b)

  // Keep selection valid when machine filter changes
  useEffect(() => {
    setSelectedFrames(prev => {
      const valid = prev.filter(f => allFrames.includes(f))
      return valid.length > 0 ? valid : allFrames.slice(0, 1)
    })
  }, [machineFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  // Initialise to first frame on mount
  useEffect(() => {
    setSelectedFrames(prev => prev.length > 0 ? prev : allFrames.slice(0, 1))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const displayFrames = (() => {
    const valid = selectedFrames.filter(f => allFrames.includes(f))
    return valid.length > 0 ? valid : allFrames.slice(0, 1)
  })()

  const toggleFrame = (f) => {
    const next = displayFrames.includes(f)
      ? displayFrames.filter(x => x !== f)
      : [...displayFrames, f].sort((a, b) => a - b)
    setSelectedFrames(next.length > 0 ? next : displayFrames)
  }

  if (!visible.length) return (
    <p style={{ fontSize: 12, color: 'var(--tx-4)', margin: 0 }}>No bobbins match the current filter.</p>
  )
  if (allFrames.length === 0) return (
    <p style={{ fontSize: 12, color: 'var(--tx-4)', margin: 0 }}>No ring frame cops logged yet.</p>
  )

  const copStatus = (hank) => {
    if (hank == null) return 'pending'
    const dev = Math.abs(hank - H_target)
    if (dev <= rfTol * 0.5) return 'pass'
    if (dev <= rfTol)       return 'warn'
    return 'fail'
  }

  // Uniform column dimensions
  const COL = 108   // data column width (all 3 stages identical)
  const ARW = 36    // arrow column

  // gridTemplateColumns: can·arrow·bobbin·arrow·cop×N
  const gridCols = `${COL}px ${ARW}px ${COL}px ${ARW}px ${displayFrames.map(() => `${COL}px`).join(' ')}`

  // Style factories
  const hdrCell = (extra = {}) => ({
    padding: '6px 10px', display: 'flex', alignItems: 'center',
    background: 'var(--bg-2)', borderBottom: '2px solid var(--bd-md)',
    fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em',
    color: 'var(--tx-4)',
    ...extra,
  })
  const dataCell = (extra = {}) => ({
    padding: '9px 10px', display: 'flex', flexDirection: 'column', gap: 2, justifyContent: 'center',
    background: 'var(--bg)', borderBottom: '1px solid var(--bd)',
    ...extra,
  })
  const arrowCell = (extra = {}) => ({
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--bg)', borderBottom: '1px solid var(--bd)',
    color: 'var(--bd-md)', fontSize: 12, userSelect: 'none', letterSpacing: 0,
    ...extra,
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* ── Frame selector ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        padding: '8px 12px', borderRadius: 'var(--r)',
        background: 'var(--bg-2)', border: '1px solid var(--bd)',
      }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--tx-3)', flexShrink: 0 }}>Ring Frame:</span>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', flex: 1 }}>
          {allFrames.map(f => {
            const on = displayFrames.includes(f)
            return (
              <button key={f} onClick={() => toggleFrame(f)} style={{
                padding: '2px 8px', fontSize: 11, fontWeight: on ? 700 : 400, borderRadius: 4,
                border: `1px solid ${on ? 'var(--claude)' : 'var(--bd)'}`,
                background: on ? 'var(--claude)' : 'transparent',
                color: on ? '#fff' : 'var(--tx-3)',
                cursor: 'pointer', fontFamily: 'var(--font)', transition: 'background .1s, color .1s',
              }}>Fr {f}</button>
            )
          })}
        </div>
        <span style={{ fontSize: 10, color: 'var(--tx-4)', flexShrink: 0 }}>
          {displayFrames.length === 1
            ? 'Add more frames to compare side-by-side'
            : `${displayFrames.length} frames — columns branch right`}
        </span>
      </div>

      {/* ── ERP Grid ── */}
      <div style={{ overflowX: 'auto' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: gridCols,
          border: '1px solid var(--bd)',
          borderRadius: 'var(--r)',
          overflow: 'hidden',
          width: 'max-content',
        }}>

          {/* Header row */}
          <div style={hdrCell()}>RSB Can</div>
          <div style={hdrCell()} />
          <div style={hdrCell({ color: 'var(--claude)', background: 'var(--claude-bg)', borderLeft: '2px solid var(--claude-bd)' })}>Bobbin</div>
          <div style={hdrCell()} />
          {displayFrames.map((f, fi) => (
            <div key={f} style={hdrCell({ borderLeft: fi > 0 ? '1px solid var(--bd)' : undefined })}>
              Frame {f}
            </div>
          ))}

          {/* Data rows — flatMap emits 4+N cells per bobbin directly into the grid */}
          {visible.flatMap((b, ri) => {
            const isLast = ri === visible.length - 1
            const last   = isLast ? { borderBottom: 'none' } : {}
            const cans   = b.rsb_cans ?? []
            const info   = byBobbin[b.id]

            return [
              /* ── RSB Can cell ── */
              <div key={`${b.id}C`} style={dataCell(last)}>
                {cans.length === 0
                  ? <span style={{ fontSize: 11, color: 'var(--tx-4)' }}>—</span>
                  : cans.map(c => (
                    <div key={c.can_id} style={{ lineHeight: 1.35 }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--tx)', display: 'block' }}>
                        Can {c.can_slot}
                      </span>
                      <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--tx-3)', display: 'block' }}>
                        {c.can_hank != null ? c.can_hank.toFixed(b_dp) : '—'}
                      </span>
                    </div>
                  ))
                }
              </div>,

              /* ── Arrow ── */
              <div key={`${b.id}A1`} style={arrowCell(last)}>→</div>,

              /* ── Bobbin cell ── */
              <div key={`${b.id}B`} style={dataCell({ ...last, background: 'var(--claude-bg)', borderLeft: '2px solid var(--claude-bd)' })}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--tx)' }}>{b.label}</span>
                  {b.machine_number != null && (
                    <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--tx-4)' }}>Sx {b.machine_number}</span>
                  )}
                </div>
                <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: b.bobbin_hank != null ? 'var(--tx-3)' : 'var(--tx-4)' }}>
                  {b.bobbin_hank != null ? b.bobbin_hank.toFixed(b_dp) : '—'}
                </span>
              </div>,

              /* ── Arrow ── */
              <div key={`${b.id}A2`} style={arrowCell(last)}>→</div>,

              /* ── Cop cell(s) — one per selected frame ── */
              ...displayFrames.map((f, fi) => {
                const cop = info?.rows.find(r => r.frame === f) ?? null
                const st  = copStatus(cop?.copHank)
                const dev = cop ? cop.copHank - H_target : null
                return (
                  <div key={`${b.id}F${f}`} style={dataCell({
                    ...last,
                    borderLeft: fi > 0 ? '1px solid var(--bd)' : undefined,
                  })}>
                    {cop == null
                      ? <span style={{ fontSize: 11, color: 'var(--tx-4)' }}>—</span>
                      : <>
                        <span style={{ fontSize: 13, fontFamily: 'var(--mono)', fontWeight: 700, color: V_COLOR[st], lineHeight: 1 }}>
                          {cop.copHank.toFixed(dp)}
                        </span>
                        <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: V_COLOR[st] }}>
                          {dev >= 0 ? '+' : ''}{dev.toFixed(dp)}
                        </span>
                      </>
                    }
                  </div>
                )
              }),
            ]
          })}
        </div>
      </div>

      {/* ── Legend ── */}
      <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
        {[['pass', 'Within ½ tol'], ['warn', 'Within tol'], ['fail', 'Exceeds tol']].map(([st, label]) => (
          <div key={st} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: V_COLOR[st] }} />
            <span style={{ fontSize: 10, color: 'var(--tx-4)' }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Hierarchy View ─────────────────────────────────────────────────────────── */
function HierarchyView({ hierarchy }) {
  const [expanded, setExpanded] = useState({})    // key: "can-N", "bob-N"

  const toggle = key => setExpanded(prev => ({ ...prev, [key]: !prev[key] }))
  const isOpen = key => expanded[key] !== false  // default open

  if (!hierarchy || !hierarchy.length) {
    return <div style={{ padding: 24, textAlign: 'center', color: 'var(--tx-3)', fontSize: 12 }}>No hierarchy data available. Ensure cans, bobbins and cops are linked.</div>
  }

  const cellStyle = { padding: '4px 10px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 11, whiteSpace: 'nowrap' }
  const labelStyle = { padding: '4px 10px', fontSize: 11, color: 'var(--tx-2)' }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 11 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--bd-md)' }}>
            <th style={{ ...labelStyle, textAlign: 'left', fontWeight: 700, color: 'var(--tx-4)', paddingBottom: 6 }}>Node</th>
            <th style={{ ...cellStyle, fontWeight: 700, color: 'var(--tx-4)', paddingBottom: 6 }}>Mean Hank</th>
            <th style={{ ...cellStyle, fontWeight: 700, color: 'var(--tx-4)', paddingBottom: 6 }}>CV%</th>
            <th style={{ ...cellStyle, fontWeight: 700, color: 'var(--tx-4)', paddingBottom: 6 }}>N</th>
            <th style={{ ...cellStyle, fontWeight: 700, color: 'var(--tx-4)', paddingBottom: 6 }}>Machine</th>
            <th style={{ ...cellStyle, fontWeight: 700, color: 'var(--tx-4)', paddingBottom: 6 }}>Spindle</th>
            <th style={{ ...cellStyle, fontWeight: 700, color: 'var(--tx-4)', paddingBottom: 6 }}>Frame</th>
          </tr>
        </thead>
        <tbody>
          {hierarchy.map((can, ci) => {
            const canKey = `can-${ci}`
            const canOpen = isOpen(canKey)
            return (
              <Fragment key={canKey}>
                {/* Can row */}
                <tr style={{ background: 'var(--bg-2)', borderTop: ci > 0 ? '2px solid var(--bd)' : undefined }}>
                  <td style={{ ...labelStyle, fontWeight: 700, cursor: 'pointer', userSelect: 'none' }} onClick={() => toggle(canKey)}>
                    <span style={{ marginRight: 6, fontSize: 10, color: 'var(--tx-4)' }}>{canOpen ? '▼' : '▶'}</span>
                    🗂 {can.label}
                    {can.slot != null && <span style={{ fontSize: 10, color: 'var(--tx-4)', marginLeft: 6 }}>slot {can.slot}</span>}
                    <span style={{ fontSize: 10, color: 'var(--tx-4)', marginLeft: 8 }}>({(can.bobbins || []).length} bobbins)</span>
                  </td>
                  <td style={{ ...cellStyle, fontWeight: 600 }}>{can.mean_hank != null ? can.mean_hank.toFixed(4) : '—'}</td>
                  <td style={{ ...cellStyle, color: can.cv_pct > 2 ? 'var(--bad)' : can.cv_pct > 1 ? 'var(--warn)' : 'var(--tx)' }}>{can.cv_pct != null ? can.cv_pct.toFixed(2) + '%' : '—'}</td>
                  <td style={cellStyle}>{can.n_readings ?? '—'}</td>
                  <td style={cellStyle}>—</td>
                  <td style={cellStyle}>—</td>
                  <td style={cellStyle}>—</td>
                </tr>
                {canOpen && (can.bobbins || []).map((bob, bi) => {
                  const bobKey = `bob-${ci}-${bi}`
                  const bobOpen = isOpen(bobKey)
                  return (
                    <Fragment key={bobKey}>
                      {/* Bobbin row */}
                      <tr style={{ borderTop: '1px solid var(--bd)' }}>
                        <td style={{ ...labelStyle, paddingLeft: 28, cursor: 'pointer', userSelect: 'none' }} onClick={() => toggle(bobKey)}>
                          <span style={{ marginRight: 6, fontSize: 10, color: 'var(--tx-4)' }}>{bobOpen ? '▼' : '▶'}</span>
                          🧶 {bob.label}
                        </td>
                        <td style={{ ...cellStyle }}>{bob.mean_hank != null ? bob.mean_hank.toFixed(4) : '—'}</td>
                        <td style={{ ...cellStyle, color: bob.cv_pct > 2 ? 'var(--bad)' : bob.cv_pct > 1 ? 'var(--warn)' : 'var(--tx)' }}>{bob.cv_pct != null ? bob.cv_pct.toFixed(2) + '%' : '—'}</td>
                        <td style={cellStyle}>{bob.n_readings ?? '—'}</td>
                        <td style={{ ...cellStyle, fontFamily: 'var(--mono)' }}>{bob.machine_number != null ? `Sx ${bob.machine_number}` : '—'}</td>
                        <td style={{ ...cellStyle, fontFamily: 'var(--mono)' }}>{bob.spindle_number != null ? `Sp ${bob.spindle_number}` : '—'}</td>
                        <td style={cellStyle}>—</td>
                      </tr>
                      {bobOpen && (bob.cops || []).map((cop, ki) => (
                        <tr key={ki} style={{ borderTop: '1px solid var(--bd)', background: 'transparent' }}>
                          <td style={{ ...labelStyle, paddingLeft: 52, color: 'var(--tx-3)' }}>
                            🪡 {cop.label}
                          </td>
                          <td style={{ ...cellStyle }}>{cop.mean_hank != null ? cop.mean_hank.toFixed(4) : '—'}</td>
                          <td style={{ ...cellStyle, color: cop.cv_pct > 3 ? 'var(--bad)' : cop.cv_pct > 1.5 ? 'var(--warn)' : 'var(--tx)' }}>{cop.cv_pct != null ? cop.cv_pct.toFixed(2) + '%' : '—'}</td>
                          <td style={cellStyle}>{cop.n_readings ?? '—'}</td>
                          <td style={cellStyle}>—</td>
                          <td style={{ ...cellStyle, fontFamily: 'var(--mono)' }}>{cop.spindle_number != null ? `Sp ${cop.spindle_number}` : '—'}</td>
                          <td style={{ ...cellStyle, fontFamily: 'var(--mono)' }}>{cop.frame_number != null ? `Fr ${cop.frame_number}` : '—'}</td>
                        </tr>
                      ))}
                    </Fragment>
                  )
                })}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/* ── Matrix View ─────────────────────────────────────────────────────────────── */
function MatrixView({ hierarchy }) {
  if (!hierarchy || !hierarchy.length) {
    return <div style={{ padding: 24, textAlign: 'center', color: 'var(--tx-3)', fontSize: 12 }}>No hierarchy data available.</div>
  }

  // Build Can×Bobbin matrix: rows = cans, cols = bobbins across all cans
  // We'll show two matrices: (A) Can → Bobbin, (B) Bobbin → Cop

  // Extract all cans and all bobbins
  const allBobbins = []
  const canBobbinMap = []  // [{ can, bobbins }]
  hierarchy.forEach(can => {
    const bobs = can.bobbins || []
    canBobbinMap.push({ can, bobbins: bobs })
    bobs.forEach(b => allBobbins.push(b))
  })

  // Matrix A: for each can, show its bobbins mean_hank
  // Matrix B: for each bobbin that has cops, show cop mean_hanks

  const thStyle = { padding: '4px 8px', fontSize: 10, fontWeight: 700, color: 'var(--tx-4)', textAlign: 'center', background: 'var(--bg-2)', border: '1px solid var(--bd)', whiteSpace: 'nowrap' }
  const tdStyle = { padding: '4px 8px', fontSize: 11, textAlign: 'center', fontFamily: 'var(--mono)', border: '1px solid var(--bd)', whiteSpace: 'nowrap' }

  const hankColor = (val, mean) => {
    if (val == null || mean == null) return 'var(--tx-4)'
    const pct = Math.abs((val - mean) / mean) * 100
    if (pct > 3) return 'var(--bad)'
    if (pct > 1.5) return 'var(--warn)'
    return 'var(--tx)'
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>

      {/* Matrix A: Can → Bobbin */}
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--tx-2)', marginBottom: 10 }}>
          Matrix A — Can → Bobbin (mean hank per bobbin, grouped by source can)
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, textAlign: 'left' }}>Can</th>
                <th style={{ ...thStyle, textAlign: 'left' }}>Slot</th>
                <th style={{ ...thStyle, textAlign: 'left' }}>Can Mean Hk</th>
                {/* Dynamic bobbin columns — up to first 10 unique across all cans */}
                {Array.from({ length: Math.max(...canBobbinMap.map(c => c.bobbins.length), 1) }, (_, i) => (
                  <th key={i} style={thStyle}>Bobbin {i + 1}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {canBobbinMap.map(({ can, bobbins }, ri) => {
                const canMean = can.mean_hank
                const maxCols = Math.max(...canBobbinMap.map(c => c.bobbins.length), 1)
                return (
                  <tr key={ri} style={{ background: ri % 2 === 0 ? 'var(--bg)' : 'var(--bg-2)' }}>
                    <td style={{ ...tdStyle, textAlign: 'left', fontWeight: 600 }}>{can.label}</td>
                    <td style={{ ...tdStyle }}>{can.slot ?? '—'}</td>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>{canMean != null ? canMean.toFixed(4) : '—'}</td>
                    {Array.from({ length: maxCols }, (_, ci) => {
                      const b = bobbins[ci]
                      if (!b) return <td key={ci} style={{ ...tdStyle, color: 'var(--tx-4)' }}>—</td>
                      const mc = b.machine_number != null ? ` Sx${b.machine_number}` : ''
                      const sp = b.spindle_number != null ? `/Sp${b.spindle_number}` : ''
                      return (
                        <td key={ci} style={{ ...tdStyle, color: hankColor(b.mean_hank, canMean) }}>
                          <div style={{ fontWeight: 600 }}>{b.mean_hank != null ? b.mean_hank.toFixed(4) : '—'}</div>
                          <div style={{ fontSize: 9, color: 'var(--tx-4)' }}>{b.label}{mc}{sp}</div>
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Matrix B: Bobbin → Cop */}
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--tx-2)', marginBottom: 10 }}>
          Matrix B — Bobbin → Cop (mean hank per cop, grouped by source bobbin)
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, textAlign: 'left' }}>Bobbin</th>
                <th style={{ ...thStyle, textAlign: 'left' }}>Machine</th>
                <th style={{ ...thStyle, textAlign: 'left' }}>Spindle</th>
                <th style={{ ...thStyle, textAlign: 'left' }}>Bob Mean Hk</th>
                {Array.from({ length: Math.max(...allBobbins.map(b => (b.cops || []).length), 1) }, (_, i) => (
                  <th key={i} style={thStyle}>Cop {i + 1}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allBobbins.filter(b => (b.cops || []).length > 0).map((bob, ri) => {
                const bobMean = bob.mean_hank
                const maxCops = Math.max(...allBobbins.map(b => (b.cops || []).length), 1)
                return (
                  <tr key={ri} style={{ background: ri % 2 === 0 ? 'var(--bg)' : 'var(--bg-2)' }}>
                    <td style={{ ...tdStyle, textAlign: 'left', fontWeight: 600 }}>{bob.label}</td>
                    <td style={{ ...tdStyle }}>{bob.machine_number != null ? `Sx ${bob.machine_number}` : '—'}</td>
                    <td style={{ ...tdStyle }}>{bob.spindle_number != null ? `Sp ${bob.spindle_number}` : '—'}</td>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>{bobMean != null ? bobMean.toFixed(4) : '—'}</td>
                    {Array.from({ length: maxCops }, (_, ci) => {
                      const cop = (bob.cops || [])[ci]
                      if (!cop) return <td key={ci} style={{ ...tdStyle, color: 'var(--tx-4)' }}>—</td>
                      const fr = cop.frame_number != null ? ` Fr${cop.frame_number}` : ''
                      const sp = cop.spindle_number != null ? `/Sp${cop.spindle_number}` : ''
                      return (
                        <td key={ci} style={{ ...tdStyle, color: hankColor(cop.mean_hank, bobMean) }}>
                          <div style={{ fontWeight: 600 }}>{cop.mean_hank != null ? cop.mean_hank.toFixed(4) : '—'}</div>
                          <div style={{ fontSize: 9, color: 'var(--tx-4)' }}>{cop.label}{fr}{sp}</div>
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
              {allBobbins.filter(b => (b.cops || []).length > 0).length === 0 && (
                <tr><td colSpan={100} style={{ ...tdStyle, color: 'var(--tx-4)', padding: 16 }}>No cops linked to bobbins yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  )
}

/* ── Variation View ──────────────────────────────────────────────────────────── */
function VariationView({ variation }) {
  if (!variation) {
    return <div style={{ padding: 24, textAlign: 'center', color: 'var(--tx-3)', fontSize: 12 }}>No variation data available.</div>
  }
  const { level1, level2, level3, level4 } = variation

  const cvColor = cv => {
    if (cv == null) return 'var(--tx-4)'
    if (cv > 3) return 'var(--bad)'
    if (cv > 1.5) return 'var(--warn)'
    return 'var(--ok)'
  }

  const sectionStyle = { display: 'flex', flexDirection: 'column', gap: 12 }
  const hdrStyle = { fontSize: 12, fontWeight: 700, color: 'var(--tx-2)', paddingBottom: 6, borderBottom: '1px solid var(--bd)' }
  const subStyle = { fontSize: 10, color: 'var(--tx-4)', fontWeight: 400 }
  const thStyle = { padding: '5px 10px', fontSize: 10, fontWeight: 700, color: 'var(--tx-4)', textAlign: 'left', background: 'var(--bg-2)', borderBottom: '1px solid var(--bd)' }
  const tdStyle = { padding: '4px 10px', fontSize: 11, fontFamily: 'var(--mono)', borderBottom: '1px solid var(--bd)' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>

      {/* Level 1: Between Cans */}
      <div style={sectionStyle}>
        <div style={hdrStyle}>Level 1 — Between-Can Variation <span style={subStyle}>(material source differences)</span></div>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 8 }}>
          {[
            ['Cans measured', level1.n ?? '—'],
            ['Grand mean', level1.mean != null ? level1.mean.toFixed(4) : '—'],
            ['Range', level1.range != null ? level1.range.toFixed(4) : '—'],
            ['CV%', level1.cv != null ? level1.cv.toFixed(2) + '%' : '—'],
          ].map(([label, val]) => (
            <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 100 }}>
              <span style={{ fontSize: 10, color: 'var(--tx-4)', fontWeight: 600 }}>{label}</span>
              <span style={{ fontSize: 14, fontWeight: 700, fontFamily: 'var(--mono)', color: label === 'CV%' ? cvColor(level1.cv) : 'var(--tx)' }}>{val}</span>
            </div>
          ))}
        </div>
        {(level1.cans || []).length > 0 && (
          <table style={{ borderCollapse: 'collapse', fontSize: 11 }}>
            <thead><tr>
              <th style={thStyle}>Can</th><th style={{ ...thStyle, textAlign: 'right' }}>Slot</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Mean Hank</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>CV%</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Bobbins</th>
            </tr></thead>
            <tbody>
              {level1.cans.map((c, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? 'var(--bg)' : 'var(--bg-2)' }}>
                  <td style={tdStyle}>{c.label}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{c.slot ?? '—'}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{c.mean != null ? c.mean.toFixed(4) : '—'}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', color: cvColor(c.cv_pct) }}>{c.cv_pct != null ? c.cv_pct.toFixed(2) + '%' : '—'}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{c.n_bobbins}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Level 2: Between Bobbins within Can */}
      <div style={sectionStyle}>
        <div style={hdrStyle}>Level 2 — Between-Bobbin Variation within Can <span style={subStyle}>(simplex machine / spindle effect)</span></div>
        {(level2 || []).length === 0
          ? <div style={{ fontSize: 12, color: 'var(--tx-4)' }}>No within-can bobbin data.</div>
          : level2.map((canGroup, i) => (
            <div key={i} style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--tx-3)', marginBottom: 4 }}>
                {canGroup.can_label} {canGroup.can_slot != null ? `(slot ${canGroup.can_slot})` : ''}
                <span style={{ marginLeft: 10, fontFamily: 'var(--mono)', color: cvColor(canGroup.cv) }}>CV% {canGroup.cv != null ? canGroup.cv.toFixed(2) + '%' : '—'}</span>
                <span style={{ marginLeft: 8, fontFamily: 'var(--mono)', color: 'var(--tx-4)' }}>Range {canGroup.range != null ? canGroup.range.toFixed(4) : '—'}</span>
              </div>
              <table style={{ borderCollapse: 'collapse', fontSize: 11 }}>
                <thead><tr>
                  <th style={thStyle}>Bobbin</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Machine</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Spindle</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Mean Hank</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>CV%</th>
                </tr></thead>
                <tbody>
                  {canGroup.bobbins.map((b, j) => (
                    <tr key={j} style={{ background: j % 2 === 0 ? 'var(--bg)' : 'var(--bg-2)' }}>
                      <td style={tdStyle}>{b.label}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{b.machine_number != null ? `Sx ${b.machine_number}` : '—'}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{b.spindle_number != null ? `Sp ${b.spindle_number}` : '—'}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{b.mean != null ? b.mean.toFixed(4) : '—'}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', color: cvColor(b.cv_pct) }}>{b.cv_pct != null ? b.cv_pct.toFixed(2) + '%' : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))
        }
      </div>

      {/* Level 3: Between Cops within Bobbin */}
      <div style={sectionStyle}>
        <div style={hdrStyle}>Level 3 — Between-Cop Variation within Bobbin <span style={subStyle}>(ring frame effect on same roving source)</span></div>
        {(level3 || []).length === 0
          ? <div style={{ fontSize: 12, color: 'var(--tx-4)' }}>No within-bobbin cop data.</div>
          : level3.map((bobGroup, i) => (
            <div key={i} style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--tx-3)', marginBottom: 4 }}>
                {bobGroup.bobbin_label}
                {bobGroup.machine_number != null && <span style={{ color: 'var(--tx-4)', marginLeft: 6 }}>Sx {bobGroup.machine_number}</span>}
                {bobGroup.spindle_number != null && <span style={{ color: 'var(--tx-4)', marginLeft: 4 }}>Sp {bobGroup.spindle_number}</span>}
                <span style={{ marginLeft: 10, fontFamily: 'var(--mono)', color: cvColor(bobGroup.cv) }}>CV% {bobGroup.cv != null ? bobGroup.cv.toFixed(2) + '%' : '—'}</span>
                <span style={{ marginLeft: 8, fontFamily: 'var(--mono)', color: 'var(--tx-4)' }}>Range {bobGroup.range != null ? bobGroup.range.toFixed(4) : '—'}</span>
              </div>
              <table style={{ borderCollapse: 'collapse', fontSize: 11 }}>
                <thead><tr>
                  <th style={thStyle}>Cop</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Frame</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Spindle</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Mean Hank</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>CV%</th>
                </tr></thead>
                <tbody>
                  {bobGroup.cops.map((c, j) => (
                    <tr key={j} style={{ background: j % 2 === 0 ? 'var(--bg)' : 'var(--bg-2)' }}>
                      <td style={tdStyle}>{c.label}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{c.frame_number != null ? `Fr ${c.frame_number}` : '—'}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{c.spindle_number != null ? `Sp ${c.spindle_number}` : '—'}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{c.mean != null ? c.mean.toFixed(4) : '—'}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', color: cvColor(c.cv_pct) }}>{c.cv_pct != null ? c.cv_pct.toFixed(2) + '%' : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))
        }
      </div>

      {/* Level 4: Within-Cop Variation */}
      <div style={sectionStyle}>
        <div style={hdrStyle}>Level 4 — Within-Cop Variation <span style={subStyle}>(yarn-level irregularity per cop, worst first)</span></div>
        {(level4 || []).length === 0
          ? <div style={{ fontSize: 12, color: 'var(--tx-4)' }}>No within-cop variation data.</div>
          : (
            <table style={{ borderCollapse: 'collapse', fontSize: 11 }}>
              <thead><tr>
                <th style={thStyle}>Cop</th><th style={thStyle}>Bobbin</th><th style={thStyle}>Can</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Frame</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Spindle</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Mean Hk</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>CV%</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Readings</th>
              </tr></thead>
              <tbody>
                {level4.map((c, i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? 'var(--bg)' : 'var(--bg-2)' }}>
                    <td style={tdStyle}>{c.cop_label}</td>
                    <td style={tdStyle}>{c.bobbin_label}</td>
                    <td style={tdStyle}>{c.can_label}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{c.frame_number != null ? `Fr ${c.frame_number}` : '—'}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{c.spindle_number != null ? `Sp ${c.spindle_number}` : '—'}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{c.mean_hank != null ? c.mean_hank.toFixed(4) : '—'}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600, color: cvColor(c.cv_pct) }}>{c.cv_pct.toFixed(2)}%</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{c.n_readings}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        }
      </div>

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
  const [activeTab,     setActiveTab]     = useState('hierarchy')  // 'hierarchy'|'matrices'|'variation'|'machine'|'statistical'

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

  // Apply machine filter to Statistical tab tables
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

  // Machine View: group cops by frame number
  const byFrameForMachineView = useMemo(() => {
    if (!report.hierarchy) return {}
    const map = {}
    report.hierarchy.forEach(can => {
      (can.bobbins || []).forEach(bob => {
        (bob.cops || []).forEach(cop => {
          const fr = cop.frame_number ?? 'Unassigned'
          if (!map[fr]) map[fr] = []
          map[fr].push({ cop, bobbin: bob, can })
        })
      })
    })
    return map
  }, [report.hierarchy])

  const tabs = [
    { id: 'hierarchy',   label: 'Hierarchy' },
    { id: 'matrices',    label: 'Matrices' },
    { id: 'variation',   label: 'Variation' },
    { id: 'machine',     label: 'Machine View' },
    { id: 'statistical', label: 'Statistical' },
  ]

  const tabBtnStyle = (active) => ({
    padding: '6px 16px', fontSize: 11, fontWeight: 600,
    border: `1px solid ${active ? 'var(--claude)' : 'var(--bd)'}`,
    borderBottom: active ? '1px solid var(--bg)' : '1px solid var(--bd)',
    borderRadius: 'var(--r) var(--r) 0 0',
    background: active ? 'var(--bg)' : 'var(--bg-2)',
    color: active ? 'var(--claude)' : 'var(--tx-3)',
    cursor: 'pointer', fontFamily: 'var(--font)',
    marginBottom: -1, position: 'relative', zIndex: active ? 1 : 0,
    transition: 'all .1s',
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

      {/* Report meta bar */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, paddingBottom: 12, borderBottom: '1px solid var(--bd)', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--tx)' }}>Bobbin–Frame Interaction Report</div>
          <div style={{ fontSize: 11, color: 'var(--tx-3)', marginTop: 3, fontFamily: 'var(--mono)' }}>
            RF target {_fmt(H_target, dp)} &nbsp;·&nbsp;
            Simplex target {_fmt(H_b_target, 4)} &nbsp;·&nbsp;
            Nominal RF draft {nominalDraft.toFixed(3)}× &nbsp;·&nbsp;
            {report.interactions.length} interaction{report.interactions.length !== 1 ? 's' : ''} logged
          </div>
        </div>
        <button onClick={() => setReport(null)} style={{ padding: '5px 12px', fontSize: 11, fontWeight: 500, border: '1px solid var(--bd)', borderRadius: 'var(--r)', background: 'var(--bg)', color: 'var(--tx-3)', cursor: 'pointer', fontFamily: 'var(--font)' }}>
          ↻ Regenerate
        </button>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--bd)', marginBottom: 24 }}>
        {tabs.map(t => (
          <button key={t.id} style={tabBtnStyle(activeTab === t.id)} onClick={() => setActiveTab(t.id)}>{t.label}</button>
        ))}
      </div>

      {/* ── Tab: Hierarchy ── */}
      {activeTab === 'hierarchy' && (
        <IrSection title="Can → Bobbin → Cop Hierarchy" subtitle="Expand/collapse each level. Tracks full lineage from RSB can through simplex bobbin to ring frame cop.">
          <HierarchyView hierarchy={report.hierarchy} />
        </IrSection>
      )}

      {/* ── Tab: Matrices ── */}
      {activeTab === 'matrices' && (
        <IrSection title="Interaction Matrices" subtitle="Matrix A: one row per can, one column per bobbin. Matrix B: one row per bobbin, one column per cop. Colour indicates deviation from the node's own mean.">
          <MatrixView hierarchy={report.hierarchy} />
        </IrSection>
      )}

      {/* ── Tab: Variation ── */}
      {activeTab === 'variation' && (
        <IrSection title="4-Level Variation Analysis" subtitle="Decomposes variance across the Can→Bobbin→Cop→Reading hierarchy. Levels with high CV% or large range indicate where defects are introduced.">
          <VariationView variation={report.variation} />
        </IrSection>
      )}

      {/* ── Tab: Machine View ── */}
      {activeTab === 'machine' && (
        <IrSection title="Machine View — Grouped by Ring Frame" subtitle="All cops produced by each frame, with full lineage. Reveals frame-level consistency; compare side-by-side for frame-to-frame differences.">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {Object.keys(byFrameForMachineView).sort((a, b) => {
              if (a === 'Unassigned') return 1
              if (b === 'Unassigned') return -1
              return Number(a) - Number(b)
            }).map(fr => {
              const entries = byFrameForMachineView[fr]
              const hanks = entries.map(e => e.cop.mean_hank).filter(h => h != null)
              const mean = hanks.length ? hanks.reduce((a, b) => a + b, 0) / hanks.length : null
              return (
                <div key={fr}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--tx-2)', marginBottom: 6, display: 'flex', gap: 12, alignItems: 'baseline' }}>
                    {fr === 'Unassigned' ? 'Unassigned Frame' : `Frame ${fr}`}
                    <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--tx-4)', fontWeight: 400 }}>
                      {entries.length} cop{entries.length !== 1 ? 's' : ''}
                      {mean != null ? ` · mean ${mean.toFixed(4)}` : ''}
                    </span>
                  </div>
                  <table style={{ borderCollapse: 'collapse', fontSize: 11, width: '100%' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid var(--bd-md)' }}>
                        {[['Cop', 'left'], ['Mean Hank', 'right'], ['CV%', 'right'], ['Source Bobbin', 'left'], ['Sx M/c', 'right'], ['Sx Spindle', 'right'], ['Source Can', 'left']].map(([h, align]) => (
                          <th key={h} style={{ padding: '4px 8px', fontSize: 10, fontWeight: 700, color: 'var(--tx-4)', textAlign: align, background: 'var(--bg-2)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map(({ cop, bobbin, can }, i) => {
                        const dev = mean != null && cop.mean_hank != null ? Math.abs((cop.mean_hank - mean) / mean) * 100 : null
                        const col = dev == null ? 'var(--tx)' : dev > 3 ? 'var(--bad)' : dev > 1.5 ? 'var(--warn)' : 'var(--tx)'
                        return (
                          <tr key={i} style={{ borderTop: '1px solid var(--bd)', background: i % 2 === 0 ? 'var(--bg)' : 'var(--bg-2)' }}>
                            <td style={{ padding: '4px 8px', fontSize: 11 }}>{cop.label}</td>
                            <td style={{ padding: '4px 8px', fontSize: 11, fontFamily: 'var(--mono)', textAlign: 'right', color: col, fontWeight: 600 }}>{cop.mean_hank != null ? cop.mean_hank.toFixed(4) : '—'}</td>
                            <td style={{ padding: '4px 8px', fontSize: 11, fontFamily: 'var(--mono)', textAlign: 'right', color: cop.cv_pct > 3 ? 'var(--bad)' : cop.cv_pct > 1.5 ? 'var(--warn)' : 'var(--tx)' }}>{cop.cv_pct != null ? cop.cv_pct.toFixed(2) + '%' : '—'}</td>
                            <td style={{ padding: '4px 8px', fontSize: 11 }}>{bobbin.label}</td>
                            <td style={{ padding: '4px 8px', fontSize: 11, fontFamily: 'var(--mono)', textAlign: 'right' }}>{bobbin.machine_number != null ? `Sx ${bobbin.machine_number}` : '—'}</td>
                            <td style={{ padding: '4px 8px', fontSize: 11, fontFamily: 'var(--mono)', textAlign: 'right' }}>{bobbin.spindle_number != null ? `Sp ${bobbin.spindle_number}` : '—'}</td>
                            <td style={{ padding: '4px 8px', fontSize: 11 }}>{can.label}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )
            })}
            {Object.keys(byFrameForMachineView).length === 0 && (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--tx-3)', fontSize: 12 }}>No cop–frame assignments found. Add ring frame cops and link them to bobbins via the Flow Board.</div>
            )}
          </div>
        </IrSection>
      )}

      {/* ── Tab: Statistical ── */}
      {activeTab === 'statistical' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>

          {/* Machine filter */}
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

            <IrSection title="Diagnostic Heatmap" subtitle="Cop hank at each bobbin–frame intersection. Text colour indicates deviation from target.">
              <DiagnosticHeatmap report={{ ...report, bobbins: filteredBobbins, interactions: filteredInteractions }} />
            </IrSection>

            <IrSection
              title="Lineage Trace — Can → Bobbin → Cop"
              subtitle="Select a ring frame to trace Can → Bobbin → Cop for that frame. Select multiple frames to compare side-by-side — cop columns branch right. Color on cop values only; containers are neutral."
            >
              <LineageTraceTable report={report} machineFilter={machineFilter} />
            </IrSection>

            <IrSection title="Table 1 — Frame-wise Interaction" subtitle="How each frame performs across all bobbins it received. Consistent count deviation within a frame indicates a frame calibration issue.">
              {frames.map(f => filteredByFrame[f]?.length ? (
                <FrameInteractionTable key={f} frame={f} rows={filteredByFrame[f]} dp={dp} rfTol={rfTol} H_target={H_target} />
              ) : null)}
            </IrSection>

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

            <IrSection title="Table 3 — Frame Summary" subtitle="Aggregated metrics per frame across all bobbins it processed.">
              <FrameSummaryTable frameSummary={filteredFrameSummary} dp={dp} rfTol={rfTol} H_target={H_target} />
            </IrSection>

            <IrSection title="Table 4 — Bobbin Summary" subtitle="Aggregated output metrics per bobbin across all frames it fed.">
              <BobbinSummaryTable bobbinSummary={bobbinSummary.filter(r => visibleBobbinIds.has(r.bobbinId))} dp={dp} />
            </IrSection>

          </>)}
        </div>
      )}

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
