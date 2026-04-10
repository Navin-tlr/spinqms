/**
 * Primitives.jsx — Design-system atoms
 * Anthropic / Claude aesthetic: warm parchment, soft charcoal,
 * hand-drawn-feel icons, organic interactions.
 */

/* ── Badge ──────────────────────────────────────────────────────────────── */
export function Badge({ variant = 'neutral', children, className = '' }) {
  const base = 'inline-flex items-center gap-1 text-[11px] font-medium px-[10px] py-[3.5px] rounded-full border leading-none whitespace-nowrap tracking-[.015em]'
  const variants = {
    ok:      'bg-[var(--ok-bg)]      text-[var(--ok)]      border-[var(--ok-bd)]',
    warn:    'bg-[var(--warn-bg)]    text-[var(--warn)]    border-[var(--warn-bd)]',
    bad:     'bg-[var(--bad-bg)]     text-[var(--bad)]     border-[var(--bad-bd)]',
    info:    'bg-[var(--info-bg)]    text-[var(--info)]    border-[var(--info-bd)]',
    neutral: 'bg-[var(--bg-3)]      text-[var(--tx-2)]    border-[var(--bd-md)]',
    claude:  'bg-[var(--claude-bg)]  text-[var(--claude)]  border-[var(--claude-bd)]',
    purple:  'bg-[var(--purple-bg)]  text-[var(--purple)]  border-[var(--purple-bd)]',
  }
  return <span className={`${base} ${variants[variant] ?? variants.neutral} ${className}`}>{children}</span>
}

/* ── Alert ──────────────────────────────────────────────────────────────── */
const AL = { ok:'✓', warn:'!', bad:'×', info:'i' }
export function Alert({ variant = 'info', children }) {
  const base = 'flex items-start gap-2.5 px-4 py-3 rounded-[var(--r)] border text-[12.5px] leading-relaxed'
  const variants = {
    ok:   'bg-[var(--ok-bg)]   text-[var(--ok)]   border-[var(--ok-bd)]',
    warn: 'bg-[var(--warn-bg)] text-[var(--warn)] border-[var(--warn-bd)]',
    bad:  'bg-[var(--bad-bg)]  text-[var(--bad)]  border-[var(--bad-bd)]',
    info: 'bg-[var(--info-bg)] text-[var(--info)] border-[var(--info-bd)]',
  }
  return (
    <div className={`${base} ${variants[variant] ?? variants.info}`}>
      <span className="shrink-0 text-[12px] mt-px font-semibold w-[16px] h-[16px] rounded-full border border-current flex items-center justify-center leading-none">{AL[variant]}</span>
      <span>{children}</span>
    </div>
  )
}

/* ── Card ───────────────────────────────────────────────────────────────── */
export function Card({ children, className = '', sm = false }) {
  const pad = sm ? 'p-[14px_16px]' : 'p-[18px_20px]'
  return (
    <div className={`bg-[var(--bg)] border border-[var(--bd)] rounded-[var(--r-lg)] ${pad} ${className}`}>
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
  const base = 'inline-flex items-center gap-1.5 border rounded-[var(--r)] cursor-pointer transition-all duration-100 whitespace-nowrap leading-none font-[var(--font)] font-medium disabled:opacity-35 disabled:cursor-not-allowed select-none'
  const sizes = {
    md: 'px-[16px] py-[7px] text-[13px] min-h-[34px]',
    sm: 'px-[12px] py-[5px] text-[12px] min-h-[30px]',
  }
  const variants = {
    default: 'bg-[var(--bg)] text-[var(--tx)] border-[var(--bd-md)] hover:bg-[var(--bg-2)] hover:border-[var(--bd-hv)]',
    primary: 'bg-[var(--claude)] text-white border-[var(--claude)] hover:opacity-85',
    ghost:   'bg-transparent text-[var(--tx)] border-transparent hover:bg-[var(--bg-hover)]',
    danger:  'bg-[var(--bg)] text-[var(--bad)] border-[var(--bd-md)] hover:bg-[var(--bad-bg)] hover:border-[var(--bad-bd)]',
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}>
      {children}
    </button>
  )
}

/* ── Metric tile ─────────────────────────────────────────────────────────── */
export function Metric({ label, value, sub, quality }) {
  const cm = { ok:'text-[var(--ok)]', warn:'text-[var(--warn)]', bad:'text-[var(--bad)]' }
  return (
    <div className="bg-[var(--bg-2)] rounded-[var(--r)] px-4 py-3.5 flex flex-col gap-1.5 transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow)]">
      <div className={`text-[22px] font-semibold tracking-tight leading-none font-[var(--mono)] ${cm[quality] ?? 'text-[var(--tx)]'}`}>{value ?? '—'}</div>
      <div className="text-[11px] font-medium text-[var(--tx-3)]">{label}</div>
      {sub && <div className="text-[10px] text-[var(--tx-4)] mt-0.5">{sub}</div>}
    </div>
  )
}

/* ── Label caps ──────────────────────────────────────────────────────────── */
export function LabelCaps({ children, className = '' }) {
  return <div className={`text-[10px] font-semibold tracking-[.1em] uppercase text-[var(--tx-3)] mb-3 ${className}`}>{children}</div>
}

/* ── Formula box ─────────────────────────────────────────────────────────── */
export function FmlBox({ children, className = '' }) {
  return <div className={`font-[var(--mono)] text-[12px] bg-[var(--bg-2)] px-4 py-3 rounded-[var(--r)] leading-loose text-[var(--tx-2)] border border-[var(--bd)] ${className}`}>{children}</div>
}

/* ── Table wrapper ───────────────────────────────────────────────────────── */
export function TblWrap({ children }) {
  return <div className="overflow-x-auto rounded-[var(--r)]">{children}</div>
}

/* ── Shift selector ──────────────────────────────────────────────────────── */
export function ShiftBar({ value, onChange, options }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {options.map(o => (
        <button key={o.value} onClick={() => onChange(o.value)}
          className={`px-[16px] py-[5px] text-[12px] font-medium border rounded-[20px] cursor-pointer transition-all font-[var(--font)] select-none
            ${value === o.value
              ? 'bg-[var(--claude)] text-white border-[var(--claude)] font-semibold'
              : 'bg-transparent text-[var(--tx-2)] border-[var(--bd-md)] hover:border-[var(--bd-hv)]'}`}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

/* ── Empty state ─────────────────────────────────────────────────────────── */
export function Empty({ children = 'No data yet' }) {
  return (
    <div className="py-10 text-center text-[var(--tx-3)] text-[13px]">
      <div className="text-[26px] mb-2 opacity-25">~</div>
      {children}
    </div>
  )
}

/* ── Spinner ─────────────────────────────────────────────────────────────── */
export function Spinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="w-7 h-7 border-2 border-[var(--bd-md)] border-t-[var(--claude)] rounded-full animate-spin" />
    </div>
  )
}

/* ── Quality helpers ─────────────────────────────────────────────────────── */
export const qualityLabel = { ok:'In control', warn:'Warning', bad:'Action required' }
export const qualityColor = { ok:'text-[var(--ok)]', warn:'text-[var(--warn)]', bad:'text-[var(--bad)]' }
