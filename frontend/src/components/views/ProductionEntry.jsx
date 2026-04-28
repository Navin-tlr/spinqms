/* ──────────────────────────────────────────────────────────────────────────
   ProductionEntry — SAP Fiori Data Entry Form (Image 05 reference)
   - Flat white panel, 1px border, 0px radius
   - SAP form pattern: label (grey, 12px) above input (13px)
   - Unified SAP blue (#0854a0) — no per-department colours
   - Section headers: small uppercase grey
   - Submit: SAP primary button
────────────────────────────────────────────────────────────────────────── */

import { useState, useEffect, useCallback } from 'react'
import {
  getProductionStdRates, updateProductionStdRate,
  createProductionEntry,
  calcEfficiencyKg, calcHankMeterKg, calcTheoreticalKg,
} from '../../api.js'

const SAP_BLUE   = '#0854a0'
const SAP_BORDER = '#89919a'
const SAP_BG     = '#f2f2f2'

/* ── Department configuration ─────────────────────────────────────────── */
const DEPTS = [
  { id: 'carding',   name: 'Carding',    method: 'efficiency',  machines: 3  },
  { id: 'breaker',   name: 'Breaker',    method: 'efficiency',  machines: 1  },
  { id: 'rsb',       name: 'RSB',        method: 'efficiency',  machines: 2  },
  { id: 'simplex',   name: 'Simplex',    method: 'hank_meter',  machines: 3  },
  { id: 'ringframe', name: 'Ring Frame', method: 'hank_meter',  machines: 25, ne_default: 47 },
]

/* ── SAP form atoms ────────────────────────────────────────────────────── */
function SapLabel({ children, required }) {
  return (
    <label style={{
      fontSize: 12, fontWeight: 400, color: '#6a6d70',
      display: 'block', marginBottom: 4,
    }}>
      {children}
      {required && <span style={{ color: '#bb0000', marginLeft: 2 }}>*</span>}
    </label>
  )
}

function SapInput({ value, onChange, type = 'text', placeholder, min, max, step, disabled }) {
  return (
    <input
      type={type}
      value={value ?? ''}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      min={min} max={max} step={step}
      disabled={disabled}
      style={{
        width: '100%',
        padding: '7px 10px',
        fontSize: 13,
        border: `1px solid ${disabled ? '#d9dadb' : SAP_BORDER}`,
        borderRadius: 2,
        background: disabled ? '#f2f2f2' : '#fff',
        color: disabled ? '#89919a' : '#32363a',
        fontFamily: 'var(--mono)',
        outline: 'none',
        boxSizing: 'border-box',
      }}
      onFocus={e => { if (!disabled) { e.target.style.borderColor = SAP_BLUE; e.target.style.outline = `2px solid rgba(8,84,160,.2)`; e.target.style.outlineOffset = 0 }}}
      onBlur={e => { e.target.style.borderColor = disabled ? '#d9dadb' : SAP_BORDER; e.target.style.outline = 'none' }}
    />
  )
}

function Field({ label, required, hint, children }) {
  return (
    <div>
      <SapLabel required={required}>{label}</SapLabel>
      {children}
      {hint && <div style={{ fontSize: 11, color: '#89919a', marginTop: 3 }}>{hint}</div>}
    </div>
  )
}

/* ── SAP-style section divider with title ──────────────────────────────── */
function SectionTitle({ children }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
      letterSpacing: '.09em', color: '#6a6d70',
      paddingBottom: 8, marginBottom: 14,
      borderBottom: '1px solid #d9dadb',
    }}>
      {children}
    </div>
  )
}

/* ── Live Calculation panel ─────────────────────────────────────────────── */
function FormulaPanel({ dept, fields, result, theoretical }) {
  const empty = result === null || result === undefined || isNaN(result)

  return (
    <div style={{
      background: '#fff',
      border: '1px solid #d9dadb',
      borderLeft: `3px solid ${SAP_BLUE}`,
    }}>
      <div style={{
        padding: '10px 16px',
        borderBottom: '1px solid #d9dadb',
        background: '#f5f5f5',
        fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
        letterSpacing: '.09em', color: '#6a6d70',
      }}>
        Live Calculation
      </div>

      <div style={{ padding: '16px' }}>
        {/* Formula text */}
        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: '#89919a', marginBottom: 8, lineHeight: 1.6 }}>
          {dept.method === 'efficiency' ? (
            <>output = std_rate × (eff% / 100) × hours<br />
            = {fields.stdRate ?? '?'} × ({fields.effPct ?? '?'} / 100) × {fields.hours ?? '?'}</>
          ) : (
            <>primary = (hank × spindles / Ne) × 0.453592<br />
            = ({fields.hankReading ?? '?'} × {fields.spindles ?? '?'} / {fields.ne ?? '?'}) × 0.453592</>
          )}
        </div>

        {/* Theoretical line */}
        {dept.method === 'hank_meter' && theoretical !== null && !isNaN(theoretical) && (
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: '#89919a', marginBottom: 8, lineHeight: 1.6 }}>
            theoretical = rpm / (tpi × 36) × mins × spindles / (Ne × 840) × 0.453592<br />
            = <span style={{ color: '#32363a' }}>{theoretical.toLocaleString('en-IN', { maximumFractionDigits: 1 })} kg</span>
          </div>
        )}

        {/* Result — SAP large number style */}
        <div style={{ borderTop: '1px solid #d9dadb', paddingTop: 14, marginTop: 6 }}>
          <div style={{ fontSize: 11, color: '#6a6d70', marginBottom: 4 }}>Primary Output</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{
              fontFamily: 'var(--mono)',
              fontSize: empty ? 24 : 38,
              fontWeight: 300,
              color: empty ? '#d9dadb' : SAP_BLUE,
              lineHeight: 1,
            }}>
              {empty ? '—' : result.toLocaleString('en-IN', { maximumFractionDigits: 1 })}
            </span>
            {!empty && <span style={{ fontSize: 14, color: '#6a6d70', fontWeight: 400 }}>kg</span>}
          </div>
          {!empty && (
            <div style={{ fontSize: 11, color: '#89919a', marginTop: 4 }}>
              {dept.name} · Shift output
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Std Rate editor ────────────────────────────────────────────────────── */
function StdRateEditor({ deptId, machineNumber, rates, onRateUpdated }) {
  const key    = `${deptId}:${machineNumber ?? 'null'}`
  const rate   = rates[key]
  const [editing, setEditing] = useState(false)
  const [val,     setVal]     = useState('')
  const [saving,  setSaving]  = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      await updateProductionStdRate(deptId, {
        std_rate_kg_per_hr: parseFloat(val),
        machine_number: machineNumber || null,
      })
      onRateUpdated(); setEditing(false)
    } catch (e) {
      alert(e?.response?.data?.detail || 'Failed to save')
    } finally { setSaving(false) }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      {editing ? (
        <>
          <input
            type="number" value={val} onChange={e => setVal(e.target.value)}
            style={{
              width: 80, padding: '6px 8px', fontSize: 12,
              border: `1px solid ${SAP_BLUE}`, borderRadius: 2,
              fontFamily: 'var(--mono)', outline: 'none',
            }}
            autoFocus
          />
          <span style={{ fontSize: 11, color: '#6a6d70' }}>kg/hr</span>
          <SapPrimaryBtn onClick={save} disabled={saving || !val} small>
            {saving ? 'Saving' : 'Save'}
          </SapPrimaryBtn>
          <SapGhostBtn onClick={() => setEditing(false)} small>Cancel</SapGhostBtn>
        </>
      ) : (
        <>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 14, color: '#32363a' }}>
            {rate?.std_rate_kg_per_hr ?? '—'} kg/hr
          </span>
          <SapGhostBtn onClick={() => { setVal(rate?.std_rate_kg_per_hr ?? ''); setEditing(true) }} small>
            Edit
          </SapGhostBtn>
        </>
      )}
    </div>
  )
}

/* ── SAP Button atoms ────────────────────────────────────────────────────── */
function SapPrimaryBtn({ children, onClick, disabled, small }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{
        padding: small ? '5px 12px' : '8px 20px',
        fontSize: small ? 11 : 13,
        fontWeight: 400,
        border: `1px solid ${disabled ? '#d9dadb' : SAP_BLUE}`,
        borderRadius: 2,
        background: disabled ? '#f2f2f2' : SAP_BLUE,
        color: disabled ? '#89919a' : '#fff',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: 'var(--font)',
      }}
    >{children}</button>
  )
}

function SapGhostBtn({ children, onClick, disabled, small }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{
        padding: small ? '5px 12px' : '8px 20px',
        fontSize: small ? 11 : 13,
        fontWeight: 400,
        border: `1px solid ${SAP_BORDER}`,
        borderRadius: 2,
        background: '#fff',
        color: '#32363a',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: 'var(--font)',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = '#e8f0fb'; e.currentTarget.style.borderColor = SAP_BLUE; e.currentTarget.style.color = SAP_BLUE }}
      onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = SAP_BORDER; e.currentTarget.style.color = '#32363a' }}
    >{children}</button>
  )
}

/* ══════════════════════════════════════════════════════════════════════════
   Main component
══════════════════════════════════════════════════════════════════════════ */
export default function ProductionEntry({ onSaved }) {
  const [selDeptId,  setSelDeptId]  = useState('carding')
  const [shift,      setShift]      = useState('A')
  const [entryDate,  setEntryDate]  = useState(new Date().toISOString().slice(0, 10))
  const [machineNum, setMachineNum] = useState(null)
  const [notes,      setNotes]      = useState('')
  const [saving,     setSaving]     = useState(false)
  const [saved,      setSaved]      = useState(false)
  const [error,      setError]      = useState('')

  const [effPct,  setEffPct]  = useState('')
  const [hours,   setHours]   = useState('')

  const [hankReading, setHankReading] = useState('')
  const [spindles,    setSpindles]    = useState('')
  const [ne,          setNe]          = useState('')

  const [rpm, setRpm] = useState('')
  const [tpi, setTpi] = useState('')

  const [stdRates, setStdRates] = useState({})
  const loadRates = useCallback(async () => {
    try {
      const rows = await getProductionStdRates()
      const map = {}
      rows.forEach(r => { map[`${r.dept_id}:${r.machine_number ?? 'null'}`] = r })
      setStdRates(map)
    } catch {}
  }, [])
  useEffect(() => { loadRates() }, [loadRates])

  const dept = DEPTS.find(d => d.id === selDeptId)

  const getStdRate = () => {
    const mk = `${selDeptId}:${machineNum ?? 'null'}`
    const dk = `${selDeptId}:null`
    return stdRates[mk]?.std_rate_kg_per_hr ?? stdRates[dk]?.std_rate_kg_per_hr ?? null
  }

  let liveResult      = null
  let liveTheoretical = null
  if (dept.method === 'efficiency') {
    const rate = getStdRate()
    if (rate && effPct && hours) liveResult = calcEfficiencyKg(parseFloat(rate), parseFloat(effPct), parseFloat(hours))
  } else {
    if (hankReading && spindles && ne) liveResult = calcHankMeterKg(parseFloat(hankReading), parseInt(spindles), parseFloat(ne))
    if (rpm && tpi && spindles && ne) liveTheoretical = calcTheoreticalKg(parseFloat(rpm), parseFloat(tpi), parseInt(spindles), parseFloat(ne))
  }

  const switchDept = (id) => {
    setSelDeptId(id); setMachineNum(null)
    setEffPct(''); setHours('')
    setHankReading(''); setSpindles('')
    setNe(DEPTS.find(d => d.id === id)?.ne_default ?? '')
    setRpm(''); setTpi('')
    setSaved(false); setError('')
  }

  const handleSubmit = async () => {
    setSaving(true); setError(''); setSaved(false)
    try {
      const body = {
        dept_id: selDeptId, shift, entry_date: entryDate,
        machine_number: machineNum || null,
        calc_method: dept.method, notes: notes || null,
      }
      if (dept.method === 'efficiency') {
        body.efficiency_pct = parseFloat(effPct)
        body.running_hours  = parseFloat(hours)
        body.std_rate_kg_per_hr = getStdRate()
      } else {
        body.hank_reading  = parseFloat(hankReading)
        body.spindle_count = parseInt(spindles)
        body.ne_count      = parseFloat(ne)
        if (rpm) body.spindle_rpm = parseFloat(rpm)
        if (tpi) body.tpi         = parseFloat(tpi)
      }
      await createProductionEntry(body)
      setSaved(true)
      setEffPct(''); setHours(''); setHankReading(''); setSpindles('')
      setRpm(''); setTpi(''); setNotes('')
      if (onSaved) onSaved()
      setTimeout(() => setSaved(false), 3000)
    } catch (e) {
      setError(e?.response?.data?.detail || JSON.stringify(e?.response?.data) || 'Save failed')
    } finally { setSaving(false) }
  }

  const canSubmit = dept.method === 'efficiency'
    ? !!(effPct && hours && getStdRate())
    : !!(hankReading && spindles && ne)

  const today = new Date().toISOString().slice(0, 10)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, maxWidth: 1040 }}>

      {/* ── SAP action bar (Image 05 top bar) ───────────────────────── */}
      <div style={{
        background: '#fff',
        border: '1px solid #d9dadb',
        borderBottom: 'none',
        padding: '8px 16px',
        display: 'flex', alignItems: 'center', gap: 20,
        flexShrink: 0,
      }}>
        <button
          onClick={onSaved}
          style={{ background: 'none', border: 'none', fontSize: 12, color: SAP_BLUE, cursor: 'pointer', fontFamily: 'var(--font)', padding: 0 }}
        >
          ← Back to Dashboard
        </button>
        <div style={{ width: 1, height: 16, background: '#d9dadb' }} />
        <span style={{ fontSize: 12, color: '#6a6d70' }}>Production Entry</span>
      </div>

      {/* ── Page title strip ────────────────────────────────────────── */}
      <div style={{
        background: '#fff',
        border: '1px solid #d9dadb',
        borderBottom: 'none',
        padding: '14px 16px',
        borderTop: '1px solid #d9dadb',
      }}>
        <div style={{ fontSize: 16, fontWeight: 400, color: '#32363a' }}>
          Production Entry
        </div>
        <div style={{ fontSize: 12, color: '#6a6d70', marginTop: 2 }}>
          Record shift output per department
        </div>
      </div>

      {/* ── SAP Fiori horizontal dept tabs (like Image 05 segment bar) ── */}
      <div style={{
        background: '#fff',
        border: '1px solid #d9dadb',
        borderBottom: 'none',
        padding: '0 16px',
        display: 'flex', alignItems: 'flex-end', gap: 0,
      }}>
        {DEPTS.map(d => {
          const active = selDeptId === d.id
          return (
            <button
              key={d.id}
              onClick={() => switchDept(d.id)}
              style={{
                padding: '10px 18px 8px',
                fontSize: 13, fontWeight: active ? 600 : 400,
                border: 'none',
                borderBottom: active ? `3px solid ${SAP_BLUE}` : '3px solid transparent',
                background: 'transparent',
                color: active ? SAP_BLUE : '#6a6d70',
                cursor: 'pointer', fontFamily: 'var(--font)',
                transition: 'color .1s, border-color .1s',
              }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.color = '#32363a' }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.color = '#6a6d70' }}
            >
              {d.name}
              <div style={{ fontSize: 10, color: active ? SAP_BLUE + '99' : '#89919a', marginTop: 1 }}>
                {d.method === 'efficiency' ? 'Efficiency' : 'Hank Meter'}
              </div>
            </button>
          )
        })}
      </div>

      {/* ── Two-column form + calculation ───────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 0, alignItems: 'start' }}>

        {/* ── Left: Data Entry Form ───────────────────────────────── */}
        <div style={{
          background: '#fff',
          border: '1px solid #d9dadb',
        }}>

          {/* Form content */}
          <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 0 }}>

            {/* Section 1: General Information */}
            <SectionTitle>General Information</SectionTitle>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 20 }}>

              <Field label="Shift" required>
                <div style={{ display: 'flex', gap: 0 }}>
                  {['A', 'B', 'C'].map((s, i) => (
                    <button
                      key={s}
                      onClick={() => setShift(s)}
                      style={{
                        flex: 1, padding: '7px 0', fontSize: 13,
                        border: `1px solid ${shift === s ? SAP_BLUE : SAP_BORDER}`,
                        borderLeft: i > 0 ? 'none' : undefined,
                        background: shift === s ? SAP_BLUE : '#fff',
                        color: shift === s ? '#fff' : '#32363a',
                        cursor: 'pointer', fontFamily: 'var(--font)',
                        fontWeight: shift === s ? 600 : 400,
                      }}
                    >{s}</button>
                  ))}
                </div>
              </Field>

              <Field label="Date" required>
                <SapInput type="date" value={entryDate} onChange={setEntryDate} max={today} />
              </Field>

              <Field label="Department">
                <div style={{
                  padding: '7px 10px', fontSize: 13, color: '#32363a',
                  border: '1px solid #d9dadb', background: '#f2f2f2',
                  borderRadius: 2,
                }}>
                  {dept.name}
                </div>
              </Field>
            </div>

            {/* Machine selector */}
            {dept.machines > 1 && (
              <div style={{ marginBottom: 20 }}>
                <SapLabel>{dept.id === 'ringframe' ? 'Frame Number' : 'Machine Number'} (optional)</SapLabel>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                  <button
                    onClick={() => setMachineNum(null)}
                    style={{
                      padding: '5px 12px', fontSize: 12,
                      border: `1px solid ${machineNum === null ? SAP_BLUE : SAP_BORDER}`,
                      borderRadius: 2, cursor: 'pointer',
                      background: machineNum === null ? '#e8f0fb' : '#fff',
                      color: machineNum === null ? SAP_BLUE : '#32363a',
                      fontFamily: 'var(--font)',
                    }}
                  >All / Dept</button>
                  {Array.from({ length: Math.min(dept.machines, 12) }, (_, i) => i + 1).map(n => (
                    <button
                      key={n}
                      onClick={() => setMachineNum(n)}
                      style={{
                        padding: '5px 10px', fontSize: 12, minWidth: 36,
                        border: `1px solid ${machineNum === n ? SAP_BLUE : SAP_BORDER}`,
                        borderRadius: 2, cursor: 'pointer',
                        background: machineNum === n ? '#e8f0fb' : '#fff',
                        color: machineNum === n ? SAP_BLUE : '#32363a',
                        fontFamily: 'var(--mono)',
                      }}
                    >#{n}</button>
                  ))}
                  {dept.machines > 12 && (
                    <input
                      type="number" placeholder={`1–${dept.machines}`}
                      min={1} max={dept.machines}
                      value={machineNum ?? ''}
                      onChange={e => setMachineNum(e.target.value ? parseInt(e.target.value) : null)}
                      style={{
                        width: 80, padding: '6px 8px', fontSize: 12,
                        border: `1px solid ${SAP_BORDER}`, borderRadius: 2,
                        fontFamily: 'var(--mono)',
                      }}
                    />
                  )}
                </div>
              </div>
            )}

            {/* Section 2: Method-specific inputs */}
            <div style={{ borderTop: '1px solid #d9dadb', paddingTop: 20, marginTop: 4 }}>

              {dept.method === 'efficiency' && (
                <>
                  <SectionTitle>Efficiency Method Inputs</SectionTitle>

                  <div style={{ marginBottom: 16 }}>
                    <SapLabel>Standard Production Rate</SapLabel>
                    <StdRateEditor
                      deptId={selDeptId} machineNumber={machineNum}
                      rates={stdRates} onRateUpdated={loadRates}
                    />
                    <div style={{ fontSize: 11, color: '#89919a', marginTop: 3 }}>
                      Baseline kg/hr at 100% efficiency. Click Edit to update.
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                    <Field label="Efficiency (%)" required hint="e.g. 85">
                      <SapInput type="number" value={effPct} onChange={setEffPct}
                        placeholder="85" min={1} max={110} step={0.1} />
                    </Field>
                    <Field label="Running Hours" required hint="e.g. 8 or 7.5">
                      <SapInput type="number" value={hours} onChange={setHours}
                        placeholder="8" min={0.5} max={12} step={0.25} />
                    </Field>
                  </div>
                </>
              )}

              {dept.method === 'hank_meter' && (
                <>
                  <SectionTitle>Primary — Hank Meter Readings</SectionTitle>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 20 }}>
                    <Field label="Hank Reading" required hint="Total hanks per spindle">
                      <SapInput type="number" value={hankReading} onChange={setHankReading}
                        placeholder="120" min={0.1} step={0.1} />
                    </Field>
                    <Field label="Working Spindles" required hint="Active spindles this shift">
                      <SapInput type="number" value={spindles} onChange={setSpindles}
                        placeholder={dept.id === 'ringframe' ? '480' : '120'} min={1} step={1} />
                    </Field>
                    <Field label="Yarn Count (Ne)" required hint="1 lb = Ne × 840 yd">
                      <SapInput type="number" value={ne} onChange={setNe}
                        placeholder="47" min={0.1} step={0.5} />
                    </Field>
                  </div>

                  <div style={{ background: '#f5f5f5', border: '1px solid #d9dadb', padding: '14px 16px', marginBottom: 16 }}>
                    <SectionTitle>Secondary — Theoretical Validation (optional)</SectionTitle>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                      <Field label="Spindle RPM" hint="Spindle speed">
                        <SapInput type="number" value={rpm} onChange={setRpm} placeholder="18000" min={100} step={100} />
                      </Field>
                      <Field label="TPI (Turns / inch)" hint="Twist per inch">
                        <SapInput type="number" value={tpi} onChange={setTpi} placeholder="22.4" min={0.1} step={0.1} />
                      </Field>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Notes */}
            <div style={{ borderTop: '1px solid #d9dadb', paddingTop: 20, marginBottom: 16 }}>
              <Field label="Notes (optional)">
                <textarea
                  value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                  placeholder="Shift remarks, downtime reason, etc."
                  style={{
                    width: '100%', padding: '7px 10px', fontSize: 12,
                    border: `1px solid ${SAP_BORDER}`, borderRadius: 2,
                    background: '#fff', color: '#32363a',
                    fontFamily: 'var(--font)', resize: 'vertical', outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </Field>
            </div>

            {/* Status messages */}
            {error && (
              <div style={{
                padding: '9px 12px', fontSize: 12,
                background: '#fff0f0', border: '1px solid #f9bfbf',
                borderLeft: '3px solid #bb0000', color: '#bb0000', marginBottom: 12,
              }}>{error}</div>
            )}
            {saved && (
              <div style={{
                padding: '9px 12px', fontSize: 12, fontWeight: 500,
                background: '#f0faf2', border: '1px solid #abe2bc',
                borderLeft: '3px solid #188f36', color: '#188f36', marginBottom: 12,
              }}>
                Entry saved — {dept.name} · Shift {shift}
                {liveResult !== null ? ` · ${liveResult?.toLocaleString('en-IN', { maximumFractionDigits: 1 })} kg` : ''}
              </div>
            )}

            {/* SAP button bar */}
            <div style={{ display: 'flex', gap: 8, paddingTop: 4 }}>
              <SapPrimaryBtn onClick={handleSubmit} disabled={!canSubmit || saving}>
                {saving ? 'Saving…' : 'Save'}
              </SapPrimaryBtn>
              <SapGhostBtn onClick={() => {
                setEffPct(''); setHours(''); setHankReading(''); setSpindles('')
                setRpm(''); setTpi(''); setNotes(''); setSaved(false); setError('')
              }}>
                Reset
              </SapGhostBtn>
            </div>
          </div>
        </div>

        {/* ── Right: Live Calculation ──────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          <FormulaPanel
            dept={dept} result={liveResult} theoretical={liveTheoretical}
            fields={{
              stdRate: getStdRate(), effPct: effPct || null, hours: hours || null,
              hankReading: hankReading || null, spindles: spindles || null,
              ne: ne || null, rpm: rpm || null, tpi: tpi || null,
            }}
          />

          {/* Engineering reference note */}
          <div style={{
            background: '#fff', border: '1px solid #d9dadb', borderTop: 'none',
            padding: '14px 16px', fontSize: 11, color: '#6a6d70', lineHeight: 1.7,
          }}>
            <div style={{ fontWeight: 600, color: '#32363a', marginBottom: 6 }}>
              {dept.method === 'efficiency' ? 'Efficiency Method' : 'Hank Meter Method'}
            </div>
            {dept.method === 'efficiency' ? (
              <>
                <div>• Std rate = rated output at 100% efficiency</div>
                <div>• Efficiency % covers downtime, stoppages</div>
                <div>• Edit std rate to match actual machine capacity</div>
              </>
            ) : (
              <>
                <div>• 1 hank = 840 yards (standard)</div>
                <div>• Ne = yards per pound ÷ 840</div>
                <div>• Output (lb) = hanks × spindles ÷ Ne</div>
                <div>• Output (kg) = lb × 0.453592</div>
                <div style={{ marginTop: 4, color: '#89919a' }}>• Theoretical inputs for validation only</div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
