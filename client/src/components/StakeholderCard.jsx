import { ATTITUDE_META, ROLE_META } from '../lib/constants.js'
import { initials } from '../lib/format.js'
import { Icon } from './Icon.jsx'

/**
 * 单个关键人卡片
 * - 角色标签用角色主色（决策者红 / 使用者蓝 / 影响者琥珀 / 支持者绿）
 * - 悬浮或键盘聚焦时，向上弹出"核心诉求 + 应对策略"
 * - 没有内容的字段给出可操作的空态文案，避免出现空白 Tooltip
 */
export function StakeholderCard ({ person, onDelete }) {
  const role = ROLE_META[person.role_type] || ROLE_META.influencer
  const attitude = ATTITUDE_META[person.attitude] || ATTITUDE_META.neutral
  const hasDemand = Boolean(person.core_demand?.trim())
  const hasStrategy = Boolean(person.strategy?.trim())

  return (
    <div className="group relative" tabIndex={0} aria-label={`${person.name} ${person.title}`}>
      <div className={`relative rounded-xl border bg-white p-3 transition duration-150 ${role.border}
        group-hover:-translate-y-0.5 group-hover:shadow-[0_10px_28px_-16px_rgba(15,30,60,0.45)]
        group-focus-visible:-translate-y-0.5 group-focus-visible:ring-2 group-focus-visible:ring-brand-200`}>
        {/* 左侧角色色条 */}
        <span className="absolute inset-y-2.5 left-0 w-[3px] rounded-full" style={{ backgroundColor: role.accent }} />

        <div className="flex items-start gap-2.5 pl-2">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11.5px] font-semibold"
            style={{ backgroundColor: `${role.accent}14`, color: role.accent }}
          >
            {initials(person.name)}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p className="truncate text-[13.5px] font-semibold text-slate-800">{person.name}</p>
              {person.influence >= 5 && (
                <span className="shrink-0 rounded bg-amber-50 px-1 py-px text-[9.5px] font-semibold text-amber-600 ring-1 ring-inset ring-amber-200">
                  高影响
                </span>
              )}
            </div>
            <p className="mt-0.5 truncate text-[11.5px] text-slate-500">{person.title || '职务未填写'}</p>
          </div>

          {onDelete && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onDelete(person) }}
              aria-label={`删除 ${person.name}`}
              className="shrink-0 rounded p-1 text-slate-300 opacity-0 transition hover:bg-rose-50 hover:text-rose-500 focus-visible:opacity-100 group-hover:opacity-100"
            >
              <Icon name="trash" className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-1 pl-2">
          <span className={`chip ${role.chip}`}>{role.label}</span>
          <span className={`chip ${attitude.chip}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${attitude.dot}`} />
            {attitude.label}
          </span>
          {person.focus && (
            <span className="chip bg-slate-50 text-slate-500 ring-slate-200" title={person.focus}>
              关注 {person.focus}
            </span>
          )}
        </div>

        {/* 影响力刻度 */}
        <div className="mt-2 flex items-center gap-1 pl-2">
          <span className="text-[10px] text-slate-400">影响力</span>
          <div className="flex gap-0.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <span
                key={n}
                className={`h-1 w-3.5 rounded-full ${n <= person.influence ? 'bg-slate-400' : 'bg-slate-100'}`}
              />
            ))}
          </div>
          <span className="ml-auto inline-flex items-center gap-0.5 text-[10px] text-slate-300 transition group-hover:text-brand-500">
            <Icon name="external" className="h-3 w-3" />
            悬停看诉求
          </span>
        </div>
      </div>

      {/* Tooltip：核心诉求 + 应对策略 */}
      <div
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-0 z-40 mb-2 w-[290px] translate-y-1 rounded-xl bg-navy-900 p-3 text-white opacity-0 shadow-2xl ring-1 ring-white/10 transition duration-150
                   group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100"
      >
        <div className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: role.accent }} />
          <p className="text-[11.5px] font-semibold text-slate-200">{person.name} · {role.label}</p>
          <span className={`ml-auto chip ${attitude.chip} !text-[10px]`}>{attitude.label}</span>
        </div>

        <div className="mt-2.5 space-y-2.5">
          <div>
            <p className="flex items-center gap-1 text-[10.5px] font-medium uppercase tracking-wider text-brand-300">
              <Icon name="target" className="h-3 w-3" /> 核心诉求
            </p>
            <p className={`mt-1 text-[12px] leading-[1.6] ${hasDemand ? 'text-slate-100' : 'text-slate-500'}`}>
              {hasDemand ? person.core_demand : '还没问到真实诉求 —— 下次沟通先问"这件事最影响您哪个指标？"'}
            </p>
          </div>

          <div className="border-t border-white/10 pt-2">
            <p className="flex items-center gap-1 text-[10.5px] font-medium uppercase tracking-wider text-emerald-300">
              <Icon name="shield" className="h-3 w-3" /> 应对策略
            </p>
            <p className={`mt-1 text-[12px] leading-[1.6] ${hasStrategy ? 'text-slate-100' : 'text-slate-500'}`}>
              {hasStrategy ? person.strategy : '尚未制定策略 —— 先确认对方 KPI，再决定给数据、给案例还是给让价。'}
            </p>
          </div>
        </div>

        {/* 小箭头 */}
        <span className="absolute -bottom-1 left-6 h-2 w-2 rotate-45 rounded-[2px] bg-navy-900 ring-1 ring-white/10" />
      </div>
    </div>
  )
}
