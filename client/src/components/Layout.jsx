import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Icon } from './Icon.jsx'
import { ROLE_LABEL, useAuth } from '../lib/auth.jsx'
import { initials } from '../lib/format.js'
import { Modal, useToast } from './ui.jsx'
import { PasswordForm } from './PasswordForm.jsx'

const NAV = [
  { to: '/', label: '工作台', icon: 'grid', end: true, group: '业务' },
  { to: '/accounts', label: '客户管理', icon: 'building', end: true, group: '业务' },
  { to: '/map', label: '决策链图谱', icon: 'network', group: '业务' },
  { to: '/interactions', label: '跟进记录', icon: 'chat', group: '业务' },
  { to: '/ai', label: 'AI 痛点提取', icon: 'sparkles', group: '智能' }
]

const TITLES = [
  { test: (p) => p === '/', title: '工作台', desc: '今天该跟谁、该推进什么，一眼看完' },
  { test: (p) => p.startsWith('/map'), title: '决策链图谱', desc: '谁拍板、谁反对、先攻谁' },
  { test: (p) => p.startsWith('/accounts/') && p.endsWith('/map'), title: '决策链图谱', desc: '谁拍板、谁反对、先攻谁' },
  { test: (p) => p.startsWith('/accounts/'), title: '客户详情', desc: '客户全貌与决策链' },
  { test: (p) => p.startsWith('/accounts'), title: '客户管理', desc: '全部 KA 客户的阶段、金额与健康度' },
  { test: (p) => p.startsWith('/interactions'), title: '跟进记录', desc: '每次沟通留下的痛点和卡点' },
  { test: (p) => p.startsWith('/ai'), title: 'AI 痛点提取', desc: '把长文本拆成"表面要求"与"真实痛点"' },
  { test: (p) => p.startsWith('/profile'), title: '个人信息', desc: '修改姓名、职务与登录账号' }
]

function SidebarLink ({ item }) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        `group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] transition ${
          isActive
            ? 'bg-navy-800 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
            : 'text-slate-300/80 hover:bg-navy-850 hover:text-white'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <span className={`absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full transition ${isActive ? 'bg-brand-500' : 'bg-transparent'}`} />
          <Icon name={item.icon} className={`h-[18px] w-[18px] ${isActive ? 'text-brand-200' : 'text-slate-400 group-hover:text-slate-200'}`} />
          <span className="font-medium">{item.label}</span>
        </>
      )}
    </NavLink>
  )
}

/* --------------------------- 修改密码弹窗 --------------------------- */
function PasswordModal ({ open, onClose }) {
  return (
    <Modal open={open} onClose={onClose} title="修改密码" description="改完后其他设备上的登录会立即失效">
      <PasswordForm onDone={onClose} />
    </Modal>
  )
}

export function Layout () {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { user, logout, mustChangePassword } = useAuth()
  const { push } = useToast()
  const [menuOpen, setMenuOpen] = useState(false)
  const [pwOpen, setPwOpen] = useState(false)
  const menuRef = useRef(null)

  const meta = TITLES.find((t) => t.test(pathname)) || TITLES[0]
  const today = new Date()
  const weekday = ['日', '一', '二', '三', '四', '五', '六'][today.getDay()]
  const groups = ['业务', '智能']
  const displayName = user?.display_name || user?.username || '未登录'

  useEffect(() => {
    if (!menuOpen) return
    const onClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
    }
    const onKey = (e) => e.key === 'Escape' && setMenuOpen(false)
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  const handleLogout = async () => {
    setMenuOpen(false)
    await logout()
    push('已退出登录')
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen bg-canvas">
      {/* 侧边栏：深蓝，商务侧 */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[232px] flex-col border-r border-navy-800/60 bg-navy-900 lg:flex">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-gradient-to-br from-brand-500 to-brand-700 text-[10.5px] font-bold tracking-tight text-white shadow-lg shadow-brand-900/40">
            KAM
          </div>
          <div className="leading-tight">
            <p className="text-[13px] font-semibold leading-tight text-white">Key Account<br />Management</p>
            <p className="text-[10.5px] text-slate-400">大客户销售管理</p>
          </div>
        </div>

        <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-2">
          {groups.map((group) => (
            <div key={group}>
              <p className="mb-1.5 px-3 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-500">{group}</p>
              <div className="space-y-0.5">
                {NAV.filter((n) => n.group === group).map((item) => <SidebarLink key={item.to} item={item} />)}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-navy-800/60 p-3">
          <div className="rounded-xl bg-navy-850/80 p-3 ring-1 ring-inset ring-white/5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-700 text-[12px] font-semibold text-white">
                {initials(displayName)}
              </div>
              <div className="min-w-0 flex-1 leading-tight">
                <Link to="/profile" className="block truncate text-[12.5px] font-medium text-white hover:text-brand-200" title="查看个人信息">
                  {displayName}
                </Link>
                <p className="truncate text-[11px] text-slate-400">{ROLE_LABEL[user?.role] || '销售'} · 本地账号</p>
              </div>
            </div>
            <div className="mt-2.5 grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => setPwOpen(true)}
                className="flex items-center justify-center gap-1 rounded-md bg-white/5 py-1.5 text-[10.5px] font-medium text-slate-300 transition hover:bg-white/10 hover:text-white"
              >
                <Icon name="key" className="h-3 w-3" /> 改密码
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="flex items-center justify-center gap-1 rounded-md bg-white/5 py-1.5 text-[10.5px] font-medium text-slate-300 transition hover:bg-white/10 hover:text-white"
              >
                <Icon name="logout" className="h-3 w-3" /> 退出
              </button>
            </div>
            <div className="mt-2 flex items-center gap-1.5 rounded-md bg-emerald-500/10 px-2 py-1 text-[10.5px] font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/20">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              纯本地部署 · 数据不出内网
            </div>
          </div>
        </div>
      </aside>

      <div className="lg:pl-[232px]">
        <header className="sticky top-0 z-30 border-b border-hairline bg-white/85 backdrop-blur-md">
          <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-4 py-3.5 sm:px-6 lg:px-8">
            <div className="min-w-0">
              <h1 className="truncate text-[19px] font-semibold tracking-tight text-slate-900">{meta.title}</h1>
              <p className="mt-0.5 truncate text-[12.5px] text-slate-400">{meta.desc}</p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <div className="hidden items-center gap-1.5 rounded-lg border border-hairline bg-white px-2.5 py-1.5 text-[12px] text-slate-500 sm:flex">
                <Icon name="calendar" className="h-3.5 w-3.5 text-slate-400" />
                {today.getFullYear()}-{String(today.getMonth() + 1).padStart(2, '0')}-{String(today.getDate()).padStart(2, '0')}
                <span className="text-slate-300">·</span>
                周{weekday}
              </div>

              <div className="relative" ref={menuRef}>
                <button
                  type="button"
                  onClick={() => setMenuOpen((v) => !v)}
                  className="flex h-8 items-center gap-1.5 rounded-full pl-0.5 pr-2 transition hover:bg-slate-100"
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  title="账号菜单"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-navy-900 text-[11px] font-semibold text-white">
                    {initials(displayName)}
                  </span>
                  <Icon name="chevronDown" className={`h-3.5 w-3.5 text-slate-400 transition ${menuOpen ? 'rotate-180' : ''}`} />
                </button>

                {menuOpen && (
                  <div className="animate-pop absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-xl border border-hairline bg-white shadow-xl" role="menu">
                    <div className="border-b border-hairline px-3.5 py-2.5">
                      <p className="truncate text-[12.5px] font-semibold text-slate-800">{displayName}</p>
                      <p className="truncate text-[11px] text-slate-400">{user?.username} · {ROLE_LABEL[user?.role] || '销售'}</p>
                    </div>
                    <button type="button" role="menuitem" className="flex w-full items-center gap-2 px-3.5 py-2 text-[12.5px] text-slate-600 transition hover:bg-slate-50" onClick={() => { setMenuOpen(false); navigate('/profile') }}>
                      <Icon name="user" className="h-3.5 w-3.5 text-slate-400" /> 个人信息
                    </button>
                    <button type="button" role="menuitem" className="flex w-full items-center gap-2 px-3.5 py-2 text-[12.5px] text-slate-600 transition hover:bg-slate-50" onClick={() => { setMenuOpen(false); setPwOpen(true) }}>
                      <Icon name="key" className="h-3.5 w-3.5 text-slate-400" /> 修改密码
                    </button>
                    <button type="button" role="menuitem" className="flex w-full items-center gap-2 px-3.5 py-2 text-[12.5px] text-rose-600 transition hover:bg-rose-50" onClick={handleLogout}>
                      <Icon name="logout" className="h-3.5 w-3.5" /> 退出登录
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 移动端导航 */}
          <div className="flex gap-1 overflow-x-auto border-t border-hairline px-3 py-2 lg:hidden">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] transition ${
                    isActive ? 'bg-navy-900 text-white' : 'text-slate-500 hover:bg-slate-100'
                  }`
                }
              >
                <Icon name={item.icon} className="h-4 w-4" />
                {item.label}
              </NavLink>
            ))}
          </div>
        </header>

        {mustChangePassword && (
          <div className="mx-auto max-w-[1440px] px-4 pt-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50/70 px-3.5 py-2 text-[12px] text-amber-800">
              <Icon name="key" className="h-3.5 w-3.5" />
              你仍在使用初始密码，建议立即修改。
              <button type="button" className="ml-auto font-medium text-amber-900 underline underline-offset-2" onClick={() => setPwOpen(true)}>去修改</button>
            </div>
          </div>
        )}

        <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8 lg:py-7">
          <Outlet />
        </main>
      </div>

      <PasswordModal open={pwOpen} onClose={() => setPwOpen(false)} />
    </div>
  )
}
