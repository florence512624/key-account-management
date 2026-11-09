import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api.js'
import { STAGE_META, STAGE_ORDER } from '../lib/constants.js'
import { fmtDate, fmtWan, healthTone } from '../lib/format.js'
import { Icon } from '../components/Icon.jsx'
import {
  EmptyState, ErrorBanner, MockBadge, Modal, ProgressBar, Spinner, useToast
} from '../components/ui.jsx'

const EMPTY = {
  name: '', industry: '', scale: '大型', stage: 'lead',
  estimated_amount: '', health_score: 65, owner: '张伟', region: '', note: ''
}

export default function Accounts () {
  const navigate = useNavigate()
  const { push } = useToast()

  const [stage, setStage] = useState('')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState('amount')
  const [state, setState] = useState({ loading: true, data: null, error: null, mock: false })
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const { data, mock } = await api.accounts({ stage, q, sort })
      setState({ loading: false, data, error: null, mock })
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: err }))
    }
  }, [stage, q, sort])

  useEffect(() => {
    const timer = setTimeout(load, q ? 260 : 0)
    return () => clearTimeout(timer)
  }, [load, q])

  const items = state.data?.items || []
  const summary = state.data?.summary

  /** 导出走 blob 下载：失败时能拿到后端的具体错误，而不是跳到一个 JSON 页面 */
  const handleExport = async () => {
    if (exporting) return
    setExporting(true)
    try {
      const { blob, filename } = await api.exportAccounts({ stage, q, sort })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 5000)
      push(`已导出 ${items.length} 家客户（含汇总页）`)
    } catch (err) {
      push(err.message, 'error')
    } finally {
      setExporting(false)
    }
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) return
    setSaving(true)
    try {
      const created = await api.createAccount({
        name: form.name.trim(),
        industry: form.industry.trim() || '其他',
        scale: form.scale,
        stage: form.stage,
        estimated_amount: Number(form.estimated_amount) || 0,
        health_score: Number(form.health_score) || 60,
        owner: form.owner.trim() || '未分配',
        region: form.region.trim() || null,
        note: form.note.trim() || null
      })
      push(`已创建客户：${created.name}`)
      setOpen(false)
      setForm(EMPTY)
      load()
    } catch (err) {
      push(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      {state.error && <ErrorBanner message={state.error.message} details={state.error.details} onRetry={load} />}

      {/* 工具栏 */}
      <section className="surface p-3.5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-1">
            {[{ value: '', label: '全部' }, ...STAGE_ORDER.map((s) => ({ value: s, label: STAGE_META[s].label }))].map((t) => (
              <button
                key={t.value || 'all'}
                type="button"
                onClick={() => setStage(t.value)}
                className={`rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition ${
                  stage === t.value ? 'bg-navy-900 text-white' : 'text-slate-500 hover:bg-slate-100'
                }`}
              >
                {t.label}
              </button>
            ))}
            {state.mock && <span className="ml-1"><MockBadge /></span>}
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Icon name="search" className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                className="field !w-52 !pl-8 !py-1.5 !text-[12.5px]"
                placeholder="搜客户 / 行业 / 负责人"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <div className="relative">
              <select className="field !w-auto !py-1.5 !pl-2.5 !pr-8 !text-[12.5px]" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="排序">
                <option value="amount">按金额</option>
                <option value="health">按健康度</option>
                <option value="recent">按更新时间</option>
                <option value="name">按名称</option>
              </select>
              <Icon name="chevronDown" className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            </div>
            <button
              type="button"
              className="btn-ghost !py-1.5 !text-[12.5px]"
              onClick={handleExport}
              disabled={exporting || state.loading || items.length === 0}
              title="按当前筛选条件导出 .xlsx（含商机汇总页）"
            >
              {exporting ? <Spinner className="h-3.5 w-3.5" /> : <Icon name="download" className="h-3.5 w-3.5" />}
              {exporting ? '导出中…' : '导出 Excel'}
            </button>
            <button type="button" className="btn-primary !py-1.5 !text-[12.5px]" onClick={() => setOpen(true)}>
              <Icon name="plus" className="h-3.5 w-3.5" /> 新建客户
            </button>
          </div>
        </div>

        {summary && (
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-hairline pt-3 text-[11.5px] text-slate-400">
            <span>共 <b className="font-semibold text-slate-700">{summary.total}</b> 家</span>
            <span>在途金额 <b className="font-semibold text-slate-700 tabular-nums">{fmtWan(summary.pipeline ?? summary.amount)}</b></span>
            <span>高风险 <b className="font-semibold text-rose-600">{summary.risk}</b> 家</span>
            <span className="hidden sm:inline">点击任意一行进入决策链图谱</span>
          </div>
        )}
      </section>

      {/* 表格 */}
      <section className="surface overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] border-collapse text-left">
            <thead>
              <tr className="border-b border-hairline bg-slate-50/60 text-[11px] font-medium text-slate-400">
                <th className="px-4 py-2.5">客户</th>
                <th className="px-3 py-2.5">阶段</th>
                <th className="px-3 py-2.5 text-right">预估金额</th>
                <th className="px-3 py-2.5">健康度</th>
                <th className="px-3 py-2.5 text-center">关键人</th>
                <th className="px-3 py-2.5">最近跟进</th>
                <th className="px-3 py-2.5">负责人</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {state.loading && (
                [0, 1, 2, 3, 4].map((i) => (
                  <tr key={i}>
                    <td colSpan={8} className="px-4 py-3"><div className="skeleton h-9 w-full" /></td>
                  </tr>
                ))
              )}

              {!state.loading && items.map((a) => {
                const meta = STAGE_META[a.stage] || STAGE_META.lead
                const health = healthTone(a.health_score)
                return (
                  <tr
                    key={a.id}
                    className="group cursor-pointer transition hover:bg-slate-50/80"
                    onClick={() => navigate(`/accounts/${a.id}/map`)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-navy-900/5 text-[11px] font-semibold text-navy-800">
                          {a.name.slice(0, 2)}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-semibold text-slate-800">{a.name}</p>
                          <p className="truncate text-[11px] text-slate-400">{a.industry} · {a.scale} · {a.region || '未填区域'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3"><span className={`chip ${meta.chip}`}>{meta.label}</span></td>
                    <td className="px-3 py-3 text-right text-[13px] font-semibold tabular-nums text-slate-800">{fmtWan(a.estimated_amount)}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <ProgressBar value={a.health_score / 100} className="h-1 w-14" barClass={health.bar} />
                        <span className={`text-[11.5px] font-medium tabular-nums ${health.text}`}>{a.health_score}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className="text-[12px] tabular-nums text-slate-600">{a.stakeholder_count}</span>
                      {a.opposer_count > 0 && <span className="ml-1 text-[10.5px] text-rose-500">({a.opposer_count} 反对)</span>}
                    </td>
                    <td className="px-3 py-3 text-[12px] text-slate-500">
                      {a.last_contact_date ? fmtDate(a.last_contact_date) : <span className="text-slate-300">—</span>}
                      {a.overdue_task_count > 0 && (
                        <span className="ml-1.5 rounded bg-rose-50 px-1 py-px text-[10px] text-rose-600">逾期 {a.overdue_task_count}</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-[12px] text-slate-600">{a.owner}</td>
                    <td className="px-3 py-3 text-right">
                      <span className="inline-flex items-center gap-1 text-[11.5px] font-medium text-brand-600 opacity-0 transition group-hover:opacity-100">
                        决策链 <Icon name="arrowRight" className="h-3.5 w-3.5" />
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {!state.loading && items.length === 0 && (
          <EmptyState
            icon="building"
            title="没有匹配的客户"
            description="换个筛选条件，或者直接新建一个客户。"
            action={<button type="button" className="btn-primary mt-2" onClick={() => setOpen(true)}><Icon name="plus" className="h-4 w-4" /> 新建客户</button>}
          />
        )}
      </section>

      <Modal open={open} onClose={() => setOpen(false)} title="新建客户" description="阶段先填「线索」也没关系，后续在跟进中推进" width="max-w-xl">
        <form onSubmit={submit} className="space-y-3.5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">公司名称 <span className="text-rose-500">*</span></label>
              <input className="field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="例如：恒瑞医药" required autoFocus />
            </div>
            <div>
              <label className="label">行业</label>
              <input className="field" value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} placeholder="医药制造 / 新能源…" />
            </div>
            <div>
              <label className="label">规模</label>
              <select className="field" value={form.scale} onChange={(e) => setForm({ ...form, scale: e.target.value })}>
                <option value="大型">大型</option>
                <option value="中型">中型</option>
                <option value="小型">小型</option>
              </select>
            </div>
            <div>
              <label className="label">当前阶段</label>
              <select className="field" value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value })}>
                {STAGE_ORDER.map((s) => <option key={s} value={s}>{STAGE_META[s].label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">预估金额（元）</label>
              <input type="number" min="0" step="10000" className="field" value={form.estimated_amount} onChange={(e) => setForm({ ...form, estimated_amount: e.target.value })} placeholder="3000000" />
            </div>
            <div>
              <label className="label">健康度（0-100）</label>
              <input type="number" min="0" max="100" className="field" value={form.health_score} onChange={(e) => setForm({ ...form, health_score: e.target.value })} />
            </div>
            <div>
              <label className="label">负责人</label>
              <input className="field" value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })} />
            </div>
            <div>
              <label className="label">大区 / 城市</label>
              <input className="field" value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} placeholder="华东" />
            </div>
          </div>
          <div>
            <label className="label">备注</label>
            <textarea className="field min-h-[68px] resize-y" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="背景、竞争态势、特殊要求…" />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>取消</button>
            <button type="submit" className="btn-primary" disabled={saving}>{saving && <Spinner />} 创建客户</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
