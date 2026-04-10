/**
 * DataLog.jsx
 * -----------
 * Displays all saved batches with snapshot targets (target_value, usl_value, lsl_value).
 * Includes Machine # column for ringframe/carding/simplex, and respects the global
 * machineFilter passed from App.jsx.
 */

import { useState, useEffect, useCallback } from 'react'
import { Card, LabelCaps, Badge, TblWrap, Empty } from '../Primitives.jsx'
import { getLog, deleteSample } from '../../api.js'
import { MACHINE_CONFIG } from '../../App.jsx'

export default function DataLog({ depts, refreshKey, currentDept, machineFilter }) {
  const [rows,    setRows]    = useState([])
  const [total,   setTotal]   = useState(0)
  const [loading, setLoading] = useState(false)

  const [deptFilter,  setDeptFilter]  = useState('ALL')
  const [shiftFilter, setShiftFilter] = useState('ALL')
  const [dateFrom,    setDateFrom]    = useState('')
  const [dateTo,      setDateTo]      = useState('')
  const [sortCol,     setSortCol]     = useState('timestamp')
  const [sortDir,     setSortDir]     = useState('desc')

  /* Active machine config — driven by the active dept filter (falls back to currentDept) */
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
    // date_from: start of selected day (00:00:00 local → UTC via ISO string)
    if (dateFrom) params.date_from = new Date(dateFrom + 'T00:00:00').toISOString()
    // date_to: end of selected day (23:59:59 local → UTC)
    if (dateTo)   params.date_to   = new Date(dateTo   + 'T23:59:59').toISOString()
    getLog(params)
      .then(d => { setRows(d.rows); setTotal(d.total) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [deptFilter, shiftFilter, sortCol, sortDir, machineFilter, machineConf, dateFrom, dateTo])

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
      style={{ padding:'8px 12px', textAlign:'left', fontSize:10, fontWeight:600, color:'var(--tx-3)', letterSpacing:'.05em', textTransform:'uppercase', borderBottom:'1px solid var(--bd-md)', whiteSpace:'nowrap', cursor:'pointer', userSelect:'none' }}>
      {children} {sortCol === col ? (sortDir === 'asc' ? '↑' : '↓') : <span style={{opacity:.35}}>↕</span>}
    </th>
  )

  const Th = ({ children, title }) => (
    <th title={title}
      style={{ padding:'8px 12px', textAlign:'left', fontSize:10, fontWeight:600, color:'var(--tx-3)', letterSpacing:'.05em', textTransform:'uppercase', borderBottom:'1px solid var(--bd-md)', whiteSpace:'nowrap' }}>
      {children}
    </th>
  )

  const colCount = 10 + (showMachineCol ? 1 : 0) + 1  // +1 for delete col

  return (
    <Card sm>
      {/* ── Filter bar ──────────────────────────────────────────────────────── */}
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
            style={{ padding:'5px 10px', fontSize:12, background:'var(--bg)', color:'var(--tx)', border:'1px solid var(--bd-md)', borderRadius:'var(--r)', cursor:'pointer' }}>
            <option value="ALL">All Departments</option>
            {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <select value={shiftFilter} onChange={e => setShiftFilter(e.target.value)}
            style={{ padding:'5px 10px', fontSize:12, background:'var(--bg)', color:'var(--tx)', border:'1px solid var(--bd-md)', borderRadius:'var(--r)', cursor:'pointer' }}>
            <option value="ALL">All Shifts</option>
            <option value="A">Shift A</option>
            <option value="B">Shift B</option>
            <option value="C">Shift C</option>
          </select>

          {/* ── Date range ── */}
          <div style={{ display:'flex', alignItems:'center', gap:5 }}>
            <span style={{ fontSize:11, color:'var(--tx-3)', fontWeight:500, whiteSpace:'nowrap' }}>From</span>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              max={dateTo || undefined}
              style={{ padding:'4px 8px', fontSize:12, background:'var(--bg)', color:'var(--tx)', border:'1px solid var(--bd-md)', borderRadius:'var(--r)', cursor:'pointer', fontFamily:'var(--font)' }} />
            <span style={{ fontSize:11, color:'var(--tx-3)', fontWeight:500, whiteSpace:'nowrap' }}>to</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              min={dateFrom || undefined}
              style={{ padding:'4px 8px', fontSize:12, background:'var(--bg)', color:'var(--tx)', border:'1px solid var(--bd-md)', borderRadius:'var(--r)', cursor:'pointer', fontFamily:'var(--font)' }} />
            {(dateFrom || dateTo) && (
              <button onClick={() => { setDateFrom(''); setDateTo('') }}
                title="Clear date filter"
                style={{ padding:'3px 8px', fontSize:11, border:'1px solid var(--bd-md)', borderRadius:'var(--r)', background:'transparent', color:'var(--tx-3)', cursor:'pointer', lineHeight:1 }}>
                ✕
              </button>
            )}
          </div>

          <span style={{ fontSize:12, color:'var(--tx-3)' }}>
            {loading ? 'Loading…' : `${total} batch${total !== 1 ? 'es' : ''}`}
          </span>
        </div>
      </div>

      <TblWrap>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
          <thead>
            <tr>
              <SortTh col="timestamp">Date &amp; Time</SortTh>
              <Th>Department</Th>
              <Th>Shift</Th>
              {showMachineCol && (
                <Th title="Machine / frame number recorded with this batch">Machine #</Th>
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
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={colCount}><Empty>No batches match the current filter</Empty></td></tr>
            ) : rows.map(r => {
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

              return (
                <tr key={r.id}>
                  <td style={TD}><span style={{ fontFamily:'var(--mono)', fontSize:12 }}>{dateStr} {timeStr}</span></td>
                  <td style={TD}>{r.dept_name}</td>
                  <td style={TD}><Badge variant="neutral">Shift {r.shift}</Badge></td>
                  {showMachineCol && (
                    <td style={TD}>
                      {r.frame_number != null && rowMachineConf ? (
                        <span style={{ fontFamily:'var(--mono)', fontSize:12, fontWeight:600, padding:'2px 8px', borderRadius:12, background:'var(--claude-bg)', color:'var(--claude)', border:'1px solid var(--claude-bd)' }}>
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
                  <td style={{ ...TD, textAlign:'center' }}>
                    <button onClick={() => handleDelete(r.id)} title="Delete this entry"
                      style={{ padding:'4px 9px', fontSize:11, border:'1px solid var(--bad)', borderRadius:'var(--r)', background:'transparent', color:'var(--bad)', cursor:'pointer', lineHeight:1, transition:'all .12s' }}
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
  )
}

const TD = { padding:'9px 12px', borderBottom:'1px solid var(--bd)' }
