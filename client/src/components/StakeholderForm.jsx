import { useState } from 'react'
import { api } from '../lib/api.js'
import { ATTITUDE_META, ROLE_META, ROLE_ORDER } from '../lib/constants.js'
import { Icon } from './Icon.jsx'
import { ErrorBanner, Spinner, useToast } from './ui.jsx'

const EMPTY = {
  name: '',
  title: '',
  role_type: 'influencer',
  attitude: 'neutral',
  influence: 3,
  focus: '',
  core_demand: '',
  strategy: ''
}

/** 快速添加决策人：默认值已选好，销售只需要填姓名和诉求 */
export function StakeholderForm ({ accountId, onCreated }) {
  const { push } = useToast()
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }))

  const submit = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) {
      setError({ message: '请先填写姓名' })
      return
    }
    setSaving(true)
    setError(null)
    try {
      const payload = {
        name: form.name.trim(),
        title: form.title.trim(),
        role_type: form.role_type,
        attitude: form.attitude,
        influence: Number(form.influence),
        focus: form.focus.trim() || null,
        core_demand: form.core_demand.trim() || null,
        strategy: form.strategy.trim() || null
      }
      const created = await api.addStakeholder(accountId, payload)
      push(`${created.name} 已加入决策链`)
      setForm(EMPTY)
      onCreated?.(created)
    } catch (err) {
      setError({ message: err.message, details: err.details })
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="surface overflow-hidden">
      <div className="flex items-start justify-between gap-3 border-b border-hairline px-5 py-3.5">
        <div>
          <h2 className="flex items-center gap-1.5 text-[15px] font-semibold text-slate-800">
            <Icon name="users" className="h-4 w-4 text-slate-400" />
            添加决策人
          </h2>
          <p className="mt-0.5 text-xs text-slate-400">
            填得越细，图谱越好用；"核心诉求"和"应对策略"会直接出现在卡片悬浮提示里
          </p>
        </div>
        <span className="hidden shrink-0 rounded-md bg-slate-50 px-2 py-1 text-[11px] text-slate-400 sm:block">
          必填：姓名
        </span>
      </div>

      <form onSubmit={submit} className="space-y-3.5 px-5 py-4">
        {error && <ErrorBanner message={error.message} details={error.details} />}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="label" htmlFor="sk-name">姓名 <span className="text-rose-500">*</span></label>
            <input
              id="sk-name"
              className="field"
              placeholder="例如：周立群"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              maxLength={40}
              autoComplete="off"
            />
          </div>
          <div>
            <label className="label" htmlFor="sk-title">职务</label>
            <input
              id="sk-title"
              className="field"
              placeholder="例如：集团 CIO"
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
              maxLength={60}
              autoComplete="off"
            />
          </div>
          <div>
            <label className="label" htmlFor="sk-role">角色类型</label>
            <select id="sk-role" className="field" value={form.role_type} onChange={(e) => set('role_type', e.target.value)}>
              {ROLE_ORDER.map((r) => <option key={r} value={r}>{ROLE_META[r].label}（{ROLE_META[r].hint}）</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="sk-attitude">当前态度</label>
            <select id="sk-attitude" className="field" value={form.attitude} onChange={(e) => set('attitude', e.target.value)}>
              {Object.entries(ATTITUDE_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="sk-focus">关注点</label>
            <input
              id="sk-focus"
              className="field"
              placeholder="ROI / 预算 / 体验 / 合规…"
              value={form.focus}
              onChange={(e) => set('focus', e.target.value)}
              maxLength={120}
            />
          </div>
          <div>
            <label className="label" htmlFor="sk-influence">影响力（1-5）</label>
            <div className="flex items-center gap-3">
              <input
                id="sk-influence"
                type="range"
                min="1"
                max="5"
                step="1"
                value={form.influence}
                onChange={(e) => set('influence', Number(e.target.value))}
                className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-slate-200 accent-brand-600"
              />
              <span className="w-14 text-center text-[12px] tabular-nums text-slate-500">{form.influence} / 5</span>
            </div>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <div>
            <label className="label" htmlFor="sk-demand">核心诉求（只关心什么）</label>
            <textarea
              id="sk-demand"
              className="field min-h-[72px] resize-y"
              placeholder="例如：只关心三年内能不能算清 ROI，数据不出内网"
              value={form.core_demand}
              onChange={(e) => set('core_demand', e.target.value)}
              maxLength={500}
            />
          </div>
          <div>
            <label className="label" htmlFor="sk-strategy">应对策略（我们怎么打）</label>
            <textarea
              id="sk-strategy"
              className="field min-h-[72px] resize-y"
              placeholder="例如：带财务口径的 ROI 测算表上门，同步提供本地化架构图"
              value={form.strategy}
              onChange={(e) => set('strategy', e.target.value)}
              maxLength={500}
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 pt-1">
          <p className="text-[11.5px] text-slate-400">
            提示：决策者建议只留 1 位，多位"决策者"通常意味着还没找对人。
          </p>
          <div className="flex shrink-0 gap-2">
            <button type="button" className="btn-ghost" onClick={() => { setForm(EMPTY); setError(null) }} disabled={saving}>
              清空
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? <Spinner /> : <Icon name="plus" className="h-4 w-4" />}
              加入决策链
            </button>
          </div>
        </div>
      </form>
    </section>
  )
}
