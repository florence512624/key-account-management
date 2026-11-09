import { Icon } from './Icon.jsx'

const TONES = {
  brand: { icon: 'bg-brand-50 text-brand-600 ring-brand-100', accent: 'text-brand-600' },
  navy: { icon: 'bg-navy-900/5 text-navy-800 ring-navy-900/10', accent: 'text-navy-800' },
  amber: { icon: 'bg-amber-50 text-amber-600 ring-amber-100', accent: 'text-amber-600' },
  rose: { icon: 'bg-rose-50 text-rose-600 ring-rose-100', accent: 'text-rose-600' },
  emerald: { icon: 'bg-emerald-50 text-emerald-600 ring-emerald-100', accent: 'text-emerald-600' }
}

export function StatCard ({ label, value, unit, icon = 'target', tone = 'brand', footer, hint, loading = false }) {
  const t = TONES[tone] || TONES.brand
  return (
    <div className="surface surface-hover p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12.5px] font-medium text-slate-500">{label}</p>
          {loading ? (
            <div className="skeleton mt-2 h-8 w-24" />
          ) : (
            <p className="mt-1 flex items-baseline gap-1.5">
              <span className={`text-[26px] font-semibold leading-none tracking-tight tabular-nums ${t.accent}`}>{value}</span>
              {unit && <span className="text-[12px] font-medium text-slate-400">{unit}</span>}
            </p>
          )}
        </div>
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] ring-1 ring-inset ${t.icon}`}>
          <Icon name={icon} className="h-[18px] w-[18px]" />
        </div>
      </div>

      <div className="mt-3 min-h-[20px]">{hint}</div>
      {footer && <div className="mt-1.5 text-[11.5px] leading-5 text-slate-400">{footer}</div>}
    </div>
  )
}
