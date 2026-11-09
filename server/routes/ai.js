import express from 'express'
import { z } from 'zod'
import { db } from '../db.js'
import { notFound, requireId, validate } from '../http.js'
import { extractInsights, listModels, OLLAMA_BASE, DEFAULT_MODEL, TIMEOUT_MS, heuristicAnalysis } from '../ollama.js'

export const aiRouter = express.Router()

const MODEL_RE = /^[a-zA-Z0-9._:\/-]{1,80}$/

const extractSchema = z.object({
  text: z.string().trim().min(20, '文本太短，至少 20 字').max(20_000, '文本过长，请控制在 2 万字内'),
  model: z.string().trim().regex(MODEL_RE, '模型名不合法').optional(),
  accountId: z.number().int().positive().nullable().optional(),
  persist: z.boolean().default(true)
})

/* ---------------- 健康检查：给前端显示"AI 是否在线"的绿灯 ---------------- */
aiRouter.get('/health', async (req, res) => {
  const startedAt = Date.now()
  try {
    const models = await listModels()
    res.json({
      reachable: true,
      baseUrl: OLLAMA_BASE,
      defaultModel: DEFAULT_MODEL,
      suggestedModel: models.includes(DEFAULT_MODEL) ? DEFAULT_MODEL : models[0] || null,
      models,
      timeoutMs: TIMEOUT_MS,
      latencyMs: Date.now() - startedAt
    })
  } catch (err) {
    res.json({
      reachable: false,
      baseUrl: OLLAMA_BASE,
      defaultModel: DEFAULT_MODEL,
      suggestedModel: null,
      models: [],
      timeoutMs: TIMEOUT_MS,
      latencyMs: Date.now() - startedAt,
      error: err?.code === 'timeout' ? 'Ollama 无响应' : (err?.message || '连不上 Ollama')
    })
  }
})

/* ---------------- 核心：文本 → { 表面要求 / 真实痛点 } ---------------- */
aiRouter.post('/extract', async (req, res) => {
  const { text, model, accountId, persist } = validate(extractSchema, req.body)

  let accountName = ''
  if (accountId) {
    const account = db.prepare('SELECT id, name FROM accounts WHERE id = ?').get(accountId)
    if (!account) throw notFound('客户')
    accountName = account.name
  }

  const result = await extractInsights({ text, model: model || DEFAULT_MODEL, accountName })

  // 留痕：即使降级也记录，方便复盘"哪次分析不可靠"
  let analysisId = null
  if (persist) {
    const info = db.prepare(`
      INSERT INTO ai_analyses (account_id, raw_text, model, degraded, result_json, latency_ms)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      accountId ?? null,
      text,
      result.model ?? model ?? DEFAULT_MODEL,
      result.degraded ? 1 : 0,
      JSON.stringify(result.data),
      result.latencyMs ?? null
    )
    analysisId = Number(info.lastInsertRowid)
  }

  res.json({
    ...result,
    accountId: accountId ?? null,
    analysisId,
    meta: { baseUrl: OLLAMA_BASE, timeoutMs: TIMEOUT_MS }
  })
})

/* ---------------- 降级预览：不调模型，直接看本地规则结果（调试用） ---------------- */
aiRouter.post('/preview-fallback', (req, res) => {
  const { text } = validate(z.object({ text: z.string().min(1).max(20_000) }), req.body)
  res.json({ ok: true, degraded: true, data: heuristicAnalysis(text) })
})

/* ---------------- 分析历史 ---------------- */
aiRouter.get('/analyses', (req, res) => {
  const accountId = req.query.accountId ? requireId(req.query.accountId) : null
  const items = db.prepare(`
    SELECT id, account_id, model, degraded, latency_ms, created_at,
           substr(raw_text, 1, 160) AS preview,
           result_json
    FROM ai_analyses
    ${accountId ? 'WHERE account_id = ?' : ''}
    ORDER BY id DESC LIMIT 20
  `).all(...(accountId ? [accountId] : []))

  res.json({
    items: items.map((r) => {
      let parsed = null
      try { parsed = JSON.parse(r.result_json) } catch { /* 坏数据不影响列表 */ }
      return { ...r, result_json: undefined, result: parsed }
    })
  })
})
