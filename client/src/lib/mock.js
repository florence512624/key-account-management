/**
 * 演示用 mock 数据：结构与后端 /api/dashboard、/api/accounts 完全一致。
 * 只在"后端没启动"时兜底，页面右上角会打上「演示数据」标记，
 * 所以既满足"先用 mock 开发"的要求，又不会让人误以为是真数据。
 */
import { STAGE_ORDER } from './constants.js'

const day = (n) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  const p = (v) => String(v).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function mockDashboard () {
  return {
    mock: true,
    month: day(0).slice(0, 7),
    stats: {
      followingCustomers: {
        value: 8,
        breakdown: { lead: 2, following: 4, negotiation: 2 },
        pipelineAmount: 22_360_000
      },
      monthlyTarget: { value: 8_000_000, achieved: 5_600_000, completion: 0.7 },
      overdueTasks: { value: 2, oldestOverdueDays: 2 },
      highRiskAccounts: { value: 4 }
    },
    funnel: STAGE_ORDER.map((stage, i) => ({
      stage,
      count: [2, 4, 2, 2][i],
      amount: [3_000_000, 10_760_000, 8_600_000, 8_000_000][i]
    })),
    todayTasks: [
      { id: 1, content: '补齐三年 ROI 测算表并发给周立群', due_date: day(0), priority: 'high', is_done: 0, account_id: 1, account_name: '恒瑞医药' },
      { id: 2, content: '准备三年 TCO 对比材料，回应采购压价', due_date: day(0), priority: 'high', is_done: 0, account_id: 2, account_name: '宁德时代' },
      { id: 3, content: '推动法务确认框架协议数据归属条款', due_date: day(0), priority: 'medium', is_done: 0, account_id: 3, account_name: '海尔智家' },
      { id: 4, content: '输出审计日志补充方案（承诺两周内）', due_date: day(-2), priority: 'high', is_done: 0, account_id: 4, account_name: '招商银行' },
      { id: 5, content: '约陈国栋确认一期小额合同预算口径', due_date: day(-1), priority: 'high', is_done: 0, account_id: 1, account_name: '恒瑞医药' }
    ],
    doneToday: 1,
    opportunities: [
      { id: 9, name: '京东方', industry: '半导体显示', stage: 'following', estimated_amount: 7_300_000, health_score: 77, owner: '李娜', stakeholder_count: 2, opposer_count: 0, last_contact_date: day(-4), overdue_task_count: 0 },
      { id: 2, name: '宁德时代', industry: '新能源', stage: 'following', estimated_amount: 6_200_000, health_score: 58, owner: '李娜', stakeholder_count: 3, opposer_count: 1, last_contact_date: day(-2), overdue_task_count: 0 },
      { id: 1, name: '恒瑞医药', industry: '医药制造', stage: 'negotiation', estimated_amount: 4_800_000, health_score: 72, owner: '张伟', stakeholder_count: 4, opposer_count: 1, last_contact_date: day(-1), overdue_task_count: 2 },
      { id: 3, name: '海尔智家', industry: '家电制造', stage: 'negotiation', estimated_amount: 3_500_000, health_score: 81, owner: '王强', stakeholder_count: 3, opposer_count: 0, last_contact_date: day(-5), overdue_task_count: 0 },
      { id: 4, name: '招商银行', industry: '金融', stage: 'following', estimated_amount: 2_900_000, health_score: 46, owner: '张伟', stakeholder_count: 2, opposer_count: 1, last_contact_date: day(-6), overdue_task_count: 1 },
      { id: 6, name: '三一重工', industry: '工程机械', stage: 'lead', estimated_amount: 1_800_000, health_score: 65, owner: '王强', stakeholder_count: 0, opposer_count: 0, last_contact_date: null, overdue_task_count: 0 }
    ]
  }
}

export function mockAccounts () {
  const rows = mockDashboard().opportunities.concat([
    { id: 5, name: '蔚来汽车', industry: '汽车制造', stage: 'signed', estimated_amount: 5_600_000, health_score: 92, owner: '李娜', stakeholder_count: 2, opposer_count: 0, last_contact_date: day(-8), overdue_task_count: 0 },
    { id: 8, name: '药明康德', industry: '医药研发', stage: 'signed', estimated_amount: 2_400_000, health_score: 88, owner: '陈晨', stakeholder_count: 1, opposer_count: 0, last_contact_date: day(-20), overdue_task_count: 0 }
  ])
  return {
    items: rows,
    summary: {
      total: rows.length,
      amount: rows.reduce((s, a) => s + a.estimated_amount, 0),
      pipeline: rows.filter((a) => a.stage !== 'signed').reduce((s, a) => s + a.estimated_amount, 0),
      risk: rows.filter((a) => a.health_score < 60 && a.stage !== 'signed').length
    }
  }
}
