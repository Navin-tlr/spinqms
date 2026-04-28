import { useCallback, useEffect, useState } from 'react'
import {
  convertRecommendationToPO,
  getPurchaseOrders,
  getPurchaseRecommendations,
  receivePurchaseOrder,
} from '../../api.js'
import { Spinner } from '../Primitives.jsx'

const SAP_BLUE = '#012169'
const inputStyle = {
  padding: '5px 8px', fontSize: 12,
  border: '1px solid #89919a', borderRadius: 2,
  background: '#fff', color: '#32363a', fontFamily: 'var(--font)',
}

function fmt(n, unit) {
  return `${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 1 })} ${unit || ''}`
}

export default function PurchaseFlow({ mode = 'requisitions' }) {
  const [recommendations, setRecommendations] = useState([])
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [convert, setConvert] = useState(null)
  const [receipt, setReceipt] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [recs, pos] = await Promise.all([
        getPurchaseRecommendations('open'),
        getPurchaseOrders(),
      ])
      setRecommendations(recs)
      setOrders(pos)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const createPO = async () => {
    await convertRecommendationToPO(convert.id, {
      quantity: Number(convert.quantity),
      rate: Number(convert.rate),
      supplier: convert.supplier || null,
    })
    setConvert(null)
    await load()
  }

  const postReceipt = async () => {
    await receivePurchaseOrder(receipt.po.id, {
      receipt_date: receipt.receipt_date,
      notes: receipt.notes || null,
      lines: receipt.po.lines.map(line => ({
        po_line_id: line.id,
        quantity_received: Number(receipt.quantities[line.id] || 0),
      })).filter(line => line.quantity_received > 0),
    })
    setReceipt(null)
    await load()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ background: '#fff', border: '1px solid #d9dadb', padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#32363a' }}>{mode === 'orders' ? 'Purchase Orders' : 'Purchase Requisitions'}</span>
          <span style={{ fontSize: 11, color: '#89919a', marginLeft: 12 }}>{mode === 'orders' ? 'Purchase orders and goods receipts' : 'MRP-generated internal recommendations'}</span>
        </div>
        <button onClick={load} style={{ ...inputStyle, cursor: 'pointer' }}>Refresh</button>
      </div>

      {loading ? (
        <div style={{ background: '#fff', border: '1px solid #d9dadb', padding: 48, textAlign: 'center' }}><Spinner /></div>
      ) : (
        <>
          {mode === 'requisitions' && <div style={{ background: '#fff', border: '1px solid #d9dadb', overflowX: 'auto' }}>
            <div style={{ padding: '10px 16px', borderBottom: '1px solid #d9dadb', fontSize: 13, fontWeight: 600 }}>Open Purchase Recommendations</div>
            {recommendations.length === 0 ? (
              <div style={{ padding: 24, fontSize: 13, color: '#89919a' }}>No open recommendations.</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Item', 'Suggested Qty', 'Reason', 'Decision Support', 'Created', ''].map(h => (
                      <th key={h} style={{ padding: '7px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#6a6d70', textTransform: 'uppercase', letterSpacing: '.07em', background: '#f5f5f5', borderBottom: '1px solid #d9dadb' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recommendations.map((r, i) => (
                    <tr key={r.id} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                      <td style={{ padding: '8px 12px', fontSize: 12, fontWeight: 600, borderBottom: '1px solid #eeeeee' }}>{r.material_name}</td>
                      <td style={{ padding: '8px 12px', fontFamily: 'var(--mono)', fontSize: 13, color: SAP_BLUE, borderBottom: '1px solid #eeeeee' }}>{fmt(r.suggested_qty, r.unit)}</td>
                      <td style={{ padding: '8px 12px', fontSize: 12, color: '#32363a', borderBottom: '1px solid #eeeeee' }}>{r.reason}</td>
                      <td style={{ padding: '8px 12px', fontSize: 12, color: '#6a6d70', borderBottom: '1px solid #eeeeee' }}>{r.decision_support}</td>
                      <td style={{ padding: '8px 12px', fontSize: 11, color: '#89919a', borderBottom: '1px solid #eeeeee' }}>{new Date(r.created_at).toLocaleDateString('en-IN')}</td>
                      <td style={{ padding: '8px 12px', borderBottom: '1px solid #eeeeee' }}>
                        <button onClick={() => setConvert({ ...r, quantity: r.suggested_qty, rate: '', supplier: '' })} style={{ ...inputStyle, background: SAP_BLUE, color: '#fff', borderColor: SAP_BLUE, cursor: 'pointer' }}>Convert to PO</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>}

          {mode === 'orders' && <div style={{ background: '#fff', border: '1px solid #d9dadb', overflowX: 'auto' }}>
            <div style={{ padding: '10px 16px', borderBottom: '1px solid #d9dadb', fontSize: 13, fontWeight: 600 }}>Purchase Orders</div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['PO', 'Status', 'Supplier', 'Item', 'Ordered', 'Received', 'Rate', ''].map(h => (
                    <th key={h} style={{ padding: '7px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#6a6d70', textTransform: 'uppercase', letterSpacing: '.07em', background: '#f5f5f5', borderBottom: '1px solid #d9dadb' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.flatMap(po => po.lines.map(line => ({ po, line }))).map(({ po, line }, i) => (
                  <tr key={line.id} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <td style={{ padding: '8px 12px', fontFamily: 'var(--mono)', fontSize: 12, borderBottom: '1px solid #eeeeee' }}>{po.po_number}</td>
                    <td style={{ padding: '8px 12px', fontSize: 11, textTransform: 'uppercase', color: '#6a6d70', borderBottom: '1px solid #eeeeee' }}>{po.status}</td>
                    <td style={{ padding: '8px 12px', fontSize: 12, borderBottom: '1px solid #eeeeee' }}>{po.supplier || '—'}</td>
                    <td style={{ padding: '8px 12px', fontSize: 12, fontWeight: 600, borderBottom: '1px solid #eeeeee' }}>{line.material_name}</td>
                    <td style={{ padding: '8px 12px', fontFamily: 'var(--mono)', fontSize: 12, borderBottom: '1px solid #eeeeee' }}>{fmt(line.quantity_ordered, line.unit)}</td>
                    <td style={{ padding: '8px 12px', fontFamily: 'var(--mono)', fontSize: 12, borderBottom: '1px solid #eeeeee' }}>{fmt(line.quantity_received, line.unit)}</td>
                    <td style={{ padding: '8px 12px', fontFamily: 'var(--mono)', fontSize: 12, borderBottom: '1px solid #eeeeee' }}>₹{line.rate}</td>
                    <td style={{ padding: '8px 12px', borderBottom: '1px solid #eeeeee' }}>
                      <button
                        disabled={line.quantity_received >= line.quantity_ordered}
                        onClick={() => setReceipt({
                          po,
                          receipt_date: new Date().toISOString().slice(0, 10),
                          notes: '',
                          quantities: Object.fromEntries(po.lines.map(l => [l.id, Math.max(0, l.quantity_ordered - l.quantity_received)])),
                        })}
                        style={{ ...inputStyle, cursor: 'pointer', color: line.quantity_received >= line.quantity_ordered ? '#89919a' : '#32363a' }}
                      >Receive</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>}
        </>
      )}

      {convert && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10 }}>
          <div style={{ background: '#fff', border: '1px solid #89919a', width: 360 }}>
            <div style={{ padding: '10px 16px', borderBottom: '1px solid #d9dadb', fontSize: 13, fontWeight: 600 }}>Create Purchase Order · {convert.material_name}</div>
            <div style={{ padding: 16, display: 'grid', gap: 10 }}>
              <input value={convert.supplier} onChange={e => setConvert({ ...convert, supplier: e.target.value })} placeholder="Supplier" style={inputStyle} />
              <input type="number" value={convert.quantity} onChange={e => setConvert({ ...convert, quantity: e.target.value })} placeholder="Quantity" style={inputStyle} />
              <input type="number" value={convert.rate} onChange={e => setConvert({ ...convert, rate: e.target.value })} placeholder="Rate" style={inputStyle} />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button onClick={() => setConvert(null)} style={{ ...inputStyle, cursor: 'pointer' }}>Cancel</button>
                <button onClick={createPO} disabled={!convert.rate || !convert.quantity} style={{ ...inputStyle, background: SAP_BLUE, color: '#fff', borderColor: SAP_BLUE, cursor: 'pointer' }}>Create PO</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {receipt && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10 }}>
          <div style={{ background: '#fff', border: '1px solid #89919a', width: 440 }}>
            <div style={{ padding: '10px 16px', borderBottom: '1px solid #d9dadb', fontSize: 13, fontWeight: 600 }}>Goods Receipt · {receipt.po.po_number}</div>
            <div style={{ padding: 16, display: 'grid', gap: 10 }}>
              <input type="date" value={receipt.receipt_date} onChange={e => setReceipt({ ...receipt, receipt_date: e.target.value })} style={inputStyle} />
              {receipt.po.lines.map(line => (
                <div key={line.id} style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 12 }}>{line.material_name}</span>
                  <input type="number" value={receipt.quantities[line.id]} onChange={e => setReceipt({ ...receipt, quantities: { ...receipt.quantities, [line.id]: e.target.value } })} style={inputStyle} />
                </div>
              ))}
              <textarea value={receipt.notes} onChange={e => setReceipt({ ...receipt, notes: e.target.value })} placeholder="Receipt notes" style={{ ...inputStyle, resize: 'vertical' }} />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button onClick={() => setReceipt(null)} style={{ ...inputStyle, cursor: 'pointer' }}>Cancel</button>
                <button onClick={postReceipt} style={{ ...inputStyle, background: SAP_BLUE, color: '#fff', borderColor: SAP_BLUE, cursor: 'pointer' }}>Post GR</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
