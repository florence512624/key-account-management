import express from 'express'
import { z } from 'zod'
import { db } from '../db.js'
import { HttpError, validate } from '../http.js'
import {
  DEFAULT_ADMIN, SESSION_COOKIE, createSession, destroySession, destroyUserSessions,
  hashPassword, parseCookies, purgeExpiredSessions,
  requireAuth, sessionCookie, clearCookie, verifyPassword
} from '../auth.js'

export const authRouter = express.Router()

const loginSchema = z.object({
  username: z.string().trim().min(1, '请输入用户名').max(40),
  password: z.string().min(1, '请输入密码').max(128)
})

const profileSchema = z.object({
  display_name: z.string().trim().min(1, '姓名不能为空').max(40),
  username: z.string().trim().min(3, '用户名至少 3 位').max(40)
    .regex(/^[a-zA-Z0-9._-]+$/, '用户名只能包含字母、数字、点、下划线、短横线'),
  title: z.string().trim().max(60).optional().default(''),
  email: z.string().trim().max(120).optional().default('')
    .refine((v) => !v || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), '邮箱格式不正确'),
  phone: z.string().trim().max(30).optional().default('')
})

const passwordSchema = z.object({
  current_password: z.string().min(1, '请输入当前密码').max(128),
  new_password: z.string().min(6, '新密码至少 6 位').max(128)
})

/* --------------------------- 登录失败限速 --------------------------- */
const MAX_FAILS = 5
const WINDOW_MS = 10 * 60 * 1000
const fails = new Map()

function failKey (req, username) {
  return `${req.ip || 'local'}::${username.toLowerCase()}`
}

function isLocked (key) {
  const rec = fails.get(key)
  if (!rec) return 0
  if (Date.now() - rec.firstAt > WINDOW_MS) {
    fails.delete(key)
    return 0
  }
  return rec.count >= MAX_FAILS ? Math.ceil((WINDOW_MS - (Date.now() - rec.firstAt)) / 60000) : 0
}

function recordFail (key) {
  const rec = fails.get(key)
  if (!rec || Date.now() - rec.firstAt > WINDOW_MS) {
    fails.set(key, { count: 1, firstAt: Date.now() })
  } else {
    rec.count += 1
  }
}

const publicUser = (u) => ({
  id: u.id,
  username: u.username,
  display_name: u.display_name,
  role: u.role,
  title: u.title || '',
  email: u.email || '',
  phone: u.phone || '',
  created_at: u.created_at || null,
  last_login_at: u.last_login_at || null
})

/* ------------------------------ 登录 ------------------------------ */
authRouter.post('/login', (req, res) => {
  const { username, password } = validate(loginSchema, req.body)
  const key = failKey(req, username)

  const lockedMinutes = isLocked(key)
  if (lockedMinutes > 0) {
    throw new HttpError(429, `密码错误次数过多，请 ${lockedMinutes} 分钟后再试`)
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(username)

  // 用户不存在与密码错误返回同一句话，避免被用来枚举账号
  if (!user || !verifyPassword(password, user.password_hash)) {
    recordFail(key)
    const left = MAX_FAILS - (fails.get(key)?.count || 0)
    throw new HttpError(401, left > 0 ? `用户名或密码不正确（还可尝试 ${left} 次）` : '用户名或密码不正确')
  }

  fails.delete(key)
  purgeExpiredSessions()

  const token = createSession(user.id, req.headers['user-agent'])
  db.prepare("UPDATE users SET last_login_at = datetime('now','localtime') WHERE id = ?").run(user.id)

  // 还在用初始密码就提示改，但不阻塞登录
  const usingDefaultPassword = verifyPassword(DEFAULT_ADMIN.password, user.password_hash)

  res.setHeader('Set-Cookie', sessionCookie(token))
  res.json({ user: publicUser(user), must_change_password: usingDefaultPassword })
})

/* ------------------------------ 登出 ------------------------------ */
authRouter.post('/logout', (req, res) => {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE]
  destroySession(token)
  res.setHeader('Set-Cookie', clearCookie())
  res.json({ ok: true })
})

/* ------------------------------ 当前用户 ------------------------------ */
authRouter.get('/me', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)
  res.json({
    user: publicUser(row),
    must_change_password: Boolean(row) && verifyPassword(DEFAULT_ADMIN.password, row.password_hash)
  })
})

/* ------------------------------ 个人资料 ------------------------------ */
authRouter.patch('/profile', requireAuth, (req, res) => {
  const data = validate(profileSchema, req.body)

  // 改用户名要保证唯一，且不区分大小写（Admin 与 admin 视为同一个）
  const taken = db.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE AND id != ?')
    .get(data.username, req.user.id)
  if (taken) throw new HttpError(409, `用户名「${data.username}」已被占用`)

  db.prepare(`
    UPDATE users SET username = @username, display_name = @display_name,
                     title = @title, email = @email, phone = @phone
    WHERE id = @id
  `).run({ ...data, id: req.user.id })

  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)
  res.json({
    user: publicUser(row),
    must_change_password: verifyPassword(DEFAULT_ADMIN.password, row.password_hash)
  })
})

/* ------------------------------ 修改密码 ------------------------------ */
authRouter.patch('/password', requireAuth, (req, res) => {
  const { current_password, new_password } = validate(passwordSchema, req.body)
  if (current_password === new_password) {
    throw new HttpError(400, '新密码不能与当前密码相同')
  }

  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)
  if (!row || !verifyPassword(current_password, row.password_hash)) {
    throw new HttpError(400, '当前密码不正确')
  }

  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(new_password), req.user.id)
  // 改密后其他设备全部掉线，当前会话保留，避免自己也被踢出去
  destroyUserSessions(req.user.id, { exceptSessionId: req.user.sessionId })

  res.json({ ok: true, message: '密码已更新，其他设备需重新登录' })
})

/* ------------------------------ 会话自检（本地运维用） ------------------------------ */
authRouter.get('/sessions', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT id, created_at, expires_at, user_agent
    FROM sessions WHERE user_id = ? ORDER BY id DESC
  `).all(req.user.id)
  res.json({
    items: rows.map((r) => ({ ...r, current: r.id === req.user.sessionId }))
  })
})
