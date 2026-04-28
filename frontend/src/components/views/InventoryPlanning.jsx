import { useCallback, useEffect, useRef, useState } from 'react'
import {
  addMaterialMarketPrice,
  createMaterial,
  createMaterialIssue,
  createVendor,
  deactivateMaterial,
  deactivateVendor,
  getInventoryMovements,
  getInventoryOverview,
  getMaterials,
  getVendors,
  postDirectGR,
  updateMaterial,
  updateMaterialPlanning,
  updateVendor,
} from '../../api.js'
import { Spinner } from '../Primitives.jsx'

/* ── Design tokens (SAP Fiori-inspired) ────────────────────────────────────── */
const B   = '#012169'   // SAP blue
const BD  = '#89919a'   // border
const ERR = '#bb0000'
const OK  = '#188f36'

const cell  = { padding: '8px 12px', fontSize: 12, borderBottom: '1px solid #eeeeee' }
const hCell = { padding: '7px 12px', fontSize: 11, fontWeight: 600, color: '#6a6d70',
                textTransform: 'uppercase', letterSpacing: '.07em',
                background: '#f5f5f5', borderBottom: '1px solid #d9dadb', whiteSpace: 'nowrap' }

const inp = {
  padding: '5px 8px', fontSize: 12,
  border: `1px solid ${BD}`, borderRadius: 2,
  background: '#fff', color: '#32363a', fontFamily: 'var(--font)',
  boxSizing: 'border-box',
}
const btn = (active = true, danger = false) => ({
  ...inp,
  cursor: active ? 'pointer' : 'not-allowed',
  background:  danger ? ERR : active ? B : '#f2f2f2',
  color:       active ? '#fff' : '#89919a',
  borderColor: danger ? ERR : active ? B : '#d9dadb',
  fontWeight: 600,
  opacity: active ? 1 : 0.6,
})

const COMMON_UNITS = ['Bales', 'Kg', 'Cones', 'Bobbins', 'Bags', 'Litres', 'Nos', 'Rolls']
const MAT_CATEGORIES = ['Raw Material', 'Dyes & Chemicals', 'Packing Material', 'Spare Parts', 'Consumables', 'Other']

/* ── Helpers ───────────────────────────────────────────────────────────────── */
function fmt(n, unit = '') {
  if (n === null || n === undefined) return '-'
  return `${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}${unit ? ' ' + unit : ''}`
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
   VENDOR MASTER
══════════════════════════════════════════════════════════════════════════════ */
function VendorMaster({ vendors, onChanged }) {
  const blank = { code: '', name: '', contact_person: '', phone: '', email: '', gst_number: '', address: '' }
  const [form, setForm]     = useState(blank)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(null)   // vendor id being edited
  const [editDraft, setEditDraft] = useState({})
  const [msg, setMsg]       = useState('')
  const [err, setErr]       = useState('')

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))
  const canSave = form.code.trim() && form.name.trim()

  const save = async () => {
    setSaving(true); setErr(''); setMsg('')
    try {
      const v = await createVendor(form)
      setMsg(`Created: ${v.code} — ${v.name}`)
      setForm(blank)
      onChanged(v, 'add')
    } catch (e) { setErr(errMsg(e)) } finally { setSaving(false) }
  }

  const saveEdit = async (id) => {
    try {
      const v = await updateVendor(id, editDraft)
      setEditing(null)
      onChanged(v, 'update')
    } catch (e) { setErr(errMsg(e)) }
  }

  const deactivate = async (id, name) => {
    if (!window.confirm(`Deactivate vendor "${name}"?`)) return
    try { await deactivateVendor(id); onChanged({ id }, 'remove') }
    catch (e) { setErr(errMsg(e)) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Add form */}
      <div style={{ background: '#fff', border: '1px solid #d9dadb', borderBottom: 'none', padding: '14px 16px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#6a6d70', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 12 }}>Add New Vendor</div>
        <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 1fr 140px 140px', gap: 10, marginBottom: 10 }}>
          {[['code','Vendor Code'],['name','Vendor Name'],['gst_number','GST Number'],['phone','Phone']].map(([k,label]) => (
            <div key={k}>
              <div style={{ fontSize: 11, color: '#6a6d70', marginBottom: 3 }}>{label}{k === 'code' || k === 'name' ? ' *' : ''}</div>
              <input value={form[k]} onChange={set(k)} style={{ ...inp, width: '100%' }} placeholder={label} />
            </div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 10, alignItems: 'end' }}>
          {[['email','Email'],['address','Address / City']].map(([k,label]) => (
            <div key={k}>
              <div style={{ fontSize: 11, color: '#6a6d70', marginBottom: 3 }}>{label}</div>
              <input value={form[k]} onChange={set(k)} style={{ ...inp, width: '100%' }} placeholder={label} />
            </div>
          ))}
          <button disabled={!canSave || saving} onClick={save} style={btn(canSave && !saving)}>
            {saving ? 'Saving…' : 'Add Vendor'}
          </button>
        </div>
        {(err || msg) && (
          <div style={{ marginTop: 8, fontSize: 12, color: err ? ERR : OK }}>{err || msg}</div>
        )}
      </div>

      {/* Vendor list */}
      <div style={{ background: '#fff', border: '1px solid #d9dadb', overflowX: 'auto' }}>
        {vendors.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: '#89919a', fontSize: 13 }}>No vendors yet. Add your first vendor above.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{['Code','Name','GST Number','Phone','Email','Status',''].map(h => <th key={h} style={hCell}>{h}</th>)}</tr></thead>
            <tbody>
              {vendors.map((v, i) => editing === v.id ? (
                <tr key={v.id} style={{ background: '#f0f4ff' }}>
                  <td style={cell}><input value={editDraft.code || v.code} onChange={e => setEditDraft(d => ({ ...d, code: e.target.value }))} style={{ ...inp, width: 100 }} disabled /></td>
                  <td style={cell}><input value={editDraft.name ?? v.name} onChange={e => setEditDraft(d => ({ ...d, name: e.target.value }))} style={{ ...inp, width: '100%' }} /></td>
                  <td style={cell}><input value={editDraft.gst_number ?? v.gst_number ?? ''} onChange={e => setEditDraft(d => ({ ...d, gst_number: e.target.value }))} style={{ ...inp, width: 130 }} /></td>
                  <td style={cell}><input value={editDraft.phone ?? v.phone ?? ''} onChange={e => setEditDraft(d => ({ ...d, phone: e.target.value }))} style={{ ...inp, width: 110 }} /></td>
                  <td style={cell}><input value={editDraft.email ?? v.email ?? ''} onChange={e => setEditDraft(d => ({ ...d, email: e.target.value }))} style={{ ...inp, width: 160 }} /></td>
                  <td style={cell} />
                  <td style={{ ...cell, display: 'flex', gap: 6 }}>
                    <button onClick={() => saveEdit(v.id)} style={btn(true)}>Save</button>
                    <button onClick={() => setEditing(null)} style={{ ...inp, cursor: 'pointer' }}>Cancel</button>
                  </td>
                </tr>
              ) : (
                <tr key={v.id} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                  <td style={{ ...cell, fontFamily: 'var(--mono)', fontWeight: 700, color: B }}>{v.code}</td>
                  <td style={{ ...cell, fontWeight: 600 }}>{v.name}</td>
                  <td style={{ ...cell, fontFamily: 'var(--mono)' }}>{v.gst_number || '—'}</td>
                  <td style={cell}>{v.phone || '—'}</td>
                  <td style={cell}>{v.email || '—'}</td>
                  <td style={cell}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: v.status === 'active' ? OK : '#89919a' }}>
                      {v.status.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ ...cell, display: 'flex', gap: 6 }}>
                    <button onClick={() => { setEditing(v.id); setEditDraft({}) }} style={{ ...inp, cursor: 'pointer', fontSize: 11 }}>Edit</button>
                    {v.status === 'active' && (
                      <button onClick={() => deactivate(v.id, v.name)} style={{ ...inp, cursor: 'pointer', color: ERR, fontSize: 11 }}>Deactivate</button>
                    )}
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
   MATERIAL MASTER  (with inline Edit + soft Archive)
══════════════════════════════════════════════════════════════════════════════ */
function MaterialMaster({ materials, onChanged }) {
  const blank = { code: '', name: '', base_unit: 'Bales', category: '', description: '' }
  const [form,     setForm]     = useState(blank)
  const [saving,   setSaving]   = useState(false)
  const [editing,  setEditing]  = useState(null)   // material id being edited
  const [editDraft, setEditDraft] = useState({})
  const [editSaving, setEditSaving] = useState(false)
  const [archiving, setArchiving] = useState(null)  // material id being archived
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  const setF = k => e => setForm(f => ({ ...f, [k]: e.target.value }))
  const canSave = form.code.trim() && form.name.trim() && form.base_unit.trim()

  /* ── Add new ── */
  const save = async () => {
    setSaving(true); setErr(''); setMsg('')
    try {
      const m = await createMaterial(form)
      setMsg(`Added: ${m.code} — ${m.name}`)
      setForm(blank)
      onChanged(m, 'add')
    } catch (e) { setErr(errMsg(e)) } finally { setSaving(false) }
  }

  /* ── Inline edit ── */
  const startEdit = (m) => {
    setEditing(m.id)
    setEditDraft({ code: m.code, name: m.name, base_unit: m.base_unit, category: m.category || '', description: m.description || '' })
    setErr('')
  }
  const cancelEdit = () => { setEditing(null); setEditDraft({}) }
  const saveEdit = async (id) => {
    setEditSaving(true); setErr('')
    try {
      const updated = await updateMaterial(id, {
        code:        editDraft.code?.trim() || undefined,
        name:        editDraft.name?.trim() || undefined,
        base_unit:   editDraft.base_unit?.trim() || undefined,
        category:    editDraft.category  || undefined,
        description: editDraft.description || undefined,
      })
      setEditing(null)
      onChanged(updated, 'update')
    } catch (e) { setErr(errMsg(e)) } finally { setEditSaving(false) }
  }

  /* ── Archive (soft delete) ── */
  const archive = async (m) => {
    if (!window.confirm(
      `Archive "${m.name}"?\n\n` +
      `It will be hidden from all operator dropdowns immediately.\n` +
      `Historical receipts and movements that reference this material will remain intact.`
    )) return
    setArchiving(m.id)
    try {
      await deactivateMaterial(m.id)
      onChanged({ id: m.id }, 'remove')
    } catch (e) { setErr(errMsg(e)) } finally { setArchiving(null) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* ── Add form ── */}
      <div style={{ background: '#fff', border: '1px solid #d9dadb', borderBottom: 'none', padding: '14px 16px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#6a6d70', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 12 }}>Add New Material</div>
        <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr 150px 180px', gap: 10, marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 11, color: '#6a6d70', marginBottom: 3 }}>Material Code *</div>
            <input value={form.code} onChange={setF('code')}
              placeholder="e.g. RM-COTTON-01" style={{ ...inp, width: '100%', fontFamily: 'var(--mono)', textTransform: 'uppercase' }} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#6a6d70', marginBottom: 3 }}>Material Name *</div>
            <input value={form.name} onChange={setF('name')}
              placeholder="e.g. Raw Cotton — Shankar 6" style={{ ...inp, width: '100%' }} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#6a6d70', marginBottom: 3 }}>Unit of Measure *</div>
            <select value={form.base_unit} onChange={setF('base_unit')} style={{ ...inp, width: '100%' }}>
              {COMMON_UNITS.map(u => <option key={u}>{u}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#6a6d70', marginBottom: 3 }}>Category</div>
            <select value={form.category} onChange={setF('category')} style={{ ...inp, width: '100%' }}>
              <option value="">— Select —</option>
              {MAT_CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'end' }}>
          <div>
            <div style={{ fontSize: 11, color: '#6a6d70', marginBottom: 3 }}>Description</div>
            <input value={form.description} onChange={setF('description')}
              placeholder="Optional description" style={{ ...inp, width: '100%' }} />
          </div>
          <button disabled={!canSave || saving} onClick={save} style={btn(canSave && !saving)}>
            {saving ? 'Saving…' : 'Add Material'}
          </button>
        </div>
        {(err || msg) && <div style={{ marginTop: 8, fontSize: 12, color: err ? ERR : OK }}>{err || msg}</div>}
      </div>

      {/* ── Material list ── */}
      <div style={{ background: '#fff', border: '1px solid #d9dadb', overflowX: 'auto' }}>
        {materials.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: '#89919a', fontSize: 13 }}>No materials yet. Add your first material above.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>{['#', 'Code', 'Name', 'Unit', 'Category', 'Description', ''].map(h => <th key={h} style={hCell}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {materials.map((m, i) => editing === m.id ? (
                /* ── Edit row ── */
                <tr key={m.id} style={{ background: '#f0f4ff' }}>
                  <td style={{ ...cell, color: '#89919a', width: 40 }}>{i + 1}</td>
                  <td style={{ padding: '5px 12px', borderBottom: '1px solid #eee' }}>
                    <input value={editDraft.code} onChange={e => setEditDraft(d => ({ ...d, code: e.target.value }))}
                      style={{ ...inp, width: 130, fontFamily: 'var(--mono)', textTransform: 'uppercase' }} />
                  </td>
                  <td style={{ padding: '5px 12px', borderBottom: '1px solid #eee' }}>
                    <input value={editDraft.name} onChange={e => setEditDraft(d => ({ ...d, name: e.target.value }))}
                      style={{ ...inp, width: '100%' }} />
                  </td>
                  <td style={{ padding: '5px 12px', borderBottom: '1px solid #eee', width: 120 }}>
                    <select value={editDraft.base_unit} onChange={e => setEditDraft(d => ({ ...d, base_unit: e.target.value }))} style={{ ...inp, width: '100%' }}>
                      {COMMON_UNITS.map(u => <option key={u}>{u}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: '5px 12px', borderBottom: '1px solid #eee', width: 150 }}>
                    <select value={editDraft.category} onChange={e => setEditDraft(d => ({ ...d, category: e.target.value }))} style={{ ...inp, width: '100%' }}>
                      <option value="">— None —</option>
                      {MAT_CATEGORIES.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: '5px 12px', borderBottom: '1px solid #eee' }}>
                    <input value={editDraft.description} onChange={e => setEditDraft(d => ({ ...d, description: e.target.value }))}
                      placeholder="Optional" style={{ ...inp, width: '100%' }} />
                  </td>
                  <td style={{ padding: '5px 12px', borderBottom: '1px solid #eee', whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => saveEdit(m.id)} disabled={editSaving} style={btn(!editSaving)}>
                        {editSaving ? '…' : 'Save'}
                      </button>
                      <button onClick={cancelEdit} style={{ ...inp, cursor: 'pointer', fontSize: 11 }}>Cancel</button>
                    </div>
                  </td>
                </tr>
              ) : (
                /* ── Read row ── */
                <tr key={m.id} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                  <td style={{ ...cell, color: '#89919a', width: 40 }}>{i + 1}</td>
                  <td style={{ ...cell, fontFamily: 'var(--mono)', fontWeight: 700, color: B }}>{m.code}</td>
                  <td style={{ ...cell, fontWeight: 600 }}>{m.name}</td>
                  <td style={{ ...cell, fontFamily: 'var(--mono)', color: '#6a6d70' }}>{m.base_unit}</td>
                  <td style={{ ...cell, fontSize: 11, color: '#6a6d70' }}>{m.category || '—'}</td>
                  <td style={{ ...cell, fontSize: 11, color: '#89919a', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {m.description || '—'}
                  </td>
                  <td style={{ ...cell, whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => startEdit(m)}
                        style={{ ...inp, cursor: 'pointer', fontSize: 11 }}>
                        Edit
                      </button>
                      <button
                        disabled={archiving === m.id}
                        onClick={() => archive(m)}
                        style={{ ...inp, cursor: archiving === m.id ? 'not-allowed' : 'pointer', color: '#b55b00', borderColor: '#e8a87c', fontSize: 11 }}>
                        {archiving === m.id ? '…' : 'Archive'}
                      </button>
                    </div>
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
   STOCK OVERVIEW
══════════════════════════════════════════════════════════════════════════════ */
function StockOverview({ rows, loading }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #d9dadb', overflowX: 'auto' }}>
      {loading ? (
        <div style={{ padding: 48, textAlign: 'center' }}><Spinner /></div>
      ) : rows.length === 0 ? (
        <div style={{ padding: 32, textAlign: 'center', color: '#89919a', fontSize: 13 }}>
          No stock data. Post a Goods Receipt to add opening stock.
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>{['Material','Unit','Current Stock','Avg / Day (7d)','Days Left','Reorder Level','Status','Action'].map(h => <th key={h} style={hCell}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.material_id} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                <td style={{ ...cell, fontWeight: 600 }}>{r.material_name}</td>
                <td style={{ ...cell, fontFamily: 'var(--mono)', color: '#89919a' }}>{r.unit}</td>
                <td style={{ ...cell, fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700, color: B }}>{fmt(r.stock)}</td>
                <td style={{ ...cell, fontFamily: 'var(--mono)' }}>{fmt(r.avg_consumption_7d)}</td>
                <td style={{ ...cell, fontFamily: 'var(--mono)' }}>{r.days_left ? `~${r.days_left}d` : '—'}</td>
                <td style={{ ...cell, fontFamily: 'var(--mono)' }}>{fmt(r.reorder_level)}</td>
                <td style={{ ...cell, fontSize: 11, fontWeight: 700, color: statusColor(r.status), whiteSpace: 'nowrap' }}>{r.status}</td>
                <td style={{ ...cell, fontSize: 11, fontWeight: 600, color: r.action === 'ORDER NOW' ? ERR : '#6a6d70' }}>{r.action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════════════
   MATERIAL RECEIPT (Direct GR — vendor required, optional file attachment)
══════════════════════════════════════════════════════════════════════════════ */
function MaterialReceipt({ materials, vendors, onPosted }) {
  const today = new Date().toISOString().slice(0, 10)
  const [vendorId,     setVendorId]     = useState('')
  const [receiptDate,  setReceiptDate]  = useState(today)
  const [reference,    setReference]    = useState('')
  const [notes,        setNotes]        = useState('')
  const [lines,        setLines]        = useState([{ material_id: '', quantity: '' }])
  const [file,         setFile]         = useState(null)
  const [posting,      setPosting]      = useState(false)
  const [message,      setMessage]      = useState('')
  const [error,        setError]        = useState('')
  const fileRef = useRef()

  const matMap = Object.fromEntries(materials.map(m => [String(m.id), m]))
  const addRow    = () => setLines(p => [...p, { material_id: '', quantity: '' }])
  const removeRow = i  => setLines(p => p.length === 1 ? p : p.filter((_, j) => j !== i))
  const updateRow = (i, patch) => setLines(p => p.map((r, j) => j === i ? { ...r, ...patch } : r))

  const canPost = vendorId && lines.every(r => r.material_id && Number(r.quantity) > 0)

  const post = async () => {
    setPosting(true); setError(''); setMessage('')
    try {
      const doc = await postDirectGR({
        vendor_id:    Number(vendorId),
        receipt_date: receiptDate,
        reference:    reference || undefined,
        notes:        notes || undefined,
        lines: lines.map(r => ({
          material_id:       Number(r.material_id),
          quantity_received: Number(r.quantity),
        })),
      }, file)
      setMessage(`Posted ${doc.gr_number} — ${doc.lines.length} line(s) ✓`)
      setLines([{ material_id: '', quantity: '' }])
      setReference(''); setNotes(''); setFile(null)
      if (fileRef.current) fileRef.current.value = ''
      onPosted && onPosted()
    } catch (e) { setError(errMsg(e)) } finally { setPosting(false) }
  }

  const activeVendors = vendors.filter(v => v.status === 'active')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Header */}
      <div style={{ background: '#fff', border: '1px solid #d9dadb', borderBottom: 'none', padding: '14px 16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '220px 180px 1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 11, color: '#6a6d70', marginBottom: 3 }}>Vendor *</div>
            <select value={vendorId} onChange={e => setVendorId(e.target.value)} style={{ ...inp, width: '100%' }}>
              <option value="">— Select Vendor —</option>
              {activeVendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
            {activeVendors.length === 0 && (
              <div style={{ fontSize: 11, color: ERR, marginTop: 3 }}>No active vendors — add one in Vendor Master first</div>
            )}
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#6a6d70', marginBottom: 3 }}>Receipt Date</div>
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
          {file && (
            <span style={{ fontSize: 11, color: OK, fontWeight: 600 }}>📎 {file.name}</span>
          )}
        </div>
      </div>

      {/* Lines */}
      <div style={{ background: '#fff', border: '1px solid #d9dadb', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>{['Line','Material','Quantity','Unit','Movement',''].map(h => <th key={h} style={hCell}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {lines.map((line, idx) => {
              const mat = matMap[line.material_id]
              return (
                <tr key={idx}>
                  <td style={{ ...cell, width: 50, fontFamily: 'var(--mono)', color: '#89919a' }}>{idx + 1}</td>
                  <td style={{ padding: '5px 12px', borderBottom: '1px solid #eee', minWidth: 240 }}>
                    <select value={line.material_id} onChange={e => updateRow(idx, { material_id: e.target.value })} style={{ ...inp, width: '100%' }}>
                      <option value="">✓ Select material</option>
                      {materials.map(m => <option key={m.id} value={m.id}>{m.name} ({m.base_unit})</option>)}
                    </select>
                  </td>
                  <td style={{ padding: '5px 12px', borderBottom: '1px solid #eee', width: 140 }}>
                    <input type="number" min="0.01" step="0.01" value={line.quantity}
                      onChange={e => updateRow(idx, { quantity: e.target.value })}
                      style={{ ...inp, width: '100%', fontFamily: 'var(--mono)' }} />
                  </td>
                  <td style={{ ...cell, fontFamily: 'var(--mono)', color: '#6a6d70', width: 80 }}>{mat?.base_unit || '—'}</td>
                  <td style={{ ...cell, color: OK, fontWeight: 700, width: 80 }}>GR</td>
                  <td style={{ padding: '5px 12px', borderBottom: '1px solid #eee', width: 80 }}>
                    <button onClick={() => removeRow(idx)} disabled={lines.length === 1}
                      style={{ ...inp, cursor: lines.length === 1 ? 'not-allowed' : 'pointer', color: lines.length === 1 ? '#89919a' : ERR, fontSize: 11 }}>Remove</button>
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
   MATERIAL ISSUE (daily — no shift)
══════════════════════════════════════════════════════════════════════════════ */
function MaterialIssue({ materials, stockRows, onPosted }) {
  const today = new Date().toISOString().slice(0, 10)
  const [issueDate,  setIssueDate]  = useState(today)
  const [reference,  setReference]  = useState('Daily Production')
  const [lines,      setLines]      = useState([{ material_id: '', quantity: '' }])
  const [posting,    setPosting]    = useState(false)
  const [message,    setMessage]    = useState('')
  const [error,      setError]      = useState('')

  const matMap   = Object.fromEntries(materials.map(m => [String(m.id), m]))
  const stockMap = Object.fromEntries(stockRows.map(r => [r.material_id, r.stock]))

  const addRow    = () => setLines(p => [...p, { material_id: '', quantity: '' }])
  const removeRow = i  => setLines(p => p.length === 1 ? p : p.filter((_, j) => j !== i))
  const updateRow = (i, patch) => setLines(p => p.map((r, j) => j === i ? { ...r, ...patch } : r))

  const lineErrors = lines.map(r => {
    if (!r.material_id || !r.quantity) return null
    const onHand = stockMap[Number(r.material_id)] ?? 0
    const qty    = Number(r.quantity)
    if (qty > onHand) return `Only ${onHand} ${matMap[r.material_id]?.base_unit || ''} available`
    return null
  })
  const canPost = lines.every((r, i) => r.material_id && Number(r.quantity) > 0 && !lineErrors[i])

  const post = async () => {
    setPosting(true); setError(''); setMessage('')
    try {
      const doc = await createMaterialIssue({
        issue_date: issueDate,
        reference,
        lines: lines.map(r => ({ material_id: Number(r.material_id), quantity: Number(r.quantity) })),
      })
      setMessage(`Posted ${doc.document_number} ✓`)
      setLines([{ material_id: '', quantity: '' }])
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
            <tr>{['Line','Material','Available Stock','Quantity to Issue','Unit','Movement',''].map(h => <th key={h} style={hCell}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {lines.map((line, idx) => {
              const mat    = matMap[line.material_id]
              const onHand = line.material_id ? (stockMap[Number(line.material_id)] ?? 0) : null
              const lineErr = lineErrors[idx]
              return (
                <tr key={idx} style={{ background: lineErr ? '#fff5f5' : undefined }}>
                  <td style={{ ...cell, width: 50, fontFamily: 'var(--mono)', color: '#89919a' }}>{idx + 1}</td>
                  <td style={{ padding: '5px 12px', borderBottom: '1px solid #eee', minWidth: 240 }}>
                    <select value={line.material_id} onChange={e => updateRow(idx, { material_id: e.target.value, quantity: '' })} style={{ ...inp, width: '100%' }}>
                      <option value="">Select material</option>
                      {materials.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                  </td>
                  <td style={{ ...cell, fontFamily: 'var(--mono)', fontWeight: 700,
                               color: onHand === 0 ? ERR : onHand > 0 ? OK : '#89919a', width: 130 }}>
                    {onHand !== null ? `${onHand} ${mat?.base_unit || ''}` : '—'}
                  </td>
                  <td style={{ padding: '5px 12px', borderBottom: '1px solid #eee', width: 150 }}>
                    <input type="number" min="0.01" step="0.01" value={line.quantity}
                      onChange={e => updateRow(idx, { quantity: e.target.value })}
                      style={{ ...inp, width: '100%', fontFamily: 'var(--mono)',
                               borderColor: lineErr ? ERR : BD }} />
                    {lineErr && <div style={{ fontSize: 10, color: ERR, marginTop: 2 }}>{lineErr}</div>}
                  </td>
                  <td style={{ ...cell, fontFamily: 'var(--mono)', color: '#6a6d70', width: 80 }}>{mat?.base_unit || '—'}</td>
                  <td style={{ ...cell, color: ERR, fontWeight: 700, width: 80 }}>GI</td>
                  <td style={{ padding: '5px 12px', borderBottom: '1px solid #eee', width: 80 }}>
                    <button onClick={() => removeRow(idx)} disabled={lines.length === 1}
                      style={{ ...inp, cursor: lines.length === 1 ? 'not-allowed' : 'pointer', color: lines.length === 1 ? '#89919a' : ERR, fontSize: 11 }}>Remove</button>
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
              <tr>{['Doc #','Material','Date','Type','Qty','Unit','Source','Notes'].map(h => <th key={h} style={hCell}>{h}</th>)}</tr>
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
   PLANNING (MRP params + market price)
══════════════════════════════════════════════════════════════════════════════ */
function Planning({ rows, onSaved }) {
  const [drafts, setDrafts] = useState({})
  const [price,  setPrice]  = useState({ material_id: '', price: '', price_date: new Date().toISOString().slice(0, 10) })

  useEffect(() => {
    setDrafts(Object.fromEntries(rows.map(r => [r.material_id, {
      lead_time_days:    r.lead_time_days,
      safety_stock_qty:  r.safety_stock_qty,
      reorder_qty:       r.reorder_qty,
      critical_days_left: 2,
    }])))
  }, [rows])

  const saveRow = async (materialId) => {
    const d = drafts[materialId]
    await updateMaterialPlanning(materialId, {
      lead_time_days:     Number(d.lead_time_days),
      safety_stock_qty:   Number(d.safety_stock_qty),
      reorder_qty:        Number(d.reorder_qty),
      critical_days_left: Number(d.critical_days_left || 2),
    })
    onSaved()
  }

  const savePrice = async () => {
    if (!price.material_id || !price.price) return
    await addMaterialMarketPrice(price.material_id, { price_date: price.price_date, price: Number(price.price) })
    setPrice(p => ({ ...p, price: '' }))
    onSaved()
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 16 }}>
      <div style={{ background: '#fff', border: '1px solid #d9dadb', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>{['Material','Lead Time (days)','Safety Stock','Reorder Qty','Reorder Level (calc)',''].map(h => <th key={h} style={hCell}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const d = drafts[r.material_id] || {}
              return (
                <tr key={r.material_id}>
                  <td style={{ ...cell, fontWeight: 600 }}>{r.material_name}</td>
                  {['lead_time_days','safety_stock_qty','reorder_qty'].map(k => (
                    <td key={k} style={{ padding: '5px 12px', borderBottom: '1px solid #eee' }}>
                      <input type="number" value={d[k] ?? ''} onChange={e => setDrafts(prev => ({ ...prev, [r.material_id]: { ...d, [k]: e.target.value } }))}
                        style={{ ...inp, width: 90, fontFamily: 'var(--mono)' }} />
                    </td>
                  ))}
                  <td style={{ ...cell, fontFamily: 'var(--mono)' }}>{fmt(r.reorder_level, r.unit)}</td>
                  <td style={{ padding: '5px 12px', borderBottom: '1px solid #eee' }}>
                    <button onClick={() => saveRow(r.material_id)} style={{ ...inp, cursor: 'pointer' }}>Save</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div style={{ background: '#fff', border: '1px solid #d9dadb' }}>
        <div style={{ padding: '10px 16px', borderBottom: '1px solid #d9dadb', fontSize: 13, fontWeight: 600 }}>Market Price Entry</div>
        <div style={{ padding: 16, display: 'grid', gap: 10 }}>
          <select value={price.material_id} onChange={e => setPrice(p => ({ ...p, material_id: e.target.value }))} style={inp}>
            <option value="">Select Material</option>
            {rows.map(r => <option key={r.material_id} value={r.material_id}>{r.material_name}</option>)}
          </select>
          <input type="date" value={price.price_date} onChange={e => setPrice(p => ({ ...p, price_date: e.target.value }))} style={inp} />
          <input type="number" value={price.price} onChange={e => setPrice(p => ({ ...p, price: e.target.value }))}
            placeholder="Market price (₹)" style={{ ...inp, fontFamily: 'var(--mono)' }} />
          <button onClick={savePrice} disabled={!price.material_id || !price.price} style={btn(price.material_id && price.price)}>Save Price</button>
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════════════
   ROOT COMPONENT
══════════════════════════════════════════════════════════════════════════════ */
export default function InventoryPlanning({ mode = 'stock' }) {
  const [rows,      setRows]      = useState([])
  const [materials, setMaterials] = useState([])
  const [vendors,   setVendors]   = useState([])
  const [movements, setMovements] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [loadErrors, setLoadErrors] = useState([])

  const load = useCallback(async () => {
    setLoading(true)
    setLoadErrors([])
    try {
      const [ovRes, matRes, venRes, movRes] = await Promise.allSettled([
        getInventoryOverview(),
        getMaterials(),
        getVendors(),
        getInventoryMovements({ limit: 300 }),
      ])
      const errs = []
      if (ovRes.status  === 'fulfilled') setRows(ovRes.value)
      else errs.push(`Stock overview: ${errMsg(ovRes.reason)}`)
      if (matRes.status === 'fulfilled') setMaterials(matRes.value)
      else errs.push(`Materials: ${errMsg(matRes.reason)}`)
      if (venRes.status === 'fulfilled') setVendors(venRes.value)
      else errs.push(`Vendors: ${errMsg(venRes.reason)}`)
      if (movRes.status === 'fulfilled') setMovements(movRes.value)
      else errs.push(`Movements: ${errMsg(movRes.reason)}`)
      if (errs.length) setLoadErrors(errs)
    } catch (e) {
      setLoadErrors([`Unexpected error: ${errMsg(e)}`])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  /* Optimistic updates so list reflects changes instantly */
  const onMaterialChanged = (item, op) => {
    if (op === 'add')    setMaterials(p => p.some(m => m.id === item.id) ? p : [...p, item])
    if (op === 'remove') setMaterials(p => p.filter(m => m.id !== item.id))
    if (op === 'update') setMaterials(p => p.map(m => m.id === item.id ? item : m))
    load()
  }
  const onVendorChanged = (item, op) => {
    if (op === 'add')    setVendors(p => p.some(v => v.id === item.id) ? p : [...p, item])
    if (op === 'remove') setVendors(p => p.filter(v => v.id !== item.id))
    if (op === 'update') setVendors(p => p.map(v => v.id === item.id ? item : v))
    load()
  }

  const TITLES = {
    vendors:   ['Vendor Master',       'Central vendor directory used across purchasing and receipts'],
    materials: ['Material Master',     'Raw materials and consumables registry'],
    stock:     ['Stock Overview',      'Current stock, days left, and reorder status'],
    receipt:   ['Material Receipt',    'Post vendor goods receipt — updates stock ledger'],
    issue:     ['Material Issue',      'Post daily goods issue — reduces stock ledger'],
    movements: ['Material Movements',  'Append-only inventory ledger (GR/GI audit trail)'],
    planning:  ['Planning (MRP)',      'Lead time, safety stock, reorder parameters'],
  }
  const [title, subtitle] = TITLES[mode] || TITLES.stock

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <PageBar title={title} subtitle={subtitle} onRefresh={load}>
        {loading && (
          <span style={{ fontSize: 11, color: '#89919a', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid #d9dadb', borderTopColor: B, borderRadius: '50%', animation: 'spin .7s linear infinite' }} />
            Loading…
          </span>
        )}
      </PageBar>

      {/* Surface any API errors as a non-blocking banner */}
      {loadErrors.length > 0 && (
        <div style={{ background: '#fff5f5', border: '1px solid #ffcccc', borderBottom: 'none', padding: '8px 16px' }}>
          {loadErrors.map((e, i) => (
            <div key={i} style={{ fontSize: 12, color: ERR }}>⚠ {e}</div>
          ))}
        </div>
      )}

      {/* All modes render immediately — no loading gate blocking forms */}
      {mode === 'vendors'   && <VendorMaster    vendors={vendors}      onChanged={onVendorChanged} />}
      {mode === 'materials' && <MaterialMaster  materials={materials}  onChanged={onMaterialChanged} />}
      {mode === 'stock'     && <StockOverview   rows={rows}            loading={loading} />}
      {mode === 'receipt'   && <MaterialReceipt materials={materials}  vendors={vendors} onPosted={load} />}
      {mode === 'issue'     && <MaterialIssue   materials={materials}  stockRows={rows}  onPosted={load} />}
      {mode === 'movements' && <MaterialMovements movements={movements} loading={loading} />}
      {mode === 'planning'  && <Planning         rows={rows}           onSaved={load} />}
    </div>
  )
}
