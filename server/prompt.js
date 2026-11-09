/**
 * 提示词工程：把"客户说了什么"和"客户真正怕什么"拆开。
 * 小模型最容易犯的错是把客户原话换个说法重复两遍，
 * 所以提示词里用"判定标准 + 反例 + 无证据就留空"三条硬约束压住。
 */

const MAX_CHARS = 12_000 // 控制上下文占用，完整原文仍会存进 ai_analyses

export function buildExtractionPrompt ({ text, accountName = '' }) {
  const clipped = text.slice(0, MAX_CHARS)
  const truncated = text.length > MAX_CHARS ? '\n\n（原文过长，以下仅为前 12000 字）' : ''

  return `你是一位有 15 年经验的 KA 大客户销售顾问，擅长用 SPIN 方法拆解客户话语。

# 任务
阅读下面这段与客户的沟通记录（可能是录音转写、会议纪要或客户来函），区分两类信息：
1) 表面要求：客户明确说出口的、字面上的诉求（功能、交付、报价、流程、时间点）。
2) 真实痛点：客户没有直说、但从措辞、顾虑、反复强调、内部约束中能推断出的真正障碍。
   常见层次：预算与决策流程、部门利益冲突、个人 KPI 与担责风险、对失败的历史阴影、对变革的抵触。

# 判定标准
- 表面要求必须有原文依据，是"客户提出的"。
- 真实痛点必须回答"他为什么提这个要求"，落到业务或组织后果，不要复述要求。
- 反例：客户说"你们报价太高"。
  × 错误痛点："客户觉得价格高"（这是复述表面要求）。
  √ 正确痛点："采购部今年预算已被其他系统占用，压价是为了把项目挤进剩余额度，本质是预算窗口问题"。
- 没有证据支撑的内容一律不要编造；宁可返回空数组。

# 输出格式（只输出 JSON，不要任何解释、不要 markdown 代码块）
{
  "surface_requirements": [
    { "content": "客户明确提出的要求，一句话", "quote": "支撑它的原文片段", "urgency": "high" }
  ],
  "real_pain_points": [
    {
      "content": "背后的真实痛点，一句话",
      "why": "为什么这是痛点，会造成什么业务/组织后果",
      "category": "成本",
      "quote": "推断所依据的原文片段"
    }
  ],
  "stakeholder_signals": [
    { "name": "提到的人名或职务，没提到就留空", "signal": "此人的态度或立场信号" }
  ],
  "next_best_action": "销售下一步最该做的一个动作，具体可执行",
  "confidence": 0.75
}

约束：
- urgency 只能是 high / medium / low。
- category 只能是 成本 / 效率 / 风险 / 组织 / 体验 / 竞争 / 其他 之一。
- 每个数组最多 5 条，按重要性排序。
- confidence 是 0 到 1 的小数。
- 如果原文只是寒暄没有有效信息，两个数组都返回 []，并在 next_best_action 说明需要补充什么信息。

${accountName ? `客户名称：${accountName}` : ''}
# 沟通记录
"""
${clipped}
"""${truncated}`
}

export function buildRepairPrompt ({ text, accountName = '', previous = '' }) {
  return `${buildExtractionPrompt({ text, accountName })}

# 重要修正
你上一次的输出无法被 JSON.parse 解析：${previous.slice(0, 200) || '格式不合法'}。
这次请严格遵守：
1. 只输出一个 JSON 对象，第一个字符是 {，最后一个字符是 }。
2. 不要输出 markdown 代码块围栏，不要输出任何前后说明文字。
3. 所有字符串用英文双引号，字符串内部不要出现未转义的双引号。
4. 不要有尾随逗号。`
}
