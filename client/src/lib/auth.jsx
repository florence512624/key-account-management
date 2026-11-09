import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api } from './api.js'

const AuthContext = createContext(null)

/**
 * 登录态唯一来源。
 * - 首屏用 /api/auth/me 探一次，避免刷新页面就掉登录；
 * - 任意接口返回 401 时由 api.js 派发 ka:unauthorized，这里统一清空用户，
 *   路由层随即把页面切到 /login，不用每个页面各写一遍。
 */
export function AuthProvider ({ children }) {
  const [state, setState] = useState({ loading: true, user: null, mustChangePassword: false })

  const refresh = useCallback(async () => {
    try {
      const res = await api.me()
      setState({ loading: false, user: res.user, mustChangePassword: Boolean(res.must_change_password) })
    } catch {
      setState({ loading: false, user: null, mustChangePassword: false })
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  useEffect(() => {
    const onUnauthorized = () => {
      setState((s) => (s.user ? { ...s, user: null } : s))
    }
    window.addEventListener('ka:unauthorized', onUnauthorized)
    return () => window.removeEventListener('ka:unauthorized', onUnauthorized)
  }, [])

  const login = useCallback(async (username, password) => {
    const res = await api.login({ username, password })
    setState({ loading: false, user: res.user, mustChangePassword: Boolean(res.must_change_password) })
    return res
  }, [])

  const logout = useCallback(async () => {
    try {
      await api.logout()
    } catch {
      // 网络问题也要让本地退出去，否则用户会卡在"退不出去"的状态
    } finally {
      setState({ loading: false, user: null, mustChangePassword: false })
    }
  }, [])

  const updateProfile = useCallback(async (patch) => {
    const res = await api.updateProfile(patch)
    // 立刻刷新本地用户，侧栏姓名/头像不用等下一次 /me
    setState((s) => ({ ...s, user: res.user, mustChangePassword: Boolean(res.must_change_password) }))
    return res.user
  }, [])

  const changePassword = useCallback(async (currentPassword, newPassword) => {
    await api.changePassword({ current_password: currentPassword, new_password: newPassword })
    setState((s) => ({ ...s, mustChangePassword: false }))
  }, [])

  const value = useMemo(
    () => ({ ...state, login, logout, changePassword, updateProfile, refresh }),
    [state, login, logout, changePassword, updateProfile, refresh]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth () {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth 必须在 AuthProvider 内使用')
  return ctx
}

export const ROLE_LABEL = { admin: '管理员', sales: '销售' }
