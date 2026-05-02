/* ──────────────────────────────────────────────────────────────────────────
   ProductionLog — SAP Fiori table layout (Image 01/02 reference)
   - Flat white table, 1px border, 0px radius
   - Compact row height, striped alternating bg
   - Filter bar: flat inputs inline
   - No colour coding per dept — unified neutral display
────────────────────────────────────────────────────────────────────────── */

import { useState, useEffect, useCallback } from 'react'
import { getProductionEntries, deleteProductionEntry } from '../../api.js'
import { Spinner } from '../Primitives.jsx'

const SAP_BLUE = '#0a6ed1'

const DEPT_META = {
  carding:   { name: 'Carding'    },
  breaker:   { name: 'Breaker'    },
  rsb:       { name: 'RSB'        },
  simplex:   { name: 'Simplex'    },
  ringframe: { name: 'Ring Frame' },
}

function fmtKg(n) {
  if (n === null || n === undefined) return '—'
  return n.toLocaleString('en-IN', { maximumFractionDigits: 1 }) + ' kg'
}

function fmtDate(s) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

/* ── SAP inline filter input ──────────────────────────────────────────── */
function FilterInput({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ fontSize: 11, color: '#6a6d70', textTransform: 'uppercase', letterSpacing: '.07em', fontWeight: 600 }}>
        {label}
      </span>
      {children}
    </div>
  )
}

const inputStyle = {
  padding: '4px 8px', fontSize: 12,
  border: '1px solid #bfbfbf', borderRadius: 0,
  background: '#fff', color: '#1d1d1d', fontFamily: 'var(--font)',
  outline: 'none',
}

export default function ProductionLog() {
  const [entries,  setEntries]  = useState([])
  const [loading,  setLoading]  = useState(true)
  const [deleting, setDeleting] = useState(null)

  const today   = new Date().toISOString().slice(0, 10)
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)
  const [fromDate,    setFromDate]    = useState(weekAgo)
  const [toDate,      setToDate]      = useState(today)
  const [deptFilter,  setDeptFilter]  = useState('')
  const [shiftFilter, setShiftFilter] = useState('')

  const [sortCol, setSortCol] = useState('entry_date')
  const [sortDir, setSortDir] = useState('desc')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = {
        limit: 200,
        ...(deptFilter  && { dept_id: deptFilter }),
        ...(shiftFilter && { shift: shiftFilter }),
      }
      const data = await getProductionEntries(params)
      setEntries(data.filter(e => e.entry_date >= fromDate && e.entry_date <= toDate))
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [fromDate, toDate, deptFilter, shiftFilter])

  useEffect(() => { load() }, [load])

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this production entry?')) return
    setDeleting(id)
    try {
      await deleteProductionEntry(id)
      setEntries(prev => prev.filter(e => e.id !== id))
    } catch (e) {
      alert(e?.response?.data?.detail || 'Delete failed')
    } finally { setDeleting(null) }
  }

  const sorted = [...entries].sort((a, b) => {
    let av = a[sortCol], bv = b[sortCol]
    if (typeof av === 'string') av = av.toLowerCase()
    if (typeof bv === 'string') bv = bv.toLowerCase()
    if (av == null) return 1
    if (bv == null) return -1
    return sortDir === 'asc' ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1)
  })

  const toggleSort = col => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('desc') }
  }

  const totalKg = entries.reduce((s, e) => s + (e.primary_kg || 0), 0)

  const thStyle = (col) => ({
    padding: '5px 8px',
    textAlign: 'left',
    fontSize: 11, fontWeight: 700, color: '#1d1d1d',
    textTransform: 'uppercase', letterSpacing: '.05em',
    background: '#e8e8e8',
    border: '1px solid #cccccc',
    cursor: col ? 'pointer' : 'default',
    userSelect: 'none',
    whiteSpace: 'nowrap',
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

      {/* ── Page header bar ─────────────────────────────────────────── */}
      <div style={{
        background: '#fff', border: '1px solid #e0e0e0', borderBottom: 'none',
        padding: '10px 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#32363a' }}>Production Log</span>
          <span style={{ fontSize: 11, color: '#89919a', marginLeft: 12 }}>Historical shift-wise production records</span>
        </div>
        <button onClick={load} style={{
          padding: '5px 14px', fontSize: 12,
          border: '1px solid #89919a', borderRadius: 2,
          background: '#fff', color: '#32363a', cursor: 'pointer',
          fontFamily: 'var(--font)',
        }}>
          Refresh
        </button>
      </div>

      {/* ── SAP filter bar (inline, flat) ───────────────────────────── */}
      <div style={{
        background: '#fff', border: '1px solid #e0e0e0', borderBottom: 'none',
        padding: '12px 16px',
        display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end',
      }}>
        <FilterInput label="From">
          <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
            max={toDate} style={inputStyle} />
        </FilterInput>

        <FilterInput label="To">
          <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
            min={fromDate} max={today} style={inputStyle} />
        </FilterInput>

        <FilterInput label="Department">
          <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)} style={inputStyle}>
            <option value="">All</option>
            {Object.entries(DEPT_META).map(([id, m]) => (
              <option key={id} value={id}>{m.name}</option>
            ))}
          </select>
        </FilterInput>

        <FilterInput label="Shift">
          <select value={shiftFilter} onChange={e => setShiftFilter(e.target.value)} style={inputStyle}>
            <option value="">All</option>
            <option value="A">Shift A</option>
            <option value="B">Shift B</option>
            <option value="C">Shift C</option>
          </select>
        </FilterInput>

        {/* Summary chip */}
        {!loading && entries.length > 0 && (
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: '#89919a' }}>{entries.length} records</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 20, fontWeight: 300, color: SAP_BLUE }}>
              {fmtKg(totalKg)}
            </div>
          </div>
        )}
      </div>

      {/* ── SAP table ────────────────────────────────────────────────── */}
      <div style={{ background: '#fff', border: '1px solid #e0e0e0', overflowX: 'auto' }}>
        {loading ? (
          <div style={{ padding: 48, textAlign: 'center' }}><Spinner /></div>
        ) : sorted.length === 0 ? (
          <div style={{ padding: '32px 20px', textAlign: 'center', color: '#89919a', fontSize: 13 }}>
            No production entries for this filter range.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {[
                  { col: 'entry_date',     label: 'Date'         },
                  { col: 'dept_id',        label: 'Department'   },
                  { col: 'shift',          label: 'Shift'        },
                  { col: 'machine_number', label: 'Machine'      },
                  { col: 'calc_method',    label: 'Method'       },
                  { col: null,             label: 'Inputs'       },
                  { col: 'primary_kg',     label: 'Output (kg)'  },
                  { col: 'theoretical_kg', label: 'Theoretical'  },
                  { col: null,             label: ''             },
                ].map(({ col, label }) => (
                  <th
                    key={label}
                    style={thStyle(col)}
                    onClick={col ? () => toggleSort(col) : undefined}
                  >
                    {label}
                    {sortCol === col && (
                      <span style={{ marginLeft: 4, color: SAP_BLUE }}>{sortDir === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((e, i) => {
                const meta = DEPT_META[e.dept_id] || {}
                const C = { padding: '5px 8px', fontSize: 12, color: '#1d1d1d', borderBottom: '1px solid #eaeaea', borderRight: '1px solid #eaeaea' }
                return (
                  <tr key={e.id}
                    style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}
                    onMouseEnter={ev => ev.currentTarget.style.background = '#f0f4ff'}
                    onMouseLeave={ev => ev.currentTarget.style.background = i % 2 === 0 ? '#fff' : '#fafafa'}
                  >
                    <td style={{ ...C, whiteSpace: 'nowrap', fontFamily: 'var(--mono)', color: '#5a5a5a' }}>
                      {fmtDate(e.entry_date)}
                    </td>
                    <td style={{ ...C, fontWeight: 600 }}>{meta.name}</td>
                    <td style={{ ...C, color: '#5a5a5a' }}>Shift {e.shift}</td>
                    <td style={{ ...C, fontFamily: 'var(--mono)', color: '#8c8c8c' }}>
                      {e.machine_number ? `#${e.machine_number}` : '—'}
                    </td>
                    <td style={{ ...C, fontSize: 11, color: '#8c8c8c', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                      {e.calc_method === 'efficiency' ? 'Efficiency' : 'Hank Meter'}
                    </td>
                    <td style={{ ...C, fontSize: 11, color: '#5a5a5a', fontFamily: 'var(--mono)' }}>
                      {e.calc_method === 'efficiency'
                        ? `${e.std_rate_kg_per_hr} × ${e.efficiency_pct}% × ${e.running_hours}h`
                        : `H=${e.hank_reading} · S=${e.spindle_count} · Ne=${e.ne_count}`
                      }
                    </td>
                    <td style={{ ...C, textAlign: 'right' }}>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, color: SAP_BLUE }}>
                        {fmtKg(e.primary_kg)}
                      </span>
                    </td>
                    <td style={{ ...C, fontFamily: 'var(--mono)', fontSize: 12, color: '#5a5a5a', textAlign: 'right' }}>
                      {e.theoretical_kg ? fmtKg(e.theoretical_kg) : '—'}
                    </td>
                    <td style={{ ...C, borderRight: 'none' }}>
                      <button
                        onClick={() => handleDelete(e.id)}
                        disabled={deleting === e.id}
                        style={{
                          padding: '2px 8px', fontSize: 11,
                          border: '1px solid #e0e0e0', borderRadius: 0,
                          background: '#fff', color: '#6a6d70',
                          cursor: 'pointer', fontFamily: 'var(--font)',
                        }}
                        onMouseEnter={ev => { ev.currentTarget.style.borderColor = '#bb0000'; ev.currentTarget.style.color = '#bb0000' }}
                        onMouseLeave={ev => { ev.currentTarget.style.borderColor = '#e0e0e0'; ev.currentTarget.style.color = '#6a6d70' }}
                      >
                        {deleting === e.id ? '…' : 'Delete'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
