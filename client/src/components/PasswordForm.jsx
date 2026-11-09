import { useState } from 'react'
import { useAuth } from '../lib/auth.jsx'
import { ErrorBanner, Spinner, useToast } from './ui.jsx'

/**
 * 修改密码表单：登录后的弹窗和个人信息页共用一份，避免两套校验逻辑跑偏。
 */
export function PasswordForm ({ onDone, submitLabel = '更新密码' }) {
  const { changePassword } = useAuth()
  const { push } = useToast()
  const [form, setForm] = useState({ current: '', next: '', confirm: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    if (form.next.length < 6) return setError({ message: '新密码至少 6 位' })
    if (form.next !== form.confirm) return setError({ message: '两次输入的新密码不一致' })
    if (form.next === form.current) return setError({ message: '新密码不能与当前密码相同' })

    setSaving(true)
    setError(null)
    try {
      await changePassword(form.current, form.next)
      push('密码已更新，其他设备需重新登录')
      setForm({ current: '', next: '', confirm: '' })
      onDone?.()
    } catch (err) {
      setError({ message: err.message, details: err.details })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3.5">
      {error && <ErrorBanner message={error.message} details={error.details} />}
      <div>
        <label className="label" htmlFor="pw-current">当前密码</label>
        <input id="pw-current" type="password" className="field" value={form.current}
          onChange={(e) => setForm({ ...form, current: e.target.value })} autoComplete="current-password" required />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="pw-next">新密码（至少 6 位）</label>
          <input id="pw-next" type="password" className="field" value={form.next}
            onChange={(e) => setForm({ ...form, next: e.target.value })} autoComplete="new-password" required />
        </div>
        <div>
          <label className="label" htmlFor="pw-confirm">确认新密码</label>
          <input id="pw-confirm" type="password" className="field" value={form.confirm}
            onChange={(e) => setForm({ ...form, confirm: e.target.value })} autoComplete="new-password" required />
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 pt-1">
        <p className="text-[11.5px] text-slate-400">改密后其他设备的登录会立即失效</p>
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving && <Spinner />} {submitLabel}
        </button>
      </div>
    </form>
  )
}
