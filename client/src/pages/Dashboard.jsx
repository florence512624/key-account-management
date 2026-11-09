import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api.js'
import { STAGE_META, PRIORITY_META } from '../lib/constants.js'
import { dueLabel, fmtDate, fmtPercent, fmtWan, healthTone } from '../lib/format.js'
import { StatCard } from '../components/StatCard.jsx'
import { Icon } from '../components/Icon.jsx'
import {
  Chip, EmptyState, ErrorBanner, MockBadge, Modal, ProgressBar,
  SectionHeader, Spinner, useToast
} from '../components/ui.jsx'

/* ------------------------------ 待办行 ------------------------------ */
function TaskRow ({ task, busy, onToggle }) {
  const due = dueLabel(task.due_date)
  const isOverdue = task.due_date < new Date().toISOString().slice(0, 10)
  const prio = PRIORITY_META[task.priority] || PRIORITY_META.medium

  return (
    <li className="group flex items-start gap-3 px-4 py-3 transition hover:bg-slate-50/70">
      <button
        type="button"
        onClick={() => onToggle(task)}
        disabled={busy}
        aria-label={`完成：${task.content}`}
        className="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border border-slate-300 bg-white text-transparent transition hover:border-brand-500 hover:text-brand-500 disabled:opacity-50"
      >
        {busy ? <Spinner className="h-3 w-3 text-brand-600" /> : <Icon name="check" className="h-3 w-3" strokeWidth={2.6} />}
      </button>

      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] leading-5 text-slate-800">{task.content}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11.5px]">
          <span className="inline-flex items-center gap-1 text-slate-500">
            <Icon name="building" className="h-3 w-3 text-slate-400" />
            {task.account_name}
          </span>
          <span className={`inline-flex items-center gap-1 ${due.tone}`}>
            <Icon name="clock" className="h-3 w-3" />
            {due.text}
          </span>
          <span className="inline-flex items-center gap-1 text-slate-400">
            <span className={`h-1.5 w-1.5 rounded-full ${prio.dot}`} />
            {prio.label}优先级
          </span>
        </div>
      </div>

      {isOverdue && (
        <span className="mt-0.5 shrink-0 rounded-md bg-rose-50 px-1.5 py-0.5 text-[10.5px] font-medium text-rose-600 ring-1 ring-inset ring-rose-200">
          逾期
        </span>
      )}
    </li>
  )
}

/* ------------------------------ 页面 ------------------------------ */
export default function Dashboard () {
  const navigate = useNavigate()
  const { push } = useToast()

  const [state, setState] = useState({ loading: true, error: null, data: null, mock: false })
  const [busyId, setBusyId] = useState(null)
  const [open, setOpen] = useState(false)
  const [accounts, setAccounts] = useState([])
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ account_id: '', content: '', due_date: '', priority: 'medium' })

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const { data, mock } = await api.dashboard()
      setState({ loading: false, error: null, data, mock })
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: err }))
    }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    api.accounts().then(({ data }) => {
      setAccounts(data.items || [])
      setForm((f) => ({ ...f, account_id: f.account_id || data.items?.[0]?.id || '' }))
    }).catch(() => {})
  }, [])

  const stats = state.data?.stats
  const tasks = state.data?.todayTasks || []
  const opportunities = state.data?.opportunities || []

  const handleToggle = async (task) => {
    setBusyId(task.id)
    setState((s) => ({
      ...s,
      data: {
        ...s.data,
        todayTasks: s.data.todayTasks.filter((t) => t.id !== task.id),
        doneToday: s.data.doneToday + 1
      }
    }))
    try {
      await api.toggleTask(task.id, true)
      push(`已完成：${task.content}`)
      load({ silent: true }) // 逾期数、完成数需要跟着变
    } catch (err) {
      push(err.message, 'error')
      load({ silent: true })
    } finally {
      setBusyId(null)
    }
  }

  const submitTask = async (e) => {
    e.preventDefault()
    if (!form.account_id || !form.content.trim()) return
    setSaving(true)
    try {
      await api.addTask({
        account_id: Number(form.account_id),
        content: form.content.trim(),
        due_date: form.due_date || undefined,
        priority: form.priority
      })
      push('待办已添加')
      setOpen(false)
      setForm({ account_id: form.account_id, content: '', due_date: '', priority: 'medium' })
      load({ silent: true })
    } catch (err) {
      push(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const targetHint = useMemo(() => {
    if (!stats) return null
    const { monthlyTarget } = stats
    if (!monthlyTarget.value) return <span className="text-[11.5px] text-slate-400">尚未设置本月目标</span>
    return (
      <div className="space-y-1.5">
        <ProgressBar value={monthlyTarget.completion} className="h-1.5 w-full" barClass="bg-gradient-to-r from-brand-500 to-brand-700" />
        <div className="flex items-center justify-between text-[11px] text-slate-400">
          <span>已签 <b className="font-semibold text-slate-600">{fmtWan(monthlyTarget.achieved)}</b></span>
          <span className="font-medium text-brand-600">{fmtPercent(monthlyTarget.completion)}</span>
        </div>
      </div>
    )
  }, [stats])

  return (
    <div className="space-y-4">
      {state.error && (
        <ErrorBanner message={state.error.message} details={state.error.details} onRetry={() => load()} />
      )}

      {/* 四张统计卡 */}
      <section className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="跟进中客户"
          value={stats?.followingCustomers.value ?? '—'}
          unit="家"
          icon="users"
          tone="brand"
          loading={state.loading}
          hint={
            stats && (
              <div className="flex flex-wrap items-center gap-1.5">
                <Chip className="bg-slate-50 text-slate-600 ring-slate-200">线索 {stats.followingCustomers.breakdown.lead}</Chip>
                <Chip className="bg-blue-50 text-blue-700 ring-blue-200">跟进 {stats.followingCustomers.breakdown.following}</Chip>
                <Chip className="bg-amber-50 text-amber-700 ring-amber-200">谈判 {stats.followingCustomers.breakdown.negotiation}</Chip>
              </div>
            )
          }
          footer={stats ? `在途商机合计 ${fmtWan(stats.followingCustomers.pipelineAmount)}` : undefined}
        />

        <StatCard
          label="本月目标金额"
          value={stats ? (stats.monthlyTarget.value ? (stats.monthlyTarget.value / 10000).toFixed(0) : '—') : '—'}
          unit={stats?.monthlyTarget.value ? '万元' : ''}
          icon="target"
          tone="navy"
          loading={state.loading}
          hint={targetHint}
        />

        <StatCard
          label="逾期任务"
          value={stats?.overdueTasks.value ?? '—'}
          unit="条"
          icon="clock"
          tone="rose"
          loading={state.loading}
          hint={
            stats && stats.overdueTasks.value > 0
              ? <span className="text-[11.5px] font-medium text-rose-600">最早一条已逾期 {stats.overdueTasks.oldestOverdueDays} 天</span>
              : <span className="text-[11.5px] text-emerald-600">没有逾期，节奏正常</span>
          }
          footer="逾期即失约，优先清掉再谈新单"
        />

        <StatCard
          label="高风险客户"
          value={stats?.highRiskAccounts.value ?? '—'}
          unit="家"
          icon="alert"
          tone="amber"
          loading={state.loading}
          hint={
            stats && (
              <span className="text-[11.5px] text-slate-500">
                健康度 &lt; 60 且未签约，占在跟客户
                {' '}
                <b className="font-semibold text-amber-600">
                  {stats.followingCustomers.value ? Math.round((stats.highRiskAccounts.value / stats.followingCustomers.value) * 100) : 0}%
                </b>
              </span>
            )
          }
          footer="建议本周安排一次面对面复盘"
        />
      </section>

      {/* 商机漏斗 */}
      {!state.loading && state.data?.funnel && (
        <section className="surface flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:gap-2">
          <div className="flex shrink-0 items-center gap-2 pr-2">
            <Icon name="filter" className="h-4 w-4 text-slate-400" />
            <span className="text-[12.5px] font-medium text-slate-600">商机漏斗</span>
          </div>
          <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-4">
            {state.data.funnel.map((f) => {
              const meta = STAGE_META[f.stage]
              return (
                <div key={f.stage} className="rounded-lg border border-hairline bg-slate-50/50 px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                    <span className="text-[11.5px] text-slate-500">{meta.label}</span>
                    <span className="ml-auto text-[12px] font-semibold tabular-nums text-slate-700">{f.count}</span>
                  </div>
                  <p className="mt-0.5 text-[11.5px] tabular-nums text-slate-400">{fmtWan(f.amount)}</p>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* 两列主体 */}
      <section className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        {/* 今日待办 */}
        <div className="surface flex flex-col overflow-hidden">
          <SectionHeader
            title="今日待办任务"
            hint={state.data ? `待处理 ${tasks.length} 条 · 今日已完成 ${state.data.doneToday} 条` : '加载中…'}
            right={
              <button type="button" className="btn-ghost !px-2.5 !py-1.5 !text-[12px]" onClick={() => setOpen(true)}>
                <Icon name="plus" className="h-3.5 w-3.5" /> 新增
              </button>
            }
          />

          {state.loading ? (
            <ul className="divide-y divide-slate-100">
              {[0, 1, 2].map((i) => (
                <li key={i} className="flex gap-3 px-4 py-4">
                  <div className="skeleton h-4 w-4 rounded" />
                  <div className="flex-1 space-y-2">
                    <div className="skeleton h-3.5 w-3/4" />
                    <div className="skeleton h-3 w-1/3" />
                  </div>
                </li>
              ))}
            </ul>
          ) : tasks.length === 0 ? (
            <EmptyState icon="check" title="今天没有待办了" description="所有到期任务都已清空，可以专注推进新商机。" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {tasks.map((t) => (
                <TaskRow key={t.id} task={t} busy={busyId === t.id} onToggle={handleToggle} />
              ))}
            </ul>
          )}

          <div className="mt-auto flex items-center justify-between border-t border-hairline px-4 py-2.5 text-[11.5px] text-slate-400">
            <span className="inline-flex items-center gap-1">
              <Icon name="clock" className="h-3.5 w-3.5" />
              按截止日 + 优先级排序
            </span>
            <button type="button" className="font-medium text-brand-600 hover:text-brand-700" onClick={() => navigate('/interactions')}>
              去记录跟进 →
            </button>
          </div>
        </div>

        {/* 高潜客户商机 */}
        <div className="surface flex flex-col overflow-hidden">
          <SectionHeader
            title="高潜客户商机"
            hint="按预估金额排序，点击进入决策链图谱"
            right={<MockBadgeIf mock={state.mock} />}
          />

          {state.loading ? (
            <div className="space-y-3 p-4">
              {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-14 w-full rounded-lg" />)}
            </div>
          ) : opportunities.length === 0 ? (
            <EmptyState icon="trending" title="暂无在途商机" description="去客户管理里新建一个客户，商机会自动出现在这里。" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {opportunities.map((o, i) => {
                const stageMeta = STAGE_META[o.stage] || STAGE_META.lead
                const health = healthTone(o.health_score)
                return (
                  <li key={o.id}>
                    <button
                      type="button"
                      onClick={() => navigate(`/accounts/${o.id}/map`)}
                      className="group flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-50/80"
                    >
                      <span className="w-4 shrink-0 text-center text-[11px] font-semibold tabular-nums text-slate-300">
                        {String(i + 1).padStart(2, '0')}
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="truncate text-[13.5px] font-semibold text-slate-800">{o.name}</p>
                          <span className={`chip ${stageMeta.chip}`}>{stageMeta.label}</span>
                          {o.opposer_count > 0 && (
                            <span className="chip bg-rose-50 text-rose-600 ring-rose-200">反对者 {o.opposer_count}</span>
                          )}
                        </div>
                        <p className="mt-0.5 truncate text-[11.5px] text-slate-400">
                          {o.industry} · {o.owner} · 最近跟进 {o.last_contact_date ? fmtDate(o.last_contact_date) : '无记录'}
                        </p>
                        <div className="mt-1.5 flex items-center gap-1.5">
                          <ProgressBar value={o.health_score / 100} className="h-1 w-14" barClass={health.bar} />
                          <span className={`whitespace-nowrap text-[10.5px] font-medium tabular-nums ${health.text}`}>健康度 {o.health_score}</span>
                        </div>
                      </div>

                      <div className="shrink-0 text-right">
                        <p className="text-[13.5px] font-semibold tabular-nums text-slate-800">{fmtWan(o.estimated_amount)}</p>
                        <p className="text-[10.5px] text-slate-400">预估金额</p>
                      </div>

                      <Icon name="arrowRight" className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-brand-600" />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}

          <div className="mt-auto flex items-center justify-between border-t border-hairline px-4 py-2.5 text-[11.5px] text-slate-400">
            <span>仅展示金额最高的 6 家</span>
            <button type="button" className="font-medium text-brand-600 hover:text-brand-700" onClick={() => navigate('/accounts')}>
              查看全部客户 →
            </button>
          </div>
        </div>
      </section>

      {/* 新增待办 */}
      <Modal open={open} onClose={() => setOpen(false)} title="新增待办" description="绑定客户后，逾期会自动计入看板统计">
        <form onSubmit={submitTask} className="space-y-3.5">
          <div>
            <label className="label">关联客户</label>
            <select
              className="field"
              value={form.account_id}
              onChange={(e) => setForm({ ...form, account_id: e.target.value })}
              required
            >
              <option value="" disabled>请选择客户</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">任务内容</label>
            <input
              className="field"
              placeholder="例如：把 ROI 测算表发给周立群"
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              maxLength={300}
              autoFocus
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">截止日期</label>
              <input
                type="date"
                className="field"
                value={form.due_date}
                onChange={(e) => setForm({ ...form, due_date: e.target.value })}
              />
            </div>
            <div>
              <label className="label">优先级</label>
              <select className="field" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                <option value="high">高</option>
                <option value="medium">中</option>
                <option value="low">低</option>
              </select>
            </div>
          </div>
          <p className="text-[11.5px] text-slate-400">不填截止日期则默认今天，勾选完成后会自动记录完成时间。</p>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>取消</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving && <Spinner />} 保存待办
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

function MockBadgeIf ({ mock }) {
  return mock ? <MockBadge /> : null
}
