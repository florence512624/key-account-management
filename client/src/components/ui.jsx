import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { Icon } from './Icon.jsx'

/* ------------------------------- Toast ------------------------------- */
const ToastCtx = createContext({ push: () => {} })

export function ToastProvider ({ children }) {
  const [items, setItems] = useState([])
  const idRef = useRef(0)

  const push = useCallback((message, type = 'success') => {
    const id = ++idRef.current
    setItems((prev) => [...prev, { id, message, type }])
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 3200)
  }, [])

  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div className="pointer-events-none fixed bottom-6 right-6 z-[80] flex w-80 flex-col gap-2">
        {items.map((t) => (
          <div
            key={t.id}
            className={`animate-pop pointer-events-auto flex items-start gap-2 rounded-lg border px-3.5 py-2.5 text-sm shadow-lg ${
              t.type === 'error'
                ? 'border-rose-200 bg-rose-50 text-rose-700'
                : 'border-slate-200 bg-white text-slate-700'
            }`}
          >
            <Icon
              name={t.type === 'error' ? 'alert' : 'check'}
              className={`mt-0.5 h-4 w-4 shrink-0 ${t.type === 'error' ? 'text-rose-500' : 'text-emerald-500'}`}
            />
            <span className="leading-5">{t.message}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

export const useToast = () => useContext(ToastCtx)

/* ------------------------------- 基础件 ------------------------------- */

export function Chip ({ children, className = '', mono = false }) {
  return (
    <span className={`chip ${mono ? 'tabular-nums' : ''} ${className}`}>{children}</span>
  )
}

export function Spinner ({ className = 'h-4 w-4' }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" className="opacity-20" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}

export function EmptyState ({ icon = 'dot', title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-50 text-slate-400 ring-1 ring-slate-100">
        <Icon name={icon} className="h-5 w-5" />
      </div>
      <p className="text-sm font-medium text-slate-700">{title}</p>
      {description && <p className="max-w-xs text-xs leading-5 text-slate-400">{description}</p>}
      {action}
    </div>
  )
}

export function ProgressBar ({ value = 0, className = 'h-1.5 w-full', barClass = 'bg-brand-600' }) {
  const pct = Math.max(0, Math.min(1, Number(value) || 0)) * 100
  return (
    <div className={`overflow-hidden rounded-full bg-slate-100 ${className}`}>
      <div className={`h-full rounded-full transition-[width] duration-500 ${barClass}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

export function SectionHeader ({ title, hint, right }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-hairline px-5 py-3.5">
      <div>
        <h2 className="text-[15px] font-semibold text-slate-800">{title}</h2>
        {hint && <p className="mt-0.5 text-xs text-slate-400">{hint}</p>}
      </div>
      {right}
    </div>
  )
}

export function Modal ({ open, onClose, title, description, children, width = 'max-w-lg' }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose?.()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-navy-950/40 px-4 py-10 backdrop-blur-[2px]">
      <div className={`animate-pop w-full ${width} rounded-2xl bg-white shadow-2xl`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="flex items-start justify-between gap-4 border-b border-hairline px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900">{title}</h3>
            {description && <p className="mt-0.5 text-xs text-slate-400">{description}</p>}
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" aria-label="关闭">
            <Icon name="x" className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  )
}

export function ErrorBanner ({ message, details, onRetry }) {
  if (!message) return null
  return (
    <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50/70 px-4 py-3">
      <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-rose-700">{message}</p>
        {details?.length > 0 && (
          <ul className="mt-1 space-y-0.5 text-xs text-rose-600/80">
            {details.slice(0, 4).map((d, i) => <li key={i}>· {d}</li>)}
          </ul>
        )}
      </div>
      {onRetry && (
        <button type="button" onClick={onRetry} className="shrink-0 rounded-md border border-rose-200 bg-white px-2.5 py-1 text-xs text-rose-700 hover:bg-rose-100">
          重试
        </button>
      )}
    </div>
  )
}

export function MockBadge () {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 ring-1 ring-inset ring-amber-200"
      title="后端未启动，当前展示的是前端内置演示数据">
      <Icon name="dot" className="h-2 w-2" /> 演示数据
    </span>
  )
}
