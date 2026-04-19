/**
 * Primitives.jsx — Design-system atoms  v2
 * Clean SaaS aesthetic: white surfaces, neutral grays,
 * subtle elevation, generous radius.
 */

/* ── Badge ──────────────────────────────────────────────────────────────── */
export function Badge({ variant = 'neutral', children, className = '' }) {
  const base = 'inline-flex items-center gap-1 text-[11px] font-semibold px-[9px] py-[3px] rounded-full leading-none whitespace-nowrap tracking-[.02em]'
  const variants = {
    ok:      'bg-[var(--ok-bg)]      text-[var(--ok)]      ring-1 ring-[var(--ok-bd)]',
    warn:    'bg-[var(--warn-bg)]    text-[var(--warn)]    ring-1 ring-[var(--warn-bd)]',
    bad:     'bg-[var(--bad-bg)]     text-[var(--bad)]     ring-1 ring-[var(--bad-bd)]',
    info:    'bg-[var(--info-bg)]    text-[var(--info)]    ring-1 ring-[var(--info-bd)]',
    neutral: 'bg-[var(--bg-3)]      text-[var(--tx-2)]    ring-1 ring-[var(--bd-md)]',
    claude:  'bg-[var(--claude-bg)]  text-[var(--claude)]  ring-1 ring-[var(--claude-bd)]',
    purple:  'bg-[var(--purple-bg)]  text-[var(--purple)]  ring-1 ring-[var(--purple-bd)]',
  }
  return <span className={`${base} ${variants[variant] ?? variants.neutral} ${className}`}>{children}</span>
}

/* ── Alert ──────────────────────────────────────────────────────────────── */
const AL = { ok: '✓', warn: '!', bad: '×', info: 'i' }
export function Alert({ variant = 'info', children }) {
  const base = 'flex items-start gap-3 px-4 py-3 rounded-[var(--r-lg)] text-[12.5px] leading-relaxed ring-1'
  const variants = {
    ok:   'bg-[var(--ok-bg)]   text-[var(--ok)]   ring-[var(--ok-bd)]',
    warn: 'bg-[var(--warn-bg)] text-[var(--warn)] ring-[var(--warn-bd)]',
    bad:  'bg-[var(--bad-bg)]  text-[var(--bad)]  ring-[var(--bad-bd)]',
    info: 'bg-[var(--info-bg)] text-[var(--info)] ring-[var(--info-bd)]',
  }
  return (
    <div className={`${base} ${variants[variant] ?? variants.info}`}>
      <span className="shrink-0 text-[11px] mt-px font-bold w-[16px] h-[16px] rounded-full ring-1 ring-current flex items-center justify-center leading-none">
        {AL[variant]}
      </span>
      <span>{children}</span>
    </div>
  )
}

/* ── Card ───────────────────────────────────────────────────────────────── */
export function Card({ children, className = '', sm = false }) {
  const pad = sm ? 'p-[14px_16px]' : 'p-[18px_20px]'
  return (
    <div
      className={`bg-[var(--bg)] rounded-[var(--r-lg)] ${pad} ${className}`}
      style={{ border: '1px solid var(--bd-md)', boxShadow: 'var(--shadow)' }}
    >
      {children}
    </div>
  )
}

export function CardHeader({ title, children }) {
  return (
    <div className="flex items-center justify-between flex-wrap gap-2 mb-3.5">
      {typeof title === 'string'
        ? <span className="text-[10px] font-semibold tracking-[.1em] uppercase text-[var(--tx-3)]">{title}</span>
        : title}
      {children}
    </div>
  )
}

/* ── Button ─────────────────────────────────────────────────────────────── */
export function Btn({
  children, onClick, variant = 'default', size = 'md',
  className = '', disabled = false, type = 'button',
}) {
  const base = 'inline-flex items-center gap-1.5 rounded-[var(--r)] cursor-pointer transition-all duration-100 whitespace-nowrap leading-none font-[var(--font)] font-medium disabled:opacity-40 disabled:cursor-not-allowed select-none'
  const sizes = {
    md: 'px-[14px] py-[7px] text-[13px] min-h-[34px]',
    sm: 'px-[10px] py-[5px] text-[12px] min-h-[28px]',
  }
  const variants = {
    /* dark primary — matches reference image "Commit" button */
    primary: 'bg-[#111827] text-white border border-[#111827] hover:bg-[#1F2937]',
    /* accent — terracotta for filters, active pills, CTAs */
    accent:  'bg-[var(--claude)] text-white border border-[var(--claude)] hover:opacity-85',
    default: 'bg-[var(--bg)] text-[var(--tx)] border border-[var(--bd-md)] hover:bg-[var(--bg-2)] hover:border-[var(--bd-hv)] shadow-[var(--shadow)]',
    ghost:   'bg-transparent text-[var(--tx-2)] border border-transparent hover:bg-[var(--bg-hover)] hover:text-[var(--tx)]',
    danger:  'bg-[var(--bg)] text-[var(--bad)] border border-[var(--bd-md)] hover:bg-[var(--bad-bg)] hover:border-[var(--bad-bd)]',
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      className={`${base} ${sizes[size]} ${variants[variant] ?? variants.default} ${className}`}>
      {children}
    </button>
  )
}

/* ── Metric tile ─────────────────────────────────────────────────────────── */
export function Metric({ label, value, sub, quality, large = false }) {
  const cm = { ok: 'text-[var(--ok)]', warn: 'text-[var(--warn)]', bad: 'text-[var(--bad)]' }
  const valSize = large ? 'text-[18px]' : 'text-[22px]'
  return (
    <div
      className="rounded-[var(--r-lg)] px-4 py-3.5 flex flex-col gap-1.5 transition-all hover:-translate-y-px"
      style={{ background: 'var(--bg-2)', border: '1px solid var(--bd)', boxShadow: 'var(--shadow)' }}
    >
      <div className={`${valSize} font-semibold tracking-tight leading-none font-[var(--mono)] ${cm[quality] ?? 'text-[var(--tx)]'}`}>
        {value ?? '—'}
      </div>
      <div className="text-[11px] font-medium text-[var(--tx-3)] leading-tight">{label}</div>
      {sub && <div className="text-[10px] text-[var(--tx-4)] mt-0.5">{sub}</div>}
    </div>
  )
}

/* ── Section label ───────────────────────────────────────────────────────── */
export function LabelCaps({ children, className = '' }) {
  return (
    <div className={`text-[10.5px] font-semibold tracking-[.09em] uppercase text-[var(--tx-3)] mb-3 ${className}`}>
      {children}
    </div>
  )
}

/* ── Formula box ─────────────────────────────────────────────────────────── */
export function FmlBox({ children, className = '' }) {
  return (
    <div
      className={`font-[var(--mono)] text-[12px] px-4 py-3 rounded-[var(--r-lg)] leading-loose text-[var(--tx-2)] ${className}`}
      style={{ background: 'var(--bg-2)', border: '1px solid var(--bd)', boxShadow: 'inset 0 1px 3px rgba(0,0,0,.03)' }}
    >
      {children}
    </div>
  )
}

/* ── Table wrapper ───────────────────────────────────────────────────────── */
export function TblWrap({ children }) {
  return (
    <div className="overflow-x-auto" style={{ borderRadius: 'var(--r-lg)', border: '1px solid var(--bd)' }}>
      {children}
    </div>
  )
}

/* ── Shift selector ──────────────────────────────────────────────────────── */
export function ShiftBar({ value, onChange, options }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {options.map(o => (
        <button key={o.value} onClick={() => onChange(o.value)}
          className={`px-[14px] py-[5px] text-[12px] font-medium rounded-[20px] cursor-pointer transition-all font-[var(--font)] select-none
            ${value === o.value
              ? 'bg-[#111827] text-white border border-[#111827] font-semibold'
              : 'bg-transparent text-[var(--tx-2)] border border-[var(--bd-md)] hover:border-[var(--bd-hv)] hover:text-[var(--tx)]'}`}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

/* ── Empty state ─────────────────────────────────────────────────────────── */
export function Empty({ children = 'No data yet' }) {
  return (
    <div className="py-12 text-center">
      <div
        className="inline-flex items-center justify-center w-10 h-10 rounded-full mb-3"
        style={{ background: 'var(--bg-3)', border: '1px solid var(--bd)' }}
      >
        <span style={{ fontSize: 16, opacity: .5 }}>∅</span>
      </div>
      <div className="text-[13px] text-[var(--tx-3)]">{children}</div>
    </div>
  )
}

/* ── Spinner ─────────────────────────────────────────────────────────────── */
export function Spinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <div
        className="w-7 h-7 rounded-full"
        style={{
          border: '2px solid var(--bd-md)',
          borderTopColor: 'var(--claude)',
          animation: 'spin .7s linear infinite',
        }}
      />
    </div>
  )
}

/* ── Quality helpers ─────────────────────────────────────────────────────── */
export const qualityLabel = { ok: 'In control', warn: 'Warning', bad: 'Action required' }
export const qualityColor = { ok: 'text-[var(--ok)]', warn: 'text-[var(--warn)]', bad: 'text-[var(--bad)]' }
