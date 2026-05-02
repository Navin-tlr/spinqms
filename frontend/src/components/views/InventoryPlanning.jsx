import { useCallback, useEffect, useRef, useState } from 'react'
import {
  addMaterialMarketPrice,
  archiveMaterial,
  createMaterial,
  createMaterialIssue,
  deleteMaterial,
  getBusinessPartners,
  getInventoryMovements,
  getInventoryOverview,
  getStockLots,
  getMaterials,
  postDirectGR,
  resetInventory,
  updateMaterial,
  updateMaterialPlanning,
} from '../../api.js'
import { Spinner } from '../Primitives.jsx'

/* ── Design tokens (SAP Fiori high-density) ────────────────────────────────── */
const B      = '#0a6ed1'
const SAP_BLUE = '#0070f2'
const BD     = '#cccccc'
const ERR    = '#bb0000'
const OK     = '#188f36'
const BG_HD  = '#e8e8e8'
const BG_PAGE = '#f2f6fa'

const cell  = {
  padding: '5px 8px',
  fontSize: 12,
  borderBottom: '1px solid #e0e0e0',
  borderRight:  '1px solid #e0e0e0',
  color: '#1d1d1d',
}
const hCell = {
  padding: '5px 8px',
  fontSize: 11,
  fontWeight: 700,
  color: '#1d1d1d',
  textTransform: 'uppercase',
  letterSpacing: '.05em',
  background: BG_HD,
  border: `1px solid ${BD}`,
  whiteSpace: 'nowrap',
}
const inp = {
  padding: '4px 7px',
  fontSize: 12,
  border: '1px solid #bfbfbf',
  borderRadius: 2,
  background: '#fff',
  color: '#1d1d1d',
  fontFamily: 'var(--font)',
  boxSizing: 'border-box',
  outline: 'none',
}
const sapSel = (extra = {}) => ({
  ...inp,
  appearance: 'none',
  WebkitAppearance: 'none',
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='5' viewBox='0 0 8 5'%3E%3Cpath d='M0 0l4 5 4-5z' fill='%23666666'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 7px center',
  paddingRight: 22,
  cursor: 'pointer',
  ...extra,
})
const btn = (active = true, danger = false) => ({
  ...inp,
  cursor: active ? 'pointer' : 'not-allowed',
  background:  danger ? ERR : active ? B : '#e8e8e8',
  color:       active ? '#fff' : '#8c8c8c',
  borderColor: danger ? ERR : active ? B : BD,
  fontWeight: 600,
  opacity: active ? 1 : 0.6,
})

/* ── MRP / EOQ defaults ─────────────────────────────────────────────────────── */
const EOQ_ORDER_COST   = 500    // ₹ cost to place one order (default)
const EOQ_HOLDING_PCT  = 0.20   // 20% of unit cost per year (default)

function calcEOQ(avgDaily, unitCost) {
  const annual = avgDaily * 365
  if (!annual || annual <= 0) return null
  const cost = unitCost || 1000   // fallback unit cost when no market price
  return Math.round(Math.sqrt((2 * annual * EOQ_ORDER_COST) / (cost * EOQ_HOLDING_PCT)))
}

const COMMON_UNITS = ['Bales', 'Kg', 'Cones', 'Bobbins', 'Bags', 'Litres', 'Nos', 'Rolls']
const MAT_CATEGORIES = ['Raw Material', 'Dyes & Chemicals', 'Packing Material', 'Spare Parts', 'Consumables', 'Other']

/* ── Helpers ───────────────────────────────────────────────────────────────── */
function fmt(n, unit = '') {
  if (n === null || n === undefined) return '-'
  return `${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}${unit ? ' ' + unit : ''}`
}
function fmtMoney(n) {
  if (n === null || n === undefined || n === '') return '—'
  return `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
}
function statusColor(s) {
  if (s === 'BELOW REORDER LEVEL') return ERR
  if (s === 'SAFE (CLOSE)') return '#b55b00'
  return OK
}
function errMsg(e) { return e?.response?.data?.detail || e?.message || 'An error occurred' }

/* ── PageBar ────────────────────────────────────────────────────────────────── */
function PageBar({ title, subtitle, onRefresh, children }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #d9dadb', borderBottom: 'none',
                  padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#32363a' }}>{title}</span>
        <span style={{ fontSize: 11, color: '#89919a', marginLeft: 12 }}>{subtitle}</span>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {children}
        <button onClick={onRefresh} style={{ ...inp, cursor: 'pointer' }}>Refresh</button>
      </div>
    </div>
  )
}


/* ══════════════════════════════════════════════════════════════════════════════
   STOCK OVERVIEW  (per-lot — opening / receipts MTD / issues MTD / closing)
══════════════════════════════════════════════════════════════════════════════ */
function StockOverview({ stockLots, loading }) {
  const today = new Date()
  const monthLabel = today.toLocaleString('en-IN', { month: 'long', year: 'numeric' })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <div style={{ background: '#f5f5f5', borderBottom: '1px solid #d9dadb', padding: '6px 16px',
                    fontSize: 11, color: '#6a6d70' }}>
        Month-to-date summary · <strong>{monthLabel}</strong> · Each row = one lot bucket
      </div>
      <div style={{ background: '#fff', border: '1px solid #d9dadb', overflowX: 'auto' }}>
        {loading ? (
          <div style={{ padding: 48, textAlign: 'center' }}><Spinner /></div>
        ) : stockLots.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: '#89919a', fontSize: 13 }}>
            No stock data. Post a Goods Receipt to add opening stock.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>{['Material','Category','Lot ID','Unit','Opening Stock','Receipts (MTD)','Issues (MTD)','Closing Stock'].map(h =>
                <th key={h} style={hCell}>{h}</th>
              )}</tr>
            </thead>
            <tbody>
              {stockLots.map((r, i) => (
                <tr key={`${r.material_id}-${r.lot_id}`} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                  <td style={{ ...cell, fontWeight: 600 }}>{r.material_name}</td>
                  <td style={{ ...cell, fontSize: 11, color: '#6a6d70' }}>{r.material_category || '—'}</td>
                  <td style={{ ...cell, fontFamily: 'var(--mono)', color: r.lot_id ? B : '#c0c0c0', fontSize: 11 }}>
                    {r.lot_id || <span style={{ fontStyle: 'italic' }}>No Lot</span>}
                  </td>
                  <td style={{ ...cell, fontFamily: 'var(--mono)', color: '#89919a' }}>{r.unit}</td>
                  <td style={{ ...cell, fontFamily: 'var(--mono)' }}>{fmt(r.opening_stock)}</td>
                  <td style={{ ...cell, fontFamily: 'var(--mono)', color: OK }}>{r.receipts_mtd > 0 ? `+${fmt(r.receipts_mtd)}` : '—'}</td>
                  <td style={{ ...cell, fontFamily: 'var(--mono)', color: r.issues_mtd > 0 ? ERR : '#89919a' }}>
                    {r.issues_mtd > 0 ? `-${fmt(r.issues_mtd)}` : '—'}
                  </td>
                  <td style={{ ...cell, fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700,
                               color: r.closing_stock <= 0 ? ERR : B }}>
                    {fmt(r.closing_stock)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}


/* ══════════════════════════════════════════════════════════════════════════════
   MATERIAL RECEIPT (Direct GR — BP required, optional lot + rate + attachment)
══════════════════════════════════════════════════════════════════════════════ */
function MaterialReceipt({ materials, businessPartners, onPosted }) {
  const today = new Date().toISOString().slice(0, 10)
  const blankLine = () => ({ _id: Math.random(), material_id: '', quantity: '', rate: '', lot_id: '' })
  const [bpId,         setBpId]         = useState('')
  const [documentDate, setDocumentDate] = useState(today)
  const [receiptDate,  setReceiptDate]  = useState(today)
  const [reference,    setReference]    = useState('')
  const [notes,        setNotes]        = useState('')
  const [lines,        setLines]        = useState([blankLine()])
  const [file,         setFile]         = useState(null)
  const [posting,      setPosting]      = useState(false)
  const [message,      setMessage]      = useState('')
  const [error,        setError]        = useState('')
  const fileRef = useRef()

  const matMap = Object.fromEntries(materials.map(m => [String(m.id), m]))
  const addRow    = () => setLines(p => [...p, blankLine()])
  const removeRow = i  => setLines(p => p.length === 1 ? p : p.filter((_, j) => j !== i))
  const updateRow = (i, patch) => setLines(p => p.map((r, j) => j === i ? { ...r, ...patch } : r))

  const canPost = bpId && lines.every(r => r.material_id && Number(r.quantity) > 0)

  const post = async () => {
    setPosting(true); setError(''); setMessage('')
    try {
      const doc = await postDirectGR({
        business_partner_id: Number(bpId),
        document_date: documentDate || undefined,
        receipt_date:  receiptDate,
        reference:     reference || undefined,
        notes:         notes || undefined,
        lines: lines.map(r => ({
          material_id:       Number(r.material_id),
          quantity_received: Number(r.quantity),
          rate:              r.rate ? Number(r.rate) : undefined,
          lot_id:            r.lot_id || undefined,
        })),
      }, file)
      setMessage(`Posted ${doc.gr_number} — ${doc.lines.length} line(s) ✓`)
      setLines([blankLine()])
      setReference(''); setNotes(''); setFile(null)
      if (fileRef.current) fileRef.current.value = ''
      onPosted && onPosted()
    } catch (e) { setError(errMsg(e)) } finally { setPosting(false) }
  }

  const activeBPs = (businessPartners || []).filter(bp => bp.status === 'Active')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Header fields */}
      <div style={{ background: '#fff', border: '1px solid #d9dadb', borderBottom: 'none', padding: '14px 16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '220px 160px 160px 1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 11, color: '#6a6d70', marginBottom: 3 }}>Business Partner (Vendor) *</div>
            <select value={bpId} onChange={e => setBpId(e.target.value)} style={sapSel({ width: '100%' })}>
              <option value="">— Select BP —</option>
              {activeBPs.map(bp => <option key={bp.id} value={bp.id}>{bp.bp_code} · {bp.name}</option>)}
            </select>
            {activeBPs.length === 0 && (
              <div style={{ fontSize: 11, color: ERR, marginTop: 3 }}>No active BPs — add one in Master Data → Business Partners</div>
            )}
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#6a6d70', marginBottom: 3 }}>Invoice Date</div>
            <input type="date" value={documentDate} max={today} onChange={e => setDocumentDate(e.target.value)} style={{ ...inp, width: '100%' }} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#6a6d70', marginBottom: 3 }}>Posting / Receipt Date</div>
            <input type="date" value={receiptDate} max={today} onChange={e => setReceiptDate(e.target.value)} style={{ ...inp, width: '100%' }} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#6a6d70', marginBottom: 3 }}>Invoice / Reference No.</div>
            <input value={reference} onChange={e => setReference(e.target.value)} placeholder="e.g. INV-2026-001" style={{ ...inp, width: '100%' }} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#6a6d70', marginBottom: 3 }}>Notes</div>
            <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes" style={{ ...inp, width: '100%' }} />
          </div>
        </div>

        {/* File attachment */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#6a6d70" strokeWidth={2} strokeLinecap="round">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
          </svg>
          <span style={{ fontSize: 11, color: '#6a6d70' }}>Attach Invoice (PDF / Image, max 10 MB)</span>
          <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.heic"
            onChange={e => setFile(e.target.files?.[0] || null)}
            style={{ fontSize: 11 }} />
          {file && <span style={{ fontSize: 11, color: OK, fontWeight: 600 }}>📎 {file.name}</span>}
        </div>
      </div>

      {/* Line items */}
      <div style={{ background: '#fff', border: '1px solid #d9dadb', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>{['Line','Material','Category','Lot ID','Quantity','Unit','Rate (₹/Unit)','Amount (₹)','Mvt',''].map(h =>
              <th key={h} style={hCell}>{h}</th>
            )}</tr>
          </thead>
          <tbody>
            {lines.map((line, idx) => {
              const mat    = matMap[line.material_id]
              const amount = (line.quantity && line.rate)
                ? Number(line.quantity) * Number(line.rate)
                : null
              return (
                <tr key={line._id}>
                  <td style={{ ...cell, width: 50, fontFamily: 'var(--mono)', color: '#89919a' }}>{idx + 1}</td>
                  <td style={{ padding: '5px 12px', borderBottom: '1px solid #eee', minWidth: 200 }}>
                    <select value={line.material_id} onChange={e => updateRow(idx, { material_id: e.target.value, lot_id: '' })} style={sapSel({ width: '100%' })}>
                      <option value="">✓ Select material</option>
                      {materials.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                  </td>
                  <td style={{ ...cell, fontSize: 11, color: '#6a6d70', minWidth: 120 }}>
                    {mat?.category || '—'}
                  </td>
                  <td style={{ padding: '5px 12px', borderBottom: '1px solid #eee', minWidth: 120 }}>
                    <input
                      type="text"
                      value={line.lot_id}
                      onChange={e => updateRow(idx, { lot_id: e.target.value })}
                      placeholder="e.g. Lot-A"
                      style={{ ...inp, width: '100%', fontFamily: 'var(--mono)', fontSize: 11 }}
                    />
                  </td>
                  <td style={{ padding: '5px 12px', borderBottom: '1px solid #eee', width: 120 }}>
                    <input type="number" min="0.01" step="0.01" value={line.quantity}
                      onChange={e => updateRow(idx, { quantity: e.target.value })}
                      style={{ ...inp, width: '100%', fontFamily: 'var(--mono)' }} />
                  </td>
                  <td style={{ ...cell, fontFamily: 'var(--mono)', color: '#6a6d70', width: 70 }}>{mat?.base_unit || '—'}</td>
                  <td style={{ padding: '5px 12px', borderBottom: '1px solid #eee', width: 130 }}>
                    <input type="number" min="0" step="0.01" value={line.rate}
                      onChange={e => updateRow(idx, { rate: e.target.value })}
                      placeholder="0.00"
                      style={{ ...inp, width: '100%', fontFamily: 'var(--mono)' }} />
                  </td>
                  <td style={{ ...cell, fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600,
                               color: amount ? '#32363a' : '#c0c0c0', width: 120, textAlign: 'right' }}>
                    {amount ? fmtMoney(amount) : '—'}
                  </td>
                  <td style={{ ...cell, color: OK, fontWeight: 700, width: 50 }}>GR</td>
                  <td style={{ padding: '5px 12px', borderBottom: '1px solid #eee', width: 80 }}>
                    <button onClick={() => removeRow(idx)} disabled={lines.length === 1}
                      style={{ ...inp, cursor: lines.length === 1 ? 'not-allowed' : 'pointer',
                               color: lines.length === 1 ? '#89919a' : ERR, fontSize: 11 }}>Remove</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div style={{ background: '#fff', border: '1px solid #d9dadb', borderTop: 'none', padding: '10px 16px',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button onClick={addRow} style={{ ...inp, cursor: 'pointer' }}>+ Add Row</button>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {error   && <span style={{ fontSize: 12, color: ERR, maxWidth: 400 }}>{error}</span>}
          {message && <span style={{ fontSize: 12, color: OK, fontWeight: 600 }}>{message}</span>}
          <button disabled={!canPost || posting} onClick={post} style={btn(canPost && !posting)}>
            {posting ? 'Posting…' : 'Post GR'}
          </button>
        </div>
      </div>
    </div>
  )
}


/* ══════════════════════════════════════════════════════════════════════════════
   MATERIAL ISSUE  (lot-aware stock check)
══════════════════════════════════════════════════════════════════════════════ */
function MaterialIssue({ materials, stockLots, onPosted }) {
  const today = new Date().toISOString().slice(0, 10)
  const blankLine = { material_id: '', quantity: '', lot_id: '' }
  const [issueDate,  setIssueDate]  = useState(today)
  const [reference,  setReference]  = useState('Daily Production')
  const [lines,      setLines]      = useState([{ ...blankLine }])
  const [posting,    setPosting]    = useState(false)
  const [message,    setMessage]    = useState('')
  const [error,      setError]      = useState('')

  const matMap = Object.fromEntries(materials.map(m => [String(m.id), m]))

  // Build per-lot stock lookup: key = `${material_id}::${lot_id}`
  const lotStockMap = Object.fromEntries(
    stockLots.map(r => [`${r.material_id}::${r.lot_id}`, r.closing_stock])
  )
  // Total stock per material (sum all lots)
  const totalStockMap = {}
  stockLots.forEach(r => {
    totalStockMap[r.material_id] = (totalStockMap[r.material_id] || 0) + r.closing_stock
  })
  // Lots available per material
  const lotsForMaterial = (matId) =>
    stockLots.filter(r => r.material_id === Number(matId) && r.closing_stock > 0)

  const addRow    = () => setLines(p => [...p, { ...blankLine }])
  const removeRow = i  => setLines(p => p.length === 1 ? p : p.filter((_, j) => j !== i))
  const updateRow = (i, patch) => setLines(p => p.map((r, j) => j === i ? { ...r, ...patch } : r))

  const lineErrors = lines.map(r => {
    if (!r.material_id || !r.quantity) return null
    const lot    = r.lot_id || ''
    const key    = `${r.material_id}::${lot}`
    const onHand = lotStockMap[key] ?? 0
    const qty    = Number(r.quantity)
    if (qty > onHand + 1e-9) {
      const mat = matMap[r.material_id]
      return `Only ${onHand} ${mat?.base_unit || ''} available${lot ? ` in Lot ${lot}` : ''}`
    }
    return null
  })
  const canPost = lines.every((r, i) => r.material_id && Number(r.quantity) > 0 && !lineErrors[i])

  const post = async () => {
    setPosting(true); setError(''); setMessage('')
    try {
      const doc = await createMaterialIssue({
        issue_date: issueDate,
        reference,
        lines: lines.map(r => ({
          material_id: Number(r.material_id),
          quantity:    Number(r.quantity),
          lot_id:      r.lot_id || undefined,
        })),
      })
      setMessage(`Posted ${doc.document_number} ✓`)
      setLines([{ ...blankLine }])
      onPosted && onPosted()
    } catch (e) { setError(errMsg(e)) } finally { setPosting(false) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <div style={{ background: '#fff', border: '1px solid #d9dadb', borderBottom: 'none', padding: '14px 16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 16, alignItems: 'end' }}>
          <div>
            <div style={{ fontSize: 11, color: '#6a6d70', marginBottom: 3 }}>Date</div>
            <input type="date" value={issueDate} max={today} onChange={e => setIssueDate(e.target.value)} style={{ ...inp, width: '100%' }} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#6a6d70', marginBottom: 3 }}>Reference</div>
            <input value={reference} onChange={e => setReference(e.target.value)} style={{ ...inp, width: '100%' }} />
          </div>
        </div>
      </div>

      <div style={{ background: '#fff', border: '1px solid #d9dadb', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>{['Line','Material','Lot','Available Stock','Qty to Issue','Unit','Mvt',''].map(h =>
              <th key={h} style={hCell}>{h}</th>
            )}</tr>
          </thead>
          <tbody>
            {lines.map((line, idx) => {
              const mat      = matMap[line.material_id]
              const availLots = line.material_id ? lotsForMaterial(line.material_id) : []
              const lot       = line.lot_id || ''
              const key       = `${line.material_id}::${lot}`
              const onHand    = line.material_id ? (lotStockMap[key] ?? 0) : null
              const lineErr   = lineErrors[idx]
              return (
                <tr key={idx} style={{ background: lineErr ? '#fff5f5' : undefined }}>
                  <td style={{ ...cell, width: 50, fontFamily: 'var(--mono)', color: '#89919a' }}>{idx + 1}</td>
                  <td style={{ padding: '5px 12px', borderBottom: '1px solid #eee', minWidth: 200 }}>
                    <select value={line.material_id}
                      onChange={e => {
                        const matId = e.target.value
                        const avail = stockLots.filter(r => r.material_id === Number(matId) && r.closing_stock > 0)
                        // Auto-select the lot when exactly one is available
                        const autoLot = avail.length === 1 ? (avail[0].lot_id || '') : ''
                        updateRow(idx, { material_id: matId, lot_id: autoLot, quantity: '' })
                      }}
                      style={sapSel({ width: '100%' })}>
                      <option value="">Select material</option>
                      {materials.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: '5px 12px', borderBottom: '1px solid #eee', minWidth: 130 }}>
                    <select value={line.lot_id}
                      onChange={e => updateRow(idx, { lot_id: e.target.value, quantity: '' })}
                      style={sapSel({ width: '100%', fontFamily: 'var(--mono)', fontSize: 11 })}>
                      <option value="">No Lot</option>
                      {availLots.filter(l => l.lot_id).map(l => (
                        <option key={l.lot_id} value={l.lot_id}>{l.lot_id} ({l.closing_stock} {l.unit})</option>
                      ))}
                    </select>
                  </td>
                  <td style={{ ...cell, fontFamily: 'var(--mono)', fontWeight: 700, width: 140,
                               color: onHand === 0 ? ERR : onHand > 0 ? OK : '#89919a' }}>
                    {onHand !== null ? `${fmt(onHand)} ${mat?.base_unit || ''}` : '—'}
                  </td>
                  <td style={{ padding: '5px 12px', borderBottom: '1px solid #eee', width: 140 }}>
                    <input type="number" min="0.01" step="0.01" value={line.quantity}
                      onChange={e => updateRow(idx, { quantity: e.target.value })}
                      style={{ ...inp, width: '100%', fontFamily: 'var(--mono)',
                               borderColor: lineErr ? ERR : BD }} />
                    {lineErr && <div style={{ fontSize: 10, color: ERR, marginTop: 2 }}>{lineErr}</div>}
                  </td>
                  <td style={{ ...cell, fontFamily: 'var(--mono)', color: '#6a6d70', width: 70 }}>{mat?.base_unit || '—'}</td>
                  <td style={{ ...cell, color: ERR, fontWeight: 700, width: 50 }}>GI</td>
                  <td style={{ padding: '5px 12px', borderBottom: '1px solid #eee', width: 80 }}>
                    <button onClick={() => removeRow(idx)} disabled={lines.length === 1}
                      style={{ ...inp, cursor: lines.length === 1 ? 'not-allowed' : 'pointer',
                               color: lines.length === 1 ? '#89919a' : ERR, fontSize: 11 }}>Remove</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div style={{ background: '#fff', border: '1px solid #d9dadb', borderTop: 'none', padding: '10px 16px',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button onClick={addRow} style={{ ...inp, cursor: 'pointer' }}>+ Add Row</button>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {error   && <span style={{ fontSize: 12, color: ERR, maxWidth: 400 }}>{error}</span>}
          {message && <span style={{ fontSize: 12, color: OK, fontWeight: 600 }}>{message}</span>}
          <button disabled={!canPost || posting} onClick={post} style={btn(canPost && !posting)}>
            {posting ? 'Posting…' : 'Post GI'}
          </button>
        </div>
      </div>
    </div>
  )
}


/* ══════════════════════════════════════════════════════════════════════════════
   MATERIAL MOVEMENTS LEDGER
══════════════════════════════════════════════════════════════════════════════ */
function MaterialMovements({ movements, loading }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #d9dadb', overflowX: 'auto' }}>
      {loading ? <div style={{ padding: 48, textAlign: 'center' }}><Spinner /></div> : (
        movements.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: '#89919a', fontSize: 13 }}>No movements yet.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>{['Doc #','Material','Date','Type','Lot','Qty','Unit','Source','Notes'].map(h =>
                <th key={h} style={hCell}>{h}</th>
              )}</tr>
            </thead>
            <tbody>
              {movements.map((m, i) => (
                <tr key={m.id} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                  <td style={{ ...cell, fontFamily: 'var(--mono)', color: '#89919a' }}>{m.id}</td>
                  <td style={{ ...cell, fontWeight: 600 }}>{m.material_name}</td>
                  <td style={cell}>{m.movement_date}</td>
                  <td style={{ ...cell, fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                               color: m.quantity_delta < 0 ? ERR : OK }}>
                    {m.movement_type}
                  </td>
                  <td style={{ ...cell, fontFamily: 'var(--mono)', fontSize: 11, color: m.lot_id ? '#32363a' : '#c0c0c0' }}>
                    {m.lot_id || '—'}
                  </td>
                  <td style={{ ...cell, fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700,
                               color: m.quantity_delta < 0 ? ERR : OK }}>
                    {m.quantity_delta > 0 ? '+' : ''}{fmt(m.quantity_delta)}
                  </td>
                  <td style={{ ...cell, fontFamily: 'var(--mono)', color: '#89919a' }}>{m.unit}</td>
                  <td style={{ ...cell, fontSize: 11, color: '#6a6d70' }}>{m.source_type}</td>
                  <td style={{ ...cell, fontSize: 11, color: '#89919a', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      )}
    </div>
  )
}


/* ══════════════════════════════════════════════════════════════════════════════
   PLANNING (MRP params + market price) — uses aggregate overview rows
══════════════════════════════════════════════════════════════════════════════ */
function Planning({ rows, onSaved }) {
  const [drafts,     setDrafts]     = useState({})
  const [genLoading, setGenLoading] = useState({})
  const [price,      setPrice]      = useState({
    material_id: '',
    price: '',
    price_date: new Date().toISOString().slice(0, 10),
  })

  useEffect(() => {
    setDrafts(Object.fromEntries(rows.map(r => [r.material_id, {
      lead_time_days:    r.lead_time_days,
      safety_stock_qty:  r.safety_stock_qty,
      reorder_qty:       r.reorder_qty,
    }])))
  }, [rows])

  const saveRow = async (materialId) => {
    const d = drafts[materialId]
    await updateMaterialPlanning(materialId, {
      lead_time_days:     Number(d.lead_time_days),
      safety_stock_qty:   Number(d.safety_stock_qty),
      reorder_qty:        Number(d.reorder_qty),
      critical_days_left: 2,
    })
    onSaved()
  }

  const savePrice = async () => {
    if (!price.material_id || !price.price) return
    await addMaterialMarketPrice(price.material_id, {
      price_date: price.price_date,
      price: Number(price.price),
    })
    setPrice(p => ({ ...p, price: '' }))
    onSaved()
  }

  // Trigger MRP for one material by refreshing overview (MRP auto-runs on fetch)
  const genRequisition = async (materialId) => {
    setGenLoading(p => ({ ...p, [materialId]: true }))
    await onSaved()
    setGenLoading(p => ({ ...p, [materialId]: false }))
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 16 }}>

      {/* ── MRP Table ── */}
      <div style={{ background: '#fff', border: `1px solid ${BD}`, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {[
                'Material', 'Stock', 'Runway (Days)', 'Lead Time',
                'Safety Stock', 'Reorder Qty', 'Reorder Level', 'EOQ', 'Action', '',
              ].map(h => <th key={h} style={hCell}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const d = drafts[r.material_id] || {}
              const runway    = r.days_left
              const leadTime  = Number(d.lead_time_days) || r.lead_time_days || 5
              const critical  = runway !== null && runway !== undefined && runway < leadTime
              const warn      = !critical && runway !== null && runway !== undefined && runway < leadTime * 1.5
              const eoq       = calcEOQ(r.avg_consumption_7d, r.last_market_price)
              const hasPendingRec = r.recommendation && r.recommendation.status === 'open'

              // Row triage background
              const rowBg = critical
                ? '#fff0f0'
                : warn
                  ? '#fff8ee'
                  : i % 2 === 0 ? '#fff' : '#fafafa'

              return (
                <tr key={r.material_id} style={{ background: rowBg }}>
                  <td style={{ ...cell, fontWeight: 600 }}>
                    <div>{r.material_name}</div>
                    {critical && (
                      <div style={{ fontSize: 10, color: ERR, fontWeight: 700, marginTop: 2 }}>
                        ⚠ CRITICAL — Runway &lt; Lead Time
                      </div>
                    )}
                  </td>
                  <td style={{ ...cell, fontFamily: 'var(--mono)', fontWeight: 700, color: B }}>
                    {fmt(r.stock, r.unit)}
                  </td>

                  {/* Runway cell — tinted if critical */}
                  <td style={{
                    ...cell,
                    fontFamily: 'var(--mono)',
                    fontWeight: 700,
                    color: critical ? ERR : warn ? '#b55b00' : OK,
                    background: critical ? '#ffe8e8' : warn ? '#fff3dc' : undefined,
                  }}>
                    {runway !== null && runway !== undefined ? `${runway}d` : '—'}
                  </td>

                  {/* Editable planning params */}
                  {['lead_time_days', 'safety_stock_qty', 'reorder_qty'].map(k => (
                    <td key={k} style={{ padding: '4px 8px', borderBottom: '1px solid #e0e0e0', borderRight: '1px solid #e0e0e0' }}>
                      <input
                        type="number"
                        value={d[k] ?? ''}
                        onChange={e => setDrafts(prev => ({
                          ...prev,
                          [r.material_id]: { ...d, [k]: e.target.value },
                        }))}
                        style={{ ...inp, width: 80, fontFamily: 'var(--mono)' }}
                      />
                    </td>
                  ))}

                  <td style={{ ...cell, fontFamily: 'var(--mono)' }}>
                    {fmt(r.reorder_level, r.unit)}
                  </td>

                  {/* EOQ */}
                  <td style={{ ...cell, fontFamily: 'var(--mono)', color: B }}>
                    {eoq ? fmt(eoq) : <span style={{ color: '#aaa', fontSize: 10 }}>No price</span>}
                  </td>

                  {/* Action */}
                  <td style={{ padding: '4px 8px', borderBottom: '1px solid #e0e0e0', whiteSpace: 'nowrap' }}>
                    {hasPendingRec ? (
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '2px 7px',
                        background: '#ebf4ff', color: '#0064d9',
                        border: '1px solid #b8d4f8', borderRadius: 2,
                      }}>
                        Req. Pending
                      </span>
                    ) : r.status === 'BELOW REORDER LEVEL' ? (
                      <button
                        onClick={() => genRequisition(r.material_id)}
                        disabled={!!genLoading[r.material_id]}
                        style={{
                          ...inp,
                          cursor: 'pointer',
                          background: ERR,
                          color: '#fff',
                          borderColor: ERR,
                          fontWeight: 600,
                          fontSize: 11,
                          padding: '3px 8px',
                        }}
                      >
                        {genLoading[r.material_id] ? '…' : 'Generate Req.'}
                      </button>
                    ) : (
                      <span style={{ fontSize: 10, color: '#8c8c8c' }}>
                        {r.status === 'SAFE (CLOSE)' ? 'Monitor' : 'Safe'}
                      </span>
                    )}
                  </td>

                  {/* Save params */}
                  <td style={{ padding: '4px 8px', borderBottom: '1px solid #e0e0e0' }}>
                    <button
                      onClick={() => saveRow(r.material_id)}
                      style={{ ...inp, cursor: 'pointer', fontSize: 11 }}
                    >
                      Save
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ── Market Price Entry ── */}
      <div style={{ background: '#fff', border: `1px solid ${BD}` }}>
        <div style={{
          padding: '8px 14px',
          borderBottom: `1px solid ${BD}`,
          fontSize: 12,
          fontWeight: 700,
          background: BG_HD,
          color: '#1d1d1d',
        }}>
          Market Price Entry
        </div>
        <div style={{ padding: 14, display: 'grid', gap: 10 }}>
          <div>
            <div style={{ fontSize: 11, color: '#5a5a5a', marginBottom: 3 }}>Material</div>
            <select
              value={price.material_id}
              onChange={e => setPrice(p => ({ ...p, material_id: e.target.value }))}
              style={{ ...inp, width: '100%' }}
            >
              <option value="">Select Material</option>
              {rows.map(r => (
                <option key={r.material_id} value={r.material_id}>
                  {r.material_name}
                  {r.last_market_price ? ` (₹${r.last_market_price})` : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#5a5a5a', marginBottom: 3 }}>Price Date</div>
            <input
              type="date"
              value={price.price_date}
              onChange={e => setPrice(p => ({ ...p, price_date: e.target.value }))}
              style={{ ...inp, width: '100%' }}
            />
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#5a5a5a', marginBottom: 3 }}>Market Price (₹/{rows.find(r => String(r.material_id) === String(price.material_id))?.unit || 'unit'})</div>
            <input
              type="number"
              value={price.price}
              onChange={e => setPrice(p => ({ ...p, price: e.target.value }))}
              placeholder="0.00"
              style={{ ...inp, width: '100%', fontFamily: 'var(--mono)' }}
            />
          </div>
          <button
            onClick={savePrice}
            disabled={!price.material_id || !price.price}
            style={btn(price.material_id && price.price)}
          >
            Save Price
          </button>
          <div style={{ fontSize: 10, color: '#8c8c8c', lineHeight: 1.5 }}>
            Market prices feed EOQ calculations. EOQ uses Order Cost = ₹{EOQ_ORDER_COST}, Holding = {EOQ_HOLDING_PCT * 100}%/yr.
          </div>
        </div>
      </div>
    </div>
  )
}


/* ══════════════════════════════════════════════════════════════════════════════
   ADMIN RESET
══════════════════════════════════════════════════════════════════════════════ */
function AdminReset({ onReset }) {
  const [confirm, setConfirm] = useState('')
  const [running, setRunning] = useState(false)
  const [msg,     setMsg]     = useState('')
  const [err,     setErr]     = useState('')

  const KEYWORD = 'RESET'
  const canRun  = confirm === KEYWORD && !running

  const run = async () => {
    setRunning(true); setErr(''); setMsg('')
    try {
      await resetInventory()
      setMsg('✓ All inventory data wiped. Vendors, materials, movements, GRs — all cleared. Quality samples and production entries untouched.')
      setConfirm('')
      onReset && onReset()
    } catch (e) { setErr(errMsg(e)) } finally { setRunning(false) }
  }

  return (
    <div style={{ background: '#fff', border: `2px solid ${ERR}`, padding: 24, maxWidth: 560 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: ERR, marginBottom: 12 }}>
        ⚠ Danger Zone — Full Inventory Reset
      </div>
      <div style={{ fontSize: 12, color: '#32363a', lineHeight: 1.6, marginBottom: 16 }}>
        This will permanently erase:
        <ul style={{ margin: '8px 0', paddingLeft: 20 }}>
          <li>All vendors and materials</li>
          <li>All inventory movements and stock balances</li>
          <li>All goods receipts and goods issues</li>
          <li>All purchase orders and recommendations</li>
        </ul>
        Quality samples, production entries, and department settings are <strong>not</strong> affected.
        <br /><br />
        Type <strong style={{ fontFamily: 'var(--mono)' }}>{KEYWORD}</strong> to confirm:
      </div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <input
          value={confirm}
          onChange={e => setConfirm(e.target.value.toUpperCase())}
          placeholder={KEYWORD}
          style={{ ...inp, width: 120, fontFamily: 'var(--mono)', fontWeight: 700 }}
        />
        <button disabled={!canRun} onClick={run} style={btn(canRun, true)}>
          {running ? 'Resetting…' : 'Reset All Inventory'}
        </button>
      </div>
      {(err || msg) && (
        <div style={{ marginTop: 12, fontSize: 12, color: err ? ERR : OK, lineHeight: 1.5 }}>{err || msg}</div>
      )}
    </div>
  )
}


/* ══════════════════════════════════════════════════════════════════════════════
   ROOT COMPONENT
══════════════════════════════════════════════════════════════════════════════ */
export default function InventoryPlanning({ mode = 'stock' }) {
  const [rows,             setRows]             = useState([])   // MRP overview (material-level)
  const [stockLots,        setStockLots]        = useState([])   // per-lot stock
  const [materials,        setMaterials]        = useState([])
  const [businessPartners, setBusinessPartners] = useState([])
  const [movements,        setMovements]        = useState([])
  const [loading,          setLoading]          = useState(true)
  const [loadErrors,       setLoadErrors]       = useState([])

  const load = useCallback(async () => {
    setLoading(true)
    setLoadErrors([])
    try {
      const [ovRes, matRes, bpRes, movRes, slotsRes] = await Promise.allSettled([
        getInventoryOverview(),
        getMaterials(),
        getBusinessPartners('MM_VENDOR'),
        getInventoryMovements({ limit: 300 }),
        getStockLots(),
      ])
      const errs = []
      if (ovRes.status    === 'fulfilled') setRows(ovRes.value)
      else errs.push(`MRP overview: ${errMsg(ovRes.reason)}`)
      if (matRes.status   === 'fulfilled') setMaterials(matRes.value)
      else errs.push(`Materials: ${errMsg(matRes.reason)}`)
      if (bpRes.status    === 'fulfilled') setBusinessPartners(bpRes.value)
      else errs.push(`Business Partners: ${errMsg(bpRes.reason)}`)
      if (movRes.status   === 'fulfilled') setMovements(movRes.value)
      else errs.push(`Movements: ${errMsg(movRes.reason)}`)
      if (slotsRes.status === 'fulfilled') setStockLots(slotsRes.value)
      else errs.push(`Stock lots: ${errMsg(slotsRes.reason)}`)
      if (errs.length) setLoadErrors(errs)
    } catch (e) {
      setLoadErrors([`Unexpected error: ${errMsg(e)}`])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const TITLES = {
    stock:         ['Stock Overview',     'Month-to-date opening / receipts / issues / closing — per lot'],
    receipt:       ['Material Receipt',   'Post goods receipt from vendor — updates stock ledger'],
    issue:         ['Material Issue',     'Post daily goods issue — reduces stock ledger'],
    movements:     ['Material Movements', 'Append-only inventory ledger (GR/GI audit trail)'],
    planning:      ['Planning (MRP)',     'Lead time, safety stock, reorder parameters'],
    'admin-reset': ['Admin — Data Reset', 'Wipe all inventory test data and start fresh'],
  }
  const [title, subtitle] = TITLES[mode] || TITLES.stock

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, background: BG_PAGE }}>
      <PageBar title={title} subtitle={subtitle} onRefresh={load}>
        {loading && (
          <span style={{ fontSize: 11, color: '#89919a', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid #d9dadb', borderTopColor: B, borderRadius: '50%', animation: 'spin .7s linear infinite' }} />
            Loading…
          </span>
        )}
      </PageBar>

      {loadErrors.length > 0 && (
        <div style={{ background: '#fff5f5', border: '1px solid #ffcccc', borderBottom: 'none', padding: '8px 16px' }}>
          {loadErrors.map((e, i) => (
            <div key={i} style={{ fontSize: 12, color: ERR }}>⚠ {e}</div>
          ))}
        </div>
      )}

      {mode === 'stock'       && <StockOverview    stockLots={stockLots}      loading={loading} />}
      {mode === 'receipt'     && <MaterialReceipt  materials={materials}       businessPartners={businessPartners} onPosted={load} />}
      {mode === 'issue'       && <MaterialIssue    materials={materials}       stockLots={stockLots} onPosted={load} />}
      {mode === 'movements'   && <MaterialMovements movements={movements}      loading={loading} />}
      {mode === 'planning'    && <Planning          rows={rows}                onSaved={load} />}
      {mode === 'admin-reset' && <AdminReset        onReset={load} />}
    </div>
  )
}
