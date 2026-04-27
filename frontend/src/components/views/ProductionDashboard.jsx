import { useState, useEffect, useCallback } from 'react'
import { getProductionDashboard, getProductionEntries } from '../../api.js'
import { Spinner } from '../Primitives.jsx'

const DEPT_META = {
  carding:   { name: 'Carding',    icon: '⚙', method: 'efficiency',  color: '#1b5e9e' },
  breaker:   { name: 'Breaker',    icon: '⚙', method: 'efficiency',  color: '#0e7a4a' },
  rsb:       { name: 'RSB',        icon: '⚙', method: 'efficiency',  color: '#6b3a8a' },
  simplex:   { name: 'Simplex',    icon: '🧵', method: 'hank_meter',  color: '#b45309' },
  ringframe: { name: 'Ring Frame', icon: '🔄', method: 'hank_meter',  color: '#b42626' },
}

const SHIFT_COLORS = { A: '#1b5e9e', B: '#0e7a4a', C: '#6b3a8a' }

function fmtKg(n) {
  if (!n && n !== 0) return '—'
  return n.toLocaleString('en-IN', { maximumFractionDigits: 1 }) + ' kg'
}

function KpiCard({ dept }) {
  const meta = DEPT_META[dept.dept_id] || {}
  const total = dept.today_kg
  const pct = total > 0 ? 100 : 0   // would compare vs target in future

  return (
    <div style={{
      background: '#fff',
      border: '1px solid #e0e2e6',
      borderRadius: 8,
      padding: '20px 24px',
      display: 'flex',
      flexDirection: 'column',
      gap: 16,
      boxShadow: '0 1px 4px rgba(0,0,0,.06)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 32, height: 32,
            borderRadius: 6,
            background: meta.color + '14',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16,
          }}>{meta.icon}</div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#37352F', letterSpacing: '.02em' }}>
              {dept.dept_name}
            </div>
            <div style={{ fontSize: 10, color: '#9b9b9b', textTransform: 'uppercase', letterSpacing: '.08em' }}>
              {dept.calc_method === 'efficiency' ? 'Efficiency method' : 'Hank meter method'}
            </div>
          </div>
        </div>
        {dept.entry_count > 0 && (
          <span style={{
            fontSize: 10, fontWeight: 500, color: '#2D9A4E',
            background: '#F0FDF4', border: '1px solid #BBF7D0',
            padding: '2px 8px', borderRadius: 20,
          }}>
            {dept.entry_count} {dept.entry_count === 1 ? 'entry' : 'entries'}
          </span>
        )}
      </div>

      {/* Big number */}
      <div style={{ lineHeight: 1 }}>
        <div style={{
          fontFamily: 'var(--mono)', fontSize: 32, fontWeight: 600,
          color: total > 0 ? meta.color : '#c7c6c3',
        }}>
          {fmtKg(total)}
        </div>
        <div style={{ fontSize: 11, color: '#9b9b9b', marginTop: 4 }}>Today's production</div>
      </div>

      {/* Shift breakdown */}
      <div style={{ display: 'flex', gap: 8 }}>
        {['A', 'B', 'C'].map(s => {
          const kg = dept[`shift_${s.toLowerCase()}_kg`]
          return (
            <div key={s} style={{
              flex: 1,
              padding: '8px 10px',
              background: '#f7f7f5',
              border: '1px solid #e8e7e4',
              borderRadius: 6,
            }}>
              <div style={{
                fontSize: 9, fontWeight: 600, textTransform: 'uppercase',
                letterSpacing: '.1em', color: SHIFT_COLORS[s], marginBottom: 3,
              }}>
                Shift {s}
              </div>
              <div style={{
                fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 500,
                color: kg > 0 ? '#37352F' : '#c7c6c3',
              }}>
                {kg > 0 ? fmtKg(kg) : '—'}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function RecentEntries({ entries }) {
  return (
    <div style={{
      background: '#fff',
      border: '1px solid #e0e2e6',
      borderRadius: 8,
      overflow: 'hidden',
      boxShadow: '0 1px 4px rgba(0,0,0,.06)',
    }}>
      <div style={{
        padding: '14px 20px',
        borderBottom: '1px solid #f0f0ef',
        fontSize: 12, fontWeight: 600, color: '#37352F',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <span>Recent Entries</span>
        <span style={{
          fontSize: 11, fontWeight: 400, color: '#9b9b9b',
          marginLeft: 'auto',
        }}>last 15 across all departments</span>
      </div>

      {entries.length === 0 ? (
        <div style={{ padding: '32px 20px', textAlign: 'center', color: '#acaba8', fontSize: 13 }}>
          No production entries recorded today.
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f7f7f5' }}>
              {['Department', 'Shift', 'Machine', 'Method', 'Primary Output', 'Theoretical', 'Notes'].map(h => (
                <th key={h} style={{
                  padding: '8px 14px', textAlign: 'left',
                  fontSize: 10, fontWeight: 600, color: '#9b9b9b',
                  textTransform: 'uppercase', letterSpacing: '.06em',
                  borderBottom: '1px solid #e8e7e4',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {entries.map((e, i) => {
              const meta = DEPT_META[e.dept_id] || {}
              return (
                <tr key={e.id} style={{
                  borderBottom: i < entries.length - 1 ? '1px solid #f0f0ef' : 'none',
                  transition: 'background .1s',
                }}>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{
                        width: 3, height: 20, borderRadius: 2, background: meta.color,
                      }} />
                      <span style={{ fontSize: 12, fontWeight: 500, color: '#37352F' }}>
                        {meta.name}
                      </span>
                    </div>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{
                      fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
                      color: SHIFT_COLORS[e.shift],
                      background: SHIFT_COLORS[e.shift] + '14',
                    }}>
                      Shift {e.shift}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 12, color: '#787774' }}>
                    {e.machine_number ? `#${e.machine_number}` : '—'}
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 11, color: '#9b9b9b', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                    {e.calc_method === 'efficiency' ? 'Efficiency' : 'Hank Meter'}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{
                      fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 600,
                      color: '#1b5e9e',
                    }}>
                      {fmtKg(e.primary_kg)}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px', fontFamily: 'var(--mono)', fontSize: 12, color: '#787774' }}>
                    {e.theoretical_kg ? fmtKg(e.theoretical_kg) : '—'}
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 11, color: '#787774', maxWidth: 200 }}>
                    {e.notes || '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}

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
      setDashboard(dash)
      setRecent(entries)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [selDate])

  useEffect(() => { load() }, [load])

  const todayStr = new Date().toISOString().slice(0, 10)
  const isToday  = selDate === todayStr

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#37352F', letterSpacing: '-.01em' }}>
            Production Overview
          </div>
          <div style={{ fontSize: 12, color: '#9b9b9b', marginTop: 2 }}>
            {isToday ? "Today's shift production" : `Production on ${selDate}`}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input
            type="date"
            value={selDate}
            max={todayStr}
            onChange={e => setSelDate(e.target.value)}
            style={{
              padding: '7px 12px', fontSize: 12, border: '1px solid #e0e2e6',
              borderRadius: 6, background: '#fff', color: '#37352F',
              fontFamily: 'var(--font)', cursor: 'pointer',
            }}
          />
          <button
            onClick={load}
            style={{
              padding: '7px 16px', fontSize: 12, fontWeight: 500,
              border: '1px solid #e0e2e6', borderRadius: 6,
              background: '#fff', color: '#37352F', cursor: 'pointer',
              fontFamily: 'var(--font)',
            }}
          >↻ Refresh</button>
          <button
            onClick={() => setProductionView('entry')}
            style={{
              padding: '7px 16px', fontSize: 12, fontWeight: 600,
              border: 'none', borderRadius: 6,
              background: '#1b5e9e', color: '#fff', cursor: 'pointer',
              fontFamily: 'var(--font)',
            }}
          >+ New Entry</button>
        </div>
      </div>

      {loading && <div style={{ padding: 48, textAlign: 'center' }}><Spinner /></div>}

      {!loading && dashboard && (
        <>
          {/* Total kg summary strip */}
          <div style={{
            background: '#1b5e9e',
            borderRadius: 8,
            padding: '18px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            boxShadow: '0 2px 8px rgba(27,94,158,.2)',
          }}>
            <div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,.7)', textTransform: 'uppercase', letterSpacing: '.12em', marginBottom: 4 }}>
                Total Production — All Departments
              </div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 36, fontWeight: 700, color: '#fff', lineHeight: 1 }}>
                {fmtKg(dashboard.total_kg)}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 24 }}>
              {['A', 'B', 'C'].map(s => {
                const kg = dashboard.depts.reduce((sum, d) => sum + (d[`shift_${s.toLowerCase()}_kg`] || 0), 0)
                return (
                  <div key={s} style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,.65)', textTransform: 'uppercase', letterSpacing: '.1em' }}>Shift {s}</div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 600, color: '#fff' }}>{fmtKg(kg)}</div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Dept KPI grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {dashboard.depts.map(dept => (
              <KpiCard key={dept.dept_id} dept={dept} />
            ))}
          </div>

          {/* Recent entries table */}
          <RecentEntries entries={recent} />
        </>
      )}
    </div>
  )
}
