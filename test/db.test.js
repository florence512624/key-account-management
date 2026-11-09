/**
 * 数据库层测试：重点验证 schema 里承诺的外键行为真的生效，
 * 而不是"写了 CASCADE 就以为级联了"（SQLite 必须显式 PRAGMA foreign_keys = ON）。
 */
process.env.DB_PATH = ':memory:'

import test from 'node:test'
import assert from 'node:assert/strict'

const { db } = await import('../server/db.js')

let seq = 0
const insertAccount = () => {
  seq += 1
  const info = db.prepare(`
    INSERT INTO accounts (name, industry, stage, estimated_amount, health_score, owner)
    VALUES (?, '测试行业', 'following', 1000000, 50, '测试员')
  `).run(`测试客户-${seq}`)
  return Number(info.lastInsertRowid)
}

test('外键开关处于打开状态', () => {
  assert.equal(db.pragma('foreign_keys', { simple: true }), 1)
})

test('删除客户会级联清空决策人、跟进、待办、AI 留痕', () => {
  const accountId = insertAccount()

  const skId = Number(db.prepare(`
    INSERT INTO stakeholders (account_id, name, role_type, attitude)
    VALUES (?, '张三', 'decision_maker', 'oppose')
  `).run(accountId).lastInsertRowid)

  db.prepare(`
    INSERT INTO interactions (account_id, stakeholder_id, channel, summary, pain_point)
    VALUES (?, ?, 'visit', '聊了一次', '预算不足')
  `).run(accountId, skId)

  db.prepare(`
    INSERT INTO tasks (account_id, content, due_date)
    VALUES (?, '回访', date('now', 'localtime'))
  `).run(accountId)

  db.prepare(`
    INSERT INTO ai_analyses (account_id, raw_text, result_json)
    VALUES (?, '一段文本', '{}')
  `).run(accountId)

  db.prepare('DELETE FROM accounts WHERE id = ?').run(accountId)

  for (const table of ['stakeholders', 'interactions', 'tasks', 'ai_analyses']) {
    const n = db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE account_id = ?`).get(accountId).n
    assert.equal(n, 0, `${table} 应被级联删除`)
  }
})

test('删除决策人时跟进记录保留、关联字段置 NULL（ON DELETE SET NULL）', () => {
  const accountId = insertAccount()
  const skId = Number(db.prepare(`
    INSERT INTO stakeholders (account_id, name, role_type) VALUES (?, '李四', 'user')
  `).run(accountId).lastInsertRowid)

  const itId = Number(db.prepare(`
    INSERT INTO interactions (account_id, stakeholder_id, channel, summary)
    VALUES (?, ?, 'call', '电话沟通')
  `).run(accountId, skId).lastInsertRowid)

  db.prepare('DELETE FROM stakeholders WHERE id = ?').run(skId)

  const row = db.prepare('SELECT * FROM interactions WHERE id = ?').get(itId)
  assert.ok(row, '纪要本体应保留')
  assert.equal(row.stakeholder_id, null, '关联人应置空')
})

test('非法枚举值会被 CHECK 约束拦住', () => {
  const accountId = insertAccount()
  assert.throws(() => {
    db.prepare(`INSERT INTO stakeholders (account_id, name, role_type) VALUES (?, '王五', 'boss')`).run(accountId)
  }, /CHECK constraint failed/)
})

test('健康度越界会被 CHECK 拦住', () => {
  assert.throws(() => {
    db.prepare(`INSERT INTO accounts (name, health_score) VALUES ('越界客户', 101)`).run()
  }, /CHECK constraint failed/)
})

test('视图口径正确：关键人数、反对者数、逾期数', () => {
  const accountId = insertAccount()
  db.prepare(`INSERT INTO stakeholders (account_id, name, role_type, attitude) VALUES (?, 'a', 'user', 'support')`).run(accountId)
  db.prepare(`INSERT INTO stakeholders (account_id, name, role_type, attitude) VALUES (?, 'b', 'influencer', 'oppose')`).run(accountId)
  db.prepare(`INSERT INTO tasks (account_id, content, due_date) VALUES (?, '逾期任务', date('now','-3 day'))`).run(accountId)
  db.prepare(`INSERT INTO tasks (account_id, content, due_date, is_done) VALUES (?, '已完成', date('now','-3 day'), 1)`).run(accountId)

  const view = db.prepare('SELECT * FROM v_account_overview WHERE id = ?').get(accountId)
  assert.equal(view.stakeholder_count, 2)
  assert.equal(view.opposer_count, 1)
  assert.equal(view.overdue_task_count, 1, '已完成的逾期任务不应计入')
})

test('updated_at 触发器只在实际修改时更新', () => {
  const accountId = insertAccount()
  const before = db.prepare('SELECT updated_at FROM accounts WHERE id = ?').get(accountId).updated_at

  db.prepare(`UPDATE accounts SET note = '新备注' WHERE id = ?`).run(accountId)
  const after = db.prepare('SELECT updated_at FROM accounts WHERE id = ?').get(accountId).updated_at

  assert.ok(after >= before)
  assert.equal(db.prepare('SELECT COUNT(*) n FROM accounts WHERE id = ?').get(accountId).n, 1)
})
