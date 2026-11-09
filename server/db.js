import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'

const here = path.dirname(fileURLToPath(import.meta.url))
const dbFile = process.env.DB_PATH || path.join(here, 'data', 'ka.db')

if (dbFile !== ':memory:') {
  fs.mkdirSync(path.dirname(dbFile), { recursive: true })
}

export const DB_FILE = dbFile
export const db = new Database(dbFile)

// WAL：读写不互相阻塞，本地单机部署的标准选择
db.pragma('journal_mode = WAL')
db.pragma('synchronous = NORMAL')
// 每个连接都必须显式打开外键，否则 CASCADE / SET NULL 全部失效
db.pragma('foreign_keys = ON')

const schemaSql = fs.readFileSync(path.join(here, 'schema.sql'), 'utf8')
db.exec(schemaSql)

/**
 * 轻量迁移：schema.sql 用的是 CREATE TABLE IF NOT EXISTS，对"已经建好的表"
 * 不会补新列。这里按需 ALTER，保证老库升级后也能直接改个人信息。
 */
function ensureColumn (table, column, definition) {
  const exists = db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column)
  if (!exists) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
}

ensureColumn('users', 'title', 'TEXT')
ensureColumn('users', 'email', 'TEXT')
ensureColumn('users', 'phone', 'TEXT')

export function isEmpty () {
  return db.prepare('SELECT COUNT(*) AS n FROM accounts').get().n === 0
}

/** 本地日期 YYYY-MM-DD */
export function todayLocal (offsetDays = 0) {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** 本地月份 YYYY-MM */
export function currentMonth () {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function nextMonth () {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() + 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function closeDb () {
  if (db.open) db.close()
}
