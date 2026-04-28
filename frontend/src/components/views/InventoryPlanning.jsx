import { useCallback, useEffect, useState } from 'react'
import {
  addMaterialMarketPrice,
  createMaterial,
  createMaterialIssue,
  deactivateMaterial,
  getInventoryMovements,
  getInventoryOverview,
  getMaterials,
  quickReceipt,
  updateMaterialPlanning,
} from '../../api.js'
import { Spinner } from '../Primitives.jsx'

const SAP_BLUE = '#012169'
const SAP_BORDER = '#89919a'

const inputStyle = {
  padding: '5px 8px', fontSize: 12,
  border: `1px solid ${SAP_BORDER}`, borderRadius: 2,
  background: '#fff', color: '#32363a', fontFamily: 'var(--font)',
}

function fmt(n, unit) {
  if (n === null || n === undefined) return '-'
  return `${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 1 })} ${unit || ''}`
}

function statusColor(status) {
  if (status === 'BELOW REORDER LEVEL') return '#bb0000'
  if (status === 'SAFE (CLOSE)') return '#b55b00'
  return '#188f36'
}

function PageBar({ title, subtitle, onRefresh, children }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #d9dadb', borderBottom: 'none', padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#32363a' }}>{title}</span>
        <span style={{ fontSize: 11, color: '#89919a', marginLeft: 12 }}>{subtitle}</span>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {children}
        <button onClick={onRefresh} style={{ ...inputStyle, cursor: 'pointer' }}>Refresh</button>
      </div>
    </div>
  )
}

function StockOverview({ rows, loading }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #d9dadb', overflowX: 'auto' }}>
      {loading ? <div style={{ padding: 48, textAlign: 'center' }}><Spinner /></div> : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Material', 'Current Stock', 'Avg / Day', 'Days Left', 'Reorder Level', 'Status', 'Action'].map(h => (
                <th key={h} style={{ padding: '7px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#6a6d70', textTransform: 'uppercase', letterSpacing: '.07em', background: '#f5f5f5', borderBottom: '1px solid #d9dadb', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.material_id} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                <td style={{ padding: '8px 12px', fontSize: 12, fontWeight: 600, borderBottom: '1px solid #eeeeee' }}>{r.material_name}</td>
                <td style={{ padding: '8px 12px', fontFamily: 'var(--mono)', fontSize: 13, color: SAP_BLUE, borderBottom: '1px solid #eeeeee' }}>{fmt(r.stock, r.unit)}</td>
                <td style={{ padding: '8px 12px', fontFamily: 'var(--mono)', fontSize: 12, borderBottom: '1px solid #eeeeee' }}>{fmt(r.avg_consumption_7d, `${r.unit}/day`)}</td>
                <td style={{ padding: '8px 12px', fontFamily: 'var(--mono)', fontSize: 12, borderBottom: '1px solid #eeeeee' }}>{r.days_left ? `~${r.days_left} days` : '-'}</td>
                <td style={{ padding: '8px 12px', fontFamily: 'var(--mono)', fontSize: 12, borderBottom: '1px solid #eeeeee' }}>{fmt(r.reorder_level, r.unit)}</td>
                <td style={{ padding: '8px 12px', fontSize: 11, fontWeight: 700, color: statusColor(r.status), borderBottom: '1px solid #eeeeee', whiteSpace: 'nowrap' }}>{r.status}</td>
                <td style={{ padding: '8px 12px', fontSize: 11, color: r.action === 'ORDER NOW' ? '#bb0000' : '#6a6d70', fontWeight: 600, borderBottom: '1px solid #eeeeee' }}>{r.action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function MaterialIssue({ materials, onPosted }) {
  const today = new Date().toISOString().slice(0, 10)
  const [issueDate, setIssueDate] = useState(today)
  const [shift, setShift] = useState('A')
  const [reference, setReference] = useState('Daily Production')
  const [lines, setLines] = useState([{ material_id: '', quantity: '' }])
  const [posting, setPosting] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const materialMap = Object.fromEntries(materials.map(m => [String(m.id), m]))
  const addRow = () => setLines(prev => [...prev, { material_id: '', quantity: '' }])
  const removeRow = idx => setLines(prev => prev.length === 1 ? prev : prev.filter((_, i) => i !== idx))
  const updateRow = (idx, patch) => setLines(prev => prev.map((row, i) => i === idx ? { ...row, ...patch } : row))

  const canPost = lines.every(row => row.material_id && Number(row.quantity) > 0)

  const post = async () => {
    setPosting(true); setError(''); setMessage('')
    try {
      const doc = await createMaterialIssue({
        issue_date: issueDate,
        shift,
        reference,
        lines: lines.map(row => ({ material_id: Number(row.material_id), quantity: Number(row.quantity) })),
      })
      setMessage(`Posted ${doc.document_number}`)
      setLines([{ material_id: '', quantity: '' }])
      onPosted && onPosted()
    } catch (e) {
      setError(e?.response?.data?.detail || 'Posting failed')
    } finally {
      setPosting(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <div style={{ background: '#fff', border: '1px solid #d9dadb', borderBottom: 'none', padding: '14px 16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '180px 220px 1fr', gap: 16, alignItems: 'end' }}>
          <div>
            <div style={{ fontSize: 11, color: '#6a6d70', marginBottom: 4 }}>Date</div>
            <input type="date" value={issueDate} max={today} onChange={e => setIssueDate(e.target.value)} style={{ ...inputStyle, width: '100%' }} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#6a6d70', marginBottom: 4 }}>Shift</div>
            <div style={{ display: 'flex' }}>
              {['A', 'B', 'C'].map((s, i) => (
                <button key={s} onClick={() => setShift(s)} style={{ flex: 1, padding: '6px 0', fontSize: 12, border: `1px solid ${shift === s ? SAP_BLUE : SAP_BORDER}`, borderLeft: i > 0 ? 'none' : undefined, background: shift === s ? SAP_BLUE : '#fff', color: shift === s ? '#fff' : '#32363a', cursor: 'pointer' }}>Shift {s}</button>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#6a6d70', marginBottom: 4 }}>Reference</div>
            <input value={reference} onChange={e => setReference(e.target.value)} style={{ ...inputStyle, width: '100%' }} />
          </div>
        </div>
      </div>

      <div style={{ background: '#fff', border: '1px solid #d9dadb', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Line', 'Material', 'Quantity', 'Unit', 'Movement Type', ''].map(h => (
                <th key={h} style={{ padding: '7px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#6a6d70', textTransform: 'uppercase', letterSpacing: '.07em', background: '#f5f5f5', borderBottom: '1px solid #d9dadb' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.map((line, idx) => {
              const material = materialMap[line.material_id]
              return (
                <tr key={idx}>
                  <td style={{ padding: '7px 12px', fontFamily: 'var(--mono)', fontSize: 12, borderBottom: '1px solid #eeeeee', width: 60 }}>{idx + 1}</td>
                  <td style={{ padding: '5px 12px', borderBottom: '1px solid #eeeeee', minWidth: 220 }}>
                    <select value={line.material_id} onChange={e => updateRow(idx, { material_id: e.target.value })} style={{ ...inputStyle, width: '100%' }}>
                      <option value="">Select material</option>
                      {materials.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: '5px 12px', borderBottom: '1px solid #eeeeee', width: 160 }}>
                    <input type="number" min="0" step={material?.base_unit === 'Bales' ? 1 : 0.1} value={line.quantity} onChange={e => updateRow(idx, { quantity: e.target.value })} style={{ ...inputStyle, width: '100%', fontFamily: 'var(--mono)' }} />
                  </td>
                  <td style={{ padding: '7px 12px', fontFamily: 'var(--mono)', fontSize: 12, color: '#6a6d70', borderBottom: '1px solid #eeeeee', width: 100 }}>{material?.base_unit || '-'}</td>
                  <td style={{ padding: '7px 12px', fontSize: 12, color: '#32363a', borderBottom: '1px solid #eeeeee', width: 120 }}>GI</td>
                  <td style={{ padding: '5px 12px', borderBottom: '1px solid #eeeeee', width: 90 }}>
                    <button onClick={() => removeRow(idx)} disabled={lines.length === 1} style={{ ...inputStyle, cursor: lines.length === 1 ? 'not-allowed' : 'pointer', color: lines.length === 1 ? '#89919a' : '#bb0000' }}>Remove</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div style={{ background: '#fff', border: '1px solid #d9dadb', borderTop: 'none', padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button onClick={addRow} style={{ ...inputStyle, cursor: 'pointer' }}>Add Row</button>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {error && <span style={{ fontSize: 12, color: '#bb0000' }}>{error}</span>}
          {message && <span style={{ fontSize: 12, color: '#188f36' }}>{message}</span>}
          <button disabled={!canPost || posting} onClick={post} style={{ ...inputStyle, background: canPost ? SAP_BLUE : '#f2f2f2', color: canPost ? '#fff' : '#89919a', borderColor: canPost ? SAP_BLUE : '#d9dadb', cursor: canPost ? 'pointer' : 'not-allowed' }}>{posting ? 'Posting...' : 'Post'}</button>
        </div>
      </div>
    </div>
  )
}

function MaterialMovements({ movements, loading }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #d9dadb', overflowX: 'auto' }}>
      {loading ? <div style={{ padding: 48, textAlign: 'center' }}><Spinner /></div> : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Material Document', 'Material', 'Posting Date', 'Movement', 'Qty', 'Source'].map(h => (
                <th key={h} style={{ padding: '7px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#6a6d70', textTransform: 'uppercase', letterSpacing: '.07em', background: '#f5f5f5', borderBottom: '1px solid #d9dadb' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {movements.map(m => (
              <tr key={m.id}>
                <td style={{ padding: '8px 12px', fontFamily: 'var(--mono)', fontSize: 12, borderBottom: '1px solid #eeeeee' }}>{m.id}</td>
                <td style={{ padding: '8px 12px', fontSize: 12, fontWeight: 600, borderBottom: '1px solid #eeeeee' }}>{m.material_name}</td>
                <td style={{ padding: '8px 12px', fontSize: 12, borderBottom: '1px solid #eeeeee' }}>{m.movement_date}</td>
                <td style={{ padding: '8px 12px', fontSize: 11, textTransform: 'uppercase', color: '#6a6d70', borderBottom: '1px solid #eeeeee' }}>{m.movement_type}</td>
                <td style={{ padding: '8px 12px', fontFamily: 'var(--mono)', fontSize: 12, color: m.quantity_delta < 0 ? '#bb0000' : '#188f36', borderBottom: '1px solid #eeeeee' }}>{fmt(m.quantity_delta, m.unit)}</td>
                <td style={{ padding: '8px 12px', fontSize: 11, color: '#89919a', borderBottom: '1px solid #eeeeee' }}>{m.source_type}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

/* ── Common units used in textile mills ── */
const COMMON_UNITS = ['Bales', 'Kg', 'Cones', 'Bobbins', 'Bags', 'Litres', 'Nos', 'Rolls']

function MaterialMaster({ materials, onChanged }) {
  const [form, setForm] = useState({ code: '', name: '', base_unit: 'Bales' })
  const [saving, setSaving]   = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError]     = useState('')
  const [removing, setRemoving] = useState(null)

  const canSave = form.code.trim() && form.name.trim() && form.base_unit.trim()

  const save = async () => {
    setSaving(true); setError(''); setMessage('')
    try {
      const m = await createMaterial(form)
      setMessage(`Added: ${m.code} — ${m.name}`)
      setForm({ code: '', name: '', base_unit: 'Bales' })
      onChanged && onChanged()
    } catch (e) {
      setError(e?.response?.data?.detail || 'Could not create material')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id, name) => {
    if (!window.confirm(`Deactivate "${name}"? This cannot be undone if stock exists.`)) return
    setRemoving(id)
    try {
      await deactivateMaterial(id)
      onChanged && onChanged()
    } catch (e) {
      setError(e?.response?.data?.detail || 'Could not deactivate material')
    } finally {
      setRemoving(null)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

      {/* ── Add new material form ── */}
      <div style={{ background: '#fff', border: '1px solid #d9dadb', borderBottom: 'none', padding: '14px 16px' }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#6a6d70', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 12 }}>
          Add New Material
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr 160px auto', gap: 12, alignItems: 'end' }}>
          <div>
            <div style={{ fontSize: 11, color: '#6a6d70', marginBottom: 4 }}>Material Code</div>
            <input
              value={form.code}
              onChange={e => setForm({ ...form, code: e.target.value })}
              placeholder="e.g. RM-COTTON-01"
              style={{ ...inputStyle, width: '100%', fontFamily: 'var(--mono)', textTransform: 'uppercase' }}
            />
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#6a6d70', marginBottom: 4 }}>Material Name</div>
            <input
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Raw Cotton — Shankar 6"
              style={{ ...inputStyle, width: '100%' }}
            />
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#6a6d70', marginBottom: 4 }}>Unit of Measure</div>
            <select
              value={form.base_unit}
              onChange={e => setForm({ ...form, base_unit: e.target.value })}
              style={{ ...inputStyle, width: '100%' }}
            >
              {COMMON_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <button
            disabled={!canSave || saving}
            onClick={save}
            style={{
              ...inputStyle,
              background:  canSave ? SAP_BLUE : '#f2f2f2',
              color:       canSave ? '#fff' : '#89919a',
              borderColor: canSave ? SAP_BLUE : '#d9dadb',
              cursor:      canSave ? 'pointer' : 'not-allowed',
              fontWeight:  600,
              whiteSpace: 'nowrap',
            }}
          >
            {saving ? 'Saving…' : 'Add Material'}
          </button>
        </div>
        {(error || message) && (
          <div style={{ marginTop: 10, fontSize: 12, color: error ? '#bb0000' : '#188f36' }}>
            {error || message}
          </div>
        )}
      </div>

      {/* ── Material list ── */}
      <div style={{ background: '#fff', border: '1px solid #d9dadb', overflowX: 'auto' }}>
        {materials.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: '#89919a', fontSize: 13 }}>
            No materials yet. Add your first material above.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['#', 'Code', 'Name', 'Unit', ''].map(h => (
                  <th key={h} style={{ padding: '7px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#6a6d70', textTransform: 'uppercase', letterSpacing: '.07em', background: '#f5f5f5', borderBottom: '1px solid #d9dadb' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {materials.map((m, i) => (
                <tr key={m.id} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                  <td style={{ padding: '8px 12px', fontFamily: 'var(--mono)', fontSize: 12, color: '#89919a', borderBottom: '1px solid #eeeeee', width: 50 }}>{i + 1}</td>
                  <td style={{ padding: '8px 12px', fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600, color: SAP_BLUE, borderBottom: '1px solid #eeeeee' }}>{m.code}</td>
                  <td style={{ padding: '8px 12px', fontSize: 12, borderBottom: '1px solid #eeeeee' }}>{m.name}</td>
                  <td style={{ padding: '8px 12px', fontFamily: 'var(--mono)', fontSize: 12, color: '#6a6d70', borderBottom: '1px solid #eeeeee' }}>{m.base_unit}</td>
                  <td style={{ padding: '8px 12px', borderBottom: '1px solid #eeeeee', width: 100 }}>
                    <button
                      disabled={removing === m.id}
                      onClick={() => remove(m.id, m.name)}
                      style={{ ...inputStyle, cursor: 'pointer', color: '#bb0000', fontSize: 11 }}
                    >
                      {removing === m.id ? '…' : 'Remove'}
                    </button>
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

function MaterialReceipt({ materials, onPosted }) {
  const today = new Date().toISOString().slice(0, 10)
  const [receiptDate, setReceiptDate] = useState(today)
  const [reference,   setReference]   = useState('')
  const [lines,       setLines]       = useState([{ material_id: '', quantity: '' }])
  const [posting,     setPosting]     = useState(false)
  const [message,     setMessage]     = useState('')
  const [error,       setError]       = useState('')

  const materialMap = Object.fromEntries(materials.map(m => [String(m.id), m]))
  const addRow    = () => setLines(prev => [...prev, { material_id: '', quantity: '' }])
  const removeRow = idx => setLines(prev => prev.length === 1 ? prev : prev.filter((_, i) => i !== idx))
  const updateRow = (idx, patch) => setLines(prev => prev.map((row, i) => i === idx ? { ...row, ...patch } : row))

  const canPost = lines.every(row => row.material_id && Number(row.quantity) > 0)

  const post = async () => {
    setPosting(true); setError(''); setMessage('')
    try {
      const doc = await quickReceipt({
        receipt_date: receiptDate,
        reference:    reference || 'Direct material receipt',
        lines: lines.map(row => ({
          material_id: Number(row.material_id),
          quantity:    Number(row.quantity),
        })),
      })
      setMessage(`Posted ${doc.gr_number} — ${doc.lines_posted} line(s)`)
      setLines([{ material_id: '', quantity: '' }])
      setReference('')
      onPosted && onPosted()
    } catch (e) {
      setError(e?.response?.data?.detail || 'Posting failed')
    } finally {
      setPosting(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Header */}
      <div style={{ background: '#fff', border: '1px solid #d9dadb', borderBottom: 'none', padding: '14px 16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 16, alignItems: 'end' }}>
          <div>
            <div style={{ fontSize: 11, color: '#6a6d70', marginBottom: 4 }}>Receipt Date</div>
            <input
              type="date" value={receiptDate} max={today}
              onChange={e => setReceiptDate(e.target.value)}
              style={{ ...inputStyle, width: '100%' }}
            />
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#6a6d70', marginBottom: 4 }}>Reference / Reason</div>
            <input
              value={reference}
              onChange={e => setReference(e.target.value)}
              placeholder="e.g. Opening stock, Return from store, Supplier delivery…"
              style={{ ...inputStyle, width: '100%' }}
            />
          </div>
        </div>
      </div>

      {/* Line items */}
      <div style={{ background: '#fff', border: '1px solid #d9dadb', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Line', 'Material', 'Quantity', 'Unit', 'Movement Type', ''].map(h => (
                <th key={h} style={{ padding: '7px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#6a6d70', textTransform: 'uppercase', letterSpacing: '.07em', background: '#f5f5f5', borderBottom: '1px solid #d9dadb' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.map((line, idx) => {
              const material = materialMap[line.material_id]
              return (
                <tr key={idx}>
                  <td style={{ padding: '7px 12px', fontFamily: 'var(--mono)', fontSize: 12, borderBottom: '1px solid #eeeeee', width: 60 }}>{idx + 1}</td>
                  <td style={{ padding: '5px 12px', borderBottom: '1px solid #eeeeee', minWidth: 220 }}>
                    <select value={line.material_id} onChange={e => updateRow(idx, { material_id: e.target.value })} style={{ ...inputStyle, width: '100%' }}>
                      <option value="">Select material</option>
                      {materials.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: '5px 12px', borderBottom: '1px solid #eeeeee', width: 160 }}>
                    <input
                      type="number" min="0" step={material?.base_unit === 'Bales' ? 1 : 0.1}
                      value={line.quantity}
                      onChange={e => updateRow(idx, { quantity: e.target.value })}
                      style={{ ...inputStyle, width: '100%', fontFamily: 'var(--mono)' }}
                    />
                  </td>
                  <td style={{ padding: '7px 12px', fontFamily: 'var(--mono)', fontSize: 12, color: '#6a6d70', borderBottom: '1px solid #eeeeee', width: 100 }}>{material?.base_unit || '-'}</td>
                  <td style={{ padding: '7px 12px', fontSize: 12, color: '#188f36', fontWeight: 600, borderBottom: '1px solid #eeeeee', width: 120 }}>GR</td>
                  <td style={{ padding: '5px 12px', borderBottom: '1px solid #eeeeee', width: 90 }}>
                    <button onClick={() => removeRow(idx)} disabled={lines.length === 1} style={{ ...inputStyle, cursor: lines.length === 1 ? 'not-allowed' : 'pointer', color: lines.length === 1 ? '#89919a' : '#bb0000' }}>Remove</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div style={{ background: '#fff', border: '1px solid #d9dadb', borderTop: 'none', padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button onClick={addRow} style={{ ...inputStyle, cursor: 'pointer' }}>Add Row</button>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {error   && <span style={{ fontSize: 12, color: '#bb0000' }}>{error}</span>}
          {message && <span style={{ fontSize: 12, color: '#188f36' }}>{message}</span>}
          <button
            disabled={!canPost || posting} onClick={post}
            style={{
              ...inputStyle,
              background:  canPost ? SAP_BLUE : '#f2f2f2',
              color:       canPost ? '#fff' : '#89919a',
              borderColor: canPost ? SAP_BLUE : '#d9dadb',
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

function Planning({ rows, onSaved }) {
  const [drafts, setDrafts] = useState({})
  const [price, setPrice] = useState({ material_id: '', price: '', price_date: new Date().toISOString().slice(0, 10) })

  useEffect(() => {
    setDrafts(Object.fromEntries(rows.map(r => [r.material_id, {
      lead_time_days: r.lead_time_days,
      safety_stock_qty: r.safety_stock_qty,
      reorder_qty: r.reorder_qty,
      critical_days_left: 2,
    }])))
  }, [rows])

  const saveRow = async (materialId) => {
    const d = drafts[materialId]
    await updateMaterialPlanning(materialId, {
      lead_time_days: Number(d.lead_time_days),
      safety_stock_qty: Number(d.safety_stock_qty),
      reorder_qty: Number(d.reorder_qty),
      critical_days_left: Number(d.critical_days_left || 2),
    })
    onSaved()
  }

  const savePrice = async () => {
    if (!price.material_id || !price.price) return
    await addMaterialMarketPrice(price.material_id, {
      price_date: price.price_date,
      price: Number(price.price),
    })
    setPrice({ ...price, price: '' })
    onSaved()
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16 }}>
      <div style={{ background: '#fff', border: '1px solid #d9dadb', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Material', 'Lead Time', 'Safety Stock', 'Reorder Qty', 'Reorder Level', 'Price Trend', ''].map(h => (
                <th key={h} style={{ padding: '7px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#6a6d70', textTransform: 'uppercase', letterSpacing: '.07em', background: '#f5f5f5', borderBottom: '1px solid #d9dadb' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const draft = drafts[r.material_id] || {}
              return (
                <tr key={r.material_id}>
                  <td style={{ padding: '8px 12px', fontSize: 12, fontWeight: 600, borderBottom: '1px solid #eeeeee' }}>{r.material_name}</td>
                  <td style={{ padding: '5px 12px', borderBottom: '1px solid #eeeeee' }}><input type="number" value={draft.lead_time_days ?? ''} onChange={e => setDrafts({ ...drafts, [r.material_id]: { ...draft, lead_time_days: e.target.value } })} style={{ ...inputStyle, width: 86 }} /></td>
                  <td style={{ padding: '5px 12px', borderBottom: '1px solid #eeeeee' }}><input type="number" value={draft.safety_stock_qty ?? ''} onChange={e => setDrafts({ ...drafts, [r.material_id]: { ...draft, safety_stock_qty: e.target.value } })} style={{ ...inputStyle, width: 100 }} /></td>
                  <td style={{ padding: '5px 12px', borderBottom: '1px solid #eeeeee' }}><input type="number" value={draft.reorder_qty ?? ''} onChange={e => setDrafts({ ...drafts, [r.material_id]: { ...draft, reorder_qty: e.target.value } })} style={{ ...inputStyle, width: 100 }} /></td>
                  <td style={{ padding: '8px 12px', fontFamily: 'var(--mono)', fontSize: 12, borderBottom: '1px solid #eeeeee' }}>{fmt(r.reorder_level, r.unit)}</td>
                  <td style={{ padding: '8px 12px', fontSize: 11, color: '#6a6d70', textTransform: 'uppercase', borderBottom: '1px solid #eeeeee' }}>{r.price_trend}</td>
                  <td style={{ padding: '5px 12px', borderBottom: '1px solid #eeeeee' }}><button onClick={() => saveRow(r.material_id)} style={{ ...inputStyle, cursor: 'pointer' }}>Save</button></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
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
    </div>
  )
}

export default function InventoryPlanning({ mode = 'stock' }) {
  const [rows, setRows] = useState([])
  const [materials, setMaterials] = useState([])
  const [movements, setMovements] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      // allSettled so each call resolves independently — a failing overview
      // never prevents materials from populating the dropdowns.
      const [overviewRes, materialsRes, movementsRes] = await Promise.allSettled([
        getInventoryOverview(),
        getMaterials(),
        getInventoryMovements({ limit: 200 }),
      ])
      if (overviewRes.status  === 'fulfilled') setRows(overviewRes.value)
      if (materialsRes.status === 'fulfilled') setMaterials(materialsRes.value)
      if (movementsRes.status === 'fulfilled') setMovements(movementsRes.value)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const titles = {
    stock:     ['Stock Overview',    'Current stock, days left, and reorder status'],
    issue:     ['Material Issue',    'Post goods issue documents for daily production'],
    receipt:   ['Material Receipt',  'Post direct stock receipt without a purchase order'],
    movements: ['Material Movements','Auditable goods issue and goods receipt ledger'],
    planning:  ['Planning (MRP)',    'Lead time, safety stock, price trend, and reorder parameters'],
    materials: ['Material Master',   'Create and manage the list of materials used in production'],
  }
  const [title, subtitle] = titles[mode] || titles.stock

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <PageBar title={title} subtitle={subtitle} onRefresh={load} />
      {mode === 'stock'     && <StockOverview   rows={rows}           loading={loading} />}
      {mode === 'issue'     && <MaterialIssue   materials={materials} onPosted={load} />}
      {mode === 'receipt'   && <MaterialReceipt materials={materials} onPosted={load} />}
      {mode === 'movements' && <MaterialMovements movements={movements} loading={loading} />}
      {mode === 'planning'  && <Planning         rows={rows}           onSaved={load} />}
      {mode === 'materials' && <MaterialMaster   materials={materials} onChanged={load} />}
    </div>
  )
}
