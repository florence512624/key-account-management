/** 展示层格式化：金额一律按"万"看，日期一律按本地时区算，避免时区漂移 */

export function fmtWan (value) {
  const n = Number(value) || 0
  if (Math.abs(n) >= 100_000_000) return `${(n / 100_000_000).toFixed(2)} 亿`
  if (Math.abs(n) >= 10_000) {
    const wan = n / 10_000
    // 10 万以上取整，避免 "96.0 万 / 730 万" 混排；10 万以下保留一位小数
    return `${wan >= 10 ? Math.round(wan).toLocaleString('zh-CN') : wan.toFixed(1)} 万`
  }
  return `${n.toLocaleString('zh-CN')} 元`
}

export function fmtMoney (value) {
  return (Number(value) || 0).toLocaleString('zh-CN')
}

export function fmtPercent (ratio) {
  return `${Math.round((Number(ratio) || 0) * 100)}%`
}

/** 'YYYY-MM-DD' → '11-09' */
export function fmtDate (dateStr) {
  if (!dateStr) return '—'
  const [, m, d] = String(dateStr).slice(0, 10).split('-')
  return m && d ? `${m}-${d}` : dateStr
}

export function fmtDateTime (iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const p = (n) => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export function todayStr () {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** 纯日期差（天），只对 YYYY-MM-DD 有效 */
export function diffDays (dateStr, base = todayStr()) {
  if (!dateStr) return 0
  const a = new Date(`${String(dateStr).slice(0, 10)}T00:00:00`)
  const b = new Date(`${base}T00:00:00`)
  return Math.round((a - b) / 86_400_000)
}

/** 今天 / 逾期 2 天 / 3 天后 */
export function dueLabel (dateStr) {
  const d = diffDays(dateStr)
  if (d === 0) return { text: '今天', tone: 'text-amber-600' }
  if (d === 1) return { text: '明天', tone: 'text-slate-500' }
  if (d > 1) return { text: `${d} 天后`, tone: 'text-slate-400' }
  return { text: `逾期 ${Math.abs(d)} 天`, tone: 'text-rose-600' }
}

export function healthTone (score) {
  if (score >= 80) return { label: '健康', bar: 'bg-emerald-500', text: 'text-emerald-600', chip: 'bg-emerald-50 text-emerald-700 ring-emerald-200' }
  if (score >= 60) return { label: '观察', bar: 'bg-amber-500', text: 'text-amber-600', chip: 'bg-amber-50 text-amber-700 ring-amber-200' }
  return { label: '高风险', bar: 'bg-rose-500', text: 'text-rose-600', chip: 'bg-rose-50 text-rose-700 ring-rose-200' }
}

export function initials (name = '') {
  const trimmed = String(name).trim()
  if (!trimmed) return '?'
  // 中文统一取姓（"周立群"/"吴敏" → "周"/"吴"），英文取首字母
  if (/[\u4e00-\u9fa5]/.test(trimmed)) return trimmed.slice(0, 1)
  return trimmed.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()
}
