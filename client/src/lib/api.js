import { mockDashboard, mockAccounts } from './mock.js'

const BASE = '/api'

export class ApiError extends Error {
  constructor (message, status = 0, details) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.details = details
    this.offline = status === 0
  }
}

async function request (path, { method = 'GET', body, signal } = {}) {
  let res
  try {
    res = await fetch(BASE + path, {
      method,
      credentials: 'same-origin', // 会话 Cookie 必须带上
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal
    })
  } catch (err) {
    if (err.name === 'AbortError') throw err
    throw new ApiError('连不上后端服务，请确认 Express 已启动（npm run dev）', 0, [err.message])
  }

  const text = await res.text()
  let payload = null
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      throw new ApiError(`服务端返回了非 JSON 响应（${res.status}）`, res.status, [text.slice(0, 200)])
    }
  }

  if (!res.ok) {
    // 会话过期：通知全局，让路由把用户送回登录页（登录接口本身不触发）
    if (res.status === 401 && !path.startsWith('/auth/')) {
      window.dispatchEvent(new Event('ka:unauthorized'))
    }
    throw new ApiError(payload?.error || `请求失败（${res.status}）`, res.status, payload?.details)
  }
  return payload
}

const qs = (params = {}) => {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
  return entries.length ? `?${new URLSearchParams(entries).toString()}` : ''
}

/** 读接口统一返回 { data, mock }，页面只关心 data，mock 用来提示"演示模式" */
async function read (path, fallback) {
  try {
    return { data: await request(path), mock: false }
  } catch (err) {
    if (err.offline && fallback) return { data: fallback(), mock: true }
    throw err
  }
}

export const api = {
  /* 登录 */
  login: (body) => request('/auth/login', { method: 'POST', body }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  me: () => request('/auth/me'),
  updateProfile: (body) => request('/auth/profile', { method: 'PATCH', body }),
  changePassword: (body) => request('/auth/password', { method: 'PATCH', body }),

  /* 导出 */
  exportAccounts: async (params) => {
    let res
    try {
      res = await fetch(`${BASE}/accounts/export.xlsx${qs(params)}`, { credentials: 'same-origin' })
    } catch (err) {
      throw new ApiError('连不上后端服务，请确认 Express 已启动', 0, [err.message])
    }
    if (!res.ok) {
      let message = `导出失败（${res.status}）`
      try {
        const payload = await res.json()
        message = payload?.error || message
      } catch { /* 非 JSON 错误体 */ }
      if (res.status === 401) window.dispatchEvent(new Event('ka:unauthorized'))
      throw new ApiError(message, res.status)
    }
    const blob = await res.blob()
    const disposition = res.headers.get('content-disposition') || ''
    const matched = /filename\*=UTF-8''([^;]+)/i.exec(disposition)
    return {
      blob,
      filename: matched ? decodeURIComponent(matched[1]) : `ka-accounts-${new Date().toISOString().slice(0, 10)}.xlsx`
    }
  },

  /* 看板 */
  dashboard: () => read('/dashboard', mockDashboard),

  /* 客户 */
  accounts: (params) => read(`/accounts${qs(params)}`, mockAccounts),
  account: (id) => request(`/accounts/${id}`),
  createAccount: (body) => request('/accounts', { method: 'POST', body }),
  updateAccount: (id, body) => request(`/accounts/${id}`, { method: 'PATCH', body }),
  deleteAccount: (id) => request(`/accounts/${id}`, { method: 'DELETE' }),

  /* 决策链 */
  stakeholders: (accountId) => request(`/accounts/${accountId}/stakeholders`),
  addStakeholder: (accountId, body) => request(`/accounts/${accountId}/stakeholders`, { method: 'POST', body }),
  updateStakeholder: (id, body) => request(`/stakeholders/${id}`, { method: 'PATCH', body }),
  deleteStakeholder: (id) => request(`/stakeholders/${id}`, { method: 'DELETE' }),

  /* 跟进 */
  interactions: (accountId) => request(`/accounts/${accountId}/interactions`),
  addInteraction: (accountId, body) => request(`/accounts/${accountId}/interactions`, { method: 'POST', body }),
  deleteInteraction: (id) => request(`/interactions/${id}`, { method: 'DELETE' }),

  /* 待办 */
  tasks: (params) => request(`/tasks${qs(params)}`),
  addTask: (body) => request('/tasks', { method: 'POST', body }),
  updateTask: (id, body) => request(`/tasks/${id}`, { method: 'PATCH', body }),
  toggleTask: (id, isDone) => request(`/tasks/${id}`, { method: 'PATCH', body: { is_done: isDone } }),
  deleteTask: (id) => request(`/tasks/${id}`, { method: 'DELETE' }),

  /* AI */
  aiHealth: () => request('/ai/health'),
  aiExtract: (body) => request('/ai/extract', { method: 'POST', body }),
  aiAnalyses: (accountId) => request(`/ai/analyses${qs({ accountId })}`)
}
