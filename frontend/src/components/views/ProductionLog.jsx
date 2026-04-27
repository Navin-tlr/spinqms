import { useState, useEffect, useCallback } from 'react'
import { getProductionEntries, deleteProductionEntry } from '../../api.js'
import { Spinner } from '../Primitives.jsx'

const DEPT_META = {
  carding:   { name: 'Carding',    color: '#1b5e9e' },
  breaker:   { name: 'Breaker',    color: '#0e7a4a' },
  rsb:       { name: 'RSB',        color: '#6b3a8a' },
  simplex:   { name: 'Simplex',    color: '#b45309' },
  ringframe: { name: 'Ring Frame', color: '#b42626' },
}

const SHIFT_COLORS = { A: '#1b5e9e', B: '#0e7a4a', C: '#6b3a8a' }

function fmtKg(n) {
  if (n === null || n === undefined) return '—'
  return n.toLocaleString('en-IN', { maximumFractionDigits: 1 }) + ' kg'
}

function fmtDate(s) {
  if (!s) return '—'
  const d = new Date(s)
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function ProductionLog() {
  const [entries,   setEntries]   = useState([])
  const [loading,   setLoading]   = useState(true)
  const [deleting,  setDeleting]  = useState(null)

  // Filters
  const today = new Date().toISOString().slice(0, 10)
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)
  const [fromDate, setFromDate] = useState(weekAgo)
  const [toDate,   setToDate]   = useState(today)
  const [deptFilter,  setDeptFilter]  = useState('')
  const [shiftFilter, setShiftFilter] = useState('')

  // Sort
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
      // Client-side date filter (API doesn't support range yet)
      const filtered = data.filter(e => {
        const d = e.entry_date
        return d >= fromDate && d <= toDate
      })
      setEntries(filtered)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
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
    } finally {
      setDeleting(null)
    }
  }

  // Sort
  const sorted = [...entries].sort((a, b) => {
    let av = a[sortCol], bv = b[sortCol]
    if (typeof av === 'string') av = av.toLowerCase()
    if (typeof bv === 'string') bv = bv.toLowerCase()
    if (av === null || av === undefined) return 1
    if (bv === null || bv === undefined) return -1
    return sortDir === 'asc' ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1)
  })

  const toggleSort = col => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('desc') }
  }

  const thStyle = (col) => ({
    padding: '9px 14px',
    textAlign: 'left',
    fontSize: 10, fontWeight: 700, color: '#9b9b9b',
    textTransform: 'uppercase', letterSpacing: '.07em',
    background: '#f7f7f5',
    borderBottom: '1px solid #e8e7e4',
    cursor: 'pointer',
    userSelect: 'none',
    whiteSpace: 'nowrap',
  })

  const totalKg = entries.reduce((s, e) => s + (e.primary_kg || 0), 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#37352F', letterSpacing: '-.01em' }}>
            Production Log
          </div>
          <div style={{ fontSize: 12, color: '#9b9b9b', marginTop: 2 }}>
            Historical shift-wise production records
          </div>
        </div>
        <button
          onClick={load}
          style={{
            padding: '7px 16px', fontSize: 12, fontWeight: 500,
            border: '1px solid #e0e2e6', borderRadius: 6,
            background: '#fff', color: '#37352F', cursor: 'pointer',
            fontFamily: 'var(--font)',
          }}
        >↻ Refresh</button>
      </div>

      {/* Filters */}
      <div style={{
        background: '#fff',
        border: '1px solid #e0e2e6',
        borderRadius: 8,
        padding: '14px 18px',
        display: 'flex',
        gap: 14,
        flexWrap: 'wrap',
        alignItems: 'flex-end',
        boxShadow: '0 1px 3px rgba(0,0,0,.05)',
      }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: '#9b9b9b', marginBottom: 5 }}>From</div>
          <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
            max={toDate}
            style={{ padding: '7px 10px', fontSize: 12, border: '1px solid #d8d8d5', borderRadius: 5, fontFamily: 'var(--font)', color: '#37352F' }} />
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: '#9b9b9b', marginBottom: 5 }}>To</div>
          <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
            min={fromDate} max={today}
            style={{ padding: '7px 10px', fontSize: 12, border: '1px solid #d8d8d5', borderRadius: 5, fontFamily: 'var(--font)', color: '#37352F' }} />
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: '#9b9b9b', marginBottom: 5 }}>Department</div>
          <select
            value={deptFilter}
            onChange={e => setDeptFilter(e.target.value)}
            style={{ padding: '7px 10px', fontSize: 12, border: '1px solid #d8d8d5', borderRadius: 5, fontFamily: 'var(--font)', color: '#37352F', background: '#fff' }}
          >
            <option value="">All Departments</option>
            {Object.entries(DEPT_META).map(([id, m]) => (
              <option key={id} value={id}>{m.name}</option>
            ))}
          </select>
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: '#9b9b9b', marginBottom: 5 }}>Shift</div>
          <select
            value={shiftFilter}
            onChange={e => setShiftFilter(e.target.value)}
            style={{ padding: '7px 10px', fontSize: 12, border: '1px solid #d8d8d5', borderRadius: 5, fontFamily: 'var(--font)', color: '#37352F', background: '#fff' }}
          >
            <option value="">All Shifts</option>
            <option value="A">Shift A</option>
            <option value="B">Shift B</option>
            <option value="C">Shift C</option>
          </select>
        </div>

        {/* Summary chip */}
        {!loading && entries.length > 0 && (
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: '#9b9b9b' }}>{entries.length} records</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 700, color: '#1b5e9e' }}>
              {fmtKg(totalKg)}
            </div>
          </div>
        )}
      </div>

      {/* Table */}
      <div style={{
        background: '#fff',
        border: '1px solid #e0e2e6',
        borderRadius: 8,
        overflow: 'hidden',
        boxShadow: '0 1px 4px rgba(0,0,0,.06)',
      }}>
        {loading ? (
          <div style={{ padding: 48, textAlign: 'center' }}><Spinner /></div>
        ) : sorted.length === 0 ? (
          <div style={{ padding: '40px 24px', textAlign: 'center', color: '#acaba8', fontSize: 13 }}>
            No production entries for this filter range.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {[
                  { col: 'entry_date',  label: 'Date' },
                  { col: 'dept_id',     label: 'Department' },
                  { col: 'shift',       label: 'Shift' },
                  { col: 'machine_number', label: 'Machine' },
                  { col: 'calc_method', label: 'Method' },
                  { col: null,          label: 'Inputs' },
                  { col: 'primary_kg',  label: 'Output (kg)' },
                  { col: 'theoretical_kg', label: 'Theoretical' },
                  { col: null,          label: '' },
                ].map(({ col, label }) => (
                  <th
                    key={label}
                    style={thStyle(col)}
                    onClick={col ? () => toggleSort(col) : undefined}
                  >
                    {label}
                    {sortCol === col && (
                      <span style={{ marginLeft: 4 }}>{sortDir === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((e, i) => {
                const meta = DEPT_META[e.dept_id] || {}
                return (
                  <tr
                    key={e.id}
                    style={{
                      borderBottom: i < sorted.length - 1 ? '1px solid #f0f0ef' : 'none',
                    }}
                  >
                    <td style={{ padding: '10px 14px', fontSize: 12, color: '#37352F', fontWeight: 500, whiteSpace: 'nowrap' }}>
                      {fmtDate(e.entry_date)}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 3, height: 18, borderRadius: 2, background: meta.color, flexShrink: 0 }} />
                        <span style={{ fontSize: 12, fontWeight: 500, color: '#37352F' }}>{meta.name}</span>
                      </div>
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{
                        fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
                        color: SHIFT_COLORS[e.shift] || '#555',
                        background: (SHIFT_COLORS[e.shift] || '#555') + '14',
                      }}>
                        {e.shift}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: '#787774', fontFamily: 'var(--mono)' }}>
                      {e.machine_number ? `#${e.machine_number}` : '—'}
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 10, color: '#9b9b9b', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                      {e.calc_method === 'efficiency' ? 'Efficiency' : 'Hank Meter'}
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 11, color: '#787774', fontFamily: 'var(--mono)' }}>
                      {e.calc_method === 'efficiency'
                        ? `${e.std_rate_kg_per_hr} × ${e.efficiency_pct}% × ${e.running_hours}h`
                        : `H=${e.hank_reading} · S=${e.spindle_count} · Ne=${e.ne_count}`
                      }
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{
                        fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 700,
                        color: '#1b5e9e',
                      }}>
                        {fmtKg(e.primary_kg)}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', fontFamily: 'var(--mono)', fontSize: 12, color: '#787774' }}>
                      {e.theoretical_kg ? fmtKg(e.theoretical_kg) : '—'}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <button
                        onClick={() => handleDelete(e.id)}
                        disabled={deleting === e.id}
                        style={{
                          padding: '3px 8px', fontSize: 11,
                          border: '1px solid #FECACA', borderRadius: 4,
                          background: '#FEF2F2', color: '#B42626',
                          cursor: 'pointer', fontFamily: 'var(--font)',
                        }}
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
