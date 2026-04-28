/**
 * Primitives.jsx — Design-system atoms  v3 — Notion-inspired
 *
 * Philosophy: warm off-white surfaces, tight geometry (4–6px radius),
 * near-flat elevation, warm charcoal typography.  Blocks feel like
 * Notion pages — white surfaces on a warm #F7F7F5 body.
 */

/* ── Badge ──────────────────────────────────────────────────────────────── */
export function Badge({ variant = 'neutral', children, className = '' }) {
  const base = 'inline-flex items-center gap-1 text-[11px] font-medium px-[7px] py-[2px] leading-none whitespace-nowrap tracking-[.04em]'
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
      <span className="shrink-0 text-[11px] mt-px font-bold w-[15px] h-[15px] rounded-full ring-1 ring-current flex items-center justify-center leading-none">
        {AL[variant]}
      </span>
      <span>{children}</span>
    </div>
  )
}

/* ── Card — the primary "block" container ───────────────────────────────── */
export function Card({ children, className = '', sm = false }) {
  const pad = sm ? 'p-[12px_14px]' : 'p-[16px_18px]'
  return (
    <div
      className={`bg-[var(--bg)] rounded-[var(--r-lg)] ${pad} ${className}`}
      style={{ border: '1px solid var(--bd-md)' }}
    >
      {children}
    </div>
  )
}

export function CardHeader({ title, children }) {
  return (
    <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
      {typeof title === 'string'
        ? <span className="text-[10px] font-semibold tracking-[.09em] uppercase text-[var(--tx-3)]">{title}</span>
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
    md: 'px-[12px] py-[6px] text-[13px] min-h-[32px]',
    sm: 'px-[9px]  py-[4px] text-[12px] min-h-[26px]',
  }
  const variants = {
    /* primary — SVS navy */
    primary: 'bg-[var(--claude)] text-white border border-[var(--claude)] hover:opacity-85',
    /* accent — same as primary for consistency */
    accent:  'bg-[var(--claude)] text-white border border-[var(--claude)] hover:opacity-85',
    /* default — clean bordered */
    default: 'bg-[var(--bg)] text-[var(--tx)] border border-[var(--bd-md)] hover:bg-[var(--bg-hover)] hover:border-[var(--bd-hv)]',
    /* ghost — no border, subtle hover fill */
    ghost:   'bg-transparent text-[var(--tx-2)] border border-transparent hover:bg-[var(--bg-hover)] hover:text-[var(--tx)]',
    /* danger */
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
  const valSize = large ? 'text-[14px]' : 'text-[18px]'
  return (
    <div
      className="px-[12px] py-[10px] flex flex-col gap-1"
      style={{ background: 'var(--bg)', border: '1px solid var(--bd-md)', borderRadius: 'var(--r)' }}
    >
      <div style={{ fontSize: 11, color: 'var(--tx-3)', lineHeight: 1, marginBottom: 4 }}>{label}</div>
      <div className={`${valSize} font-medium tracking-tight leading-none font-[var(--mono)] ${cm[quality] ?? 'text-[var(--tx)]'}`}>
        {value ?? '—'}
      </div>
      {sub && <div className="text-[10px] text-[var(--tx-4)] mt-0.5">{sub}</div>}
    </div>
  )
}

/* ── Section label ───────────────────────────────────────────────────────── */
export function LabelCaps({ children, className = '' }) {
  return (
    <div className={`text-[10px] font-semibold tracking-[.09em] uppercase text-[var(--tx-3)] mb-2.5 ${className}`}>
      {children}
    </div>
  )
}

/* ── Formula box ─────────────────────────────────────────────────────────── */
export function FmlBox({ children, className = '' }) {
  return (
    <div
      className={`font-[var(--mono)] text-[12px] px-4 py-3 rounded-[var(--r-lg)] leading-loose text-[var(--tx-2)] ${className}`}
      style={{ background: 'var(--bg-3)', border: '1px solid var(--bd)' }}
    >
      {children}
    </div>
  )
}

/* ── Table wrapper ───────────────────────────────────────────────────────── */
export function TblWrap({ children }) {
  return (
    <div className="overflow-x-auto" style={{ borderRadius: 'var(--r-lg)', border: '1px solid var(--bd-md)' }}>
      {children}
    </div>
  )
}

/* ── Shift selector ──────────────────────────────────────────────────────── */
export function ShiftBar({ value, onChange, options }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {options.map(o => (
        <button key={o.value} onClick={() => onChange(o.value)}
          className={`px-[12px] py-[4px] text-[12px] font-medium rounded-full cursor-pointer transition-all font-[var(--font)] select-none
            ${value === o.value
              ? 'bg-[var(--tx)] text-white border border-[var(--tx)]'
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
    <div className="py-10 text-center">
      <div
        className="inline-flex items-center justify-center w-9 h-9 rounded-[var(--r-lg)] mb-2.5"
        style={{ background: 'var(--bg-3)', border: '1px solid var(--bd)' }}
      >
        <span style={{ fontSize: 15, opacity: .4, color: 'var(--tx-3)' }}>∅</span>
      </div>
      <div className="text-[12.5px] text-[var(--tx-3)]">{children}</div>
    </div>
  )
}

/* ── Spinner ─────────────────────────────────────────────────────────────── */
export function Spinner() {
  return (
    <div className="flex items-center justify-center py-10">
      <div
        className="w-6 h-6 rounded-full"
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

/* ── Block divider — Notion-style horizontal rule ────────────────────────── */
export function Divider({ className = '' }) {
  return (
    <hr
      className={className}
      style={{ border: 'none', borderTop: '1px solid var(--bd)', margin: '4px 0' }}
    />
  )
}

/* ── Page block — wraps a logical content section ────────────────────────── */
export function Block({ title, actions, children, className = '' }) {
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-3" style={{ marginBottom: 4 }}>
          {title && (
            <span className="text-[11px] font-semibold tracking-[.08em] uppercase text-[var(--tx-3)]">
              {title}
            </span>
          )}
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </div>
  )
}
