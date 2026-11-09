import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../lib/api.js'
import { CATEGORY_TONE, URGENCY_META } from '../lib/constants.js'
import { fmtPercent } from '../lib/format.js'
import { Icon } from '../components/Icon.jsx'
import { ErrorBanner, Spinner, useToast } from '../components/ui.jsx'

const SAMPLE = `昨天下午跟恒瑞的周总（集团 CIO）和他的信息化团队聊了 90 分钟。周总明确说，集团今年在推降本增效，所有新系统都要能算清 ROI，三年之内必须回本，否则董事会批不下来。
林倩补充说，她们上一个项目就是因为实施拖了 8 个月，最后业务部门不用了，这次一定要看到可验证的里程碑，最好六周内能有个能演示的版本。
采购部陈国栋的意思比较直接：今年预算已经被 ERP 升级占掉了，如果一定要上，只能走一期小额合同，价格还得再谈，不然就明年再说。
另外周总反复强调数据不能出内网，他们正在做等保备案，任何云端方案都不用谈。吴敏那边说一线的运营人员年纪偏大，系统如果步骤超过三步，大家肯定抵触，之前那套系统就是这么废掉的。
最好下周能安排一次现场演示，让业务部门的人也来看看。`

export default function AiInsight () {
  const { push } = useToast()
  const [health, setHealth] = useState(null)
  const [accounts, setAccounts] = useState([])
  const [accountId, setAccountId] = useState('')
  const [model, setModel] = useState('')
  const [text, setText] = useState('')
  const [running, setRunning] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [saved, setSaved] = useState(false)
  const timerRef = useRef(null)

  useEffect(() => {
    api.aiHealth().then((h) => {
      setHealth(h)
      if (h.suggestedModel) setModel(h.suggestedModel)
      else if (h.defaultModel) setModel(h.defaultModel)
    }).catch((err) => setHealth({ reachable: false, error: err.message }))

    api.accounts({ sort: 'amount' }).then(({ data }) => setAccounts(data.items || [])).catch(() => {})
  }, [])

  useEffect(() => () => clearInterval(timerRef.current), [])

  const startTimer = () => {
    const startedAt = Date.now()
    setElapsed(0)
    clearInterval(timerRef.current)
    timerRef.current = setInterval(() => setElapsed(Math.round((Date.now() - startedAt) / 1000)), 1000)
  }

  const run = async (e) => {
    e?.preventDefault()
    if (text.trim().length < 20) {
      setError({ message: '文本太短，至少粘贴 20 个字' })
      return
    }
    setRunning(true)
    setError(null)
    setResult(null)
    setSaved(false)
    startTimer()
    try {
      const res = await api.aiExtract({
        text: text.trim(),
        model: model.trim() || undefined,
        accountId: accountId ? Number(accountId) : null
      })
      setResult(res)
      if (res.degraded) push('Ollama 不可用，已切换本地关键词抽取', 'error')
    } catch (err) {
      setError({ message: err.message, details: err.details })
    } finally {
      clearInterval(timerRef.current)
      setRunning(false)
    }
  }

  const saveAsInteraction = async () => {
    if (!result || !accountId) return
    const data = result.data
    const summary = [
      '【AI 分析】表面要求：',
      ...data.surface_requirements.map((s) => `· ${s.content}`),
      '',
      `原始沟通片段：${text.trim().slice(0, 400)}`
    ].join('\n')
    const painPoint = data.real_pain_points.map((p) => `${p.category}｜${p.content}`).join('；')

    try {
      await api.addInteraction(Number(accountId), {
        channel: 'visit',
        summary,
        pain_point: painPoint || null,
        source: 'ai'
      })
      setSaved(true)
      push('已保存为该客户的跟进记录')
    } catch (err) {
      push(err.message, 'error')
    }
  }

  const modelOptions = useMemo(() => health?.models || [], [health])
  const data = result?.data
  const online = health?.reachable

  return (
    <div className="space-y-4">
      {/* Ollama 状态 */}
      <section className={`flex flex-col gap-2 rounded-xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${
        online ? 'border-emerald-200 bg-emerald-50/50' : 'border-amber-200 bg-amber-50/50'
      }`}>
        <div className="flex items-start gap-2.5">
          <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${online ? 'bg-emerald-500' : 'bg-amber-500'}`} />
          <div>
            <p className={`text-[12.5px] font-semibold ${online ? 'text-emerald-800' : 'text-amber-800'}`}>
              {online ? '本地 Ollama 已连接' : '本地 Ollama 未连接 · 将自动降级'}
            </p>
            <p className={`mt-0.5 text-[11.5px] ${online ? 'text-emerald-700/80' : 'text-amber-700/80'}`}>
              {online
                ? `${health.baseUrl} · 可用模型 ${health.models.length} 个 · 单次最长 ${health.timeoutMs / 1000}s`
                : `${health?.baseUrl || 'http://127.0.0.1:11434'} 无响应。先执行 ollama serve，或继续使用本地关键词抽取（结果标注为降级）`}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-[11px] text-slate-500">
          <Icon name="shield" className="h-3.5 w-3.5" />
          文本只在本机流转
        </div>
      </section>

      {error && <ErrorBanner message={error.message} details={error.details} />}

      {/* 输入区 */}
      <section className="surface overflow-hidden">
        <div className="flex items-start justify-between gap-3 border-b border-hairline px-5 py-3.5">
          <div>
            <h2 className="text-[15px] font-semibold text-slate-800">沟通原文</h2>
            <p className="mt-0.5 text-xs text-slate-400">录音转写、会议纪要、客户来函都可以，越具体提取越准</p>
          </div>
          <div className="flex shrink-0 gap-1.5">
            <button type="button" className="btn-ghost !px-2.5 !py-1.5 !text-[11.5px]" onClick={() => setText(SAMPLE)}>
              填入示例
            </button>
            <button type="button" className="btn-ghost !px-2.5 !py-1.5 !text-[11.5px]" onClick={() => { setText(''); setResult(null) }}>
              清空
            </button>
          </div>
        </div>

        <form onSubmit={run} className="px-5 py-4">
          <textarea
            className="field min-h-[190px] resize-y !text-[13px] !leading-6"
            placeholder="把跟客户的对话粘进来，例如：客户说预算被占了、担心周期、觉得操作复杂…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={20000}
          />
          <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400">
            <span>{text.length} / 20000 字</span>
            <span>建议 200 字以上，痛点判断需要上下文</span>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
            <div>
              <label className="label">归属客户（可选，保存记录时需要）</label>
              <div className="relative">
                <select className="field pr-8" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                  <option value="">不关联</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                <Icon name="chevronDown" className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              </div>
            </div>
            <div>
              <label className="label">模型</label>
              <input
                className="field"
                list="ollama-models"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="qwen2.5:7b"
              />
              <datalist id="ollama-models">
                {modelOptions.map((m) => <option key={m} value={m} />)}
              </datalist>
            </div>
            <button type="submit" className="btn-primary h-[38px]" disabled={running}>
              {running ? <><Spinner /> 分析中 {elapsed}s</> : <><Icon name="sparkles" className="h-4 w-4" /> 提取痛点</>}
            </button>
          </div>

          {running && (
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-[11.5px] text-slate-500">
              <Spinner className="h-3.5 w-3.5 text-brand-600" />
              正在调用本地模型，通常 20-60 秒；超过 {health?.timeoutMs ? health.timeoutMs / 1000 : 90} 秒会自动降级，不会一直卡住。
            </div>
          )}
        </form>
      </section>

      {/* 结果 */}
      {data && (
        <section className="space-y-3">
          {result.degraded && (
            <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3">
              <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <div>
                <p className="text-[12.5px] font-semibold text-amber-800">已降级：{result.message || 'AI 调用失败'}</p>
                <p className="mt-0.5 text-[11.5px] leading-5 text-amber-700">
                  下面是用本地关键词规则抽取的结果，结构一致但精度有限，请人工复核后再用于决策。
                </p>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[11.5px] text-slate-400">
            <span className="inline-flex items-center gap-1">
              <Icon name="zap" className="h-3.5 w-3.5" />
              模型 {result.model}
            </span>
            <span>耗时 {(result.latencyMs / 1000).toFixed(1)}s</span>
            {typeof data.confidence === 'number' && <span>置信度 {fmtPercent(data.confidence)}</span>}
            {result.analysisId && <span>已留痕 #{result.analysisId}</span>}
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            {/* 表面要求 */}
            <div className="surface overflow-hidden">
              <div className="flex items-center gap-2 border-b border-hairline px-4 py-3">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-slate-100 text-slate-500">
                  <Icon name="chat" className="h-3.5 w-3.5" />
                </span>
                <div>
                  <h3 className="text-[13.5px] font-semibold text-slate-800">客户表面的要求</h3>
                  <p className="text-[10.5px] text-slate-400">他嘴上说的</p>
                </div>
                <span className="ml-auto text-[11px] tabular-nums text-slate-400">{data.surface_requirements.length} 条</span>
              </div>
              <ol className="divide-y divide-slate-100">
                {data.surface_requirements.length === 0 && (
                  <li className="px-4 py-6 text-center text-[12px] text-slate-400">没有识别出明确要求</li>
                )}
                {data.surface_requirements.map((s, i) => (
                  <li key={i} className="px-4 py-3">
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded bg-slate-100 text-[10px] font-semibold text-slate-500">{i + 1}</span>
                      <p className="text-[13px] leading-6 text-slate-700">{s.content}</p>
                      <span className={`ml-auto shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium text-white ${URGENCY_META[s.urgency]?.tone || 'bg-slate-300'}`}>
                        {URGENCY_META[s.urgency]?.label || '一般'}
                      </span>
                    </div>
                    {s.quote && <p className="mt-1 pl-6 text-[11px] leading-5 text-slate-400">“{s.quote}”</p>}
                  </li>
                ))}
              </ol>
            </div>

            {/* 真实痛点 */}
            <div className="surface overflow-hidden ring-1 ring-brand-100">
              <div className="flex items-center gap-2 border-b border-brand-100 bg-brand-50/40 px-4 py-3">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-100 text-brand-700">
                  <Icon name="target" className="h-3.5 w-3.5" />
                </span>
                <div>
                  <h3 className="text-[13.5px] font-semibold text-navy-900">背后真正的痛点</h3>
                  <p className="text-[10.5px] text-slate-400">他真正怕的</p>
                </div>
                <span className="ml-auto text-[11px] tabular-nums text-slate-400">{data.real_pain_points.length} 条</span>
              </div>
              <ul className="divide-y divide-slate-100">
                {data.real_pain_points.length === 0 && (
                  <li className="px-4 py-6 text-center text-[12px] text-slate-400">没有识别出明确痛点，建议补充更多原文</li>
                )}
                {data.real_pain_points.map((p, i) => (
                  <li key={i} className="px-4 py-3">
                    <div className="flex items-start gap-2">
                      <span className={`chip mt-0.5 shrink-0 ${CATEGORY_TONE[p.category] || CATEGORY_TONE['其他']}`}>{p.category}</span>
                      <p className="text-[13px] font-medium leading-6 text-slate-800">{p.content}</p>
                    </div>
                    {p.why && <p className="mt-1 pl-1 text-[11.5px] leading-5 text-slate-500">为什么：{p.why}</p>}
                    {p.quote && <p className="mt-1 pl-1 text-[11px] leading-5 text-slate-400">依据：“{p.quote}”</p>}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* 关键人信号 + 下一步 */}
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            <div className="surface p-4">
              <h3 className="flex items-center gap-1.5 text-[12.5px] font-semibold text-slate-700">
                <Icon name="users" className="h-3.5 w-3.5 text-slate-400" /> 提到的关键人
              </h3>
              {data.stakeholder_signals.length === 0 ? (
                <p className="mt-2 text-[11.5px] text-slate-400">原文里没有明确的人名/职务信号</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {data.stakeholder_signals.map((s, i) => (
                    <li key={i} className="flex gap-2 text-[12px] leading-5">
                      <span className="shrink-0 font-medium text-slate-700">{s.name || '未具名'}</span>
                      <span className="text-slate-500">{s.signal}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="surface flex flex-col justify-between p-4">
              <div>
                <h3 className="flex items-center gap-1.5 text-[12.5px] font-semibold text-slate-700">
                  <Icon name="trending" className="h-3.5 w-3.5 text-slate-400" /> 建议下一步
                </h3>
                <p className="mt-2 text-[13px] leading-6 text-slate-700">{data.next_best_action || '模型未给出建议动作'}</p>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button type="button" className="btn-primary !py-1.5 !text-[12px]" onClick={saveAsInteraction} disabled={!accountId || saved}>
                  <Icon name={saved ? 'check' : 'plus'} className="h-3.5 w-3.5" />
                  {saved ? '已保存' : '保存为跟进记录'}
                </button>
                {!accountId && <span className="text-[11px] text-slate-400">选择归属客户后可保存</span>}
                <button
                  type="button"
                  className="btn-ghost !py-1.5 !text-[12px]"
                  onClick={() => { setResult(null); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
                >
                  <Icon name="refresh" className="h-3.5 w-3.5" /> 再分析一次
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* 空态说明 */}
      {!data && !running && (
        <section className="surface px-5 py-8">
          <div className="mx-auto max-w-2xl">
            <h3 className="text-[13px] font-semibold text-slate-700">这一步在做什么</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {[
                { icon: 'chat', title: '读原文', text: '录音转写 / 会议纪要 / 客户来函，最长 2 万字' },
                { icon: 'zap', title: '拆两层', text: '区分客户说出口的要求，和没说出口的真实约束' },
                { icon: 'target', title: '给动作', text: '每条痛点带依据原文，并给出下一步建议' }
              ].map((c) => (
                <div key={c.title} className="rounded-xl border border-hairline bg-slate-50/40 p-3">
                  <Icon name={c.icon} className="h-4 w-4 text-brand-600" />
                  <p className="mt-1.5 text-[12.5px] font-medium text-slate-800">{c.title}</p>
                  <p className="mt-0.5 text-[11.5px] leading-5 text-slate-500">{c.text}</p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[11.5px] leading-5 text-slate-400">
              提示：如果 Ollama 没启动，接口不会报 500，而是返回 <code className="rounded bg-slate-100 px-1">degraded: true</code> 的本地抽取结果，页面会明确标注。
            </p>
          </div>
        </section>
      )}
    </div>
  )
}
