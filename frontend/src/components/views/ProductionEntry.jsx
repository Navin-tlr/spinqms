import { useState, useEffect, useCallback } from 'react'
import {
  getProductionStdRates, updateProductionStdRate,
  createProductionEntry,
  calcEfficiencyKg, calcHankMeterKg, calcTheoreticalKg,
} from '../../api.js'

/* ── Department configuration ───────────────────────────────────────────── */
const DEPTS = [
  { id: 'carding',   name: 'Carding',    method: 'efficiency',  machines: 3,  color: '#1b5e9e' },
  { id: 'breaker',   name: 'Breaker',    method: 'efficiency',  machines: 1,  color: '#0e7a4a' },
  { id: 'rsb',       name: 'RSB',        method: 'efficiency',  machines: 2,  color: '#6b3a8a' },
  { id: 'simplex',   name: 'Simplex',    method: 'hank_meter',  machines: 3,  color: '#b45309' },
  { id: 'ringframe', name: 'Ring Frame', method: 'hank_meter',  machines: 25, color: '#b42626', ne_default: 47 },
]

/* ── UI atom helpers ────────────────────────────────────────────────────── */
function Label({ children, required }) {
  return (
    <label style={{
      fontSize: 11, fontWeight: 600, color: '#555',
      textTransform: 'uppercase', letterSpacing: '.07em',
      display: 'block', marginBottom: 6,
    }}>
      {children}
      {required && <span style={{ color: '#bb0000', marginLeft: 3 }}>*</span>}
    </label>
  )
}

function Input({ value, onChange, type = 'text', placeholder, min, max, step, disabled, style }) {
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
        padding: '9px 12px',
        fontSize: 13,
        border: '1px solid #d8d8d5',
        borderRadius: 6,
        background: disabled ? '#f7f7f5' : '#fff',
        color: disabled ? '#acaba8' : '#37352F',
        fontFamily: 'var(--mono)',
        outline: 'none',
        transition: 'border-color .15s',
        ...style,
      }}
      onFocus={e => { if (!disabled) e.target.style.borderColor = '#1b5e9e' }}
      onBlur={e => { e.target.style.borderColor = '#d8d8d5' }}
    />
  )
}

function FieldGroup({ label, required, hint, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <Label required={required}>{label}</Label>
      {children}
      {hint && (
        <div style={{ fontSize: 11, color: '#acaba8', marginTop: 4 }}>{hint}</div>
      )}
    </div>
  )
}

/* ── Formula display panel ──────────────────────────────────────────────── */
function FormulaPanel({ dept, fields, result, theoretical }) {
  const empty = result === null || result === undefined || isNaN(result)

  return (
    <div style={{
      background: '#f0f4fa',
      border: '1.5px solid #c6d8f0',
      borderRadius: 8,
      padding: '18px 20px',
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.12em', color: '#1b5e9e' }}>
        Live Calculation
      </div>

      {dept.method === 'efficiency' ? (
        <>
          <div style={{ fontSize: 12, color: '#555', lineHeight: 1.7, fontFamily: 'var(--mono)' }}>
            <div style={{ color: '#888', fontSize: 11, marginBottom: 4 }}>Formula:</div>
            output = std_rate × (efficiency / 100) × hours
          </div>
          <div style={{ fontSize: 12, color: '#333', lineHeight: 1.7, fontFamily: 'var(--mono)' }}>
            = {fields.stdRate ?? '?'} × ({fields.effPct ?? '?'} / 100) × {fields.hours ?? '?'}
          </div>
        </>
      ) : (
        <>
          <div style={{ fontSize: 12, color: '#555', lineHeight: 1.7, fontFamily: 'var(--mono)' }}>
            <div style={{ color: '#888', fontSize: 11, marginBottom: 4 }}>Primary formula:</div>
            output = (hank_reading × spindles / Ne) × 0.453592
          </div>
          <div style={{ fontSize: 12, color: '#333', lineHeight: 1.7, fontFamily: 'var(--mono)' }}>
            = ({fields.hankReading ?? '?'} × {fields.spindles ?? '?'} / {fields.ne ?? '?'}) × 0.453592
          </div>
          {theoretical !== null && theoretical !== undefined && !isNaN(theoretical) && (
            <div style={{ borderTop: '1px solid #c6d8f0', paddingTop: 10, marginTop: 2 }}>
              <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>
                Theoretical (validation):
              </div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: '#555' }}>
                delivery = rpm / (tpi × 36) = {fields.rpm ?? '?'} / ({fields.tpi ?? '?'} × 36)
              </div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: '#333', marginTop: 2 }}>
                → <strong>{theoretical.toLocaleString('en-IN', { maximumFractionDigits: 1 })} kg</strong>
              </div>
            </div>
          )}
        </>
      )}

      <div style={{
        borderTop: '1.5px solid #c6d8f0',
        paddingTop: 12,
        display: 'flex',
        alignItems: 'baseline',
        gap: 8,
      }}>
        <div style={{
          fontFamily: 'var(--mono)',
          fontSize: empty ? 22 : 32,
          fontWeight: 700,
          color: empty ? '#acaba8' : '#1b5e9e',
          lineHeight: 1,
        }}>
          {empty ? '—' : result.toLocaleString('en-IN', { maximumFractionDigits: 1 })}
        </div>
        {!empty && (
          <div style={{ fontSize: 14, color: '#555', fontWeight: 500 }}>kg</div>
        )}
      </div>
      {!empty && (
        <div style={{ fontSize: 11, color: '#1b5e9e', marginTop: -6 }}>
          Primary output · {dept.name}
        </div>
      )}
    </div>
  )
}

/* ── Std Rate editor inline ─────────────────────────────────────────────── */
function StdRateEditor({ deptId, machineNumber, rates, onRateUpdated }) {
  const key   = `${deptId}:${machineNumber ?? 'null'}`
  const rate  = rates[key]
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
      onRateUpdated()
      setEditing(false)
    } catch (e) {
      alert(e?.response?.data?.detail || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {editing ? (
        <>
          <input
            type="number"
            value={val}
            onChange={e => setVal(e.target.value)}
            style={{
              width: 80, padding: '5px 8px', fontSize: 12,
              border: '1px solid #1b5e9e', borderRadius: 5,
              fontFamily: 'var(--mono)',
            }}
            autoFocus
          />
          <span style={{ fontSize: 11, color: '#555' }}>kg/hr</span>
          <button
            onClick={save}
            disabled={saving || !val}
            style={{
              padding: '4px 10px', fontSize: 11, fontWeight: 500,
              background: '#1b5e9e', color: '#fff', border: 'none',
              borderRadius: 4, cursor: 'pointer', fontFamily: 'var(--font)',
            }}
          >{saving ? '…' : 'Save'}</button>
          <button
            onClick={() => setEditing(false)}
            style={{
              padding: '4px 10px', fontSize: 11,
              background: '#f0f0ef', color: '#555', border: 'none',
              borderRadius: 4, cursor: 'pointer', fontFamily: 'var(--font)',
            }}
          >Cancel</button>
        </>
      ) : (
        <>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 600, color: '#37352F' }}>
            {rate?.std_rate_kg_per_hr ?? '—'} kg/hr
          </span>
          <button
            onClick={() => { setVal(rate?.std_rate_kg_per_hr ?? ''); setEditing(true) }}
            style={{
              padding: '3px 9px', fontSize: 10, fontWeight: 500,
              border: '1px solid #d8d8d5', borderRadius: 4, background: '#fff',
              color: '#555', cursor: 'pointer', fontFamily: 'var(--font)',
            }}
          >Edit</button>
        </>
      )}
    </div>
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

  // Efficiency fields
  const [effPct,  setEffPct]  = useState('')
  const [hours,   setHours]   = useState('')

  // Hank meter fields
  const [hankReading, setHankReading] = useState('')
  const [spindles,    setSpindles]    = useState('')
  const [ne,          setNe]          = useState('')

  // Optional secondary
  const [rpm, setRpm] = useState('')
  const [tpi, setTpi] = useState('')

  // Std rates cache
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

  // Compute live preview
  const getStdRate = () => {
    const machKey = `${selDeptId}:${machineNum ?? 'null'}`
    const deptKey = `${selDeptId}:null`
    return stdRates[machKey]?.std_rate_kg_per_hr ?? stdRates[deptKey]?.std_rate_kg_per_hr ?? null
  }

  let liveResult = null
  let liveTheoretical = null

  if (dept.method === 'efficiency') {
    const rate = getStdRate()
    if (rate && effPct && hours)
      liveResult = calcEfficiencyKg(parseFloat(rate), parseFloat(effPct), parseFloat(hours))
  } else {
    if (hankReading && spindles && ne)
      liveResult = calcHankMeterKg(parseFloat(hankReading), parseInt(spindles), parseFloat(ne))
    if (rpm && tpi && spindles && ne)
      liveTheoretical = calcTheoreticalKg(parseFloat(rpm), parseFloat(tpi), parseInt(spindles), parseFloat(ne))
  }

  // Reset fields when dept changes
  const switchDept = (id) => {
    setSelDeptId(id)
    setMachineNum(null)
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
        dept_id:     selDeptId,
        shift,
        entry_date:  entryDate,
        machine_number: machineNum || null,
        calc_method: dept.method,
        notes:       notes || null,
      }
      if (dept.method === 'efficiency') {
        const rate = getStdRate()
        body.efficiency_pct     = parseFloat(effPct)
        body.running_hours      = parseFloat(hours)
        body.std_rate_kg_per_hr = rate
      } else {
        body.hank_reading  = parseFloat(hankReading)
        body.spindle_count = parseInt(spindles)
        body.ne_count      = parseFloat(ne)
        if (rpm) body.spindle_rpm = parseFloat(rpm)
        if (tpi) body.tpi         = parseFloat(tpi)
      }
      await createProductionEntry(body)
      setSaved(true)
      // Reset input fields, keep selections
      setEffPct(''); setHours('')
      setHankReading(''); setSpindles('')
      setRpm(''); setTpi('')
      setNotes('')
      if (onSaved) onSaved()
      setTimeout(() => setSaved(false), 3000)
    } catch (e) {
      setError(e?.response?.data?.detail || JSON.stringify(e?.response?.data) || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const canSubmit = dept.method === 'efficiency'
    ? (effPct && hours && getStdRate())
    : (hankReading && spindles && ne)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 960 }}>

      {/* Page header */}
      <div>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#37352F', letterSpacing: '-.01em' }}>
          Production Entry
        </div>
        <div style={{ fontSize: 12, color: '#9b9b9b', marginTop: 2 }}>
          Record shift output for each department
        </div>
      </div>

      {/* Dept tabs */}
      <div style={{
        display: 'flex',
        gap: 0,
        background: '#f7f7f5',
        border: '1px solid #e0e2e6',
        borderRadius: 8,
        padding: 4,
      }}>
        {DEPTS.map(d => (
          <button
            key={d.id}
            onClick={() => switchDept(d.id)}
            style={{
              flex: 1,
              padding: '9px 8px',
              fontSize: 12, fontWeight: selDeptId === d.id ? 700 : 400,
              border: 'none', borderRadius: 6, cursor: 'pointer',
              fontFamily: 'var(--font)',
              background: selDeptId === d.id ? '#fff' : 'transparent',
              color: selDeptId === d.id ? d.color : '#787774',
              boxShadow: selDeptId === d.id ? '0 1px 3px rgba(0,0,0,.12)' : 'none',
              transition: 'all .15s',
            }}
          >
            <div>{d.name}</div>
            <div style={{
              fontSize: 9, fontWeight: 400, marginTop: 1,
              textTransform: 'uppercase', letterSpacing: '.07em',
              color: selDeptId === d.id ? d.color + 'aa' : '#acaba8',
            }}>
              {d.method === 'efficiency' ? 'Efficiency' : 'Hank Meter'}
            </div>
          </button>
        ))}
      </div>

      {/* Two-column layout: form + formula */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20, alignItems: 'start' }}>

        {/* ── Entry Form ─────────────────────────────────────── */}
        <div style={{
          background: '#fff',
          border: '1px solid #e0e2e6',
          borderRadius: 8,
          overflow: 'hidden',
          boxShadow: '0 1px 4px rgba(0,0,0,.06)',
        }}>
          {/* Form header */}
          <div style={{
            padding: '14px 20px',
            borderBottom: '1px solid #f0f0ef',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%', background: dept.color,
            }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: '#37352F' }}>
              {dept.name}
            </span>
            <span style={{
              fontSize: 10, padding: '2px 8px', borderRadius: 10,
              background: dept.color + '14', color: dept.color,
              fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em',
              marginLeft: 4,
            }}>
              {dept.method === 'efficiency' ? 'Efficiency Method' : 'Hank Meter Method'}
            </span>
          </div>

          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 18 }}>

            {/* Shift + Date row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <FieldGroup label="Shift" required>
                <div style={{ display: 'flex', gap: 8 }}>
                  {['A', 'B', 'C'].map(s => (
                    <button
                      key={s}
                      onClick={() => setShift(s)}
                      style={{
                        flex: 1, padding: '8px 0', fontSize: 13, fontWeight: 700,
                        border: `2px solid ${shift === s ? dept.color : '#e0e2e6'}`,
                        borderRadius: 6, cursor: 'pointer',
                        background: shift === s ? dept.color : '#fff',
                        color: shift === s ? '#fff' : '#787774',
                        fontFamily: 'var(--font)', transition: 'all .12s',
                      }}
                    >{s}</button>
                  ))}
                </div>
              </FieldGroup>

              <FieldGroup label="Date" required>
                <Input
                  type="date"
                  value={entryDate}
                  onChange={setEntryDate}
                  max={new Date().toISOString().slice(0, 10)}
                />
              </FieldGroup>
            </div>

            {/* Machine number (if applicable) */}
            {dept.machines > 1 && (
              <FieldGroup label={dept.id === 'ringframe' ? 'Frame Number (optional)' : 'Machine Number (optional)'}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button
                    onClick={() => setMachineNum(null)}
                    style={{
                      padding: '6px 14px', fontSize: 11, fontWeight: machineNum === null ? 700 : 400,
                      border: `1.5px solid ${machineNum === null ? dept.color : '#e0e2e6'}`,
                      borderRadius: 4, cursor: 'pointer',
                      background: machineNum === null ? dept.color + '14' : '#fff',
                      color: machineNum === null ? dept.color : '#787774',
                      fontFamily: 'var(--font)',
                    }}
                  >All / Dept</button>
                  {Array.from({ length: Math.min(dept.machines, 10) }, (_, i) => i + 1).map(n => (
                    <button
                      key={n}
                      onClick={() => setMachineNum(n)}
                      style={{
                        padding: '6px 12px', fontSize: 11, fontWeight: machineNum === n ? 700 : 400,
                        border: `1.5px solid ${machineNum === n ? dept.color : '#e0e2e6'}`,
                        borderRadius: 4, cursor: 'pointer',
                        background: machineNum === n ? dept.color + '14' : '#fff',
                        color: machineNum === n ? dept.color : '#787774',
                        fontFamily: 'var(--mono)',
                      }}
                    >#{n}</button>
                  ))}
                  {dept.machines > 10 && (
                    <input
                      type="number"
                      placeholder={`1–${dept.machines}`}
                      min={1} max={dept.machines}
                      value={machineNum ?? ''}
                      onChange={e => setMachineNum(e.target.value ? parseInt(e.target.value) : null)}
                      style={{
                        width: 80, padding: '6px 10px', fontSize: 12,
                        border: '1.5px solid #e0e2e6', borderRadius: 4,
                        fontFamily: 'var(--mono)',
                      }}
                    />
                  )}
                </div>
              </FieldGroup>
            )}

            <div style={{ borderTop: '1px solid #f0f0ef', marginTop: 4, paddingTop: 18 }}>

              {/* ── EFFICIENCY METHOD ─────────────────────────────── */}
              {dept.method === 'efficiency' && (
                <>
                  <div style={{
                    fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                    letterSpacing: '.1em', color: '#9b9b9b', marginBottom: 14,
                  }}>
                    Efficiency Inputs
                  </div>

                  <div style={{ marginBottom: 14 }}>
                    <Label>Standard Production Rate</Label>
                    <StdRateEditor
                      deptId={selDeptId}
                      machineNumber={machineNum}
                      rates={stdRates}
                      onRateUpdated={loadRates}
                    />
                    <div style={{ fontSize: 11, color: '#acaba8', marginTop: 4 }}>
                      Baseline kg/hr for this machine at 100% efficiency. Editable in-line.
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <FieldGroup
                      label="Efficiency (%)"
                      required
                      hint="Machine efficiency this shift (e.g. 85)"
                    >
                      <Input
                        type="number" value={effPct} onChange={setEffPct}
                        placeholder="e.g. 85" min={1} max={110} step={0.1}
                      />
                    </FieldGroup>

                    <FieldGroup
                      label="Running Hours"
                      required
                      hint="Actual running time (e.g. 8 or 7.5)"
                    >
                      <Input
                        type="number" value={hours} onChange={setHours}
                        placeholder="e.g. 8" min={0.5} max={12} step={0.25}
                      />
                    </FieldGroup>
                  </div>
                </>
              )}

              {/* ── HANK METER METHOD ─────────────────────────────── */}
              {dept.method === 'hank_meter' && (
                <>
                  <div style={{
                    fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                    letterSpacing: '.1em', color: '#9b9b9b', marginBottom: 14,
                  }}>
                    Primary — Hank Meter Readings
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 18 }}>
                    <FieldGroup
                      label="Hank Reading"
                      required
                      hint="Shift total per spindle (hanks)"
                    >
                      <Input
                        type="number" value={hankReading} onChange={setHankReading}
                        placeholder="e.g. 120" min={0.1} step={0.1}
                      />
                    </FieldGroup>

                    <FieldGroup
                      label="Working Spindles"
                      required
                      hint="Active spindles this shift"
                    >
                      <Input
                        type="number" value={spindles} onChange={setSpindles}
                        placeholder={dept.id === 'ringframe' ? 'e.g. 480' : 'e.g. 120'}
                        min={1} step={1}
                      />
                    </FieldGroup>

                    <FieldGroup
                      label="Yarn Count (Ne)"
                      required
                      hint="1 lb = Ne × 840 yards"
                    >
                      <Input
                        type="number" value={ne} onChange={setNe}
                        placeholder="e.g. 47" min={0.1} step={0.5}
                      />
                    </FieldGroup>
                  </div>

                  {/* Optional secondary inputs */}
                  <div style={{
                    background: '#f7f7f5', border: '1px solid #e8e7e4',
                    borderRadius: 6, padding: '14px 16px',
                  }}>
                    <div style={{
                      fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                      letterSpacing: '.1em', color: '#acaba8', marginBottom: 12,
                    }}>
                      Secondary — Theoretical Validation (optional)
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                      <FieldGroup label="Spindle RPM" hint="Spindle speed (RPM)">
                        <Input
                          type="number" value={rpm} onChange={setRpm}
                          placeholder="e.g. 18000" min={100} step={100}
                        />
                      </FieldGroup>
                      <FieldGroup label="TPI (Turns / inch)" hint="Twist per inch">
                        <Input
                          type="number" value={tpi} onChange={setTpi}
                          placeholder="e.g. 22.4" min={0.1} step={0.1}
                        />
                      </FieldGroup>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Notes */}
            <FieldGroup label="Notes (optional)">
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={2}
                placeholder="Any shift remarks, downtime reason, etc."
                style={{
                  width: '100%', padding: '9px 12px', fontSize: 12,
                  border: '1px solid #d8d8d5', borderRadius: 6,
                  background: '#fff', color: '#37352F',
                  fontFamily: 'var(--font)', resize: 'vertical', outline: 'none',
                }}
              />
            </FieldGroup>

            {/* Status */}
            {error && (
              <div style={{
                padding: '10px 14px', borderRadius: 6, fontSize: 12,
                background: '#FEF2F2', border: '1px solid #FECACA', color: '#B42626',
              }}>{error}</div>
            )}
            {saved && (
              <div style={{
                padding: '10px 14px', borderRadius: 6, fontSize: 12,
                background: '#F0FDF4', border: '1px solid #BBF7D0', color: '#2D9A4E',
                fontWeight: 600,
              }}>
                ✓ Entry saved — {dept.name} · Shift {shift}
                {liveResult !== null ? ` · ${liveResult?.toLocaleString('en-IN', { maximumFractionDigits: 1 })} kg` : ''}
              </div>
            )}

            {/* Submit */}
            <button
              onClick={handleSubmit}
              disabled={!canSubmit || saving}
              style={{
                padding: '12px 24px', fontSize: 13, fontWeight: 700,
                border: 'none', borderRadius: 6, cursor: canSubmit ? 'pointer' : 'not-allowed',
                background: canSubmit ? dept.color : '#e8e7e4',
                color: canSubmit ? '#fff' : '#acaba8',
                fontFamily: 'var(--font)', transition: 'all .15s',
                alignSelf: 'flex-start',
              }}
            >
              {saving ? 'Saving…' : 'Save Production Entry'}
            </button>
          </div>
        </div>

        {/* ── Right panel: formula + help ───────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <FormulaPanel
            dept={dept}
            result={liveResult}
            theoretical={liveTheoretical}
            fields={{
              stdRate: getStdRate(),
              effPct: effPct || null,
              hours:  hours || null,
              hankReading: hankReading || null,
              spindles: spindles || null,
              ne: ne || null,
              rpm: rpm || null,
              tpi: tpi || null,
            }}
          />

          {/* Engineering note card */}
          <div style={{
            background: '#fff8ec',
            border: '1px solid #fde68a',
            borderRadius: 8,
            padding: '14px 16px',
            fontSize: 11,
            color: '#92400e',
            lineHeight: 1.7,
          }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>
              {dept.method === 'efficiency' ? '⚙ Efficiency Method' : '🧵 Hank Meter Method'}
            </div>
            {dept.method === 'efficiency' ? (
              <>
                <div>• Standard rate = machine's rated output at 100% efficiency</div>
                <div>• Efficiency % accounts for downtime, stoppages, speed variation</div>
                <div>• Edit the std rate any time to match actual machine capacity</div>
              </>
            ) : (
              <>
                <div>• 1 hank = 840 yards by definition</div>
                <div>• Ne = (yards per pound) ÷ 840</div>
                <div>• Output (lb) = hanks × spindles ÷ Ne</div>
                <div>• Output (kg) = output (lb) × 0.453592</div>
                <div style={{ marginTop: 4, color: '#b45309' }}>• Theoretical inputs are for validation only — primary_kg uses the hank meter reading</div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
