/* ──────────────────────────────────────────────────────────────────────────
   ProductionDashboard — SAP Fiori analytical view
   - Flat bordered KPI tiles (no colours per dept — unified SAP blue)
   - Compact table for recent entries
   - No gradients, no shadows, no rounded corners
────────────────────────────────────────────────────────────────────────── */

import { useState, useEffect, useCallback } from 'react'
import { getProductionDashboard, getProductionEntries } from '../../api.js'
import { Spinner } from '../Primitives.jsx'

const SAP_BLUE = '#0854a0'

const DEPT_META = {
  carding:   { name: 'Carding',    method: 'Efficiency'  },
  breaker:   { name: 'Breaker',    method: 'Efficiency'  },
  rsb:       { name: 'RSB',        method: 'Efficiency'  },
  simplex:   { name: 'Simplex',    method: 'Hank Meter'  },
  ringframe: { name: 'Ring Frame', method: 'Hank Meter'  },
}

const SHIFT_LABEL = { A: 'Shift A', B: 'Shift B', C: 'Shift C' }

function fmtKg(n) {
  if (!n && n !== 0) return '—'
  return n.toLocaleString('en-IN', { maximumFractionDigits: 1 }) + ' kg'
}

/* ── KPI Card — SAP flat tile (Image 03 / 04 pattern) ─────────────────── */
function KpiCard({ dept }) {
  const meta  = DEPT_META[dept.dept_id] || {}
  const total = dept.today_kg || 0
  const hasData = dept.entry_count > 0

  return (
    <div style={{
      background: '#fff',
      border: '1px solid #d9dadb',
      borderTop: `3px solid ${hasData ? SAP_BLUE : '#d9dadb'}`,
      padding: '16px 20px',
      display: 'flex', flexDirection: 'column', gap: 0,
      minWidth: 200,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#32363a' }}>{meta.name}</div>
          <div style={{ fontSize: 11, color: '#89919a', marginTop: 2, textTransform: 'uppercase', letterSpacing: '.06em' }}>
            {meta.method}
          </div>
        </div>
        {hasData && (
          <div style={{
            fontSize: 10, fontWeight: 500,
            color: '#188f36', background: '#f0faf2',
            border: '1px solid #abe2bc', padding: '2px 7px',
          }}>
            {dept.entry_count} {dept.entry_count === 1 ? 'entry' : 'entries'}
          </div>
        )}
      </div>

      {/* Big number — SAP light-weight large figure */}
      <div style={{ marginBottom: 14 }}>
        <div style={{
          fontFamily: 'var(--mono)', fontSize: 32, fontWeight: 300, lineHeight: 1,
          color: hasData ? SAP_BLUE : '#d9dadb',
        }}>
          {fmtKg(total)}
        </div>
        <div style={{ fontSize: 11, color: '#89919a', marginTop: 4 }}>Today's production</div>
      </div>

      {/* Shift breakdown — compact table rows */}
      <div style={{ borderTop: '1px solid #e8e8e8', paddingTop: 10 }}>
        {['A', 'B', 'C'].map(s => {
          const kg = dept[`shift_${s.toLowerCase()}_kg`] || 0
          return (
            <div key={s} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '3px 0', borderBottom: s !== 'C' ? '1px solid #f0f0f0' : 'none',
            }}>
              <span style={{ fontSize: 11, color: '#6a6d70' }}>Shift {s}</span>
              <span style={{
                fontFamily: 'var(--mono)', fontSize: 12,
                color: kg > 0 ? '#32363a' : '#d9dadb',
                fontWeight: kg > 0 ? 500 : 400,
              }}>
                {kg > 0 ? fmtKg(kg) : '—'}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ── Recent Entries table ─────────────────────────────────────────────── */
function RecentEntries({ entries }) {
  const thStyle = {
    padding: '7px 12px', textAlign: 'left',
    fontSize: 11, fontWeight: 600, color: '#6a6d70',
    textTransform: 'uppercase', letterSpacing: '.07em',
    background: '#f5f5f5',
    borderBottom: '1px solid #d9dadb',
    whiteSpace: 'nowrap',
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #d9dadb' }}>
      {/* Table title */}
      <div style={{
        padding: '10px 16px',
        borderBottom: '1px solid #d9dadb',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#32363a' }}>Recent Entries</span>
        <span style={{ fontSize: 11, color: '#89919a' }}>Last 15 across all departments</span>
      </div>

      {entries.length === 0 ? (
        <div style={{ padding: '32px 20px', textAlign: 'center', color: '#89919a', fontSize: 13 }}>
          No production entries recorded.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Department', 'Shift', 'Machine', 'Method', 'Primary Output', 'Theoretical', 'Notes'].map(h => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map((e, i) => {
                const meta = DEPT_META[e.dept_id] || {}
                const odd  = i % 2 === 0
                return (
                  <tr key={e.id} style={{ background: odd ? '#fff' : '#fafafa' }}>
                    <td style={{ padding: '8px 12px', fontSize: 12, color: '#32363a', fontWeight: 500, borderBottom: '1px solid #eeeeee' }}>
                      {meta.name}
                    </td>
                    <td style={{ padding: '8px 12px', fontSize: 12, color: '#32363a', borderBottom: '1px solid #eeeeee' }}>
                      {SHIFT_LABEL[e.shift]}
                    </td>
                    <td style={{ padding: '8px 12px', fontSize: 12, color: '#6a6d70', fontFamily: 'var(--mono)', borderBottom: '1px solid #eeeeee' }}>
                      {e.machine_number ? `#${e.machine_number}` : '—'}
                    </td>
                    <td style={{ padding: '8px 12px', fontSize: 11, color: '#89919a', textTransform: 'uppercase', letterSpacing: '.05em', borderBottom: '1px solid #eeeeee' }}>
                      {e.calc_method === 'efficiency' ? 'Efficiency' : 'Hank Meter'}
                    </td>
                    <td style={{ padding: '8px 12px', borderBottom: '1px solid #eeeeee' }}>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 600, color: SAP_BLUE }}>
                        {fmtKg(e.primary_kg)}
                      </span>
                    </td>
                    <td style={{ padding: '8px 12px', fontFamily: 'var(--mono)', fontSize: 12, color: '#6a6d70', borderBottom: '1px solid #eeeeee' }}>
                      {e.theoretical_kg ? fmtKg(e.theoretical_kg) : '—'}
                    </td>
                    <td style={{ padding: '8px 12px', fontSize: 11, color: '#6a6d70', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', borderBottom: '1px solid #eeeeee' }}>
                      {e.notes || '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════════
   Main
══════════════════════════════════════════════════════════════════════════ */
export default function ProductionDashboard({ setProductionView }) {
  const [dashboard, setDashboard] = useState(null)
  const [recent,    setRecent]    = useState([])
  const [loading,   setLoading]   = useState(true)
  const [selDate,   setSelDate]   = useState(new Date().toISOString().slice(0, 10))

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [dash, entries] = await Promise.all([
        getProductionDashboard(selDate),
        getProductionEntries({ entry_date: selDate, limit: 15 }),
      ])
      setDashboard(dash); setRecent(entries)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [selDate])

  useEffect(() => { load() }, [load])

  const todayStr = new Date().toISOString().slice(0, 10)
  const isToday  = selDate === todayStr

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

      {/* ── SAP action bar ────────────────────────────────────────── */}
      <div style={{
        background: '#fff', border: '1px solid #d9dadb', borderBottom: 'none',
        padding: '8px 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontSize: 13, fontWeight: 400, color: '#32363a' }}>Production Overview</span>
          <span style={{ fontSize: 11, color: '#89919a' }}>
            {isToday ? "Today's shift production" : `Production on ${selDate}`}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="date" value={selDate} max={todayStr}
            onChange={e => setSelDate(e.target.value)}
            style={{
              padding: '5px 10px', fontSize: 12,
              border: '1px solid #89919a', borderRadius: 2,
              background: '#fff', color: '#32363a', fontFamily: 'var(--font)',
            }}
          />
          <button onClick={load} style={{
            padding: '5px 14px', fontSize: 12,
            border: '1px solid #89919a', borderRadius: 2,
            background: '#fff', color: '#32363a', cursor: 'pointer',
            fontFamily: 'var(--font)',
          }}>Refresh</button>
          <button onClick={() => setProductionView('entry')} style={{
            padding: '5px 16px', fontSize: 12, fontWeight: 500,
            border: `1px solid ${SAP_BLUE}`, borderRadius: 2,
            background: SAP_BLUE, color: '#fff', cursor: 'pointer',
            fontFamily: 'var(--font)',
          }}>+ New Entry</button>
        </div>
      </div>

      {loading && (
        <div style={{ background: '#fff', border: '1px solid #d9dadb', padding: 48, textAlign: 'center' }}>
          <Spinner />
        </div>
      )}

      {!loading && dashboard && (
        <>
          {/* ── Total summary bar — flat, no gradient ─────────────── */}
          <div style={{
            background: SAP_BLUE,
            border: `1px solid ${SAP_BLUE}`,
            padding: '14px 20px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,.65)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 4 }}>
                Total Production — All Departments
              </div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 32, fontWeight: 300, color: '#fff', lineHeight: 1 }}>
                {fmtKg(dashboard.total_kg)}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 0, borderLeft: '1px solid rgba(255,255,255,.2)', paddingLeft: 24, marginLeft: 24 }}>
              {['A', 'B', 'C'].map((s, i) => {
                const kg = dashboard.depts.reduce((sum, d) => sum + (d[`shift_${s.toLowerCase()}_kg`] || 0), 0)
                return (
                  <div key={s} style={{
                    textAlign: 'center',
                    padding: '0 20px',
                    borderRight: i < 2 ? '1px solid rgba(255,255,255,.2)' : 'none',
                  }}>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,.6)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 4 }}>
                      Shift {s}
                    </div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 400, color: '#fff' }}>
                      {fmtKg(kg)}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* ── Dept KPI grid ─────────────────────────────────────── */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))',
            gap: 0, borderLeft: '1px solid #d9dadb',
          }}>
            {dashboard.depts.map(dept => (
              <KpiCard key={dept.dept_id} dept={dept} />
            ))}
          </div>

          {/* ── Recent entries ────────────────────────────────────── */}
          <div style={{ marginTop: 16 }}>
            <RecentEntries entries={recent} />
          </div>
        </>
      )}
    </div>
  )
}
