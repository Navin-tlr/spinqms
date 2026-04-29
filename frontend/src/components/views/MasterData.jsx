/**
 * MasterData.jsx — Business Partner + Material Master
 *
 * SAP Fiori table aesthetic: compact rows, thin borders, blue-accented
 * financial values, status badges, role chips.
 */
import { Fragment, useCallback, useEffect, useState } from 'react'
import {
  createBusinessPartner, deleteBusinessPartner, getBusinessPartners,
  updateBusinessPartner, addBPRole, removeBPRole,
  getMaterials, createMaterial, updateMaterial, deactivateMaterial,
  resetInventory,
} from '../../api.js'

/* ── SAP Fiori design tokens ────────────────────────────────────────────────── */
const SAP_BLUE   = '#0070f2'
const SAP_NAVY   = '#354a5e'
const BORDER     = '#d9dadb'
const BG_HDR     = '#f5f5f5'
const TXT_MAIN   = '#32363a'
const TXT_MUTED  = '#6a6d70'
const TXT_FAINT  = '#89919a'
const OK_GREEN   = '#188f36'
const ERR_RED    = '#bb0000'
const WARN_AMBER = '#df6e0c'
const BLOCKED_BG = '#fff4f4'

/* ── Material taxonomy ──────────────────────────────────────────────────────── */
export const MAT_TYPES = ['RAW_MATERIAL', 'MAINTENANCE', 'CONSUMABLE']
export const MAT_TYPE_LABELS = {
  RAW_MATERIAL: 'Raw Material',
  MAINTENANCE:  'Maintenance',
  CONSUMABLE:   'Consumable',
}
export const MAT_CATEGORIES = {
  RAW_MATERIAL: ['Cotton', 'Viscose', 'Lyocell', 'Polyester', 'Other'],
  MAINTENANCE:  ['Spare Parts (Mechanical)', 'Electrical Parts', 'Other'],
  CONSUMABLE:   ['Packing', 'Lubricants', 'General', 'Other'],
}
export const MAT_UNITS = ['Bales', 'Candy', 'Kg', 'Nos', 'Litres', 'Rolls', 'Bags', 'Sets']

/* ── BP roles ───────────────────────────────────────────────────────────────── */
const ALL_ROLES = ['MM_VENDOR', 'FI_VENDOR', 'FI_CUSTOMER', 'SD_CUSTOMER']
const ROLE_META = {
  MM_VENDOR:   { label: 'MM · Vendor',    color: '#0070f2', bg: '#e8f1fd' },
  FI_VENDOR:   { label: 'FI · Vendor',    color: '#df6e0c', bg: '#fff4e6' },
  FI_CUSTOMER: { label: 'FI · Customer',  color: '#6e00bd', bg: '#f5eaff' },
  SD_CUSTOMER: { label: 'SD · Customer',  color: '#188f36', bg: '#eafbee' },
}

/* ── Shared input/button style ──────────────────────────────────────────────── */
const inp = {
  padding: '5px 8px', fontSize: 12,
  border: `1px solid ${BORDER}`, borderRadius: 2,
  background: '#fff', color: TXT_MAIN,
  fontFamily: 'var(--font)', boxSizing: 'border-box',
  outline: 'none',
}
const primaryBtn = (active = true) => ({
  ...inp,
  cursor: active ? 'pointer' : 'not-allowed',
  background:  active ? SAP_NAVY : BG_HDR,
  color:       active ? '#fff' : TXT_FAINT,
  borderColor: active ? SAP_NAVY : BORDER,
  fontWeight: 600,
  opacity: active ? 1 : 0.65,
  whiteSpace: 'nowrap',
})
const ghostBtn = () => ({ ...inp, cursor: 'pointer', background: 'transparent' })
const dangerBtn = () => ({ ...inp, cursor: 'pointer', color: ERR_RED, borderColor: '#f5c0c0' })
const warnBtn = () => ({ ...inp, cursor: 'pointer', color: WARN_AMBER, borderColor: '#f5d9b0' })

/* ── Table cell styles ──────────────────────────────────────────────────────── */
const td  = { padding: '7px 12px', fontSize: 12, borderBottom: `1px solid #eeeeee`, color: TXT_MAIN }
const th  = {
  padding: '6px 12px', fontSize: 11, fontWeight: 600,
  color: TXT_MUTED, textTransform: 'uppercase', letterSpacing: '.07em',
  background: BG_HDR, borderBottom: `1px solid ${BORDER}`, whiteSpace: 'nowrap',
}
const inputTd = { padding: '4px 8px', borderBottom: `1px solid #eeeeee` }

function Err({ msg }) {
  if (!msg) return null
  return <div style={{ fontSize: 12, color: ERR_RED, marginTop: 6 }}>{msg}</div>
}
function Ok({ msg }) {
  if (!msg) return null
  return <div style={{ fontSize: 12, color: OK_GREEN, marginTop: 6 }}>{msg}</div>
}

function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, color: TXT_MUTED,
      textTransform: 'uppercase', letterSpacing: '.08em',
      marginBottom: 10,
    }}>{children}</div>
  )
}

function RoleChip({ role, onRemove }) {
  const m = ROLE_META[role] || { label: role, color: TXT_MUTED, bg: '#f5f5f5' }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 7px', fontSize: 10, fontWeight: 700,
      borderRadius: 10, border: `1px solid ${m.color}`,
      background: m.bg, color: m.color,
    }}>
      {m.label}
      {onRemove && (
        <button onClick={onRemove} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: m.color, padding: 0, fontSize: 11, lineHeight: 1,
        }}>×</button>
      )}
    </span>
  )
}

function StatusBadge({ status }) {
  const active  = status === 'Active'
  return (
    <span style={{
      fontSize: 10, fontWeight: 700,
      color:  active ? OK_GREEN : ERR_RED,
      background: active ? '#eafbee' : '#fff0f0',
      border: `1px solid ${active ? '#a9e0b5' : '#f5c0c0'}`,
      borderRadius: 10, padding: '1px 7px',
    }}>{status}</span>
  )
}

/* ── SAP value-help field (input + F4 trigger icon) ────────────────────────── */
const VH_ICON = (
  <svg viewBox="0 0 12 12" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="1" width="10" height="10" rx="1" />
    <line x1="1" y1="4" x2="11" y2="4" />
    <line x1="4" y1="4" x2="4" y2="11" />
  </svg>
)

function VHField({ label, value, onChange, options, placeholder, required, mono, disabled }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ position: 'relative' }}>
      <div style={{ fontSize: 11, color: TXT_MUTED, marginBottom: 3 }}>
        {label}{required && <span style={{ color: ERR_RED }}> *</span>}
      </div>
      <div style={{ display: 'flex', gap: 0 }}>
        <input
          value={value}
          onChange={onChange}
          disabled={disabled}
          placeholder={placeholder || label}
          style={{ ...inp, flex: 1, borderRight: 'none', borderRadius: '2px 0 0 2px',
            ...(mono ? { fontFamily: 'var(--mono)', textTransform: 'uppercase' } : {}),
          }}
        />
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          disabled={disabled}
          style={{
            width: 24, border: `1px solid ${BORDER}`, borderRadius: '0 2px 2px 0',
            background: open ? '#e8f1fd' : BG_HDR, color: open ? SAP_BLUE : TXT_MUTED,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}
          title="Open value list"
        >
          {VH_ICON}
        </button>
      </div>
      {open && options && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
          background: '#fff', border: `1px solid ${BORDER}`,
          boxShadow: '0 4px 12px rgba(0,0,0,.12)', maxHeight: 180, overflowY: 'auto',
        }}>
          {options.map(opt => (
            <div key={opt.value ?? opt}
              onClick={() => { onChange({ target: { value: opt.value ?? opt } }); setOpen(false) }}
              style={{
                padding: '7px 10px', fontSize: 12, cursor: 'pointer',
                background: (opt.value ?? opt) === value ? '#e8f1fd' : '#fff',
                color: (opt.value ?? opt) === value ? SAP_BLUE : TXT_MAIN,
                borderBottom: `1px solid #f0f0f0`,
                fontWeight: (opt.value ?? opt) === value ? 600 : 400,
              }}
            >
              {opt.label ?? opt}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const BP_CATEGORIES = [
  { value: 'Organization', label: 'Organization' },
  { value: 'Individual',   label: 'Individual / Person' },
]

const COUNTRY_OPTIONS = [
  'India', 'United States', 'United Kingdom', 'Germany', 'China',
  'Japan', 'Australia', 'Singapore', 'UAE', 'Bangladesh', 'Other',
]

const LANGUAGE_OPTIONS = [
  { value: 'EN', label: 'EN — English' },
  { value: 'HI', label: 'HI — Hindi' },
  { value: 'DE', label: 'DE — German' },
  { value: 'FR', label: 'FR — French' },
  { value: 'AR', label: 'AR — Arabic' },
  { value: 'ZH', label: 'ZH — Chinese' },
  { value: 'JA', label: 'JA — Japanese' },
]

/* ── Role multi-select value-help ───────────────────────────────────────── */
function RoleVHField({ selectedRoles, onToggle }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ position: 'relative' }}>
      <div style={{ fontSize: 11, color: TXT_MUTED, marginBottom: 3 }}>
        BP Role<span style={{ color: ERR_RED }}> *</span>
      </div>
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap',
          minHeight: 28, padding: '3px 4px 3px 6px',
          border: `1px solid ${BORDER}`, borderRadius: 2, cursor: 'pointer',
          background: '#fff', userSelect: 'none',
        }}
      >
        {selectedRoles.length === 0
          ? <span style={{ fontSize: 11, color: TXT_FAINT, flex: 1 }}>— Select roles —</span>
          : selectedRoles.map(r => <RoleChip key={r} role={r} />)
        }
        <span style={{ marginLeft: 'auto', color: open ? SAP_BLUE : TXT_MUTED, display: 'flex', alignItems: 'center' }}>{VH_ICON}</span>
      </div>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
          background: '#fff', border: `1px solid ${BORDER}`,
          boxShadow: '0 4px 12px rgba(0,0,0,.12)',
        }}>
          {ALL_ROLES.map(role => {
            const m = ROLE_META[role]
            const on = selectedRoles.includes(role)
            return (
              <div key={role}
                onClick={() => onToggle(role)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 12px', cursor: 'pointer',
                  background: on ? '#f0f4ff' : '#fff',
                  borderBottom: `1px solid #f0f0f0`,
                }}
              >
                <div style={{
                  width: 14, height: 14, border: `1.5px solid ${on ? SAP_BLUE : BORDER}`,
                  borderRadius: 2, background: on ? SAP_BLUE : '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  {on && <svg viewBox="0 0 10 10" width="8" height="8"><polyline points="1,5 4,8 9,2" stroke="#fff" strokeWidth="1.5" fill="none" /></svg>}
                </div>
                <RoleChip role={role} />
                <span style={{ fontSize: 11, color: TXT_MUTED, marginLeft: 4 }}>
                  {role === 'MM_VENDOR' ? '— Procurement supplier (required for GR / PO)'
                    : role === 'FI_VENDOR' ? '— Accounts payable'
                    : role === 'FI_CUSTOMER' ? '— Accounts receivable'
                    : '— Sales customer'}
                </span>
              </div>
            )
          })}
          <div style={{ padding: '6px 12px', fontSize: 11, color: TXT_FAINT, borderTop: `1px solid ${BORDER}` }}>
            Click to toggle · close by clicking outside
          </div>
        </div>
      )}
    </div>
  )
}

/* ── SAP two-column form row ─────────────────────────────────────────────── */
function FormRow({ label, children, required }) {
  return (
    <div style={{ display: 'contents' }}>
      <div style={{ fontSize: 12, color: TXT_MUTED, display: 'flex', alignItems: 'center', paddingRight: 8 }}>
        {label}{required && <span style={{ color: ERR_RED, marginLeft: 2 }}>*</span>}:
      </div>
      <div>{children}</div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════════════
   BUSINESS PARTNERS
══════════════════════════════════════════════════════════════════════════════ */
function BusinessPartners({ bps, onChanged }) {
  const blank = {
    bp_code: '', grouping: '', bp_category: 'Organization',
    name: '', name_2: '', contact_person: '', phone: '', email: '',
    gst_number: '', pan: '',
    street: '', house_number: '', city: '', postal_code: '',
    country: 'India', region: '', language: 'EN',
    roles: [],
  }
  const [form,      setForm]      = useState(blank)
  const [saving,    setSaving]    = useState(false)
  const [editing,   setEditing]   = useState(null)       // bp.id being edited
  const [editDraft, setEditDraft] = useState({})
  const [editSave,  setEditSave]  = useState(false)
  const [deleting,  setDeleting]  = useState(null)
  const [expanded,  setExpanded]  = useState(null)       // expanded bp.id in table
  const [msg, setMsg]  = useState('')
  const [err, setErr]  = useState('')

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))
  const toggleRole = role => setForm(f => ({
    ...f, roles: f.roles.includes(role) ? f.roles.filter(r => r !== role) : [...f.roles, role],
  }))
  const canSave = form.bp_code.trim() && form.name.trim() && form.roles.length > 0

  /* ── Create ── */
  const save = async () => {
    setSaving(true); setErr(''); setMsg('')
    try {
      const bp = await createBusinessPartner({ ...form, bp_code: form.bp_code.trim().toUpperCase() })
      setMsg(`Created: ${bp.bp_code} — ${bp.name}`)
      setForm(blank)
      onChanged(bp, 'add')
    } catch (e) { setErr(e?.response?.data?.detail || e.message) }
    finally { setSaving(false) }
  }

  /* ── Edit metadata ── */
  const startEdit = bp => {
    setEditing(bp.id)
    setEditDraft({
      name: bp.name, name_2: bp.name_2 || '', grouping: bp.grouping || '',
      bp_category: bp.bp_category || 'Organization',
      contact_person: bp.contact_person || '', phone: bp.phone || '',
      email: bp.email || '', gst_number: bp.gst_number || '', pan: bp.pan || '',
      street: bp.street || '', house_number: bp.house_number || '',
      city: bp.city || '', postal_code: bp.postal_code || '',
      country: bp.country || 'India', region: bp.region || '', language: bp.language || 'EN',
    })
    setErr('')
  }
  const cancelEdit = () => { setEditing(null); setEditDraft({}) }
  const saveEdit = async id => {
    setEditSave(true); setErr('')
    try {
      const bp = await updateBusinessPartner(id, editDraft)
      setEditing(null)
      onChanged(bp, 'update')
    } catch (e) { setErr(e?.response?.data?.detail || e.message) }
    finally { setEditSave(false) }
  }

  /* ── Role toggles (live patch on existing BP) ── */
  const toggleLiveRole = async (bp, role) => {
    const has = bp.roles.some(r => r.role === role)
    try {
      const updated = has ? await removeBPRole(bp.id, role) : await addBPRole(bp.id, role)
      onChanged(updated, 'update')
    } catch (e) { setErr(e?.response?.data?.detail || e.message) }
  }

  /* ── Block / Unblock ── */
  const toggleBlock = async bp => {
    try {
      const updated = await updateBusinessPartner(bp.id, {
        status: bp.status === 'Active' ? 'Blocked' : 'Active',
      })
      onChanged(updated, 'update')
    } catch (e) { setErr(e?.response?.data?.detail || e.message) }
  }

  /* ── Delete ── */
  const del = async bp => {
    if (!window.confirm(`Delete "${bp.name}"?\nThis is permanent and only allowed if no Goods Receipts have been posted against this partner.`)) return
    setDeleting(bp.id)
    try {
      await deleteBusinessPartner(bp.id)
      onChanged({ id: bp.id }, 'remove')
    } catch (e) { setErr(e?.response?.data?.detail || e.message) }
    finally { setDeleting(null) }
  }

  /* ── SAP two-column form panel ── */
  const formPanel = (draft, setD, isEdit = false) => (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0,
      border: `1px solid ${BORDER}`, marginBottom: isEdit ? 0 : undefined,
    }}>
      {/* ── LEFT: General Data ── */}
      <div style={{ padding: '16px 20px', borderRight: `1px solid ${BORDER}` }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: TXT_MUTED, textTransform: 'uppercase',
          letterSpacing: '.08em', marginBottom: 14, paddingBottom: 6, borderBottom: `1px solid ${BORDER}` }}>
          General Data
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: '10px 0', alignItems: 'start' }}>

          <FormRow label="Business Partner" required>
            <input
              value={draft.bp_code ?? ''}
              onChange={e => setD(f => ({ ...f, bp_code: e.target.value }))}
              disabled={isEdit}
              style={{ ...inp, width: '100%', fontFamily: 'var(--mono)', textTransform: 'uppercase',
                background: isEdit ? BG_HDR : '#fff' }}
              placeholder="e.g. SUP-001"
            />
          </FormRow>

          <FormRow label="Grouping">
            <input
              value={draft.grouping ?? ''}
              onChange={e => setD(f => ({ ...f, grouping: e.target.value }))}
              style={{ ...inp, width: '100%' }}
              placeholder="Account group / type"
            />
          </FormRow>

          <FormRow label="BP Category">
            <VHField
              value={draft.bp_category ?? 'Organization'}
              onChange={e => setD(f => ({ ...f, bp_category: e.target.value }))}
              options={BP_CATEGORIES}
              placeholder="Category"
            />
          </FormRow>

          <FormRow label="BP Role" required>
            <RoleVHField
              selectedRoles={draft.roles ?? []}
              onToggle={role => setD(f => ({
                ...f,
                roles: (f.roles ?? []).includes(role)
                  ? (f.roles ?? []).filter(r => r !== role)
                  : [...(f.roles ?? []), role],
              }))}
            />
          </FormRow>

          <FormRow label="Name 1" required>
            <input
              value={draft.name ?? ''}
              onChange={e => setD(f => ({ ...f, name: e.target.value }))}
              style={{ ...inp, width: '100%' }}
              placeholder="Primary name"
            />
          </FormRow>

          <FormRow label="Name 2">
            <input
              value={draft.name_2 ?? ''}
              onChange={e => setD(f => ({ ...f, name_2: e.target.value }))}
              style={{ ...inp, width: '100%' }}
              placeholder="Optional"
            />
          </FormRow>

          <FormRow label="GST Number">
            <input
              value={draft.gst_number ?? ''}
              onChange={e => setD(f => ({ ...f, gst_number: e.target.value }))}
              style={{ ...inp, width: '100%', fontFamily: 'var(--mono)', textTransform: 'uppercase' }}
              placeholder="27AAPFU0939F1ZV"
            />
          </FormRow>

          <FormRow label="PAN">
            <input
              value={draft.pan ?? ''}
              onChange={e => setD(f => ({ ...f, pan: e.target.value }))}
              style={{ ...inp, width: '100%', fontFamily: 'var(--mono)', textTransform: 'uppercase' }}
              placeholder="AAPFU0939F"
            />
          </FormRow>

          <FormRow label="Contact Person">
            <input
              value={draft.contact_person ?? ''}
              onChange={e => setD(f => ({ ...f, contact_person: e.target.value }))}
              style={{ ...inp, width: '100%' }}
              placeholder="Name"
            />
          </FormRow>

          <FormRow label="Phone">
            <input
              value={draft.phone ?? ''}
              onChange={e => setD(f => ({ ...f, phone: e.target.value }))}
              style={{ ...inp, width: '100%' }}
              placeholder="+91 98765 43210"
            />
          </FormRow>

          <FormRow label="Email">
            <input
              value={draft.email ?? ''}
              onChange={e => setD(f => ({ ...f, email: e.target.value }))}
              style={{ ...inp, width: '100%' }}
              placeholder="contact@example.com"
            />
          </FormRow>

        </div>
      </div>

      {/* ── RIGHT: Standard Address ── */}
      <div style={{ padding: '16px 20px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: TXT_MUTED, textTransform: 'uppercase',
          letterSpacing: '.08em', marginBottom: 14, paddingBottom: 6, borderBottom: `1px solid ${BORDER}` }}>
          Standard Address
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: '10px 0', alignItems: 'start' }}>

          <FormRow label="Street">
            <input
              value={draft.street ?? ''}
              onChange={e => setD(f => ({ ...f, street: e.target.value }))}
              style={{ ...inp, width: '100%' }}
              placeholder="Street name"
            />
          </FormRow>

          <FormRow label="House No.">
            <input
              value={draft.house_number ?? ''}
              onChange={e => setD(f => ({ ...f, house_number: e.target.value }))}
              style={{ ...inp, width: '100%' }}
              placeholder="12-A"
            />
          </FormRow>

          <FormRow label="City">
            <input
              value={draft.city ?? ''}
              onChange={e => setD(f => ({ ...f, city: e.target.value }))}
              style={{ ...inp, width: '100%' }}
              placeholder="City"
            />
          </FormRow>

          <FormRow label="Postal Code">
            <input
              value={draft.postal_code ?? ''}
              onChange={e => setD(f => ({ ...f, postal_code: e.target.value }))}
              style={{ ...inp, width: '100%', fontFamily: 'var(--mono)' }}
              placeholder="600001"
            />
          </FormRow>

          <FormRow label="Country">
            <VHField
              value={draft.country ?? 'India'}
              onChange={e => setD(f => ({ ...f, country: e.target.value }))}
              options={COUNTRY_OPTIONS}
              placeholder="Country"
            />
          </FormRow>

          <FormRow label="Region">
            <input
              value={draft.region ?? ''}
              onChange={e => setD(f => ({ ...f, region: e.target.value }))}
              style={{ ...inp, width: '100%' }}
              placeholder="State / Province"
            />
          </FormRow>

          <FormRow label="Language">
            <VHField
              value={draft.language ?? 'EN'}
              onChange={e => setD(f => ({ ...f, language: e.target.value }))}
              options={LANGUAGE_OPTIONS}
              placeholder="Language"
            />
          </FormRow>

        </div>
      </div>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

      {/* ── Create form ── */}
      <div style={{ background: '#fff', border: `1px solid ${BORDER}`, borderBottom: 'none', padding: '14px 16px 16px' }}>
        <SectionLabel>Create Business Partner</SectionLabel>
        {formPanel(form, setForm, false)}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 12 }}>
          <button disabled={!canSave || saving} onClick={save} style={primaryBtn(canSave && !saving)}>
            {saving ? 'Saving…' : 'Create Business Partner'}
          </button>
          {err && <span style={{ fontSize: 12, color: ERR_RED }}>{err}</span>}
          {msg && <span style={{ fontSize: 12, color: OK_GREEN }}>{msg}</span>}
        </div>
      </div>

      {/* ── BP list ── */}
      <div style={{ background: '#fff', border: `1px solid ${BORDER}`, overflowX: 'auto' }}>
        {bps.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: TXT_FAINT, fontSize: 13 }}>No business partners yet.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>{['BP Code','Name 1','Category','City','Roles','Status',''].map(h => <th key={h} style={th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {bps.map((bp, i) => (
                <Fragment key={bp.id}>
                  <tr
                    style={{ background: bp.status === 'Blocked' ? BLOCKED_BG : i % 2 === 0 ? '#fff' : '#fafafa', cursor: 'pointer' }}
                    onClick={() => setExpanded(e => e === bp.id ? null : bp.id)}
                  >
                    <td style={{ ...td, fontFamily: 'var(--mono)', fontWeight: 700, color: SAP_BLUE }}>{bp.bp_code}</td>
                    <td style={{ ...td }}>
                      <div style={{ fontWeight: 600 }}>{bp.name}</div>
                      {bp.name_2 && <div style={{ fontSize: 11, color: TXT_MUTED }}>{bp.name_2}</div>}
                    </td>
                    <td style={{ ...td, fontSize: 11, color: TXT_MUTED }}>{bp.bp_category || '—'}</td>
                    <td style={{ ...td, fontSize: 11, color: TXT_MUTED }}>
                      {[bp.city, bp.country].filter(Boolean).join(', ') || '—'}
                    </td>
                    <td style={{ ...td }}>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {bp.roles.map(r => <RoleChip key={r.role} role={r.role} />)}
                      </div>
                    </td>
                    <td style={td}><StatusBadge status={bp.status} /></td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: 5 }}>
                        <button onClick={() => { startEdit(bp); setExpanded(bp.id) }} style={{ ...ghostBtn(), fontSize: 11 }}>Edit</button>
                        <button onClick={() => toggleBlock(bp)} style={{ ...warnBtn(), fontSize: 11 }}>
                          {bp.status === 'Active' ? 'Block' : 'Unblock'}
                        </button>
                        <button onClick={() => del(bp)} disabled={deleting === bp.id} style={{ ...dangerBtn(), fontSize: 11 }}>
                          {deleting === bp.id ? '…' : 'Delete'}
                        </button>
                      </div>
                    </td>
                  </tr>

                  {/* ── Expanded detail / edit panel ── */}
                  {expanded === bp.id && (
                    <tr>
                      <td colSpan={7} style={{ padding: '0 12px 12px', background: '#f8f9fb' }}>
                        {editing === bp.id ? (
                          <>
                            {formPanel(editDraft, setEditDraft, true)}
                            {/* Role live-toggle */}
                            <div style={{ marginTop: 10, padding: '8px 0', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 11, color: TXT_MUTED, fontWeight: 600, flexShrink: 0 }}>ROLES (live):</span>
                              {ALL_ROLES.map(role => {
                                const has = bp.roles.some(r => r.role === role)
                                return (
                                  <button key={role} onClick={() => toggleLiveRole(bp, role)}
                                    style={{
                                      padding: '2px 8px', fontSize: 10, fontWeight: 700,
                                      borderRadius: 10, cursor: 'pointer',
                                      border: `1px solid ${ROLE_META[role]?.color || BORDER}`,
                                      background: has ? (ROLE_META[role]?.bg || '#f5f5f5') : 'transparent',
                                      color: ROLE_META[role]?.color || TXT_MUTED,
                                    }}>
                                    {has ? '✓ ' : '+ '}{ROLE_META[role]?.label || role}
                                  </button>
                                )
                              })}
                            </div>
                            <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
                              <button onClick={() => saveEdit(bp.id)} disabled={editSave} style={primaryBtn(!editSave)}>
                                {editSave ? 'Saving…' : 'Save Changes'}
                              </button>
                              <button onClick={cancelEdit} style={ghostBtn()}>Cancel</button>
                              {err && <span style={{ fontSize: 12, color: ERR_RED }}>{err}</span>}
                            </div>
                          </>
                        ) : (
                          /* Read-only detail view */
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, paddingTop: 10 }}>
                            <div>
                              <div style={{ fontSize: 11, fontWeight: 700, color: TXT_MUTED, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 8 }}>General Data</div>
                              {[
                                ['BP Code', <span style={{ fontFamily: 'var(--mono)', color: SAP_BLUE }}>{bp.bp_code}</span>],
                                ['Grouping', bp.grouping || '—'],
                                ['Category', bp.bp_category || '—'],
                                ['Name 1', bp.name],
                                ['Name 2', bp.name_2 || '—'],
                                ['GST', bp.gst_number || '—'],
                                ['PAN', bp.pan || '—'],
                                ['Contact', bp.contact_person || '—'],
                                ['Phone', bp.phone || '—'],
                                ['Email', bp.email || '—'],
                              ].map(([k, v]) => (
                                <div key={k} style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: 8, marginBottom: 4 }}>
                                  <span style={{ fontSize: 11, color: TXT_MUTED }}>{k}:</span>
                                  <span style={{ fontSize: 12, color: TXT_MAIN }}>{v}</span>
                                </div>
                              ))}
                            </div>
                            <div>
                              <div style={{ fontSize: 11, fontWeight: 700, color: TXT_MUTED, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 8 }}>Standard Address</div>
                              {[
                                ['Street', bp.street || '—'],
                                ['House No.', bp.house_number || '—'],
                                ['City', bp.city || '—'],
                                ['Postal Code', bp.postal_code || '—'],
                                ['Country', bp.country || '—'],
                                ['Region', bp.region || '—'],
                                ['Language', bp.language || '—'],
                              ].map(([k, v]) => (
                                <div key={k} style={{ display: 'grid', gridTemplateColumns: '90px 1fr', gap: 8, marginBottom: 4 }}>
                                  <span style={{ fontSize: 11, color: TXT_MUTED }}>{k}:</span>
                                  <span style={{ fontSize: 12, color: TXT_MAIN }}>{v}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════════════
   MATERIAL MASTER
══════════════════════════════════════════════════════════════════════════════ */
function Materials({ materials, onChanged }) {
  const blank = { code: '', name: '', base_unit: 'Bales', material_type: '', category: '', description: '' }
  const [form,      setForm]    = useState(blank)
  const [saving,    setSaving]  = useState(false)
  const [editing,   setEditing] = useState(null)
  const [editDraft, setEditDraft] = useState({})
  const [editSave,  setEditSave]  = useState(false)
  const [archiving, setArchiving] = useState(null)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  const setF = k => e => {
    setForm(f => {
      const next = { ...f, [k]: e.target.value }
      // Reset category when type changes
      if (k === 'material_type') next.category = ''
      return next
    })
  }

  const cats = MAT_CATEGORIES[form.material_type] || []
  const canSave = form.code.trim() && form.name.trim() && form.base_unit && form.material_type

  /* ── Create ── */
  const save = async () => {
    setSaving(true); setErr(''); setMsg('')
    try {
      const m = await createMaterial({ ...form, code: form.code.trim().toUpperCase() })
      setMsg(`Added: ${m.code} — ${m.name}`)
      setForm(blank)
      onChanged(m, 'add')
    } catch (e) { setErr(e?.response?.data?.detail || e.message) }
    finally { setSaving(false) }
  }

  /* ── Edit ── */
  const startEdit = m => {
    setEditing(m.id)
    setEditDraft({ code: m.code, name: m.name, base_unit: m.base_unit,
                   material_type: m.material_type || '', category: m.category || '', description: m.description || '' })
    setErr('')
  }
  const cancelEdit = () => { setEditing(null); setEditDraft({}) }
  const saveEdit = async id => {
    setEditSave(true); setErr('')
    try {
      const m = await updateMaterial(id, editDraft)
      setEditing(null)
      onChanged(m, 'update')
    } catch (e) { setErr(e?.response?.data?.detail || e.message) }
    finally { setEditSave(false) }
  }

  /* ── Archive ── */
  const archive = async m => {
    if (!window.confirm(`Archive "${m.name}"?\nIt will disappear from all dropdowns. Historical movements are preserved.`)) return
    setArchiving(m.id)
    try { await deactivateMaterial(m.id); onChanged({ id: m.id }, 'remove') }
    catch (e) { setErr(e?.response?.data?.detail || e.message) }
    finally { setArchiving(null) }
  }

  const editCats = MAT_CATEGORIES[editDraft.material_type] || []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* ── Add form ── */}
      <div style={{ background: '#fff', border: `1px solid ${BORDER}`, borderBottom: 'none', padding: '14px 16px' }}>
        <SectionLabel>Add Material</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr 140px 160px 160px', gap: 10, marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 11, color: TXT_MUTED, marginBottom: 3 }}>Code *</div>
            <input value={form.code} onChange={setF('code')} style={{ ...inp, width: '100%', fontFamily: 'var(--mono)', textTransform: 'uppercase' }} placeholder="e.g. RM-COTTON-01" />
          </div>
          <div>
            <div style={{ fontSize: 11, color: TXT_MUTED, marginBottom: 3 }}>Name *</div>
            <input value={form.name} onChange={setF('name')} style={{ ...inp, width: '100%' }} placeholder="e.g. Raw Cotton — Shankar 6" />
          </div>
          <div>
            <div style={{ fontSize: 11, color: TXT_MUTED, marginBottom: 3 }}>Type *</div>
            <select value={form.material_type} onChange={setF('material_type')} style={{ ...inp, width: '100%' }}>
              <option value="">— Select —</option>
              {MAT_TYPES.map(t => <option key={t} value={t}>{MAT_TYPE_LABELS[t]}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 11, color: TXT_MUTED, marginBottom: 3 }}>Category</div>
            <select value={form.category} onChange={setF('category')} style={{ ...inp, width: '100%' }} disabled={!form.material_type}>
              <option value="">— Select —</option>
              {cats.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 11, color: TXT_MUTED, marginBottom: 3 }}>Unit *</div>
            <select value={form.base_unit} onChange={setF('base_unit')} style={{ ...inp, width: '100%' }}>
              {MAT_UNITS.map(u => <option key={u}>{u}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'end' }}>
          <div>
            <div style={{ fontSize: 11, color: TXT_MUTED, marginBottom: 3 }}>Description</div>
            <input value={form.description} onChange={setF('description')} style={{ ...inp, width: '100%' }} placeholder="Optional" />
          </div>
          <button disabled={!canSave || saving} onClick={save} style={primaryBtn(canSave && !saving)}>
            {saving ? 'Saving…' : 'Add Material'}
          </button>
        </div>
        {(err || msg) && <div style={{ marginTop: 8, fontSize: 12, color: err ? ERR_RED : OK_GREEN }}>{err || msg}</div>}
      </div>

      {/* ── Material list ── */}
      <div style={{ background: '#fff', border: `1px solid ${BORDER}`, overflowX: 'auto' }}>
        {materials.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: TXT_FAINT, fontSize: 13 }}>No materials yet.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>{['Code','Name','Type','Category','Unit','Description',''].map(h => <th key={h} style={th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {materials.map((m, i) => editing === m.id ? (
                <tr key={m.id} style={{ background: '#f0f4ff' }}>
                  <td style={inputTd}><input value={editDraft.code} onChange={e => setEditDraft(d => ({ ...d, code: e.target.value }))} style={{ ...inp, width: 120, fontFamily: 'var(--mono)', textTransform: 'uppercase' }} /></td>
                  <td style={inputTd}><input value={editDraft.name} onChange={e => setEditDraft(d => ({ ...d, name: e.target.value }))} style={{ ...inp, width: '100%' }} /></td>
                  <td style={inputTd}>
                    <select value={editDraft.material_type} onChange={e => setEditDraft(d => ({ ...d, material_type: e.target.value, category: '' }))} style={{ ...inp, width: 130 }}>
                      <option value="">—</option>
                      {MAT_TYPES.map(t => <option key={t} value={t}>{MAT_TYPE_LABELS[t]}</option>)}
                    </select>
                  </td>
                  <td style={inputTd}>
                    <select value={editDraft.category} onChange={e => setEditDraft(d => ({ ...d, category: e.target.value }))} style={{ ...inp, width: 150 }}>
                      <option value="">—</option>
                      {editCats.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </td>
                  <td style={inputTd}>
                    <select value={editDraft.base_unit} onChange={e => setEditDraft(d => ({ ...d, base_unit: e.target.value }))} style={{ ...inp, width: 90 }}>
                      {MAT_UNITS.map(u => <option key={u}>{u}</option>)}
                    </select>
                  </td>
                  <td style={inputTd}><input value={editDraft.description} onChange={e => setEditDraft(d => ({ ...d, description: e.target.value }))} style={{ ...inp, width: '100%' }} /></td>
                  <td style={{ ...inputTd, display: 'flex', gap: 6, alignItems: 'center', minWidth: 130 }}>
                    <button onClick={() => saveEdit(m.id)} disabled={editSave} style={primaryBtn(!editSave)}>{editSave ? '…' : 'Save'}</button>
                    <button onClick={cancelEdit} style={ghostBtn()}>Cancel</button>
                  </td>
                </tr>
              ) : (
                <tr key={m.id} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                  <td style={{ ...td, fontFamily: 'var(--mono)', fontWeight: 700, color: SAP_BLUE }}>{m.code}</td>
                  <td style={{ ...td, fontWeight: 600 }}>{m.name}</td>
                  <td style={{ ...td }}>
                    {m.material_type ? (
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
                        background: m.material_type === 'RAW_MATERIAL' ? '#e8f1fd'
                          : m.material_type === 'MAINTENANCE' ? '#fff4e6' : '#eafbee',
                        color: m.material_type === 'RAW_MATERIAL' ? SAP_BLUE
                          : m.material_type === 'MAINTENANCE' ? WARN_AMBER : OK_GREEN,
                      }}>{MAT_TYPE_LABELS[m.material_type] || m.material_type}</span>
                    ) : <span style={{ color: TXT_FAINT }}>—</span>}
                  </td>
                  <td style={{ ...td, fontSize: 11, color: TXT_MUTED }}>{m.category || '—'}</td>
                  <td style={{ ...td, fontFamily: 'var(--mono)', fontSize: 11, color: TXT_MUTED }}>{m.base_unit}</td>
                  <td style={{ ...td, fontSize: 11, color: TXT_FAINT, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.description || '—'}</td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', gap: 5 }}>
                      <button onClick={() => startEdit(m)} style={{ ...ghostBtn(), fontSize: 11 }}>Edit</button>
                      <button disabled={archiving === m.id} onClick={() => archive(m)} style={{ ...warnBtn(), fontSize: 11 }}>
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
   ROOT — MasterData
══════════════════════════════════════════════════════════════════════════════ */
export default function MasterData({ mode = 'bp' }) {
  const [bps,       setBps]       = useState([])
  const [materials, setMaterials] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [loadErrs,  setLoadErrs]  = useState([])

  const load = useCallback(async () => {
    setLoading(true); setLoadErrs([])
    try {
      const [bpRes, matRes] = await Promise.allSettled([
        getBusinessPartners(),
        getMaterials(),
      ])
      const errs = []
      if (bpRes.status  === 'fulfilled') setBps(bpRes.value)
      else errs.push(`Business Partners: ${bpRes.reason?.response?.data?.detail || bpRes.reason?.message}`)
      if (matRes.status === 'fulfilled') setMaterials(matRes.value)
      else errs.push(`Materials: ${matRes.reason?.response?.data?.detail || matRes.reason?.message}`)
      if (errs.length) setLoadErrs(errs)
    } catch (e) {
      setLoadErrs([`Load error: ${e.message}`])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const onBPChanged = (item, op) => {
    if (op === 'add')    setBps(p => p.some(b => b.id === item.id) ? p : [...p, item])
    if (op === 'remove') setBps(p => p.filter(b => b.id !== item.id))
    if (op === 'update') setBps(p => p.map(b => b.id === item.id ? item : b))
    load()
  }
  const onMatChanged = (item, op) => {
    if (op === 'add')    setMaterials(p => p.some(m => m.id === item.id) ? p : [...p, item])
    if (op === 'remove') setMaterials(p => p.filter(m => m.id !== item.id))
    if (op === 'update') setMaterials(p => p.map(m => m.id === item.id ? item : m))
    load()
  }

  const TITLES = {
    bp:        ['Business Partners', 'Unified BP entity — roles define FI/MM/SD usage'],
    materials: ['Material Master',   'Raw materials, spare parts & consumables registry'],
  }
  const [title, subtitle] = TITLES[mode] || TITLES.bp

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Page bar */}
      <div style={{
        background: '#fff', border: `1px solid ${BORDER}`, borderBottom: 'none',
        padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div>
          <span style={{ fontSize: 13, fontWeight: 600, color: TXT_MAIN }}>{title}</span>
          <span style={{ fontSize: 11, color: TXT_FAINT, marginLeft: 12 }}>{subtitle}</span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {loading && (
            <span style={{ fontSize: 11, color: TXT_FAINT, display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ display: 'inline-block', width: 12, height: 12, border: `2px solid ${BORDER}`, borderTopColor: SAP_NAVY, borderRadius: '50%', animation: 'spin .7s linear infinite' }} />
              Loading…
            </span>
          )}
          <button onClick={load} style={{ ...ghostBtn(), fontSize: 11 }}>Refresh</button>
        </div>
      </div>

      {/* Error banner */}
      {loadErrs.length > 0 && (
        <div style={{ background: '#fff5f5', border: `1px solid #ffcccc`, borderBottom: 'none', padding: '7px 16px' }}>
          {loadErrs.map((e, i) => <div key={i} style={{ fontSize: 12, color: ERR_RED }}>⚠ {e}</div>)}
        </div>
      )}

      {mode === 'bp'        && <BusinessPartners bps={bps}           onChanged={onBPChanged} />}
      {mode === 'materials' && <Materials         materials={materials} onChanged={onMatChanged} />}
    </div>
  )
}
