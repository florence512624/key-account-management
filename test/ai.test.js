/**
 * AI 层测试：不依赖真实 Ollama。
 * 覆盖三件事：脏 JSON 能不能救回来、字段别名能不能归一、连不上时是否降级。
 */
process.env.OLLAMA_BASE_URL = 'http://127.0.0.1:9' // 9 端口必然拒绝连接
process.env.AI_TIMEOUT_MS = '3000'
process.env.DB_PATH = ':memory:'

import test from 'node:test'
import assert from 'node:assert/strict'

const { parseLooseJson, normalizeAnalysis, heuristicAnalysis, extractInsights } = await import('../server/ollama.js')

test('解析带 markdown 围栏的 JSON', () => {
  const raw = '```json\n{"a":1}\n```'
  assert.deepEqual(parseLooseJson(raw), { a: 1 })
})

test('解析前后带废话的 JSON', () => {
  const raw = '好的，分析结果如下：\n{"a": [1,2]}\n以上。'
  assert.deepEqual(parseLooseJson(raw), { a: [1, 2] })
})

test('修复尾逗号与中文引号', () => {
  const raw = '{"a": "值", "b": [1, 2,],}'
  assert.deepEqual(parseLooseJson(raw), { a: '值', b: [1, 2] })
})

test('完全无法解析时抛错，交由上层降级', () => {
  assert.throws(() => parseLooseJson('这不是 JSON'), /找不到 JSON|JSON/)
})

test('字段别名归一：中文键 / 字符串数组 / 大写枚举', () => {
  const normalized = normalizeAnalysis({
    surface_requirements: ['要求一', { content: '要求二', urgency: 'high' }],
    真实痛点: [{ content: '痛点一', category: '成本', why: '预算被占' }],
    next_step: '安排演示',
    confidence: 0.8
  })
  assert.equal(normalized.surface_requirements.length, 2)
  assert.equal(normalized.surface_requirements[1].urgency, 'high')
  assert.equal(normalized.real_pain_points[0].category, '成本')
  assert.equal(normalized.next_best_action, '安排演示')
  assert.equal(normalized.confidence, 0.8)
})

test('非法 category 归到「其他」，缺失字段不产生 undefined', () => {
  const normalized = normalizeAnalysis({
    real_pain_points: [{ content: '某痛点', category: '玄学' }]
  })
  assert.equal(normalized.real_pain_points[0].category, '其他')
  assert.equal(normalized.real_pain_points[0].why, '')
  assert.deepEqual(normalized.stakeholder_signals, [])
  assert.equal(normalized.next_best_action, '')
})

test('非对象输入直接拒绝', () => {
  assert.throws(() => normalizeAnalysis([]), /JSON 对象/)
  assert.throws(() => normalizeAnalysis(null), /JSON 对象/)
})

test('本地规则：抱怨归痛点，明确请求归要求', () => {
  const result = heuristicAnalysis(
    '你们报价太高了，我们预算根本没这么多。另外希望能尽快安排一次现场演示。'
  )
  const painText = result.real_pain_points.map((p) => p.content).join(' ')
  const surfaceText = result.surface_requirements.map((s) => s.content).join(' ')
  assert.match(painText, /报价太高/)
  assert.match(surfaceText, /现场演示/)
  assert.equal(result.confidence, 0.35)
})

test('本地规则：命中"尽快"时标记为高紧急度', () => {
  const result = heuristicAnalysis('希望尽快提供一份报价单。')
  assert.equal(result.surface_requirements[0].urgency, 'high')
})

test('Ollama 连不上时返回 degraded 而不是抛错/500', async () => {
  const res = await extractInsights({ text: '客户说预算被占了，希望尽快演示，但担心实施太慢。' })
  assert.equal(res.ok, true)
  assert.equal(res.degraded, true)
  assert.equal(res.reason, 'unreachable')
  assert.match(res.message, /Ollama/)
  assert.ok(Array.isArray(res.data.surface_requirements))
  assert.ok(Array.isArray(res.data.real_pain_points))
  assert.ok(res.latencyMs >= 0)
  assert.ok(Array.isArray(res.warnings))
})
