import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ROLE_LABEL, useAuth } from '../lib/auth.jsx'
import { fmtDateTime, initials } from '../lib/format.js'
import { Icon } from '../components/Icon.jsx'
import { PasswordForm } from '../components/PasswordForm.jsx'
import { ErrorBanner, Spinner, useToast } from '../components/ui.jsx'

const EMPTY_ERROR = null

export default function Profile () {
  const { user, updateProfile } = useAuth()
  const { push } = useToast()

  const initial = useMemo(() => ({
    display_name: user?.display_name || '',
    username: user?.username || '',
    title: user?.title || '',
    email: user?.email || '',
    phone: user?.phone || ''
  }), [user])

  const [form, setForm] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(EMPTY_ERROR)

  const dirty = Object.keys(initial).some((k) => (form[k] || '') !== (initial[k] || ''))

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }))

  const submit = async (e) => {
    e.preventDefault()
    if (!form.display_name.trim()) return setError({ message: '姓名不能为空' })
    if (form.username.trim().length < 3) return setError({ message: '用户名至少 3 位' })
    if (form.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) {
      return setError({ message: '邮箱格式不正确' })
    }

    setSaving(true)
    setError(null)
    try {
      await updateProfile({
        display_name: form.display_name.trim(),
        username: form.username.trim(),
        title: form.title.trim(),
        email: form.email.trim(),
        phone: form.phone.trim()
      })
      push('个人信息已保存')
    } catch (err) {
      setError({ message: err.message, details: err.details })
    } finally {
      setSaving(false)
    }
  }

  const usernameChanged = form.username.trim() !== (user?.username || '')
  const displayName = form.display_name || user?.display_name || user?.username || '未登录'

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
      {/* 左：身份卡 */}
      <section className="surface overflow-hidden">
        <div className="h-20 bg-gradient-to-br from-navy-900 via-navy-800 to-brand-700" />
        <div className="px-5 pb-5">
          <div className="-mt-9 mb-3 flex h-18 w-18 items-center justify-center rounded-2xl border-4 border-white bg-navy-900 text-[22px] font-semibold text-white shadow-lg">
            {initials(displayName)}
          </div>
          <h2 className="truncate text-[16px] font-semibold text-slate-900">{displayName}</h2>
          <p className="mt-0.5 truncate text-[12.5px] text-slate-500">
            {form.title?.trim() || '未填写职务'}
          </p>

          <div className="mt-3 flex flex-wrap gap-1.5">
            <span className="chip bg-brand-50 text-brand-700 ring-brand-200">{ROLE_LABEL[user?.role] || '销售'}</span>
            <span className="chip bg-slate-50 text-slate-600 ring-slate-200">@{user?.username}</span>
          </div>

          <dl className="mt-4 space-y-2.5 border-t border-hairline pt-4 text-[12px]">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-slate-400">注册时间</dt>
              <dd className="text-slate-600">{user?.created_at ? fmtDateTime(user.created_at) : '—'}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-slate-400">上次登录</dt>
              <dd className="text-slate-600">{user?.last_login_at ? fmtDateTime(user.last_login_at) : '—'}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-slate-400">账号类型</dt>
              <dd className="text-slate-600">本地账号 · SQLite</dd>
            </div>
          </dl>

          <div className="mt-4 flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-2 text-[11px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-100">
            <Icon name="shield" className="h-3.5 w-3.5" />
            数据不出内网，无云服务依赖
          </div>

          <Link to="/accounts" className="mt-3 flex items-center justify-center gap-1 rounded-lg border border-slate-200 py-2 text-[12px] text-slate-600 transition hover:border-slate-300 hover:text-slate-900">
            <Icon name="building" className="h-3.5 w-3.5" /> 回到客户列表
          </Link>
        </div>
      </section>

      {/* 右：表单 */}
      <div className="space-y-4">
        <section className="surface overflow-hidden">
          <div className="flex items-start justify-between gap-3 border-b border-hairline px-5 py-3.5">
            <div>
              <h2 className="text-[15px] font-semibold text-slate-800">基本信息</h2>
              <p className="mt-0.5 text-xs text-slate-400">姓名与职务会显示在工作台侧栏和欢迎语里</p>
            </div>
            <span className="hidden shrink-0 rounded-md bg-slate-50 px-2 py-1 text-[11px] text-slate-400 sm:block">
              仅存储在本地
            </span>
          </div>

          <form onSubmit={submit} className="space-y-3.5 px-5 py-4">
            {error && <ErrorBanner message={error.message} details={error.details} />}

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="pf-name">姓名 <span className="text-rose-500">*</span></label>
                <input
                  id="pf-name"
                  className="field"
                  value={form.display_name}
                  onChange={(e) => set('display_name', e.target.value)}
                  maxLength={40}
                />
              </div>
              <div>
                <label className="label" htmlFor="pf-title">职务</label>
                <input
                  id="pf-title"
                  className="field"
                  placeholder="例如：KA 销售总监"
                  value={form.title}
                  onChange={(e) => set('title', e.target.value)}
                  maxLength={60}
                />
              </div>
              <div>
                <label className="label" htmlFor="pf-username">用户名（登录用）</label>
                <input
                  id="pf-username"
                  className="field"
                  value={form.username}
                  onChange={(e) => set('username', e.target.value)}
                  maxLength={40}
                  autoComplete="username"
                />
                <p className={`mt-1 text-[11px] ${usernameChanged ? 'text-amber-600' : 'text-slate-400'}`}>
                  {usernameChanged ? '修改后下次登录要用新用户名' : '字母、数字、点、下划线、短横线'}
                </p>
              </div>
              <div>
                <label className="label" htmlFor="pf-phone">手机号</label>
                <input
                  id="pf-phone"
                  className="field"
                  placeholder="选填"
                  value={form.phone}
                  onChange={(e) => set('phone', e.target.value)}
                  maxLength={30}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor="pf-email">邮箱</label>
                <input
                  id="pf-email"
                  type="email"
                  className="field"
                  placeholder="选填，用于后续导出署名"
                  value={form.email}
                  onChange={(e) => set('email', e.target.value)}
                  maxLength={120}
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-hairline pt-3.5">
              <p className="text-[11.5px] text-slate-400">
                {dirty ? '有未保存的修改' : '资料已是最新'}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => { setForm(initial); setError(null) }}
                  disabled={saving || !dirty}
                >
                  撤销
                </button>
                <button type="submit" className="btn-primary" disabled={saving || !dirty}>
                  {saving && <Spinner />} 保存修改
                </button>
              </div>
            </div>
          </form>
        </section>

        <section className="surface overflow-hidden">
          <div className="border-b border-hairline px-5 py-3.5">
            <h2 className="text-[15px] font-semibold text-slate-800">账号安全</h2>
            <p className="mt-0.5 text-xs text-slate-400">密码使用 scrypt 加盐存储，服务端不可逆</p>
          </div>
          <div className="px-5 py-4">
            <PasswordForm />
          </div>
        </section>
      </div>
    </div>
  )
}
