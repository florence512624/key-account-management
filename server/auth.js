/**
 * 本地登录：scrypt 密码 + 数据库会话 + HttpOnly Cookie。
 *
 * 设计取舍
 *  - 不引 JWT：纯本地单机，撤销登录需要"服务端能作废"，数据库会话更直接；
 *  - 不存明文 token：库里只存 SHA-256，即使 db 文件被拷走也换不出可用 Cookie；
 *  - Cookie 用 HttpOnly + SameSite=Lax：JS 拿不到（防 XSS 窃取），
 *    跨站 POST 也不会带上（防 CSRF）；本地 http 环境不加 Secure，否则浏览器会丢弃。
 */
import crypto from 'node:crypto'
import { db } from './db.js'

export const SESSION_COOKIE = 'ka_session'
export const SESSION_TTL_DAYS = 7

/* ------------------------------ 密码 ------------------------------ */

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 }

export function hashPassword (password) {
  const salt = crypto.randomBytes(16)
  const hash = crypto.scryptSync(password, salt, SCRYPT.keylen, {
    N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p
  })
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${hash.toString('base64')}`
}

export function verifyPassword (password, stored) {
  try {
    const [algo, N, r, p, saltB64, hashB64] = String(stored).split('$')
    if (algo !== 'scrypt') return false
    const salt = Buffer.from(saltB64, 'base64')
    const expected = Buffer.from(hashB64, 'base64')
    const actual = crypto.scryptSync(password, salt, expected.length, {
      N: Number(N), r: Number(r), p: Number(p)
    })
    // 定长比较，避免根据耗时逐字节猜密码
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual)
  } catch {
    return false
  }
}

/* ------------------------------ Cookie ------------------------------ */

export function parseCookies (header = '') {
  const out = {}
  for (const part of String(header).split(';')) {
    const idx = part.indexOf('=')
    if (idx < 0) continue
    const key = part.slice(0, idx).trim()
    if (!key) continue
    out[key] = decodeURIComponent(part.slice(idx + 1).trim())
  }
  return out
}

export function sessionCookie (token, { maxAge = SESSION_TTL_DAYS * 86400 } = {}) {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`
}

export function clearCookie () {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
}

/* ------------------------------ 会话 ------------------------------ */

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex')

export function createSession (userId, userAgent = '') {
  const token = crypto.randomBytes(32).toString('base64url')
  db.prepare(`
    INSERT INTO sessions (token_hash, user_id, user_agent, expires_at)
    VALUES (?, ?, ?, datetime('now', 'localtime', ?))
  `).run(sha256(token), userId, String(userAgent).slice(0, 200), `+${SESSION_TTL_DAYS} days`)
  return token
}

export function getSessionUser (token) {
  if (!token) return null

  const row = db.prepare(`
    SELECT s.id AS session_id, s.expires_at,
           u.id, u.username, u.display_name, u.role,
           u.title, u.email, u.phone, u.created_at, u.last_login_at
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ?
  `).get(sha256(token))

  if (!row) return null

  const now = db.prepare("SELECT datetime('now', 'localtime') AS now").get().now
  if (row.expires_at <= now) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(row.session_id)
    return null
  }

  return {
    id: row.id,
    username: row.username,
    display_name: row.display_name,
    role: row.role,
    title: row.title,
    email: row.email,
    phone: row.phone,
    created_at: row.created_at,
    last_login_at: row.last_login_at,
    sessionId: row.session_id
  }
}

export function destroySession (token) {
  if (!token) return
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token))
}

export function destroyUserSessions (userId, { exceptSessionId = null } = {}) {
  if (exceptSessionId) {
    db.prepare('DELETE FROM sessions WHERE user_id = ? AND id != ?').run(userId, exceptSessionId)
  } else {
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId)
  }
}

export function purgeExpiredSessions () {
  db.prepare("DELETE FROM sessions WHERE expires_at <= datetime('now', 'localtime')").run()
}

/* ------------------------------ 中间件 ------------------------------ */

export function requireAuth (req, res, next) {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE]
  const user = getSessionUser(token)
  if (!user) {
    return res.status(401).json({ error: '登录状态已失效，请重新登录' })
  }
  req.user = user
  next()
}

/* ------------------------------ 初始账号 ------------------------------ */

export const DEFAULT_ADMIN = { username: 'admin', password: 'admin123', displayName: '张伟' }

/**
 * 首次启动兜底建号。已有账号时什么都不做（不会覆盖你改过的密码）。
 * 生产环境请通过 DEFAULT_ADMIN_PASSWORD 指定，或登录后立刻改密码。
 */
export function ensureDefaultUser () {
  const count = db.prepare('SELECT COUNT(*) AS n FROM users').get().n
  if (count > 0) return null

  const password = process.env.DEFAULT_ADMIN_PASSWORD || DEFAULT_ADMIN.password
  db.prepare(`
    INSERT INTO users (username, display_name, role, password_hash)
    VALUES (?, ?, 'admin', ?)
  `).run(DEFAULT_ADMIN.username, DEFAULT_ADMIN.displayName, hashPassword(password))

  console.log(`[auth] 已创建初始账号 ${DEFAULT_ADMIN.username}（密码${process.env.DEFAULT_ADMIN_PASSWORD ? '来自环境变量' : '为默认值 admin123，请登录后修改'}）`)
  return { username: DEFAULT_ADMIN.username, password }
}
