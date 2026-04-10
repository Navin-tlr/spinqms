import { useState } from 'react'
import { Card, LabelCaps, Btn, TblWrap } from '../Primitives.jsx'
import { updateSettings, resetSettings, clearSamples } from '../../api.js'

export default function Settings({ depts, onSettingsChanged }) {
  const [saving, setSaving] = useState({})

  const handleChange = async (deptId, field, value) => {
    const dept = depts.find(d => d.id === deptId)
    if (!dept) return
    const body = {
      target:    field === 'target'    ? parseFloat(value) : dept.target,
      tolerance: field === 'tolerance' ? parseFloat(value) : dept.tol,
      def_len:   field === 'def_len'   ? parseFloat(value) : dept.def_len,
    }
    if (isNaN(body.target) || isNaN(body.tolerance) || isNaN(body.def_len)) return
    setSaving(s => ({ ...s, [deptId]: true }))
    try {
      await updateSettings(deptId, body)
      onSettingsChanged()
    } finally {
      setSaving(s => ({ ...s, [deptId]: false }))
    }
  }

  const handleReset = async () => {
    if (!confirm('Reset all targets, tolerances, and sample lengths to factory defaults?')) return
    await resetSettings()
    onSettingsChanged()
  }

  const handleClear = async () => {
    if (!confirm('Clear ALL sample data for all departments and shifts? This cannot be undone.')) return
    await clearSamples()
    onSettingsChanged()
  }

  return (
    <>
      <Card sm>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', flexWrap:'wrap', gap:8, marginBottom:16 }}>
          <div>
            <LabelCaps className="!mb-1">Department configuration</LabelCaps>
            <div style={{ fontSize:12, color:'var(--tx-3)' }}>Edit target hank, sample length, and tolerance per department. USL and LSL auto-update.</div>
          </div>
          <Btn size="sm" onClick={handleReset}>↺ Reset to defaults</Btn>
        </div>
        <TblWrap>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead>
              <tr>
                {['Department','Target hank','Tolerance ±','USL (auto)','LSL (auto)','Sample length','Expected weight'].map(h => (
                  <th key={h} style={{ padding:'8px 12px', textAlign:'left', fontSize:10, fontWeight:600, color:'var(--tx-3)', letterSpacing:'.05em', textTransform:'uppercase', borderBottom:'1px solid var(--bd-md)', whiteSpace:'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {depts.map(d => {
                const p = d.target >= 10 ? 1 : 4
                const expW = (d.def_len * 0.54 / d.target).toFixed(2)
                return (
                  <tr key={d.id}>
                    <td style={{ padding:'9px 12px', borderBottom:'1px solid var(--bd)', fontWeight:500 }}>
                      {d.name}<br/>
                      <span style={{ fontSize:10, color:'var(--tx-3)', fontWeight:400 }}>{d.unit}</span>
                    </td>
                    <td style={{ padding:'9px 12px', borderBottom:'1px solid var(--bd)' }}>
                      <SettingInput
                        value={d.target} step={d.target >= 10 ? 0.1 : 0.0001}
                        onBlur={v => handleChange(d.id, 'target', v)}
                      />
                    </td>
                    <td style={{ padding:'9px 12px', borderBottom:'1px solid var(--bd)' }}>
                      <SettingInput
                        value={d.tol} step={d.target >= 10 ? 0.1 : 0.0001}
                        onBlur={v => handleChange(d.id, 'tolerance', v)}
                      />
                    </td>
                    <td style={{ padding:'9px 12px', borderBottom:'1px solid var(--bd)', fontFamily:'var(--mono)', fontSize:12, color:'var(--tx-2)' }}>
                      {(d.target + d.tol).toFixed(p)}
                    </td>
                    <td style={{ padding:'9px 12px', borderBottom:'1px solid var(--bd)', fontFamily:'var(--mono)', fontSize:12, color:'var(--tx-2)' }}>
                      {(d.target - d.tol).toFixed(p)}
                    </td>
                    <td style={{ padding:'9px 12px', borderBottom:'1px solid var(--bd)' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                        <SettingInput
                          value={d.def_len} step={0.5} width={70}
                          onBlur={v => handleChange(d.id, 'def_len', v)}
                        />
                        <span style={{ fontSize:11, color:'var(--tx-3)' }}>yds</span>
                      </div>
                    </td>
                    <td style={{ padding:'9px 12px', borderBottom:'1px solid var(--bd)', fontFamily:'var(--mono)', fontSize:12, color:'var(--tx-2)' }}>
                      ~{expW} g
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </TblWrap>
      </Card>

      <Card sm>
        <LabelCaps>Data management</LabelCaps>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          <Btn onClick={() => window.open('/api/export/csv','_blank')}>↓ Export all data as CSV</Btn>
          <Btn variant="danger" onClick={handleClear}>✕ Clear all data</Btn>
        </div>
        <p style={{ fontSize:12, color:'var(--tx-3)', marginTop:10 }}>
          Data is stored in SQLite (qms.db). Clearing removes all sample data permanently.
        </p>
      </Card>
    </>
  )
}

function SettingInput({ value, step, onBlur, width = 100 }) {
  const [local, setLocal] = useState(value)
  // sync if prop changes (e.g. reset)
  useState(() => { setLocal(value) }, [value])
  return (
    <input
      type="number"
      value={local}
      step={step}
      min={0}
      onChange={e => setLocal(e.target.value)}
      onBlur={e => onBlur(e.target.value)}
      style={{
        width, padding:'5px 8px', border:'1px solid var(--bd-md)', borderRadius:'var(--r)',
        fontSize:13, fontFamily:'var(--mono)', background:'var(--bg)', color:'var(--tx)',
        textAlign:'right', transition:'border-color .12s',
      }}
    />
  )
}
