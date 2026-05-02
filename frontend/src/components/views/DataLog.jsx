/**
 * DataLog.jsx — Batch data log with machine filter, date range, edit, and delete.
 */

import { useState, useEffect, useCallback } from 'react'
import { Card, LabelCaps, Badge, TblWrap, Empty } from '../Primitives.jsx'
import { getLog, deleteSample, updateSample, getSample } from '../../api.js'
import { MACHINE_CONFIG } from '../../App.jsx'

/* ── Inline SVG icon: industrial cog / gear ─────────────────────────────── */
function CogIcon({ size = 13, color = 'currentColor' }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} fill="none"
      stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="2.2"/>
      <path d="M8 1.5v1.2M8 13.3v1.2M1.5 8h1.2M13.3 8h1.2M3.4 3.4l.85.85M11.75 11.75l.85.85M3.4 12.6l.85-.85M11.75 4.25l.85-.85"/>
    </svg>
  )
}

/* ── Inline SVG icon: pencil (edit) ─────────────────────────────────────── */
function PencilIcon({ size = 12 }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} fill="none"
      stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11.5 2.5l2 2-8 8H3.5v-2l8-8z"/>
      <path d="M9.5 4.5l2 2"/>
    </svg>
  )
}

/* ── Edit modal ─────────────────────────────────────────────────────────── */
function EditModal({ row, onClose, onSaved }) {
  const origReadings = row.readings ?? Array(row.readings_count).fill('')
  const [vals,    setVals]    = useState(origReadings.map(String))
  const [saving,  setSaving]  = useState(false)
  const [err,     setErr]     = useState('')

  const p = row.mean_hank >= 10 ? 2 : 4

  const handleSave = async () => {
    const nums = vals.map(v => parseFloat(v)).filter(v => !isNaN(v) && v > 0)
    if (nums.length < 3) { setErr('Enter at least 3 valid readings.'); return }
    setErr('')
    setSaving(true)
    try {
      await updateSample(row.id, { readings: nums, avg_weight: row.avg_weight })
      onSaved()
      onClose()
    } catch (e) {
      setErr(e.response?.data?.detail ?? 'Save failed — please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 300,
      background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{
        background: 'var(--bg)', border: '1px solid var(--bd-md)', borderRadius: 'var(--r-lg)',
        padding: '20px 24px', width: 'min(520px, 94vw)',
        boxShadow: 'var(--shadow-md)', display: 'flex', flexDirection: 'column', gap: 16,
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--tx)' }}>Edit batch readings</div>
            <div style={{ fontSize: 12, color: 'var(--tx-3)', marginTop: 3 }}>
              {row.dept_name} · Shift {row.shift} · ID #{row.id}
            </div>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', fontSize: 18, cursor: 'pointer', color: 'var(--tx-3)', lineHeight: 1, padding: '0 4px' }}>×</button>
        </div>

        {/* Readings grid */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--tx-3)', marginBottom: 8 }}>
            Readings ({vals.length} slots)
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {vals.map((v, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--tx-4)', textAlign: 'center' }}>R{i+1}</label>
                <input
                  type="number" step="0.0001" value={v}
                  onChange={e => { const n = [...vals]; n[i] = e.target.value; setVals(n) }}
                  style={{
                    padding: '4px 7px', textAlign: 'center', fontSize: 12, fontFamily: 'var(--mono)',
                    border: '1px solid #bfbfbf', borderRadius: 0,
                    background: '#fff', color: '#1d1d1d', width: '100%', outline: 'none',
                  }}
                />
              </div>
            ))}
          </div>
        </div>

        {err && (
          <div style={{ fontSize: 12, color: 'var(--bad)', padding: '8px 12px', background: 'var(--bad-bg)', border: '1px solid var(--bad-bd)', borderRadius: 'var(--r)' }}>{err}</div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{
            padding: '4px 14px', fontSize: 12, fontFamily: 'var(--font)', fontWeight: 400,
            border: '1px solid #bfbfbf', borderRadius: 0, background: '#fff',
            color: '#1d1d1d', cursor: 'pointer',
          }}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={{
            padding: '4px 14px', fontSize: 12, fontFamily: 'var(--font)', fontWeight: 600,
            border: '1px solid #0a6ed1', borderRadius: 0,
            background: saving ? '#e8e8e8' : '#0a6ed1', color: saving ? '#8c8c8c' : '#fff', cursor: saving ? 'default' : 'pointer',
          }}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════════
   DataLog — main component
═══════════════════════════════════════════════════════════════════════════ */
export default function DataLog({ depts, refreshKey, currentDept, machineFilter }) {
  const [rows,       setRows]       = useState([])
  const [total,      setTotal]      = useState(0)
  const [truncated,  setTruncated]  = useState(false)
  const [loading,    setLoading]    = useState(false)
  const [editRow,    setEditRow]    = useState(null)   // full sample being edited
  const [editLoading, setEditLoading] = useState(null) // id of row being fetched

  const [deptFilter,  setDeptFilter]  = useState('ALL')
  const [shiftFilter, setShiftFilter] = useState('ALL')
  const [dateFrom,    setDateFrom]    = useState('')
  const [dateTo,      setDateTo]      = useState('')
  const [sortCol,     setSortCol]     = useState('timestamp')
  const [sortDir,     setSortDir]     = useState('desc')

  const activeDeptId  = deptFilter !== 'ALL' ? deptFilter : currentDept
  const machineConf   = MACHINE_CONFIG[activeDeptId] ?? null
  const showMachineCol = rows.some(r => r.frame_number != null) || machineConf != null

  const load = useCallback(() => {
    setLoading(true)
    const params = {
      dept_id:  deptFilter,
      shift:    shiftFilter,
      sort_col: sortCol,
      sort_dir: sortDir,
    }
    if (machineFilter != null && machineConf) {
      params.frame_number = machineFilter
    }
    if (dateFrom) params.date_from = new Date(dateFrom + 'T00:00:00').toISOString()
    if (dateTo)   params.date_to   = new Date(dateTo   + 'T23:59:59').toISOString()
    getLog(params)
      .then(d => { setRows(d.rows); setTotal(d.total); setTruncated(d.truncated ?? false) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [deptFilter, shiftFilter, sortCol, sortDir, machineFilter, machineConf, dateFrom, dateTo])

  const handleEdit = async (logRow) => {
    setEditLoading(logRow.id)
    try {
      const full = await getSample(logRow.id)
      setEditRow({ ...logRow, readings: full.readings })
    } catch {
      window.alert('Could not load readings — please try again.')
    } finally {
      setEditLoading(null)
    }
  }

  const handleDelete = (id) => {
    if (!window.confirm('Delete this batch entry? This cannot be undone.')) return
    deleteSample(id).then(() => load()).catch(() => window.alert('Delete failed — please try again.'))
  }

  useEffect(() => { load() }, [load, refreshKey])

  const handleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('desc') }
  }

  const SortTh = ({ col, children }) => (
    <th onClick={() => handleSort(col)}
      style={{ padding: '5px 8px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#1d1d1d', letterSpacing: '.05em', textTransform: 'uppercase', background: '#e8e8e8', border: '1px solid #cccccc', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}>
      {children} {sortCol === col ? (sortDir === 'asc' ? '↑' : '↓') : <span style={{opacity:.35}}>↕</span>}
    </th>
  )

  const Th = ({ children, title }) => (
    <th title={title}
      style={{ padding: '5px 8px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#1d1d1d', letterSpacing: '.05em', textTransform: 'uppercase', background: '#e8e8e8', border: '1px solid #cccccc', whiteSpace: 'nowrap' }}>
      {children}
    </th>
  )

  const colCount = 10 + (showMachineCol ? 1 : 0) + 2  // +2 for edit + delete

  return (
    <>
      {editRow && (
        <EditModal
          row={editRow}
          onClose={() => setEditRow(null)}
          onSaved={load}
        />
      )}

      <Card sm>
        {/* ── Filter bar ── */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:8, marginBottom:14 }}>
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <LabelCaps className="!mb-0">Batch data log</LabelCaps>
            {machineFilter != null && machineConf && (
              <span style={{ fontSize:10, fontWeight:600, padding:'2px 9px', borderRadius:20, background:'var(--claude-bg)', color:'var(--claude)', border:'1px solid var(--claude-bd)' }}>
                {machineConf.label} #{machineFilter}
              </span>
            )}
          </div>

          <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
            <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)}
              style={{ padding: '4px 7px', fontSize: 12, background: '#fff', color: '#1d1d1d', border: '1px solid #bfbfbf', borderRadius: 0, cursor: 'pointer', fontFamily: 'var(--font)', outline: 'none' }}>
              <option value="ALL">All Departments</option>
              {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <select value={shiftFilter} onChange={e => setShiftFilter(e.target.value)}
              style={{ padding: '4px 7px', fontSize: 12, background: '#fff', color: '#1d1d1d', border: '1px solid #bfbfbf', borderRadius: 0, cursor: 'pointer', fontFamily: 'var(--font)', outline: 'none' }}>
              <option value="ALL">All Shifts</option>
              <option value="A">Shift A</option>
              <option value="B">Shift B</option>
              <option value="C">Shift C</option>
            </select>

            {/* Date range */}
            <div style={{ display:'flex', alignItems:'center', gap:5 }}>
              <span style={{ fontSize:11, color:'#5a5a5a', fontWeight:500, whiteSpace:'nowrap' }}>From</span>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                max={dateTo || undefined}
                style={{ padding: '4px 7px', fontSize: 12, background: '#fff', color: '#1d1d1d', border: '1px solid #bfbfbf', borderRadius: 0, cursor: 'pointer', fontFamily: 'var(--font)', outline: 'none' }} />
              <span style={{ fontSize:11, color:'#5a5a5a', fontWeight:500, whiteSpace:'nowrap' }}>to</span>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                min={dateFrom || undefined}
                style={{ padding: '4px 7px', fontSize: 12, background: '#fff', color: '#1d1d1d', border: '1px solid #bfbfbf', borderRadius: 0, cursor: 'pointer', fontFamily: 'var(--font)', outline: 'none' }} />
              {(dateFrom || dateTo) && (
                <button onClick={() => { setDateFrom(''); setDateTo('') }}
                  title="Clear date filter"
                  style={{ padding: '4px 14px', fontSize: 12, border: '1px solid #bfbfbf', borderRadius: 0, background: '#fff', color: '#1d1d1d', cursor: 'pointer', lineHeight: 1, fontFamily: 'var(--font)' }}>
                  ✕
                </button>
              )}
            </div>

            <span style={{ fontSize:12, color:'var(--tx-3)' }}>
              {loading ? 'Loading…' : `${total} batch${total !== 1 ? 'es' : ''}`}
            </span>
          </div>
        </div>

        {truncated && (
          <div style={{
            margin: '0 0 8px', padding: '8px 14px',
            background: '#fff8e6', border: '1px solid #f5c842', borderRadius: 'var(--r)',
            fontSize: 12, color: '#7a5800', display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{ fontSize: 16 }}>⚠</span>
            <span>
              Showing the most recent <strong>{total}</strong> batches. There are more records — use the date filter above to narrow results and see older data.
            </span>
          </div>
        )}

        <TblWrap>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead>
              <tr>
                <SortTh col="timestamp">Date &amp; Time</SortTh>
                <Th>Department</Th>
                <Th>Shift</Th>
                {showMachineCol && (
                  <Th title="Machine / frame number recorded with this batch">
                    <span style={{ display:'inline-flex', alignItems:'center', gap:5 }}>
                      <CogIcon size={12} />
                      Machine
                    </span>
                  </Th>
                )}
                <SortTh col="avg_weight">Avg Weight (g)</SortTh>
                <SortTh col="mean_hank">Mean Hank</SortTh>
                <Th title="Target stored at the moment the sample was saved — never changes even if you later adjust settings">
                  Target @ Save ⓘ
                </Th>
                <Th title="USL stored at the moment the sample was saved">USL @ Save ⓘ</Th>
                <Th title="LSL stored at the moment the sample was saved">LSL @ Save ⓘ</Th>
                <SortTh col="cv">CV%</SortTh>
                <Th>Readings</Th>
                <Th></Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={colCount}><Empty>No batches match the current filter</Empty></td></tr>
              ) : rows.map((r, i) => {
                const raw     = r.timestamp
                const ts      = new Date(raw.endsWith('Z') || raw.includes('+') ? raw : raw + 'Z')
                const dateStr = ts.toLocaleDateString(undefined, { month:'short', day:'numeric', year:'numeric' })
                const timeStr = ts.toLocaleTimeString(undefined, { hour:'2-digit', minute:'2-digit' })
                const p       = (r.mean_hank >= 10) ? 2 : 4
                const cvStr   = r.cv != null ? `${r.cv.toFixed(2)}%` : '—'
                const cvColor = r.cv == null ? 'var(--tx-3)'
                  : r.quality === 'ok'   ? 'var(--ok)'
                  : r.quality === 'warn' ? 'var(--warn)'
                  : 'var(--bad)'
                const rowMachineConf = MACHINE_CONFIG[r.dept_id] ?? null

                const rowBg = i % 2 === 0 ? '#fff' : '#fafafa'
                return (
                  <tr key={r.id}
                    style={{ background: rowBg }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#f0f4ff' }}
                    onMouseLeave={e => { e.currentTarget.style.background = rowBg }}
                  >
                    <td style={TD}><span style={{ fontFamily:'var(--mono)', fontSize:12 }}>{dateStr} {timeStr}</span></td>
                    <td style={TD}>{r.dept_name}</td>
                    <td style={TD}><Badge variant="neutral">Shift {r.shift}</Badge></td>
                    {showMachineCol && (
                      <td style={TD}>
                        {r.frame_number != null && rowMachineConf ? (
                          <span style={{ fontFamily:'var(--mono)', fontSize:12, fontWeight:600, padding:'2px 8px', borderRadius:12, background:'var(--claude-bg)', color:'var(--claude)', border:'1px solid var(--claude-bd)', display:'inline-flex', alignItems:'center', gap:5 }}>
                            <CogIcon size={11} color="var(--claude)" />
                            {rowMachineConf.label} {r.frame_number}
                          </span>
                        ) : (
                          <span style={{ color:'var(--tx-4)', fontSize:12 }}>—</span>
                        )}
                      </td>
                    )}
                    <td style={TD}><span style={{ fontFamily:'var(--mono)', fontSize:12 }}>{r.avg_weight != null ? `${r.avg_weight.toFixed(3)} g` : '—'}</span></td>
                    <td style={TD}><span style={{ fontFamily:'var(--mono)', fontSize:12 }}>{r.mean_hank.toFixed(p)} {r.unit}</span></td>
                    <td style={TD}><span style={{ fontFamily:'var(--mono)', fontSize:12, color:'var(--info)' }}>{r.target_value.toFixed(p)}</span></td>
                    <td style={TD}><span style={{ fontFamily:'var(--mono)', fontSize:12, color:'var(--ok)' }}>{r.usl_value.toFixed(p)}</span></td>
                    <td style={TD}><span style={{ fontFamily:'var(--mono)', fontSize:12, color:'var(--warn)' }}>{r.lsl_value.toFixed(p)}</span></td>
                    <td style={TD}><span style={{ fontFamily:'var(--mono)', fontWeight:500, color:cvColor }}>{cvStr}</span></td>
                    <td style={TD}><span style={{ fontFamily:'var(--mono)', fontSize:12, color:'var(--tx-3)' }}>{r.readings_count} rdg</span></td>
                    {/* Edit */}
                    <td style={{ ...TD, textAlign:'center' }}>
                      <button
                        onClick={() => handleEdit(r)}
                        disabled={editLoading === r.id}
                        title="Edit readings"
                        style={{
                          padding: '4px 14px', fontSize: 12, border: '1px solid #bfbfbf', borderRadius: 0,
                          background: '#fff', color: '#1d1d1d', cursor: editLoading === r.id ? 'default' : 'pointer', lineHeight: 1,
                          transition: 'all .12s', display: 'inline-flex', alignItems: 'center', gap: 4,
                          opacity: editLoading === r.id ? 0.5 : 1, fontFamily: 'var(--font)',
                        }}
                        onMouseEnter={e => { if (editLoading !== r.id) { e.currentTarget.style.background='#f0f4ff'; e.currentTarget.style.borderColor='#0a6ed1'; e.currentTarget.style.color='#0a6ed1' }}}
                        onMouseLeave={e => { e.currentTarget.style.background='#fff'; e.currentTarget.style.borderColor='#bfbfbf'; e.currentTarget.style.color='#1d1d1d' }}
                      >
                        <PencilIcon size={11} /> {editLoading === r.id ? '…' : 'Edit'}
                      </button>
                    </td>
                    {/* Delete */}
                    <td style={{ ...TD, textAlign:'center' }}>
                      <button onClick={() => handleDelete(r.id)} title="Delete this entry"
                        style={{ padding: '4px 14px', fontSize: 12, border: '1px solid var(--bad)', borderRadius: 0, background: 'transparent', color: 'var(--bad)', cursor: 'pointer', lineHeight: 1, transition: 'all .12s', fontFamily: 'var(--font)' }}
                        onMouseEnter={e => { e.currentTarget.style.background='var(--bad)'; e.currentTarget.style.color='#fff' }}
                        onMouseLeave={e => { e.currentTarget.style.background='transparent'; e.currentTarget.style.color='var(--bad)' }}>
                        Delete
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </TblWrap>
      </Card>
    </>
  )
}

const TD = { padding: '5px 8px', fontSize: 12, color: '#1d1d1d', borderBottom: '1px solid #eaeaea', borderRight: '1px solid #eaeaea' }
