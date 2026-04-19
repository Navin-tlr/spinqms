import { useState, useEffect, useCallback } from 'react'
import { Card, LabelCaps, Badge, TblWrap, FmlBox, Empty } from '../Primitives.jsx'
import { getOverview } from '../../api.js'

/* ── Shift definitions (stored in localStorage) ─────────────────────────── */
const SHIFT_DEFAULTS = {
  A: { label: 'Shift 1', start: '06:00', end: '14:00' },
  B: { label: 'Shift 2', start: '14:00', end: '22:00' },
  C: { label: 'Shift 3', start: '22:00', end: '06:00' },
}

function loadShiftDefs() {
  try {
    const s = localStorage.getItem('spinqms_shift_defs')
    return s ? { ...SHIFT_DEFAULTS, ...JSON.parse(s) } : { ...SHIFT_DEFAULTS }
  } catch { return { ...SHIFT_DEFAULTS } }
}
function saveShiftDefs(defs) {
  try { localStorage.setItem('spinqms_shift_defs', JSON.stringify(defs)) } catch {}
}

/* ── Compute date_from / date_to for a named shift on today ──────────────── */
function shiftWindow(shiftKey, defs) {
  const def = defs[shiftKey]
  if (!def) return { date_from: null, date_to: null }

  const now = new Date()
  const [sh, sm] = def.start.split(':').map(Number)
  const [eh, em] = def.end.split(':').map(Number)

  const from = new Date(now)
  from.setHours(sh, sm, 0, 0)

  const to = new Date(now)
  to.setHours(eh, em, 59, 999)

  // Night shift: end time < start time → "to" is next day
  if (eh * 60 + em < sh * 60 + sm) to.setDate(to.getDate() + 1)

  // If current time is before shift start, look at yesterday's slot
  if (now < from) {
    from.setDate(from.getDate() - 1)
    to.setDate(to.getDate() - 1)
  }

  return { date_from: from.toISOString(), date_to: to.toISOString() }
}

/* ── Time ranges ─────────────────────────────────────────────────────────── */
const TIME_RANGES = [
  { id: 'shift_window', label: 'Current Shift' },
  { id: '24h',          label: 'Past 24 h'     },
  { id: 'week',         label: 'Past Week'      },
  { id: 'custom',       label: 'Custom'         },
  { id: 'all',          label: 'All Time'       },
]

function buildTimeParams(rangeId, shiftKey, shiftDefs, customFrom, customTo) {
  if (rangeId === 'all') return {}
  if (rangeId === '24h') {
    return { date_from: new Date(Date.now() - 24 * 3600 * 1000).toISOString() }
  }
  if (rangeId === 'week') {
    return { date_from: new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString() }
  }
  if (rangeId === 'shift_window' && shiftKey !== 'ALL') {
    return shiftWindow(shiftKey, shiftDefs)
  }
  if (rangeId === 'custom') {
    const params = {}
    if (customFrom) params.date_from = new Date(customFrom).toISOString()
    if (customTo)   params.date_to   = new Date(customTo + 'T23:59:59').toISOString()
    return params
  }
  return {}
}

/* ── Pill button ─────────────────────────────────────────────────────────── */
function Pill({ active, onClick, children, danger }) {
  return (
    <button onClick={onClick} style={{
      padding: '5px 14px', fontSize: 12, border: '1.5px solid', borderRadius: 20,
      cursor: 'pointer', fontFamily: 'var(--font)', transition: 'all .12s', lineHeight: 1,
      fontWeight: active ? 600 : 400,
      background:  active ? (danger ? 'var(--bad)' : 'var(--claude)') : 'transparent',
      color:       active ? '#fff' : 'var(--tx-2)',
      borderColor: active ? (danger ? 'var(--bad)' : 'var(--claude)') : 'var(--bd-md)',
    }}>{children}</button>
  )
}

/* ── Inline time input ───────────────────────────────────────────────────── */
const timeInput = {
  padding: '5px 8px', fontSize: 12, border: '1px solid var(--bd-md)',
  borderRadius: 'var(--r)', background: 'var(--bg)', color: 'var(--tx)',
  fontFamily: 'var(--mono)',
}

export default function ShiftReport() {
  const [shift,       setShift]       = useState('A')
  const [timeRange,   setTimeRange]   = useState('shift_window')
  const [customFrom,  setCustomFrom]  = useState('')
  const [customTo,    setCustomTo]    = useState('')
  const [data,        setData]        = useState([])
  const [loading,     setLoading]     = useState(false)
  const [shiftDefs,   setShiftDefs]   = useState(loadShiftDefs)
  const [editingDefs, setEditingDefs] = useState(false)
  const [draftDefs,   setDraftDefs]   = useState(loadShiftDefs)

  const fetchData = useCallback(() => {
    const timeParams = buildTimeParams(timeRange, shift, shiftDefs, customFrom, customTo)
    const params = {
      ...(shift !== 'ALL' ? { shift } : {}),
      ...timeParams,
    }
    setLoading(true)
    getOverview(params)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [shift, timeRange, shiftDefs, customFrom, customTo])

  useEffect(() => {
    // Don't auto-fetch if custom range has no dates yet
    if (timeRange === 'custom' && !customFrom && !customTo) return
    fetchData()
  }, [fetchData, timeRange, customFrom, customTo])

  const saveDefs = () => {
    setShiftDefs(draftDefs)
    saveShiftDefs(draftDefs)
    setEditingDefs(false)
  }

  const rangeLabel = TIME_RANGES.find(r => r.id === timeRange)?.label ?? ''

  return (
    <>
      {/* ── Shift + time selector ── */}
      <Card sm>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Row 1 — shift picker */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--tx-3)', flexShrink: 0 }}>Shift</span>
            {['A', 'B', 'C', 'ALL'].map(s => (
              <Pill key={s} active={shift === s} onClick={() => setShift(s)}>
                {s === 'ALL' ? 'All Shifts' : (shiftDefs[s]?.label ?? `Shift ${s}`)}
              </Pill>
            ))}
            <button
              onClick={() => { setDraftDefs({ ...shiftDefs }); setEditingDefs(v => !v) }}
              style={{ fontSize: 11, color: 'var(--tx-3)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
            >{editingDefs ? 'Cancel' : '⚙ Edit times'}</button>
          </div>

          {/* Shift time editor */}
          {editingDefs && (
            <div style={{ padding: '10px 14px', background: 'var(--bg-2)', border: '1px solid var(--bd)', borderRadius: 'var(--r)', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--tx-3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Shift time windows</div>
              {['A', 'B', 'C'].map(k => (
                <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <input
                    value={draftDefs[k]?.label ?? ''}
                    onChange={e => setDraftDefs(d => ({ ...d, [k]: { ...d[k], label: e.target.value } }))}
                    style={{ ...timeInput, width: 80 }}
                    placeholder={`Shift ${k}`}
                  />
                  <input type="time" value={draftDefs[k]?.start ?? '06:00'}
                    onChange={e => setDraftDefs(d => ({ ...d, [k]: { ...d[k], start: e.target.value } }))}
                    style={timeInput}
                  />
                  <span style={{ fontSize: 12, color: 'var(--tx-3)' }}>→</span>
                  <input type="time" value={draftDefs[k]?.end ?? '14:00'}
                    onChange={e => setDraftDefs(d => ({ ...d, [k]: { ...d[k], end: e.target.value } }))}
                    style={timeInput}
                  />
                </div>
              ))}
              <button onClick={saveDefs} style={{
                alignSelf: 'flex-start', padding: '5px 14px', fontSize: 12, borderRadius: 20,
                border: '1.5px solid var(--claude)', background: 'var(--claude)', color: '#fff',
                cursor: 'pointer', fontFamily: 'var(--font)',
              }}>Save times</button>
            </div>
          )}

          {/* Row 2 — time range picker */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--tx-3)', flexShrink: 0 }}>Time range</span>
            {TIME_RANGES.map(r => (
              <Pill key={r.id} active={timeRange === r.id} onClick={() => setTimeRange(r.id)}>
                {r.id === 'shift_window' && shift !== 'ALL'
                  ? `${shiftDefs[shift]?.label ?? 'Current Shift'} (${shiftDefs[shift]?.start}–${shiftDefs[shift]?.end})`
                  : r.label
                }
              </Pill>
            ))}
            {loading && <span style={{ fontSize: 11, color: 'var(--tx-4)', fontStyle: 'italic' }}>Loading…</span>}
          </div>

          {/* Custom date pickers */}
          {timeRange === 'custom' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', paddingLeft: 2 }}>
              <span style={{ fontSize: 12, color: 'var(--tx-3)' }}>From</span>
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} style={timeInput} />
              <span style={{ fontSize: 12, color: 'var(--tx-3)' }}>To</span>
              <input type="date" value={customTo}   onChange={e => setCustomTo(e.target.value)}   style={timeInput} />
            </div>
          )}
        </div>
      </Card>

      {/* ── Data table ── */}
      <Card sm>
        <LabelCaps>
          Shift quality report —{' '}
          {shift === 'ALL' ? 'All Shifts' : (shiftDefs[shift]?.label ?? `Shift ${shift}`)}
          {' · '}{rangeLabel}
        </LabelCaps>

        {data.length === 0 && !loading ? (
          <Empty>No data for the selected shift and time range.</Empty>
        ) : (
          <TblWrap>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  {['Department', 'n', 'Avg weight', 'Mean (x̄)', 'σ', 'CV%', 'Cpk', 'Cp', 'UCL (3σ)', 'LCL (3σ)', 'Status'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--tx-3)', letterSpacing: '.05em', textTransform: 'uppercase', borderBottom: '1px solid var(--bd-md)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map((d, i) => {
                  if (d.n === 0) return (
                    <tr key={d.dept_id} style={{ background: i % 2 === 0 ? 'var(--bg)' : 'var(--bg-2)' }}>
                      <td style={{ padding: '9px 12px', borderBottom: '1px solid var(--bd)' }}>{d.name}</td>
                      <td colSpan={10} style={{ padding: '9px 12px', color: 'var(--tx-3)', fontSize: 12, borderBottom: '1px solid var(--bd)', fontStyle: 'italic' }}>No data</td>
                    </tr>
                  )
                  const p    = d.target >= 10 ? 2 : 4
                  const qCol = d.quality === 'ok' ? 'var(--ok)' : d.quality === 'warn' ? 'var(--warn)' : 'var(--bad)'
                  const L    = d.target >= 10 ? 120 : 6
                  const avgW = d.mean ? ((L * 0.54) / d.mean).toFixed(2) : '—'
                  return (
                    <tr key={d.dept_id} style={{ background: i % 2 === 0 ? 'var(--bg)' : 'var(--bg-2)', transition: 'background .1s' }}>
                      <td style={{ padding: '9px 12px', borderBottom: '1px solid var(--bd)', fontWeight: 500 }}>{d.name}</td>
                      <td style={{ padding: '9px 12px', fontFamily: 'var(--mono)', fontSize: 12, borderBottom: '1px solid var(--bd)', color: 'var(--tx-3)' }}>{d.n}</td>
                      <td style={{ padding: '9px 12px', fontFamily: 'var(--mono)', fontSize: 12, borderBottom: '1px solid var(--bd)', color: 'var(--tx-3)' }}>{avgW} g</td>
                      <td style={{ padding: '9px 12px', fontFamily: 'var(--mono)', fontSize: 12, borderBottom: '1px solid var(--bd)' }}>{d.mean?.toFixed(p + 2)}</td>
                      <td style={{ padding: '9px 12px', fontFamily: 'var(--mono)', fontSize: 12, borderBottom: '1px solid var(--bd)', color: 'var(--tx-3)' }}>{d.sd?.toFixed(p + 3)}</td>
                      <td style={{ padding: '9px 12px', fontWeight: 600, borderBottom: '1px solid var(--bd)', color: qCol }}>{d.cv?.toFixed(3)}%</td>
                      <td style={{ padding: '9px 12px', fontFamily: 'var(--mono)', fontSize: 12, borderBottom: '1px solid var(--bd)', color: qCol }}>{d.cpk?.toFixed(3) ?? '—'}</td>
                      <td style={{ padding: '9px 12px', fontFamily: 'var(--mono)', fontSize: 12, borderBottom: '1px solid var(--bd)', color: 'var(--tx-3)' }}>{d.cp?.toFixed(3) ?? '—'}</td>
                      <td style={{ padding: '9px 12px', fontFamily: 'var(--mono)', fontSize: 12, borderBottom: '1px solid var(--bd)' }}>{d.ucl?.toFixed(p + 2)}</td>
                      <td style={{ padding: '9px 12px', fontFamily: 'var(--mono)', fontSize: 12, borderBottom: '1px solid var(--bd)' }}>{d.lcl?.toFixed(p + 2)}</td>
                      <td style={{ padding: '9px 12px', borderBottom: '1px solid var(--bd)' }}>
                        <Badge variant={d.quality}>{d.quality === 'ok' ? 'In control' : d.quality === 'warn' ? 'Warning' : 'Action'}</Badge>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </TblWrap>
        )}
      </Card>

      {/* ── Formula reference ── */}
      <Card sm>
        <LabelCaps>Formula reference — ISO 11462-1 validated</LabelCaps>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }} className="max-[720px]:!grid-cols-1">
          <FmlBox>{`Ne (hank count) = (L × 0.54) / W_grams\nwhere L = sample length (yards)\n      W = weight (grams)\nDerivation: Ne = L / (840 × W_lbs)\n           = L × 453.592 / (840 × W_g)\n           = L × 0.5400 / W_g  ✓`}</FmlBox>
          <FmlBox>{`CV%  = (σ / x̄) × 100\nσ    = √[Σ(xᵢ-x̄)²/(n-1)]   [sample]\nCpk  = min[(USL-x̄)/3σ, (x̄-LSL)/3σ]\nCp   = (USL-LSL) / 6σ\nUCL  = x̄ + 3σ\nLCL  = x̄ - 3σ\nWL±  = x̄ ± 2σ`}</FmlBox>
        </div>
      </Card>
    </>
  )
}
