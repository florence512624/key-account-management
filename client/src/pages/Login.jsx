import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth.jsx'
import { Icon } from '../components/Icon.jsx'
import { ErrorBanner, Spinner, useToast } from '../components/ui.jsx'

const HIGHLIGHTS = [
  { icon: 'target', title: '今天的仗，一眼看清', text: '待办、逾期、高潜商机按优先级排在一屏' },
  { icon: 'network', title: '决策链不再靠记', text: '谁拍板、谁反对、谁还没见，四泳道全摊开' },
  { icon: 'sparkles', title: '痛点从原文里挖', text: '本地模型拆解沟通记录，区分"说的"和"怕的"' }
]

export default function Login () {
  const { login, user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { push } = useToast()

  const [form, setForm] = useState({ username: '', password: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const from = location.state?.from || '/'

  // 已登录还停在登录页，直接送回去
  useEffect(() => {
    if (user) navigate(from, { replace: true })
  }, [user, from, navigate])

  const submit = async (e) => {
    e.preventDefault()
    if (submitting) return
    setError(null)
    setSubmitting(true)
    try {
      const res = await login(form.username.trim(), form.password)
      push(`欢迎回来，${res.user.display_name || res.user.username}`)
      navigate(from, { replace: true })
    } catch (err) {
      setError({ message: err.message, details: err.details })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen bg-canvas">
      {/* 左侧品牌区 */}
      <aside className="relative hidden w-[46%] max-w-[620px] flex-col justify-between overflow-hidden bg-navy-900 p-10 lg:flex">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand-600/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 h-80 w-80 rounded-full bg-brand-500/10 blur-3xl" />

        <div className="relative flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-[11px] font-bold text-white shadow-lg shadow-brand-900/40">
            KAM
          </div>
          <div className="leading-tight">
            <p className="text-[15px] font-semibold text-white">Key Account Management</p>
            <p className="text-[11.5px] text-slate-400">大客户销售管理系统</p>
          </div>
        </div>

        <div className="relative max-w-md">
          <h1 className="text-[30px] font-semibold leading-[1.3] tracking-tight text-white">
            大客户的单子，
            <br />
            输在没看清人，不是没努力。
          </h1>
          <p className="mt-3 text-[13.5px] leading-6 text-slate-400">
            把客户、决策链、跟进记录和 AI 洞察放在同一个工作台里，数据只存在你自己的电脑上。
          </p>

          <ul className="mt-8 space-y-4">
            {HIGHLIGHTS.map((item) => (
              <li key={item.title} className="flex gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/5 ring-1 ring-inset ring-white/10">
                  <Icon name={item.icon} className="h-4 w-4 text-brand-200" />
                </span>
                <div>
                  <p className="text-[13px] font-medium text-slate-100">{item.title}</p>
                  <p className="mt-0.5 text-[12px] leading-5 text-slate-400">{item.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative flex items-center gap-2 text-[11.5px] text-slate-500">
          <Icon name="shield" className="h-3.5 w-3.5" />
          纯本地部署 · 数据不出内网 · 无云服务依赖
        </div>
      </aside>

      {/* 右侧表单区 */}
      <main className="flex flex-1 items-center justify-center px-5 py-10">
        <div className="w-full max-w-[380px]">
          <div className="mb-7 flex items-center gap-2.5 lg:hidden">
            <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-navy-900 text-[10.5px] font-bold text-white">KAM</div>
            <div className="leading-tight">
              <p className="text-[13.5px] font-semibold text-slate-900">Key Account Management</p>
              <p className="text-[11px] text-slate-400">大客户销售管理系统</p>
            </div>
          </div>

          <h2 className="text-[24px] font-semibold tracking-tight text-slate-900">登录工作台</h2>
          <p className="mt-1 text-[13px] text-slate-500">使用你的账号继续，会话保留 7 天</p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            {error && <ErrorBanner message={error.message} details={error.details} />}

            <div>
              <label className="label" htmlFor="login-username">用户名</label>
              <div className="relative">
                <Icon name="user" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="login-username"
                  className="field !py-2.5 !pl-9"
                  placeholder="admin"
                  autoComplete="username"
                  autoFocus
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                />
              </div>
            </div>

            <div>
              <label className="label" htmlFor="login-password">密码</label>
              <div className="relative">
                <Icon name="lock" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  className="field !py-2.5 !pl-9 !pr-10"
                  placeholder="请输入密码"
                  autoComplete="current-password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                  aria-label={showPassword ? '隐藏密码' : '显示密码'}
                  tabIndex={-1}
                >
                  <Icon name={showPassword ? 'eyeOff' : 'eye'} className="h-4 w-4" />
                </button>
              </div>
            </div>

            <button type="submit" className="btn-primary h-11 w-full" disabled={submitting}>
              {submitting ? <><Spinner /> 正在登录…</> : <><Icon name="logout" className="h-4 w-4 -scale-x-100" /> 登录</>}
            </button>
          </form>

          <div className="mt-5 rounded-lg border border-hairline bg-white px-3.5 py-3">
            <p className="flex items-center gap-1.5 text-[11.5px] font-medium text-slate-600">
              <Icon name="key" className="h-3.5 w-3.5 text-amber-500" />
              初始账号
            </p>
            <p className="mt-1 text-[11.5px] leading-5 text-slate-400">
              用户名 <code className="rounded bg-slate-100 px-1 py-px font-mono text-[11px] text-slate-600">admin</code>
              　密码 <code className="rounded bg-slate-100 px-1 py-px font-mono text-[11px] text-slate-600">admin123</code>
              <br />
              登录后请在左下角用户菜单里修改密码。
            </p>
          </div>

          <p className="mt-6 text-center text-[11px] text-slate-400">
            密码使用 scrypt 加盐存储，会话只保留在本地数据库
          </p>
        </div>
      </main>
    </div>
  )
}
