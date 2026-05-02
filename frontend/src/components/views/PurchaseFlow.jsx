import { useCallback, useEffect, useState } from 'react'
import {
  convertRecommendationToPO,
  getBusinessPartners,
  getPurchaseOrders,
  getPurchaseRecommendations,
  receivePurchaseOrder,
} from '../../api.js'
import { Spinner } from '../Primitives.jsx'

/* ── Design tokens (local, matching system palette) ───────────────────────── */
const NAVY   = '#012169'
const SAP_BLUE = '#0070f2'
const BD     = '#cccccc'
const TX     = '#1d1d1d'
const TX2    = '#5a5a5a'
const TX3    = '#8c8c8c'
const BG_HD  = '#e8e8e8'
const BG_ROW_ALT = '#f5f5f5'
const BG_PAGE = '#f2f6fa'

const cell  = {
  padding: '5px 8px',
  borderBottom: '1px solid #e0e0e0',
  borderRight: '1px solid #e0e0e0',
  fontSize: 12,
  color: TX,
}
const thSt  = {
  padding: '5px 8px',
  textAlign: 'left',
  fontSize: 11,
  fontWeight: 700,
  color: TX,
  textTransform: 'uppercase',
  letterSpacing: '.05em',
  background: BG_HD,
  border: `1px solid ${BD}`,
  whiteSpace: 'nowrap',
}
const input = {
  padding: '4px 7px',
  fontSize: 12,
  border: '1px solid #bfbfbf',
  borderRadius: 2,
  background: '#fff',
  color: TX,
  fontFamily: 'var(--font)',
  boxSizing: 'border-box',
  outline: 'none',
}
const readOnly = { ...input, border: `1px solid ${BD}`, background: BG_HD, color: TX2 }

function fmt(n) {
  if (n === null || n === undefined) return '—'
  return Number(n).toLocaleString('en-IN', { maximumFractionDigits: 3 })
}

/* ── Status badge ─────────────────────────────────────────────────────────── */
function StatusBadge({ status }) {
  const map = {
    open:     { color: '#0064d9', bg: '#ebf4ff' },
    partial:  { color: '#e6600d', bg: '#fff8f0' },
    received: { color: '#188f36', bg: '#f0faf2' },
  }
  const s = map[status] || { color: TX2, bg: BG_HD }
  return (
    <span style={{
      padding: '2px 8px', fontSize: 10, fontWeight: 700, borderRadius: 2,
      background: s.bg, color: s.color,
      textTransform: 'uppercase', letterSpacing: '.06em',
    }}>
      {status}
    </span>
  )
}

/* ══════════════════════════════════════════════════════════════════════════
   GoodsReceiptScreen — SAP-style header + line-item table
   Replaces the old popup modal. Rendered full-width when a PO is selected.
══════════════════════════════════════════════════════════════════════════ */
function GoodsReceiptScreen({ po, onPost, onCancel }) {
  const today = new Date().toISOString().slice(0, 10)
  const [receiptDate, setReceiptDate] = useState(today)
  const [notes, setNotes]             = useState('')
  const [posting, setPosting]         = useState(false)
  const [error, setError]             = useState('')

  /* Pre-fill each line with the full remaining qty */
  const [quantities, setQuantities] = useState(() =>
    Object.fromEntries(
      po.lines.map(l => [l.id, Math.max(0, l.quantity_ordered - l.quantity_received)])
    )
  )

  const setQty = (lineId, raw) => {
    const line      = po.lines.find(l => l.id === lineId)
    const remaining = line.quantity_ordered - line.quantity_received
    const parsed    = Math.min(Math.max(0, Number(raw) || 0), remaining)
    setQuantities(prev => ({ ...prev, [lineId]: parsed }))
  }

  const totalReceiving = po.lines.reduce((s, l) => s + Number(quantities[l.id] || 0), 0)
  const canPost        = totalReceiving > 0 && !posting

  const post = async () => {
    setPosting(true)
    setError('')
    try {
      const lines = po.lines
        .map(l => ({ po_line_id: l.id, quantity_received: Number(quantities[l.id] || 0) }))
        .filter(l => l.quantity_received > 0)
      await onPost(po.id, { receipt_date: receiptDate, notes: notes || null, lines })
    } catch (e) {
      setError(e?.response?.data?.detail || 'Posting failed. Please try again.')
      setPosting(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

      {/* ── Page bar ── */}
      <div style={{
        background: '#fff', border: `1px solid ${BD}`, borderBottom: 'none',
        padding: '10px 16px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div>
          <span style={{ fontSize: 13, fontWeight: 600, color: TX }}>Goods Receipt</span>
          <span style={{ fontSize: 11, color: TX3, marginLeft: 12 }}>
            Post stock receipt against purchase order
          </span>
        </div>
        <button onClick={onCancel} style={{ ...input, cursor: 'pointer' }}>
          ← Back to Orders
        </button>
      </div>

      {/* ── Document header ── */}
      <div style={{
        background: '#fff', border: `1px solid ${BD}`, borderBottom: 'none',
        padding: '14px 16px',
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '180px 200px 220px 1fr',
          gap: 16, alignItems: 'end',
        }}>
          <div>
            <div style={{ fontSize: 11, color: TX2, marginBottom: 4 }}>Receipt Date</div>
            <input
              type="date" value={receiptDate} max={today}
              onChange={e => setReceiptDate(e.target.value)}
              style={{ ...input, width: '100%' }}
            />
          </div>
          <div>
            <div style={{ fontSize: 11, color: TX2, marginBottom: 4 }}>Supplier</div>
            <div style={{ ...readOnly, padding: '5px 8px' }}>{po.business_partner_name || po.supplier || '—'}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: TX2, marginBottom: 4 }}>Reference PO</div>
            <div style={{
              ...readOnly, padding: '5px 8px',
              fontFamily: 'var(--mono)', color: NAVY, fontWeight: 600,
            }}>
              {po.po_number}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: TX2, marginBottom: 4 }}>Notes (optional)</div>
            <input
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Delivery notes, vehicle no., etc."
              style={{ ...input, width: '100%' }}
            />
          </div>
        </div>
      </div>

      {/* ── Line items table ── */}
      <div style={{ background: '#fff', border: `1px solid ${BD}`, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['#', 'Material', 'Ordered Qty', 'Already Received', 'Remaining', 'Receiving Now', 'Unit'].map(h => (
                <th key={h} style={thSt}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {po.lines.map((line, idx) => {
              const remaining      = Math.max(0, line.quantity_ordered - line.quantity_received)
              const fullyReceived  = remaining <= 0
              return (
                <tr key={line.id} style={{ background: fullyReceived ? '#fafafa' : '#fff' }}>
                  <td style={{ ...cell, width: 40, color: TX2, fontFamily: 'var(--mono)' }}>
                    {idx + 1}
                  </td>
                  <td style={{ ...cell, fontWeight: 600 }}>{line.material_name}</td>
                  <td style={{ ...cell, fontFamily: 'var(--mono)' }}>
                    {fmt(line.quantity_ordered)}
                  </td>
                  <td style={{
                    ...cell, fontFamily: 'var(--mono)',
                    color: line.quantity_received > 0 ? '#188f36' : TX2,
                  }}>
                    {fmt(line.quantity_received)}
                  </td>
                  <td style={{
                    ...cell, fontFamily: 'var(--mono)',
                    color: fullyReceived ? TX3 : TX,
                  }}>
                    {fullyReceived ? '—' : fmt(remaining)}
                  </td>
                  <td style={{ ...cell, width: 170 }}>
                    {fullyReceived ? (
                      <span style={{ fontSize: 11, color: '#188f36', fontWeight: 600 }}>
                        Fully received ✓
                      </span>
                    ) : (
                      <input
                        type="number" min={0} max={remaining} step={0.001}
                        value={quantities[line.id]}
                        onChange={e => setQty(line.id, e.target.value)}
                        style={{ ...input, width: '100%', fontFamily: 'var(--mono)' }}
                      />
                    )}
                  </td>
                  <td style={{ ...cell, fontFamily: 'var(--mono)', color: TX2 }}>
                    {line.unit}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ── Action footer ── */}
      <div style={{
        background: '#fff', border: `1px solid ${BD}`, borderTop: 'none',
        padding: '10px 16px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div style={{ fontSize: 12, color: TX2 }}>
          Total receiving:{' '}
          <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: NAVY }}>
            {fmt(totalReceiving)} {po.lines[0]?.unit || ''}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {error && <span style={{ fontSize: 12, color: '#bb0000' }}>{error}</span>}
          <button onClick={onCancel} style={{ ...input, cursor: 'pointer' }}>Cancel</button>
          <button
            disabled={!canPost}
            onClick={post}
            style={{
              ...input,
              background:  canPost ? NAVY : BG_HD,
              color:       canPost ? '#fff' : TX3,
              borderColor: canPost ? NAVY : BD,
              cursor:      canPost ? 'pointer' : 'not-allowed',
              fontWeight:  600,
            }}
          >
            {posting ? 'Posting…' : 'Post GR'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════════
   PurchaseFlow — main component (Requisitions | Orders views)
══════════════════════════════════════════════════════════════════════════ */
export default function PurchaseFlow({ mode = 'requisitions' }) {
  const [recommendations, setRecommendations] = useState([])
  const [orders,          setOrders]          = useState([])
  const [mmVendors,       setMmVendors]       = useState([])
  const [loading,         setLoading]         = useState(true)
  const [convert,         setConvert]         = useState(null)  // recommendation being converted
  const [grPO,            setGrPO]            = useState(null)  // PO whose GR screen is open

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [recs, pos, vendors] = await Promise.all([
        getPurchaseRecommendations('open'),
        getPurchaseOrders(),
        getBusinessPartners('MM_VENDOR'),
      ])
      setRecommendations(recs)
      setOrders(pos)
      setMmVendors(vendors)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  /* ── Create PO from recommendation ── */
  const createPO = async () => {
    await convertRecommendationToPO(convert.id, {
      quantity:            Number(convert.quantity),
      rate:                Number(convert.rate),
      business_partner_id: convert.bp_id ? Number(convert.bp_id) : undefined,
      supplier:            !convert.bp_id ? (convert.supplier || null) : undefined,
    })
    setConvert(null)
    await load()
  }

  /* ── Post GR and return to PO list ── */
  const postReceipt = async (poId, body) => {
    await receivePurchaseOrder(poId, body)
    setGrPO(null)
    await load()
  }

  /* ── Full-page GR screen overrides the list view ── */
  if (grPO) {
    return (
      <GoodsReceiptScreen
        po={grPO}
        onPost={postReceipt}
        onCancel={() => setGrPO(null)}
      />
    )
  }

  /* ── Normal list view ── */
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, background: BG_PAGE, padding: 2 }}>

      {/* Page bar */}
      <div style={{
        background: '#fff', border: `1px solid ${BD}`,
        padding: '10px 16px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div>
          <span style={{ fontSize: 13, fontWeight: 600, color: TX }}>
            {mode === 'orders' ? 'Purchase Orders' : 'Purchase Requisitions'}
          </span>
          <span style={{ fontSize: 11, color: TX3, marginLeft: 12 }}>
            {mode === 'orders'
              ? 'Receive deliveries to update stock'
              : 'MRP-generated internal recommendations'}
          </span>
        </div>
        <button onClick={load} style={{ ...input, cursor: 'pointer' }}>Refresh</button>
      </div>

      {loading ? (
        <div style={{
          background: '#fff', border: `1px solid ${BD}`,
          padding: 48, textAlign: 'center',
        }}>
          <Spinner />
        </div>
      ) : (
        <>
          {/* ── Requisitions ── */}
          {mode === 'requisitions' && (
            <div style={{ background: '#fff', border: `1px solid ${BD}`, overflowX: 'auto' }}>
              <div style={{
                padding: '10px 16px', borderBottom: `1px solid ${BD}`,
                fontSize: 13, fontWeight: 600,
              }}>
                Open Purchase Recommendations
              </div>
              {recommendations.length === 0 ? (
                <div style={{ padding: 24, fontSize: 13, color: TX3 }}>
                  No open recommendations. Run MRP from the Planning screen.
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {['Item', 'Suggested Qty', 'Reason', 'Decision Support', 'Created', ''].map(h => (
                        <th key={h} style={thSt}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {recommendations.map((r, i) => (
                      <tr key={r.id} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                        <td style={{ ...cell, fontWeight: 600 }}>{r.material_name}</td>
                        <td style={{ ...cell, fontFamily: 'var(--mono)', color: NAVY }}>
                          {fmt(r.suggested_qty)} {r.unit}
                        </td>
                        <td style={cell}>{r.reason}</td>
                        <td style={{ ...cell, color: TX2 }}>{r.decision_support}</td>
                        <td style={{ ...cell, color: TX3, fontSize: 11 }}>
                          {new Date(r.created_at).toLocaleDateString('en-IN')}
                        </td>
                        <td style={cell}>
                          <button
                            onClick={() => setConvert({ ...r, quantity: r.suggested_qty, rate: '', bp_id: '', supplier: '' })}
                            style={{ ...input, background: NAVY, color: '#fff', borderColor: NAVY, cursor: 'pointer' }}
                          >
                            Convert to PO
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* ── Purchase Orders ── */}
          {mode === 'orders' && (
            <div style={{ background: '#fff', border: `1px solid ${BD}`, overflowX: 'auto' }}>
              <div style={{
                padding: '10px 16px', borderBottom: `1px solid ${BD}`,
                fontSize: 13, fontWeight: 600,
              }}>
                Purchase Orders
              </div>
              {orders.length === 0 ? (
                <div style={{ padding: 24, fontSize: 13, color: TX3 }}>
                  No purchase orders. Convert a recommendation from the Requisitions screen.
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {['PO Number', 'Status', 'Supplier', 'Materials', 'Ordered', 'Received', 'Order Date', ''].map(h => (
                        <th key={h} style={thSt}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((po, i) => {
                      const totalOrdered  = po.lines.reduce((s, l) => s + l.quantity_ordered,  0)
                      const totalReceived = po.lines.reduce((s, l) => s + l.quantity_received, 0)
                      const unit          = po.lines[0]?.unit || ''
                      const materials     = po.lines.map(l => l.material_name).join(', ')
                      const fullyDone     = po.status === 'received'

                      return (
                        <tr key={po.id} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                          <td style={{ ...cell, fontFamily: 'var(--mono)', fontWeight: 600, color: NAVY }}>
                            {po.po_number}
                          </td>
                          <td style={cell}>
                            <StatusBadge status={po.status} />
                          </td>
                          <td style={cell}>{po.business_partner_name || po.supplier || '—'}</td>
                          <td style={{ ...cell, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {materials}
                          </td>
                          <td style={{ ...cell, fontFamily: 'var(--mono)' }}>
                            {fmt(totalOrdered)} {unit}
                          </td>
                          <td style={{
                            ...cell, fontFamily: 'var(--mono)',
                            color: totalReceived > 0 ? '#188f36' : TX2,
                          }}>
                            {fmt(totalReceived)} {unit}
                          </td>
                          <td style={{ ...cell, color: TX2 }}>
                            {String(po.order_date)}
                          </td>
                          <td style={cell}>
                            <button
                              disabled={fullyDone}
                              onClick={() => setGrPO(po)}
                              style={{
                                ...input,
                                background:  fullyDone ? BG_HD : NAVY,
                                color:       fullyDone ? TX3 : '#fff',
                                borderColor: fullyDone ? BD : NAVY,
                                cursor:      fullyDone ? 'not-allowed' : 'pointer',
                                fontWeight:  600,
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {fullyDone ? 'Complete' : 'Post GR'}
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </>
      )}

      {/* ── Convert to PO modal (recommendation → PO) ── */}
      {convert && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.18)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10,
        }}>
          <div style={{ background: '#fff', border: `1px solid ${TX3}`, width: 360 }}>
            <div style={{
              padding: '10px 16px', borderBottom: `1px solid ${BD}`,
              fontSize: 13, fontWeight: 600,
            }}>
              Create Purchase Order · {convert.material_name}
            </div>
            <div style={{ padding: 16, display: 'grid', gap: 10 }}>
              <div>
                <div style={{ fontSize: 11, color: TX2, marginBottom: 4 }}>
                  Business Partner (MM Vendor) *
                </div>
                {mmVendors.length === 0 ? (
                  <div style={{ fontSize: 11, color: '#bb0000' }}>
                    No active MM_VENDOR partners — add one in Master Data → Business Partners
                  </div>
                ) : (
                  <select
                    value={convert.bp_id}
                    onChange={e => setConvert({ ...convert, bp_id: e.target.value })}
                    style={{ ...input, width: '100%' }}
                  >
                    <option value="">— Select vendor —</option>
                    {mmVendors
                      .filter(bp => bp.status === 'Active')
                      .map(bp => (
                        <option key={bp.id} value={bp.id}>
                          {bp.bp_code} · {bp.name}
                        </option>
                      ))}
                  </select>
                )}
              </div>
              <div>
                <div style={{ fontSize: 11, color: TX2, marginBottom: 4 }}>Quantity ({convert.unit})</div>
                <input
                  type="number" value={convert.quantity}
                  onChange={e => setConvert({ ...convert, quantity: e.target.value })}
                  style={{ ...input, width: '100%', fontFamily: 'var(--mono)' }}
                />
              </div>
              <div>
                <div style={{ fontSize: 11, color: TX2, marginBottom: 4 }}>Rate (₹/{convert.unit})</div>
                <input
                  type="number" value={convert.rate}
                  onChange={e => setConvert({ ...convert, rate: e.target.value })}
                  placeholder="0.00"
                  style={{ ...input, width: '100%', fontFamily: 'var(--mono)' }}
                />
              </div>
              {(() => {
                const canCreate = convert.bp_id && convert.rate && convert.quantity
                return (
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
                    <button onClick={() => setConvert(null)} style={{ ...input, cursor: 'pointer' }}>
                      Cancel
                    </button>
                    <button
                      onClick={createPO}
                      disabled={!canCreate}
                      style={{
                        ...input,
                        background:  canCreate ? NAVY : BG_HD,
                        color:       canCreate ? '#fff' : TX3,
                        borderColor: canCreate ? NAVY : BD,
                        cursor:      canCreate ? 'pointer' : 'not-allowed',
                        fontWeight:  600,
                      }}
                    >
                      Create PO
                    </button>
                  </div>
                )
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
