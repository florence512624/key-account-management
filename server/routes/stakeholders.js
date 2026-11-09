import express from 'express'
import { z } from 'zod'
import { db } from '../db.js'
import { notFound, requireId, validate } from '../http.js'

/* ---------------- 挂在 /api/accounts/:accountId/stakeholders 下 ---------------- */
export const accountStakeholdersRouter = express.Router({ mergeParams: true })

const ROLE = z.enum(['decision_maker', 'user', 'influencer', 'supporter'])
const ATTITUDE = z.enum(['support', 'neutral', 'oppose'])

const baseStakeholder = {
  name: z.string().trim().min(1, '姓名必填').max(40),
  title: z.string().trim().max(60).default(''),
  role_type: ROLE.default('influencer'),
  focus: z.string().trim().max(120).nullable().optional(),
  attitude: ATTITUDE.default('neutral'),
  influence: z.number().int().min(1).max(5).default(3),
  core_demand: z.string().trim().max(500).nullable().optional(),
  strategy: z.string().trim().max(500).nullable().optional()
}

const createSchema = z.object(baseStakeholder)
const updateSchema = z.object(baseStakeholder).partial()

export const ROLE_ORDER = ['decision_maker', 'influencer', 'user', 'supporter']

/** 决策链健康度：给前端的风险提示，纯读操作 */
function summarize (items) {
  const byRole = Object.fromEntries(ROLE_ORDER.map((r) => [r, 0]))
  let support = 0
  let neutral = 0
  let oppose = 0
  for (const s of items) {
    if (byRole[s.role_type] !== undefined) byRole[s.role_type] += 1
    if (s.attitude === 'support') support += 1
    else if (s.attitude === 'oppose') oppose += 1
    else neutral += 1
  }

  const decisionMakers = items.filter((s) => s.role_type === 'decision_maker')
  const decisionMaker = decisionMakers[0]
  const flags = []
  if (!decisionMaker) flags.push('尚未识别出决策者，成交路径不清晰')
  else if (decisionMaker.attitude === 'oppose') flags.push('决策者持反对态度，属于一票否决风险')
  if (decisionMakers.length > 1) {
    flags.push(`识别到 ${decisionMakers.length} 位决策者，通常说明还没找对人，建议收敛到 1 位`)
  }
  if (oppose > 0 && decisionMaker?.attitude !== 'oppose') flags.push(`存在 ${oppose} 位反对者，需逐一化解`)
  if (items.length < 3) flags.push('关键人覆盖不足 3 人，决策链过薄')
  if (support === 0) flags.push('没有任何支持者，缺少内部推动力量')

  return {
    total: items.length,
    byRole,
    support,
    neutral,
    oppose,
    coverage: Math.round(
      (ROLE_ORDER.filter((r) => byRole[r] > 0).length / ROLE_ORDER.length) * 100
    ),
    flags
  }
}

accountStakeholdersRouter.get('/', (req, res) => {
  const accountId = requireId(req.params.accountId)
  const account = db.prepare('SELECT id, name FROM accounts WHERE id = ?').get(accountId)
  if (!account) throw notFound('客户')

  const items = db.prepare(`
    SELECT * FROM stakeholders WHERE account_id = ?
    ORDER BY CASE role_type
      WHEN 'decision_maker' THEN 1 WHEN 'influencer' THEN 2
      WHEN 'user' THEN 3 ELSE 4 END,
      influence DESC, id ASC
  `).all(accountId)

  res.json({ account, items, summary: summarize(items) })
})

accountStakeholdersRouter.post('/', (req, res) => {
  const accountId = requireId(req.params.accountId)
  const account = db.prepare('SELECT id FROM accounts WHERE id = ?').get(accountId)
  if (!account) throw notFound('客户')

  const data = validate(createSchema, req.body)
  const info = db.prepare(`
    INSERT INTO stakeholders (account_id, name, title, role_type, focus, attitude, influence, core_demand, strategy)
    VALUES (@account_id, @name, @title, @role_type, @focus, @attitude, @influence, @core_demand, @strategy)
  `).run({
    account_id: accountId,
    name: data.name,
    title: data.title,
    role_type: data.role_type,
    focus: data.focus ?? null,
    attitude: data.attitude,
    influence: data.influence,
    core_demand: data.core_demand ?? null,
    strategy: data.strategy ?? null
  })

  res.status(201).json(db.prepare('SELECT * FROM stakeholders WHERE id = ?').get(info.lastInsertRowid))
})

/* ---------------- 挂在 /api/stakeholders 下 ---------------- */
export const stakeholdersRouter = express.Router()

stakeholdersRouter.patch('/:id', (req, res) => {
  const id = requireId(req.params.id)
  const data = validate(updateSchema, req.body)
  if (!Object.keys(data).length) throw notFound('决策人')

  const exists = db.prepare('SELECT id FROM stakeholders WHERE id = ?').get(id)
  if (!exists) throw notFound('决策人')

  const fields = Object.keys(data).map((k) => `${k} = @${k}`).join(', ')
  db.prepare(`UPDATE stakeholders SET ${fields} WHERE id = @id`).run({ ...data, id })
  res.json(db.prepare('SELECT * FROM stakeholders WHERE id = ?').get(id))
})

stakeholdersRouter.delete('/:id', (req, res) => {
  const id = requireId(req.params.id)
  const info = db.prepare('DELETE FROM stakeholders WHERE id = ?').run(id)
  if (info.changes === 0) throw notFound('决策人')
  res.json({ ok: true, id })
})
