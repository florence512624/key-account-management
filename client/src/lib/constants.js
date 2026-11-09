/** 枚举的"唯一真相源"：库里存英文码，界面只认这里的中文与配色 */

export const STAGE_ORDER = ['lead', 'following', 'negotiation', 'signed']

export const STAGE_META = {
  lead: {
    label: '线索',
    chip: 'bg-slate-50 text-slate-600 ring-slate-200',
    dot: 'bg-slate-400',
    bar: 'bg-slate-400'
  },
  following: {
    label: '跟进',
    chip: 'bg-blue-50 text-blue-700 ring-blue-200',
    dot: 'bg-blue-500',
    bar: 'bg-blue-500'
  },
  negotiation: {
    label: '谈判',
    chip: 'bg-amber-50 text-amber-700 ring-amber-200',
    dot: 'bg-amber-500',
    bar: 'bg-amber-500'
  },
  signed: {
    label: '签约',
    chip: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    dot: 'bg-emerald-500',
    bar: 'bg-emerald-500'
  }
}

export const ROLE_ORDER = ['decision_maker', 'influencer', 'user', 'supporter']

export const ROLE_META = {
  decision_maker: {
    label: '决策者',
    short: '决策',
    hint: '拍板人 · 预算签字',
    chip: 'bg-red-50 text-red-700 ring-red-200',
    dot: 'bg-red-500',
    soft: 'bg-red-50',
    border: 'border-red-200',
    text: 'text-red-600',
    accent: '#dc2626'
  },
  influencer: {
    label: '影响者',
    short: '影响',
    hint: '技术 / 采购 / 合规把关',
    chip: 'bg-amber-50 text-amber-700 ring-amber-200',
    dot: 'bg-amber-500',
    soft: 'bg-amber-50',
    border: 'border-amber-200',
    text: 'text-amber-600',
    accent: '#d97706'
  },
  user: {
    label: '使用者',
    short: '使用',
    hint: '一线使用 · 影响续约',
    chip: 'bg-blue-50 text-blue-700 ring-blue-200',
    dot: 'bg-blue-500',
    soft: 'bg-blue-50',
    border: 'border-blue-200',
    text: 'text-blue-600',
    accent: '#2563eb'
  },
  supporter: {
    label: '支持者',
    short: '支持',
    hint: '内部推动者 / 教练',
    chip: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    dot: 'bg-emerald-500',
    soft: 'bg-emerald-50',
    border: 'border-emerald-200',
    text: 'text-emerald-600',
    accent: '#059669'
  }
}

export const ATTITUDE_META = {
  support: { label: '支持', chip: 'bg-emerald-50 text-emerald-700 ring-emerald-200', dot: 'bg-emerald-500' },
  neutral: { label: '中立', chip: 'bg-slate-100 text-slate-600 ring-slate-200', dot: 'bg-slate-400' },
  oppose: { label: '反对', chip: 'bg-rose-50 text-rose-700 ring-rose-200', dot: 'bg-rose-500' }
}

export const PRIORITY_META = {
  high: { label: '高', chip: 'bg-rose-50 text-rose-600 ring-rose-200', dot: 'bg-rose-500' },
  medium: { label: '中', chip: 'bg-amber-50 text-amber-600 ring-amber-200', dot: 'bg-amber-500' },
  low: { label: '低', chip: 'bg-slate-50 text-slate-500 ring-slate-200', dot: 'bg-slate-400' }
}

export const CHANNEL_META = {
  visit: { label: '拜访', chip: 'bg-indigo-50 text-indigo-700 ring-indigo-200' },
  call: { label: '电话', chip: 'bg-cyan-50 text-cyan-700 ring-cyan-200' }
}

export const CATEGORY_TONE = {
  成本: 'bg-orange-50 text-orange-700 ring-orange-200',
  效率: 'bg-sky-50 text-sky-700 ring-sky-200',
  风险: 'bg-rose-50 text-rose-700 ring-rose-200',
  组织: 'bg-violet-50 text-violet-700 ring-violet-200',
  体验: 'bg-teal-50 text-teal-700 ring-teal-200',
  竞争: 'bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200',
  其他: 'bg-slate-50 text-slate-600 ring-slate-200'
}

export const URGENCY_META = {
  high: { label: '紧急', tone: 'bg-rose-500' },
  medium: { label: '一般', tone: 'bg-amber-400' },
  low: { label: '暂缓', tone: 'bg-slate-300' }
}
