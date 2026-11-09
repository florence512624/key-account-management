import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api.js'
import { CHANNEL_META } from '../lib/constants.js'
import { fmtDate } from '../lib/format.js'
import { Icon } from '../components/Icon.jsx'
import { EmptyState, ErrorBanner, Modal, Spinner, useToast } from '../components/ui.jsx'

const EMPTY = { channel: 'visit', contact_date: '', summary: '', pain_point: '', stakeholder_id: '' }

export default function Interactions () {
  const navigate = useNavigate()
  const { push } = useToast()

  const [accounts, setAccounts] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [state, setState] = useState({ loading: true, items: [], stakeholders: [], error: null })
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.accounts({ sort: 'amount' })
      .then(({ data }) => {
        const items = data.items || []
        setAccounts(items)
        if (items[0]) setActiveId(items[0].id)
      })
      .catch((err) => setState((s) => ({ ...s, loading: false, error: err })))
  }, [])

  const load = useCallback(async () => {
    if (!activeId) return
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const [list, chain] = await Promise.all([api.interactions(activeId), api.stakeholders(activeId)])
      setState({ loading: false, items: list.items || [], stakeholders: chain.items || [], error: null })
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: err }))
    }
  }, [activeId])

  useEffect(() => { load() }, [load])

  const submit = async (e) => {
    e.preventDefault()
    if (!form.summary.trim()) return
    setSaving(true)
    try {
      await api.addInteraction(activeId, {
        channel: form.channel,
        contact_date: form.contact_date || undefined,
        summary: form.summary.trim(),
        pain_point: form.pain_point.trim() || null,
        stakeholder_id: form.stakeholder_id ? Number(form.stakeholder_id) : null,
        source: 'manual'
      })
      push('跟进记录已保存')
      setOpen(false)
      setForm(EMPTY)
      load()
    } catch (err) {
      push(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (item) => {
    if (!window.confirm('删除这条跟进记录？纪要删除后不可恢复。')) return
    try {
      await api.deleteInteraction(item.id)
      push('已删除')
      load()
    } catch (err) {
      push(err.message, 'error')
    }
  }

  const account = accounts.find((a) => a.id === activeId)

  return (
    <div className="space-y-4">
      {state.error && <ErrorBanner message={state.error.message} details={state.error.details} onRetry={load} />}

      <section className="surface flex flex-col gap-3 p-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative">
            <select
              className="field !w-auto min-w-[180px] !py-2 pr-9 text-[13.5px] font-semibold"
              value={activeId || ''}
              onChange={(e) => setActiveId(Number(e.target.value))}
              aria-label="选择客户"
            >
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              {accounts.length === 0 && <option value="">加载中…</option>}
            </select>
            <Icon name="chevronDown" className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          </div>
          {account && (
            <span className="text-[12px] text-slate-400">
              共 {state.items.length} 条跟进 · 负责人 {account.owner}
            </span>
          )}
        </div>

        <div className="flex gap-2">
          <button type="button" className="btn-ghost !py-1.5 !text-[12.5px]" onClick={() => activeId && navigate(`/accounts/${activeId}/map`)}>
            <Icon name="network" className="h-3.5 w-3.5" /> 决策链
          </button>
          <button type="button" className="btn-primary !py-1.5 !text-[12.5px]" onClick={() => setOpen(true)} disabled={!activeId}>
            <Icon name="plus" className="h-3.5 w-3.5" /> 记录跟进
          </button>
        </div>
      </section>

      <section className="surface p-4 sm:p-5">
        {state.loading ? (
          <div className="space-y-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex gap-3">
                <div className="skeleton h-8 w-8 rounded-full" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton h-3.5 w-1/3" />
                  <div className="skeleton h-16 w-full rounded-lg" />
                </div>
              </div>
            ))}
          </div>
        ) : state.items.length === 0 ? (
          <EmptyState
            icon="chat"
            title="还没有跟进记录"
            description="每次拜访、电话后花 1 分钟记下来，痛点会越攒越清晰。"
            action={<button type="button" className="btn-primary mt-2" onClick={() => setOpen(true)}><Icon name="plus" className="h-4 w-4" /> 记录第一条</button>}
          />
        ) : (
          <ol className="relative space-y-5 before:absolute before:left-[15px] before:top-2 before:bottom-2 before:w-px before:bg-slate-200">
            {state.items.map((it) => {
              const ch = CHANNEL_META[it.channel] || CHANNEL_META.visit
              return (
                <li key={it.id} className="group relative flex gap-3.5">
                  <div className={`z-10 mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-4 ring-white ${it.channel === 'visit' ? 'bg-indigo-50 text-indigo-600' : 'bg-cyan-50 text-cyan-600'}`}>
                    <Icon name={it.channel === 'visit' ? 'building' : 'phone'} className="h-4 w-4" />
                  </div>

                  <div className="min-w-0 flex-1 rounded-xl border border-hairline bg-white px-4 py-3 transition group-hover:border-slate-300">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[12.5px] font-semibold text-slate-800">{fmtDate(it.contact_date)}</span>
                      <span className={`chip ${ch.chip}`}>{ch.label}</span>
                      {it.stakeholder_name && (
                        <span className="text-[11.5px] text-slate-500">
                          {it.stakeholder_name}{it.stakeholder_title ? ` · ${it.stakeholder_title}` : ''}
                        </span>
                      )}
                      {it.source === 'ai' && (
                        <span className="chip bg-violet-50 text-violet-700 ring-violet-200">
                          <Icon name="sparkles" className="h-2.5 w-2.5" /> AI 提取
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => remove(it)}
                        className="ml-auto rounded p-1 text-slate-300 opacity-0 transition hover:bg-rose-50 hover:text-rose-500 group-hover:opacity-100"
                        aria-label="删除记录"
                      >
                        <Icon name="trash" className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-6 text-slate-700">{it.summary}</p>

                    {it.pain_point && (
                      <div className="mt-2 flex items-start gap-1.5 rounded-lg bg-amber-50/70 px-2.5 py-2 ring-1 ring-inset ring-amber-100">
                        <Icon name="zap" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                        <p className="text-[12px] leading-5 text-amber-800">
                          <span className="font-medium">痛点 / 卡点：</span>{it.pain_point}
                        </p>
                      </div>
                    )}
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </section>

      <Modal open={open} onClose={() => setOpen(false)} title="记录一次跟进" description="纪要和痛点会沉淀到客户档案，AI 提取的结果也可以直接存进来">
        <form onSubmit={submit} className="space-y-3.5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">沟通方式</label>
              <select className="field" value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })}>
                <option value="visit">拜访</option>
                <option value="call">电话</option>
              </select>
            </div>
            <div>
              <label className="label">沟通日期</label>
              <input type="date" className="field" value={form.contact_date} onChange={(e) => setForm({ ...form, contact_date: e.target.value })} />
            </div>
          </div>

          <div>
            <label className="label">对接人（可选）</label>
            <select className="field" value={form.stakeholder_id} onChange={(e) => setForm({ ...form, stakeholder_id: e.target.value })}>
              <option value="">不指定</option>
              {state.stakeholders.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.title}</option>)}
            </select>
          </div>

          <div>
            <label className="label">沟通纪要 <span className="text-rose-500">*</span></label>
            <textarea
              className="field min-h-[110px] resize-y"
              placeholder="对方说了什么、我们的判断、达成的共识…"
              value={form.summary}
              onChange={(e) => setForm({ ...form, summary: e.target.value })}
              required
            />
          </div>

          <div>
            <label className="label">识别出的新痛点 / 卡点</label>
            <textarea
              className="field min-h-[70px] resize-y"
              placeholder="例如：采购总监预算窗口已关闭，今年只能签一期小额合同"
              value={form.pain_point}
              onChange={(e) => setForm({ ...form, pain_point: e.target.value })}
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>取消</button>
            <button type="submit" className="btn-primary" disabled={saving}>{saving && <Spinner />} 保存记录</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
