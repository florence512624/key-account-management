import express from 'express'
import { z } from 'zod'
import { db } from '../db.js'
import { HttpError, notFound, requireId, validate } from '../http.js'
import { buildAccountsWorkbook } from '../excel.js'

export const accountsRouter = express.Router()

const STAGE = z.enum(['lead', 'following', 'negotiation', 'signed'])
const SCALE = z.enum(['大型', '中型', '小型'])

const baseAccount = {
  name: z.string().trim().min(1, '公司名称必填').max(100),
  industry: z.string().trim().max(50).default('其他'),
  scale: SCALE.default('中型'),
  stage: STAGE.default('lead'),
  estimated_amount: z.number().min(0).default(0),
  health_score: z.number().int().min(0).max(100).default(60),
  owner: z.string().trim().max(30).default('未分配'),
  region: z.string().trim().max(30).nullable().optional(),
  note: z.string().trim().max(1000).nullable().optional(),
  signed_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional()
}

const createSchema = z.object(baseAccount)
const updateSchema = z.object(baseAccount).partial()

const SORTS = {
  amount: 'estimated_amount DESC',
  health: 'health_score ASC',
  recent: 'updated_at DESC',
  name: 'name ASC'
}

/** 列表与导出共用同一套筛选/排序，保证"屏幕上有几条，导出的就是几条" */
function queryAccounts ({ stage, q, sort = 'amount' } = {}) {
  const where = []
  const params = {}

  if (stage && STAGE.safeParse(stage).success) {
    where.push('stage = @stage')
    params.stage = stage
  }
  if (typeof q === 'string' && q.trim()) {
    where.push('(name LIKE @q OR industry LIKE @q OR owner LIKE @q)')
    params.q = `%${q.trim()}%`
  }

  const orderBy = SORTS[sort] || SORTS.amount
  return db.prepare(`
    SELECT * FROM v_account_overview
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY ${orderBy}
  `).all(params)
}

/** 列表：支持 stage / q / 排序 */
accountsRouter.get('/', (req, res) => {
  const { stage, q, sort = 'amount' } = req.query
  const items = queryAccounts({ stage, q, sort })

  res.json({
    items,
    summary: {
      total: items.length,
      amount: items.reduce((s, a) => s + a.estimated_amount, 0),
      // 在途 = 未签约，避免把已签金额算进"在途商机"
      pipeline: items.filter((a) => a.stage !== 'signed').reduce((s, a) => s + a.estimated_amount, 0),
      risk: items.filter((a) => a.health_score < 60 && a.stage !== 'signed').length
    }
  })
})

/**
 * Excel 导出。必须定义在 '/:id' 之前，否则会被当成 id 参数。
 * 筛选条件与列表接口完全一致：所见即所得。
 */
accountsRouter.get('/export.xlsx', async (req, res) => {
  const { stage, q, sort } = req.query
  const items = queryAccounts({ stage, q, sort })
  const generatedAt = new Date()

  const buffer = await buildAccountsWorkbook({
    items,
    filters: { stage, q, sort },
    generatedAt
  })

  const pad = (n) => String(n).padStart(2, '0')
  const datePart = `${generatedAt.getFullYear()}${pad(generatedAt.getMonth() + 1)}${pad(generatedAt.getDate())}`
  const fileName = `KAM客户台账-${datePart}.xlsx`

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  // 兼容不认 filename* 的客户端：ASCII 兜底 + RFC 5987 中文名
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="kam-accounts-${datePart}.xlsx"; filename*=UTF-8''${encodeURIComponent(fileName)}`
  )
  res.setHeader('Content-Length', buffer.length)
  res.setHeader('Cache-Control', 'no-store')
  res.end(buffer)
})

/** 单个客户全家桶：客户 + 决策链 + 跟进 + 待办 */
accountsRouter.get('/:id', (req, res) => {
  const id = requireId(req.params.id)
  const account = db.prepare('SELECT * FROM v_account_overview WHERE id = ?').get(id)
  if (!account) throw notFound('客户')

  const stakeholders = db.prepare(`
    SELECT * FROM stakeholders WHERE account_id = ?
    ORDER BY influence DESC, id ASC
  `).all(id)

  const interactions = db.prepare(`
    SELECT i.*, s.name AS stakeholder_name, s.title AS stakeholder_title
    FROM interactions i
    LEFT JOIN stakeholders s ON s.id = i.stakeholder_id
    WHERE i.account_id = ?
    ORDER BY i.contact_date DESC, i.id DESC
  `).all(id)

  const tasks = db.prepare(`
    SELECT * FROM tasks WHERE account_id = ?
    ORDER BY is_done ASC, due_date ASC
  `).all(id)

  res.json({ account, stakeholders, interactions, tasks })
})

accountsRouter.post('/', (req, res) => {
  const data = validate(createSchema, req.body)

  const dup = db.prepare('SELECT id FROM accounts WHERE name = ?').get(data.name)
  if (dup) throw new HttpError(409, `客户「${data.name}」已存在`)

  const signedAt = data.stage === 'signed' ? (data.signed_at || new Date().toISOString().slice(0, 10)) : (data.signed_at ?? null)

  // zod 的 optional 字段被省略时不会出现在结果里，而 better-sqlite3 要求
  // 每个 @参数 都有值，所以这里显式补 null，避免 "Missing named parameter"
  const params = {
    name: data.name,
    industry: data.industry,
    scale: data.scale,
    stage: data.stage,
    estimated_amount: data.estimated_amount,
    health_score: data.health_score,
    owner: data.owner,
    region: data.region ?? null,
    note: data.note ?? null,
    signed_at: signedAt
  }

  const info = db.prepare(`
    INSERT INTO accounts (name, industry, scale, stage, estimated_amount, health_score, owner, region, note, signed_at)
    VALUES (@name, @industry, @scale, @stage, @estimated_amount, @health_score, @owner, @region, @note, @signed_at)
  `).run(params)

  const account = db.prepare('SELECT * FROM v_account_overview WHERE id = ?').get(info.lastInsertRowid)
  res.status(201).json(account)
})

accountsRouter.patch('/:id', (req, res) => {
  const id = requireId(req.params.id)
  const data = validate(updateSchema, req.body)
  if (!Object.keys(data).length) throw new HttpError(400, '没有需要更新的字段')

  const exists = db.prepare('SELECT id FROM accounts WHERE id = ?').get(id)
  if (!exists) throw notFound('客户')

  const fields = Object.keys(data).map((k) => `${k} = @${k}`).join(', ')
  db.prepare(`UPDATE accounts SET ${fields} WHERE id = @id`).run({ ...data, id })

  res.json(db.prepare('SELECT * FROM v_account_overview WHERE id = ?').get(id))
})

/** 删除：靠 schema 里的 ON DELETE CASCADE 连带清理决策人/跟进/待办/AI 留痕 */
accountsRouter.delete('/:id', (req, res) => {
  const id = requireId(req.params.id)
  const info = db.prepare('DELETE FROM accounts WHERE id = ?').run(id)
  if (info.changes === 0) throw notFound('客户')
  res.json({ ok: true, id })
})
