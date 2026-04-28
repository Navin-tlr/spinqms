import { useCallback, useEffect, useState } from 'react'
import {
  addMaterialMarketPrice,
  getInventoryMovements,
  getInventoryOverview,
  updateMaterialPlanning,
} from '../../api.js'
import { Spinner } from '../Primitives.jsx'

const SAP_BLUE = '#012169'
const inputStyle = {
  padding: '5px 8px', fontSize: 12,
  border: '1px solid #89919a', borderRadius: 2,
  background: '#fff', color: '#32363a', fontFamily: 'var(--font)',
}

function fmt(n, unit) {
  if (n === null || n === undefined) return '—'
  return `${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 1 })} ${unit || ''}`
}

function statusColor(status) {
  if (status === 'BELOW REORDER LEVEL') return '#bb0000'
  if (status === 'SAFE (CLOSE)') return '#b55b00'
  return '#188f36'
}

export default function InventoryPlanning() {
  const [rows, setRows] = useState([])
  const [movements, setMovements] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [price, setPrice] = useState({ material_id: '', price: '', price_date: new Date().toISOString().slice(0, 10) })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [overview, ledger] = await Promise.all([
        getInventoryOverview(),
        getInventoryMovements({ limit: 50 }),
      ])
      setRows(overview)
      setMovements(ledger)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const savePlanning = async () => {
    await updateMaterialPlanning(editing.material_id, {
      lead_time_days: Number(editing.lead_time_days),
      safety_stock_qty: Number(editing.safety_stock_qty),
      reorder_qty: Number(editing.reorder_qty),
      critical_days_left: Number(editing.critical_days_left || 2),
    })
    setEditing(null)
    await load()
  }

  const savePrice = async () => {
    if (!price.material_id || !price.price) return
    await addMaterialMarketPrice(price.material_id, {
      price_date: price.price_date,
      price: Number(price.price),
    })
    setPrice({ ...price, price: '' })
    await load()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ background: '#fff', border: '1px solid #d9dadb', padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#32363a' }}>Inventory & MRP</span>
          <span style={{ fontSize: 11, color: '#89919a', marginLeft: 12 }}>Movement-led stock, consumption trend, reorder logic</span>
        </div>
        <button onClick={load} style={{ ...inputStyle, cursor: 'pointer' }}>Refresh</button>
      </div>

      {loading ? (
        <div style={{ background: '#fff', border: '1px solid #d9dadb', padding: 48, textAlign: 'center' }}><Spinner /></div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #d9dadb', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Material', 'Stock', 'Avg / Day', 'Days Left', 'Reorder Level', 'Status', 'Action', 'Price', 'MRP'].map(h => (
                  <th key={h} style={{ padding: '7px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#6a6d70', textTransform: 'uppercase', letterSpacing: '.07em', background: '#f5f5f5', borderBottom: '1px solid #d9dadb', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.material_id} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                  <td style={{ padding: '8px 12px', fontSize: 12, fontWeight: 600, color: '#32363a', borderBottom: '1px solid #eeeeee' }}>{r.material_name}</td>
                  <td style={{ padding: '8px 12px', fontFamily: 'var(--mono)', fontSize: 13, color: SAP_BLUE, borderBottom: '1px solid #eeeeee' }}>{fmt(r.stock, r.unit)}</td>
                  <td style={{ padding: '8px 12px', fontFamily: 'var(--mono)', fontSize: 12, color: '#32363a', borderBottom: '1px solid #eeeeee' }}>{fmt(r.avg_consumption_7d, `${r.unit}/day`)}</td>
                  <td style={{ padding: '8px 12px', fontFamily: 'var(--mono)', fontSize: 12, color: '#32363a', borderBottom: '1px solid #eeeeee' }}>{r.days_left ? `~${r.days_left} days` : '—'}</td>
                  <td style={{ padding: '8px 12px', fontFamily: 'var(--mono)', fontSize: 12, color: '#32363a', borderBottom: '1px solid #eeeeee' }}>{fmt(r.reorder_level, r.unit)}</td>
                  <td style={{ padding: '8px 12px', fontSize: 11, fontWeight: 700, color: statusColor(r.status), borderBottom: '1px solid #eeeeee', whiteSpace: 'nowrap' }}>{r.status}</td>
                  <td style={{ padding: '8px 12px', fontSize: 11, color: r.action === 'ORDER NOW' ? '#bb0000' : '#6a6d70', fontWeight: 600, borderBottom: '1px solid #eeeeee' }}>{r.action}</td>
                  <td style={{ padding: '8px 12px', fontSize: 11, color: '#6a6d70', textTransform: 'uppercase', borderBottom: '1px solid #eeeeee' }}>{r.price_trend}</td>
                  <td style={{ padding: '8px 12px', borderBottom: '1px solid #eeeeee' }}>
                    <button onClick={() => setEditing({ ...r, critical_days_left: 2 })} style={{ ...inputStyle, cursor: 'pointer' }}>Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 380px) 1fr', gap: 16 }}>
        <div style={{ background: '#fff', border: '1px solid #d9dadb' }}>
          <div style={{ padding: '10px 16px', borderBottom: '1px solid #d9dadb', fontSize: 13, fontWeight: 600 }}>Market Price</div>
          <div style={{ padding: 16, display: 'grid', gap: 10 }}>
            <select value={price.material_id} onChange={e => setPrice({ ...price, material_id: e.target.value })} style={inputStyle}>
              <option value="">Material</option>
              {rows.map(r => <option key={r.material_id} value={r.material_id}>{r.material_name}</option>)}
            </select>
            <input type="date" value={price.price_date} onChange={e => setPrice({ ...price, price_date: e.target.value })} style={inputStyle} />
            <input type="number" value={price.price} onChange={e => setPrice({ ...price, price: e.target.value })} placeholder="Market price" style={inputStyle} />
            <button onClick={savePrice} style={{ ...inputStyle, background: SAP_BLUE, color: '#fff', borderColor: SAP_BLUE, cursor: 'pointer' }}>Save Price</button>
          </div>
        </div>

        <div style={{ background: '#fff', border: '1px solid #d9dadb', overflowX: 'auto' }}>
          <div style={{ padding: '10px 16px', borderBottom: '1px solid #d9dadb', fontSize: 13, fontWeight: 600 }}>Recent Inventory Movements</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              {movements.slice(0, 12).map(m => (
                <tr key={m.id}>
                  <td style={{ padding: '7px 12px', fontSize: 12, borderBottom: '1px solid #eeeeee' }}>{m.material_name}</td>
                  <td style={{ padding: '7px 12px', fontSize: 11, color: '#6a6d70', borderBottom: '1px solid #eeeeee' }}>{m.source_type}</td>
                  <td style={{ padding: '7px 12px', fontFamily: 'var(--mono)', fontSize: 12, color: m.quantity_delta < 0 ? '#bb0000' : '#188f36', borderBottom: '1px solid #eeeeee' }}>{fmt(m.quantity_delta, m.unit)}</td>
                  <td style={{ padding: '7px 12px', fontSize: 11, color: '#89919a', borderBottom: '1px solid #eeeeee' }}>{m.movement_date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10 }}>
          <div style={{ background: '#fff', border: '1px solid #89919a', width: 360 }}>
            <div style={{ padding: '10px 16px', borderBottom: '1px solid #d9dadb', fontSize: 13, fontWeight: 600 }}>Planning Parameters · {editing.material_name}</div>
            <div style={{ padding: 16, display: 'grid', gap: 10 }}>
              <input type="number" value={editing.lead_time_days} onChange={e => setEditing({ ...editing, lead_time_days: e.target.value })} placeholder="Lead time days" style={inputStyle} />
              <input type="number" value={editing.safety_stock_qty} onChange={e => setEditing({ ...editing, safety_stock_qty: e.target.value })} placeholder="Safety stock" style={inputStyle} />
              <input type="number" value={editing.reorder_qty} onChange={e => setEditing({ ...editing, reorder_qty: e.target.value })} placeholder="Reorder quantity" style={inputStyle} />
              <input type="number" value={editing.critical_days_left} onChange={e => setEditing({ ...editing, critical_days_left: e.target.value })} placeholder="Critical days left" style={inputStyle} />
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => setEditing(null)} style={{ ...inputStyle, cursor: 'pointer' }}>Cancel</button>
                <button onClick={savePlanning} style={{ ...inputStyle, background: SAP_BLUE, color: '#fff', borderColor: SAP_BLUE, cursor: 'pointer' }}>Save</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
