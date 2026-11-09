/**
 * Ollama 调用层：把"一段客户沟通长文本"变成结构化洞察。
 *
 * 关键取舍
 *  1. 90 秒硬超时：录音转写动辄几千字，7B 模型在 CPU 上跑满 60-80s 很常见，
 *     超时太短会误杀，太长会把前端拖死。因此用 AbortController 卡死总预算，
 *     超时立刻降级，绝不返回 500 让页面白屏。
 *  2. format: 'json' + 轻量修复：小模型偶尔会带 ```json 围栏、尾逗号、
 *     中文引号。先严格解析，再逐步修复，最后才判定失败。
 *  3. 三重降级：超时/连不上/模型不存在/输出不可解析 → 本地规则抽取。
 *     降级结果结构与模型结果完全一致（degraded=true），前端无需分支渲染。
 */

const BASE_URL = (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/+$/, '')
export const DEFAULT_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:7b'
export const TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS || 90_000)

export class OllamaError extends Error {
  constructor (code, message, detail) {
    super(message)
    this.name = 'OllamaError'
    this.code = code
    this.detail = detail
  }
}

/* ------------------------------------------------------------------ *
 * 1. 连接探测：GET /api/tags，只给 2.5s，不能拖慢主流程
 * ------------------------------------------------------------------ */
export async function listModels (timeoutMs = 2500) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(`${BASE_URL}/api/tags`, { signal: ctrl.signal })
    if (!res.ok) throw new OllamaError('upstream_error', `Ollama 返回 ${res.status}`)
    const body = await res.json()
    return (body.models || []).map((m) => m.name)
  } finally {
    clearTimeout(timer)
  }
}

/* ------------------------------------------------------------------ *
 * 2. /api/generate 调用：非流式，一次性拿完整 JSON 字符串
 * ------------------------------------------------------------------ */
async function callGenerate ({ model, prompt, timeoutMs, signal }) {
  const ctrl = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    ctrl.abort()
  }, timeoutMs)
  const onOuterAbort = () => ctrl.abort()
  signal?.addEventListener('abort', onOuterAbort, { once: true })

  try {
    const res = await fetch(`${BASE_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: ctrl.signal,
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        format: 'json',
        options: {
          temperature: 0.2,      // 抽取任务要稳定，不要创作
          top_p: 0.9,
          num_ctx: 8192,         // 长文本需要更大上下文
          num_predict: 1200
        }
      })
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      if (res.status === 404) {
        throw new OllamaError('model_missing', `模型 ${model} 不存在`, text.slice(0, 300))
      }
      throw new OllamaError('upstream_error', `Ollama 返回 ${res.status}`, text.slice(0, 300))
    }

    const body = await res.json()
    return { response: body.response || '', totalDuration: body.total_duration ?? null }
  } catch (err) {
    if (err instanceof OllamaError) throw err
    if (err.name === 'AbortError') {
      if (signal?.aborted) throw new OllamaError('client_aborted', '请求已取消')
      throw new OllamaError('timeout', timedOut ? `模型响应超过 ${Math.round(timeoutMs / 1000)} 秒` : '请求被中断')
    }
    // 本地端口没人监听时的典型错误：fetch failed / ECONNREFUSED
    const cause = err.cause?.code || err.code || ''
    if (/ECONNREFUSED|ENOTFOUND|EAI_AGAIN|fetch failed/i.test(`${cause} ${err.message}`)) {
      throw new OllamaError('unreachable', '连不上本地 Ollama 服务（127.0.0.1:11434）')
    }
    throw new OllamaError('upstream_error', err.message)
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onOuterAbort)
  }
}

/* ------------------------------------------------------------------ *
 * 3. 宽容 JSON 解析：围栏 / 前后废话 / 尾逗号 / 中文引号
 * ------------------------------------------------------------------ */
export function parseLooseJson (raw) {
  if (typeof raw !== 'string' || !raw.trim()) throw new Error('空响应')

  let text = raw.trim()
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()

  const attempt = (candidate) => {
    try {
      return JSON.parse(candidate)
    } catch {
      return undefined
    }
  }

  const direct = attempt(text)
  if (direct !== undefined) return direct

  // 模型常在 JSON 前后加一句"好的，结果如下："，截取首尾大括号
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end <= start) throw new Error('响应里找不到 JSON 对象')

  const slice = text.slice(start, end + 1)
  const repaired = [
    slice,
    slice.replace(/,\s*([}\]])/g, '$1'),                       // 尾逗号
    slice.replace(/[“”]/g, '"').replace(/[‘’]/g, "'"),          // 中文引号
    slice.replace(/,\s*([}\]])/g, '$1').replace(/[“”]/g, '"')   // 两者都修
  ]
  for (const candidate of repaired) {
    const parsed = attempt(candidate)
    if (parsed !== undefined) return parsed
  }
  throw new Error('JSON 结构损坏，修复失败')
}

/* ------------------------------------------------------------------ *
 * 4. 归一化：不同模型/提示词可能漏字段、换键名、返回字符串数组，
 *    统一成前端唯一需要的形状，绝不让 undefined 漏到 UI
 * ------------------------------------------------------------------ */
const pick = (obj, keys) => {
  for (const k of keys) {
    if (obj && obj[k] !== undefined && obj[k] !== null) return obj[k]
  }
  return undefined
}

const asArray = (v) => {
  if (Array.isArray(v)) return v
  if (typeof v === 'string' && v.trim()) return [v]
  if (v && typeof v === 'object') return [v]
  return []
}

const str = (v, max = 400) => {
  if (v === null || v === undefined) return ''
  const s = typeof v === 'string' ? v : typeof v === 'object' ? JSON.stringify(v) : String(v)
  return s.trim().slice(0, max)
}

const URGENCY = new Set(['high', 'medium', 'low'])
const CATEGORIES = new Set(['成本', '效率', '风险', '组织', '体验', '竞争', '其他'])

export function normalizeAnalysis (raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('模型返回的不是 JSON 对象')
  }

  const surfaceRaw = asArray(pick(raw, [
    'surface_requirements', 'surfaceRequirements', 'surface', '表面要求', 'explicit_requirements', 'requirements'
  ]))
  const painRaw = asArray(pick(raw, [
    'real_pain_points', 'realPainPoints', 'pain_points', 'painPoints', '真实痛点', '痛点', 'pains'
  ]))

  const surface = surfaceRaw.map((item) => {
    if (typeof item === 'string') return { content: str(item), quote: '', urgency: 'medium' }
    return {
      content: str(pick(item, ['content', 'requirement', 'text', 'demand', '内容', '要求']), 300),
      quote: str(pick(item, ['quote', 'evidence', '原文', '原话']), 200),
      urgency: URGENCY.has(pick(item, ['urgency', 'priority', '紧急度'])) ? item.urgency || item.priority : 'medium'
    }
  }).filter((x) => x.content)

  const pains = painRaw.map((item) => {
    if (typeof item === 'string') {
      return { content: str(item), why: '', category: '其他', quote: '' }
    }
    const category = str(pick(item, ['category', 'type', '类别']), 20)
    return {
      content: str(pick(item, ['content', 'pain', 'point', 'text', '痛点', '内容']), 300),
      why: str(pick(item, ['why', 'reason', 'impact', '原因', '影响', 'business_impact']), 400),
      category: CATEGORIES.has(category) ? category : '其他',
      quote: str(pick(item, ['quote', 'evidence', '原文', '原话']), 200)
    }
  }).filter((x) => x.content)

  const signals = asArray(pick(raw, ['stakeholder_signals', 'stakeholders', '关键人信号']))
    .map((item) => {
      if (typeof item === 'string') return { name: '', signal: str(item) }
      return {
        name: str(pick(item, ['name', 'person', '姓名']), 60),
        signal: str(pick(item, ['signal', 'attitude', 'signal_text', '信号']), 200)
      }
    })
    .filter((x) => x.signal)

  const confidence = Number(pick(raw, ['confidence', '置信度']))

  return {
    surface_requirements: surface.slice(0, 8),
    real_pain_points: pains.slice(0, 8),
    stakeholder_signals: signals.slice(0, 6),
    next_best_action: str(pick(raw, ['next_best_action', 'nextAction', 'next_step', '建议动作', '下一步']), 300),
    confidence: Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : null
  }
}

/* ------------------------------------------------------------------ *
 * 5. 本地规则降级：Ollama 挂了也要给出"可用的粗糙答案"
 *    比 500 错误更有价值：销售至少能看到关键词命中的线索
 * ------------------------------------------------------------------ */
const SURFACE_HINTS = /要求|需要|希望|必须|尽快|最好|能否|能不能|是否可以|请帮|提供|安排|演示|试用|报价单|出个方案|做一版|验收|培训/g
const PAIN_HINTS = /预算|成本|太贵|价格|账期|慢|延误|周期|加班|耗时|复杂|难用|上手|人手|不足|担心|风险|合规|审计|安全|违约|失败|之前|曾经|领导|审批|部门|竞争|压价|锚定|抵触|推翻|暂停|交代/g

const CATEGORY_RULES = [
  ['成本', /预算|成本|价格|贵|报价|费用|账期|降本|缩减/],
  ['效率', /慢|延误|周期|加班|耗时|效率|来不及|排期/],
  ['风险', /风险|合规|审计|安全|违约|失败|担心|不稳|暂停|推翻/],
  ['组织', /领导|审批|流程|部门|决策|预算窗口|人事|推不动|交代/],
  ['体验', /难用|复杂|上手|体验|抵触|培训|操作|两个小时/],
  ['竞争', /竞争|压价|锚定|竞品|对手|比价/]
]

const CATEGORY_WHY = {
  成本: '价格或预算承压，直接影响立项额度与决策节奏',
  效率: '现有流程耗时，客户内部存在明确的减负诉求',
  风险: '对合规/稳定性存在顾虑，可能触发一票否决或项目暂停',
  组织: '决策流程或部门利益未理顺，内部推动力不足',
  体验: '一线使用阻力大，会影响推广速度与续约意愿',
  竞争: '竞品比价形成锚点，谈判主动权正在外移',
  其他: '需当面确认真实约束条件'
}

function scoreCategories (sentence) {
  for (const [label, re] of CATEGORY_RULES) {
    if (re.test(sentence)) return label
  }
  return '其他'
}

function splitSentences (text) {
  return text
    .split(/[。！？!?；;\n\r]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 6)
}

export function heuristicAnalysis (text) {
  const sentences = splitSentences(text).slice(0, 80)
  const surface = []
  const pains = []
  const seen = new Set()

  for (const s of sentences) {
    SURFACE_HINTS.lastIndex = 0
    PAIN_HINTS.lastIndex = 0
    const hitsSurface = (s.match(SURFACE_HINTS) || []).length
    const hitsPain = (s.match(PAIN_HINTS) || []).length
    if (!hitsSurface && !hitsPain) continue
    if (seen.has(s)) continue
    seen.add(s)

    // 同一句里既像要求又像抱怨时，抱怨优先——"报价太高"是痛点，不是需求
    if (hitsPain >= hitsSurface && hitsPain > 0 && pains.length < 4) {
      const category = scoreCategories(s)
      pains.push({
        content: s.slice(0, 120),
        why: `${CATEGORY_WHY[category]}（本地规则推断，需当面确认）`,
        category,
        quote: s.slice(0, 100)
      })
      continue
    }
    if (hitsSurface > 0 && surface.length < 4) {
      surface.push({
        content: s.slice(0, 120),
        quote: s.slice(0, 100),
        urgency: /尽快|马上|立刻|本周|下周|紧急/.test(s) ? 'high' : 'medium'
      })
    }
  }

  // 一条都没命中时，退化为"取前两句"，保证结构完整
  if (!surface.length && sentences.length) {
    surface.push({ content: sentences[0].slice(0, 120), quote: sentences[0].slice(0, 100), urgency: 'medium' })
  }
  if (!pains.length && sentences.length) {
    pains.push({
      content: `可能是：${sentences[sentences.length - 1].slice(0, 120)}`,
      why: '（本地规则推断）未命中关键词，仅按语义位置猜测，可信度低。',
      category: '其他',
      quote: ''
    })
  }

  return {
    surface_requirements: surface,
    real_pain_points: pains,
    stakeholder_signals: [],
    next_best_action: '接通 Ollama 后重新分析；当前为本地关键词抽取，仅作线索参考。',
    confidence: 0.35
  }
}

/* ------------------------------------------------------------------ *
 * 6. 对外主入口：一次调用 = 预算内重试 + 归一化 + 降级
 * ------------------------------------------------------------------ */
export async function extractInsights ({ text, model = DEFAULT_MODEL, accountName = '', signal, timeoutMs = TIMEOUT_MS } = {}) {
  const startedAt = Date.now()
  const deadline = startedAt + timeoutMs
  const remaining = () => Math.max(0, deadline - Date.now())

  try {
    const { buildExtractionPrompt, buildRepairPrompt } = await import('./prompt.js')
    const prompt = buildExtractionPrompt({ text, accountName })

    let lastErr
    for (let attempt = 0; attempt < 2; attempt++) {
      const budget = attempt === 0 ? Math.min(timeoutMs, Math.max(5_000, remaining() - 5_000)) : remaining()
      if (budget < 3_000) break
      try {
        const { response } = await callGenerate({
          model,
          prompt: attempt === 0 ? prompt : buildRepairPrompt({ text, accountName, previous: lastErr?.detail || '' }),
          timeoutMs: budget,
          signal
        })
        const data = normalizeAnalysis(parseLooseJson(response))
        return {
          ok: true,
          degraded: false,
          model,
          latencyMs: Date.now() - startedAt,
          data,
          warnings: data.real_pain_points.length === 0 ? ['模型未识别出明确痛点，建议补充原文细节后重试'] : []
        }
      } catch (err) {
        lastErr = err
        // 只有"输出不可解析"值得换一版提示词重试；连不上/超时/没模型重试无意义
        const repairable = !(err instanceof OllamaError)
        if (!repairable || !remaining()) break
      }
    }
    throw lastErr || new OllamaError('timeout', '可用时间预算已耗尽')
  } catch (err) {
    const code = err?.code || 'bad_output'
    const message = err?.message || 'AI 分析失败'
    return {
      ok: true,
      degraded: true,
      reason: code,
      message: degradeMessage(code, message, model),
      model,
      latencyMs: Date.now() - startedAt,
      data: heuristicAnalysis(text),
      warnings: ['已切换本地关键词抽取，结果仅供线索参考，请人工复核']
    }
  }
}

function degradeMessage (code, message, model) {
  switch (code) {
    case 'unreachable':
      return `连不上本地 Ollama（默认 127.0.0.1:11434），已降级。请先执行：ollama serve`
    case 'timeout':
      return `模型 ${model} 在 ${Math.round(TIMEOUT_MS / 1000)} 秒内未返回，已降级。可换更小的模型或缩短文本。`
    case 'model_missing':
      return `本地没有模型 ${model}，已降级。请先执行：ollama pull ${model}`
    case 'bad_output':
      return `模型输出无法解析为 JSON，已降级：${message}`
    default:
      return `${message || 'AI 调用异常'}，已降级为本地关键词抽取`
  }
}

export const OLLAMA_BASE = BASE_URL
