import express from 'express'
import { z } from 'zod'
import { db, todayLocal } from '../db.js'
import { notFound, requireId, validate } from '../http.js'

export const tasksRouter = express.Router()

const createSchema = z.object({
  account_id: z.number().int().positive(),
  content: z.string().trim().min(1, '任务内容必填').max(300),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  priority: z.enum(['high', 'medium', 'low']).default('medium')
})

const patchSchema = z.object({
  content: z.string().trim().min(1).max(300).optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  priority: z.enum(['high', 'medium', 'low']).optional(),
  is_done: z.union([z.boolean(), z.literal(0), z.literal(1)]).optional()
})

tasksRouter.get('/', (req, res) => {
  const { scope = 'all', accountId } = req.query
  const today = todayLocal()
  const where = []
  const params = {}

  if (scope === 'today') where.push('t.is_done = 0 AND t.due_date <= @today')
  if (scope === 'overdue') where.push('t.is_done = 0 AND t.due_date < @today')
  if (scope === 'open') where.push('t.is_done = 0')
  if (scope === 'done') where.push('t.is_done = 1')
  if (accountId) {
    where.push('t.account_id = @accountId')
    params.accountId = Number(accountId)
  }
  params.today = today

  const items = db.prepare(`
    SELECT t.*, a.name AS account_name
    FROM tasks t JOIN accounts a ON a.id = t.account_id
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY t.is_done ASC, t.due_date ASC,
             CASE t.priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END ASC, t.id ASC
  `).all(params)

  res.json({ items, today })
})

tasksRouter.post('/', (req, res) => {
  const data = validate(createSchema, req.body)
  const account = db.prepare('SELECT id FROM accounts WHERE id = ?').get(data.account_id)
  if (!account) throw notFound('客户')

  const info = db.prepare(`
    INSERT INTO tasks (account_id, content, due_date, priority)
    VALUES (@account_id, @content, @due_date, @priority)
  `).run({
    account_id: data.account_id,
    content: data.content,
    due_date: data.due_date || todayLocal(),
    priority: data.priority
  })

  res.status(201).json(db.prepare('SELECT * FROM tasks WHERE id = ?').get(info.lastInsertRowid))
})

tasksRouter.patch('/:id', (req, res) => {
  const id = requireId(req.params.id)
  const data = validate(patchSchema, req.body)
  const exists = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id)
  if (!exists) throw notFound('任务')

  const sets = []
  const params = { id }
  if (data.content !== undefined) { sets.push('content = @content'); params.content = data.content }
  if (data.due_date !== undefined) { sets.push('due_date = @due_date'); params.due_date = data.due_date }
  if (data.priority !== undefined) { sets.push('priority = @priority'); params.priority = data.priority }
  if (data.is_done !== undefined) {
    const done = data.is_done === true || data.is_done === 1
    sets.push('is_done = @is_done', 'done_at = @done_at')
    params.is_done = done ? 1 : 0
    params.done_at = done ? `${todayLocal()} ${new Date().toTimeString().slice(0, 8)}` : null
  }
  if (!sets.length) return res.json(exists)

  db.prepare(`UPDATE tasks SET ${sets.join(', ')} WHERE id = @id`).run(params)
  res.json(db.prepare('SELECT * FROM tasks WHERE id = ?').get(id))
})

tasksRouter.delete('/:id', (req, res) => {
  const id = requireId(req.params.id)
  const info = db.prepare('DELETE FROM tasks WHERE id = ?').run(id)
  if (info.changes === 0) throw notFound('任务')
  res.json({ ok: true, id })
})
