import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../lib/api.js'
import { ROLE_META, ROLE_ORDER, STAGE_META } from '../lib/constants.js'
import { fmtDate, fmtWan, healthTone } from '../lib/format.js'
import { Icon } from '../components/Icon.jsx'
import { StakeholderCard } from '../components/StakeholderCard.jsx'
import { StakeholderForm } from '../components/StakeholderForm.jsx'
import { ErrorBanner, ProgressBar, useToast } from '../components/ui.jsx'

/** 决策链健康度：支持/中立/反对 的分布条 */
function SentimentBar ({ summary }) {
  const total = summary.total || 1
  return (
    <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
      <div className="bg-emerald-500 transition-all" style={{ width: `${(summary.support / total) * 100}%` }} />
      <div className="bg-slate-300 transition-all" style={{ width: `${(summary.neutral / total) * 100}%` }} />
      <div className="bg-rose-500 transition-all" style={{ width: `${(summary.oppose / total) * 100}%` }} />
    </div>
  )
}

export default function StakeholderMap () {
  const { id } = useParams()
  const navigate = useNavigate()
  const { push } = useToast()

  const [accounts, setAccounts] = useState([])
  const [state, setState] = useState({ loading: true, error: null, account: null, items: [], summary: null })

  const activeId = id ? Number(id) : null

  useEffect(() => {
    api.accounts({ sort: 'amount' })
      .then(({ data }) => {
        const items = data.items || []
        setAccounts(items)
        if (!id && items[0]) navigate(`/accounts/${items[0].id}/map`, { replace: true })
      })
      .catch(() => {})
  }, [id, navigate])

  const load = useCallback(async () => {
    if (!activeId) return
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const [full, chain] = await Promise.all([api.account(activeId), api.stakeholders(activeId)])
      setState({ loading: false, error: null, account: full.account, items: chain.items, summary: chain.summary })
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: err }))
    }
  }, [activeId])

  useEffect(() => { load() }, [load])

  const lanes = useMemo(
    () => ROLE_ORDER.map((role) => ({ role, people: state.items.filter((p) => p.role_type === role) })),
    [state.items]
  )

  const handleDelete = async (person) => {
    if (!window.confirm(`确认从决策链中删除「${person.name}」？\n历史跟进记录会保留，但不再关联此人。`)) return
    try {
      await api.deleteStakeholder(person.id)
      push(`已移除 ${person.name}`)
      load()
    } catch (err) {
      push(err.message, 'error')
    }
  }

  const stage = state.account ? STAGE_META[state.account.stage] : null
  const health = state.account ? healthTone(state.account.health_score) : null
  const summary = state.summary

  return (
    <div className="space-y-4">
      {state.error && <ErrorBanner message={state.error.message} details={state.error.details} onRetry={load} />}

      {/* 客户切换 + 概览 */}
      <section className="surface p-4 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative">
              <select
                className="field !w-auto min-w-[190px] !py-2 pr-9 text-[14px] font-semibold"
                value={activeId || ''}
                onChange={(e) => navigate(`/accounts/${e.target.value}/map`)}
                aria-label="切换客户"
              >
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                {accounts.length === 0 && <option value="">加载中…</option>}
              </select>
              <Icon name="chevronDown" className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            </div>

            {state.account && (
              <>
                <span className={`chip ${stage.chip}`}>{stage.label}</span>
                <span className="text-[12.5px] text-slate-500">预估 {fmtWan(state.account.estimated_amount)}</span>
                <span className="text-slate-300">·</span>
                <span className="text-[12.5px] text-slate-500">负责人 {state.account.owner}</span>
                <span className="text-slate-300">·</span>
                <span className="text-[12.5px] text-slate-500">
                  最近跟进 {state.account.last_contact_date ? fmtDate(state.account.last_contact_date) : '无记录'}
                </span>
              </>
            )}
          </div>

          {state.account && (
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-[10.5px] text-slate-400">客户健康度</p>
                <p className={`text-[15px] font-semibold tabular-nums ${health.text}`}>{state.account.health_score}</p>
              </div>
              <div>
                <ProgressBar value={state.account.health_score / 100} className="h-1.5 w-24" barClass={health.bar} />
              </div>
            </div>
          )}
        </div>

        {/* 决策链概览 */}
        {summary && !state.loading && (
          <div className="mt-4 grid gap-3 border-t border-hairline pt-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-[10.5px] text-slate-400">关键人覆盖</p>
              <p className="mt-0.5 flex items-baseline gap-1">
                <span className="text-[19px] font-semibold tabular-nums text-slate-800">{summary.total}</span>
                <span className="text-[11px] text-slate-400">人 · 角色覆盖 {summary.coverage}%</span>
              </p>
            </div>
            <div>
              <p className="text-[10.5px] text-slate-400">态度分布</p>
              <div className="mt-1.5 space-y-1">
                <SentimentBar summary={summary} />
                <div className="flex gap-2 text-[10.5px]">
                  <span className="text-emerald-600">支持 {summary.support}</span>
                  <span className="text-slate-500">中立 {summary.neutral}</span>
                  <span className="text-rose-600">反对 {summary.oppose}</span>
                </div>
              </div>
            </div>
            <div>
              <p className="text-[10.5px] text-slate-400">决策者</p>
              <p className="mt-0.5 text-[12.5px] text-slate-700">
                {state.items.find((p) => p.role_type === 'decision_maker')?.name || <span className="text-rose-600">尚未识别</span>}
              </p>
            </div>
            <div>
              <p className="text-[10.5px] text-slate-400">最近更新</p>
              <p className="mt-0.5 text-[12.5px] text-slate-700">{fmtDate(state.account?.updated_at?.slice(0, 10))}</p>
            </div>
          </div>
        )}
      </section>

      {/* 风险提示 */}
      {summary?.flags?.length > 0 && (
        <section className="rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3">
          <div className="flex items-start gap-2.5">
            <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <div>
              <p className="text-[12.5px] font-semibold text-amber-800">决策链风险</p>
              <ul className="mt-1 space-y-0.5">
                {summary.flags.map((f) => (
                  <li key={f} className="text-[12px] leading-5 text-amber-700">· {f}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      )}

      {/* 角色流转说明 */}
      <div className="flex flex-wrap items-center gap-1.5 px-0.5">
        {ROLE_ORDER.map((role, i) => {
          const meta = ROLE_META[role]
          return (
            <div key={role} className="flex items-center gap-1.5">
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-medium ring-1 ring-inset ${meta.chip}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                {meta.label}
                <span className="opacity-60">· {meta.hint}</span>
              </span>
              {i < ROLE_ORDER.length - 1 && <Icon name="arrowRight" className="h-3.5 w-3.5 text-slate-300" />}
            </div>
          )
        })}
      </div>

      {/* 四列图谱 */}
      {state.loading ? (
        <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
          {ROLE_ORDER.map((r) => (
            <div key={r} className="surface p-3">
              <div className="skeleton mb-3 h-6 w-24" />
              <div className="space-y-2">
                <div className="skeleton h-24 w-full rounded-xl" />
                <div className="skeleton h-24 w-full rounded-xl" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
          {lanes.map(({ role, people }, idx) => {
            const meta = ROLE_META[role]
            return (
              <div key={role} className="surface flex flex-col overflow-visible p-3">
                <div className="mb-2.5 flex items-center gap-2 border-b border-hairline pb-2.5">
                  <span className="flex h-6 w-6 items-center justify-center rounded-md text-[10.5px] font-bold tabular-nums"
                    style={{ backgroundColor: `${meta.accent}14`, color: meta.accent }}>
                    {String(idx + 1).padStart(2, '0')}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] font-semibold text-slate-800">{meta.label}</p>
                    <p className="truncate text-[10.5px] text-slate-400">{meta.hint}</p>
                  </div>
                  <span className="rounded-full bg-slate-50 px-1.5 py-0.5 text-[10.5px] font-medium tabular-nums text-slate-500 ring-1 ring-inset ring-slate-200">
                    {people.length}
                  </span>
                </div>

                {/* 第一列卡片需要向下弹，避免贴顶被裁 */}
                <div className={`flex flex-1 flex-col gap-2 ${idx === 0 ? 'pt-2' : ''}`}>
                  {people.length === 0 ? (
                    <div className="flex flex-1 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-slate-200 px-3 py-8 text-center">
                      <Icon name="plus" className="h-4 w-4 text-slate-300" />
                      <p className="text-[11.5px] text-slate-400">暂无{meta.label}</p>
                    </div>
                  ) : (
                    people.map((p) => <StakeholderCard key={p.id} person={p} onDelete={handleDelete} />)
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* 添加表单 */}
      {activeId && (
        <StakeholderForm accountId={activeId} onCreated={load} />
      )}

      <p className="flex items-center gap-1.5 px-1 text-[11px] text-slate-400">
        <Icon name="shield" className="h-3.5 w-3.5" />
        决策链数据仅保存在本机 SQLite，删除客户时会一并清理；删除单个联系人只解除关联，历史纪要保留。
      </p>
    </div>
  )
}
