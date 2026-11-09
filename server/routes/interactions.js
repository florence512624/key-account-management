import express from 'express'
import { z } from 'zod'
import { db } from '../db.js'
import { notFound, requireId, validate } from '../http.js'

export const accountInteractionsRouter = express.Router({ mergeParams: true })

const createSchema = z.object({
  channel: z.enum(['visit', 'call']).default('visit'),
  contact_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  summary: z.string().trim().min(1, '沟通纪要必填').max(4000),
  pain_point: z.string().trim().max(1000).nullable().optional(),
  stakeholder_id: z.number().int().positive().nullable().optional(),
  source: z.enum(['manual', 'ai']).default('manual')
})

accountInteractionsRouter.get('/', (req, res) => {
  const accountId = requireId(req.params.accountId)
  const items = db.prepare(`
    SELECT i.*, s.name AS stakeholder_name, s.title AS stakeholder_title
    FROM interactions i
    LEFT JOIN stakeholders s ON s.id = i.stakeholder_id
    WHERE i.account_id = ?
    ORDER BY i.contact_date DESC, i.id DESC
  `).all(accountId)
  res.json({ items })
})

accountInteractionsRouter.post('/', (req, res) => {
  const accountId = requireId(req.params.accountId)
  const account = db.prepare('SELECT id FROM accounts WHERE id = ?').get(accountId)
  if (!account) throw notFound('客户')

  const data = validate(createSchema, req.body)

  if (data.stakeholder_id) {
    const s = db.prepare('SELECT id FROM stakeholders WHERE id = ? AND account_id = ?').get(data.stakeholder_id, accountId)
    if (!s) throw notFound('该客户下的决策人')
  }

  const info = db.prepare(`
    INSERT INTO interactions (account_id, stakeholder_id, channel, contact_date, summary, pain_point, source)
    VALUES (@account_id, @stakeholder_id, @channel, @contact_date, @summary, @pain_point, @source)
  `).run({
    account_id: accountId,
    stakeholder_id: data.stakeholder_id ?? null,
    channel: data.channel,
    contact_date: data.contact_date || new Date().toISOString().slice(0, 10),
    summary: data.summary,
    pain_point: data.pain_point ?? null,
    source: data.source
  })

  res.status(201).json(db.prepare('SELECT * FROM interactions WHERE id = ?').get(info.lastInsertRowid))
})

export const interactionsRouter = express.Router()

interactionsRouter.delete('/:id', (req, res) => {
  const id = requireId(req.params.id)
  const info = db.prepare('DELETE FROM interactions WHERE id = ?').run(id)
  if (info.changes === 0) throw notFound('跟进记录')
  res.json({ ok: true, id })
})
