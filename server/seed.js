/**
 * 演示数据种子。
 *   node server/seed.js            仅在库为空时写入
 *   node server/seed.js --reset    清空全部业务数据后重写
 * 日期全部相对"今天"生成，所以看板永远有"今日待办"和"逾期任务"。
 */
import { db, isEmpty, todayLocal, currentMonth, nextMonth, closeDb } from './db.js'

const day = (n) => todayLocal(n)

const ACCOUNTS = [
  {
    name: '恒瑞医药', industry: '医药制造', scale: '大型', stage: 'negotiation',
    estimated_amount: 4_800_000, health_score: 72, owner: '张伟', region: '华东',
    note: '集团级数字化采购，决策链长，需同时打通信息中心与业务部门。'
  },
  {
    name: '宁德时代', industry: '新能源', scale: '大型', stage: 'following',
    estimated_amount: 6_200_000, health_score: 58, owner: '李娜', region: '华南',
    note: '技术侧认可，但采购部压价强硬，竞争对手已进入第二轮报价。'
  },
  {
    name: '海尔智家', industry: '家电制造', scale: '大型', stage: 'negotiation',
    estimated_amount: 3_500_000, health_score: 81, owner: '王强', region: '华北',
    note: '标杆客户意向明确，等待集团法务走框架协议。'
  },
  {
    name: '招商银行', industry: '金融', scale: '大型', stage: 'following',
    estimated_amount: 2_900_000, health_score: 46, owner: '张伟', region: '华南',
    note: '合规部门对数据落地方案有异议，项目节奏明显放缓。'
  },
  {
    name: '蔚来汽车', industry: '汽车制造', scale: '大型', stage: 'signed',
    estimated_amount: 5_600_000, health_score: 92, owner: '李娜', region: '华东',
    note: '本月完成签约，进入交付阶段，可复制为汽车行业标杆。'
  },
  {
    name: '三一重工', industry: '工程机械', scale: '大型', stage: 'lead',
    estimated_amount: 1_800_000, health_score: 65, owner: '王强', region: '华中',
    note: '展会获取线索，尚未建立关键人联系。'
  },
  {
    name: '蜜雪冰城', industry: '连锁零售', scale: '中型', stage: 'following',
    estimated_amount: 960_000, health_score: 55, owner: '陈晨', region: '华中',
    note: '门店扩张快，但预算审批集中在总部，区域推动力有限。'
  },
  {
    name: '药明康德', industry: '医药研发', scale: '大型', stage: 'signed',
    estimated_amount: 2_400_000, health_score: 88, owner: '陈晨', region: '华东',
    note: '上季度签约，续约意愿强，可作为案例背书。'
  },
  {
    name: '京东方', industry: '半导体显示', scale: '大型', stage: 'following',
    estimated_amount: 7_300_000, health_score: 77, owner: '李娜', region: '华北',
    note: '总部统一招标，已有内部支持者在推动立项。'
  },
  {
    name: '中国建筑', industry: '建筑工程', scale: '大型', stage: 'lead',
    estimated_amount: 1_200_000, health_score: 52, owner: '陈晨', region: '西南',
    note: '仅有一次初步接触，关键人尚未触达，信息严重不足。'
  }
]

const STAKEHOLDERS = {
  恒瑞医药: [
    {
      name: '周立群', title: '集团 CIO', role_type: 'decision_maker', focus: 'ROI / 数据安全',
      attitude: 'neutral', influence: 5,
      core_demand: '只关心两件事：三年内能不能算清 ROI，以及数据不出内网。',
      strategy: '带财务口径的 ROI 测算表上门，同步提供本地化部署架构图与等保备案材料。'
    },
    {
      name: '林倩', title: '信息化部 项目经理', role_type: 'influencer', focus: '实施周期 / 交付确定性',
      attitude: 'support', influence: 4,
      core_demand: '担心项目拖成"半拉子工程"，最在意里程碑是否可验证。',
      strategy: '给出分三期的里程碑排期，第一期 6 周内交付可演示版本。'
    },
    {
      name: '陈国栋', title: '采购部 总监', role_type: 'influencer', focus: '预算 / 价格',
      attitude: 'oppose', influence: 4,
      core_demand: '认为现有预算已被其他系统占用，倾向压价或推迟到明年。',
      strategy: '拆分预算口径，先签一期小额合同锁定立项，明年再扩量。'
    },
    {
      name: '吴敏', title: '临床试验运营 主管', role_type: 'user', focus: '体验 / 上手成本',
      attitude: 'support', influence: 3,
      core_demand: '一线人员抵触新系统，希望操作步骤不超过三步。',
      strategy: '邀请她参与原型评审，把她的操作习惯做成默认流程，培养内部代言人。'
    }
  ],
  宁德时代: [
    {
      name: '赵鹏', title: '智能制造 副总裁', role_type: 'decision_maker', focus: '产能提升 / 稳定性',
      attitude: 'support', influence: 5,
      core_demand: '要的是产线不停机，方案稳定性优先于功能丰富度。',
      strategy: '提供同行业连续运行 12 个月的稳定性报告，安排一次现场 POC。'
    },
    {
      name: '孙悦', title: '采购经理', role_type: 'influencer', focus: '价格 / 付款账期',
      attitude: 'oppose', influence: 4,
      core_demand: '被竞争对手的低价锚定，要求降价 20% 并把账期拉到 180 天。',
      strategy: '不直接降价，改用"三年 TCO 对比"转移战场，账期让到 120 天换三年框架。'
    },
    {
      name: '李海峰', title: 'IT 架构师', role_type: 'user', focus: '集成难度 / 接口',
      attitude: 'neutral', influence: 3,
      core_demand: '关心能不能跟现有 MES 打通，不想再维护一套独立账号体系。',
      strategy: '提供标准 API 清单与 SSO 对接方案，安排我方架构师一对一技术对接。'
    }
  ],
  海尔智家: [
    {
      name: '王振华', title: '数字化中心 总经理', role_type: 'decision_maker', focus: '战略匹配 / 集团推广',
      attitude: 'support', influence: 5,
      core_demand: '希望做成集团可复制的模板，不只解决单个事业部的问题。',
      strategy: '把方案包装成"集团模板 + 事业部试点"，签约即锁定后续 3 个事业部。'
    },
    {
      name: '刘洋', title: '法务 合规经理', role_type: 'influencer', focus: '合规 / 合同条款',
      attitude: 'neutral', influence: 3,
      core_demand: '对数据归属和违约责任条款非常敏感。',
      strategy: '提前提供标准合同与数据归属说明，法务前置介入，别等到最后一天。'
    },
    {
      name: '张小雨', title: '供应链 计划员', role_type: 'user', focus: '体验 / 报表',
      attitude: 'support', influence: 2,
      core_demand: '每天要导 5 张表，希望一个看板全看完。',
      strategy: '把她的 5 张表合并成一张自定义看板，作为上线首日亮点演示。'
    }
  ],
  招商银行: [
    {
      name: '何俊', title: '信息科技部 处长', role_type: 'decision_maker', focus: '合规 / 审计',
      attitude: 'oppose', influence: 5,
      core_demand: '总行审计口径要求全链路留痕，现有方案无法满足。',
      strategy: '两周内补齐操作日志与审计报表模块，邀请其合规团队参与验收标准制定。'
    },
    {
      name: '徐蕾', title: '零售业务部 产品经理', role_type: 'user', focus: '效率 / 客户体验',
      attitude: 'support', influence: 3,
      core_demand: '一线客户经理每天填表两小时，急需减负。',
      strategy: '用她的真实工单做 Demo，量化"每天省 90 分钟"。'
    }
  ]
}

const INTERACTIONS = [
  {
    account: '恒瑞医药', stakeholder: '周立群', channel: 'visit', date: day(-3),
    summary: '与 CIO 周立群及其信息化团队面谈 90 分钟，演示了本地化部署方案。对方认可数据不出内网，但要求补充三年 ROI 测算。',
    pain_point: 'CIO 无法向董事会证明投入产出，缺少财务口径的测算依据。'
  },
  {
    account: '恒瑞医药', stakeholder: '陈国栋', channel: 'call', date: day(-1),
    summary: '采购总监电话沟通，明确表示今年预算已排满，希望我们"明年再说"，语气较为强硬。',
    pain_point: '预算窗口已关闭，采购侧缺乏今年立项的动力。'
  },
  {
    account: '宁德时代', stakeholder: '孙悦', channel: 'call', date: day(-2),
    summary: '采购经理反馈竞争对手报价低 22%，要求我们同步降价并延长账期。',
    pain_point: '被低价锚定，价格谈判陷入被动，客户用竞品报价施压。'
  },
  {
    account: '海尔智家', stakeholder: '王振华', channel: 'visit', date: day(-5),
    summary: '数字化中心总经理明确表示愿意做集团试点，但需要法务先过框架协议，希望 6 月前完成签约。',
    pain_point: '合同流程长，法务对数据归属条款有保留意见。'
  },
  {
    account: '招商银行', stakeholder: '何俊', channel: 'visit', date: day(-6),
    summary: '信息科技处处长指出审计留痕不达标，项目被迫暂停两周，等我们出补充方案。',
    pain_point: '合规审计要求未被满足，存在一票否决风险。'
  },
  {
    account: '京东方', stakeholder: null, channel: 'call', date: day(-4),
    summary: '与总部招标办确认了统一招标时间表，预计下月中旬发标，需要提前准备资质材料。',
    pain_point: '招标时间紧，资质与案例材料准备不足。'
  }
]

const TASKS = [
  { account: '恒瑞医药', content: '补齐三年 ROI 测算表并发给周立群', due: day(0), priority: 'high' },
  { account: '宁德时代', content: '准备三年 TCO 对比材料，回应采购压价', due: day(0), priority: 'high' },
  { account: '海尔智家', content: '推动法务确认框架协议数据归属条款', due: day(0), priority: 'medium' },
  { account: '招商银行', content: '输出审计日志补充方案（承诺两周内）', due: day(-2), priority: 'high' },
  { account: '恒瑞医药', content: '约陈国栋确认一期小额合同预算口径', due: day(-1), priority: 'high' },
  { account: '三一重工', content: '通过展会名片建立关键人首次联系', due: day(2), priority: 'medium' },
  { account: '京东方', content: '整理招标资质与同行业案例包', due: day(3), priority: 'medium' },
  { account: '蜜雪冰城', content: '确认总部预算审批流程与决策人', due: day(1), priority: 'low' },
  { account: '蔚来汽车', content: '交付启动会，确认实施里程碑', due: day(4), priority: 'medium' }
]

export function seed ({ reset = false } = {}) {
  const run = db.transaction(() => {
    if (reset) {
      db.exec(`
        DELETE FROM ai_analyses;
        DELETE FROM interactions;
        DELETE FROM tasks;
        DELETE FROM stakeholders;
        DELETE FROM accounts;
        DELETE FROM sales_targets;
        DELETE FROM sqlite_sequence;
      `)
    }

    const insertAccount = db.prepare(`
      INSERT INTO accounts (name, industry, scale, stage, estimated_amount, health_score, owner, region, note, signed_at)
      VALUES (@name, @industry, @scale, @stage, @estimated_amount, @health_score, @owner, @region, @note, @signed_at)
    `)
    const idByName = new Map()
    for (const a of ACCOUNTS) {
      const signedAt = a.stage === 'signed'
        ? (a.name === '蔚来汽车' ? day(-8) : day(-40))
        : null
      const info = insertAccount.run({ ...a, signed_at: signedAt })
      idByName.set(a.name, Number(info.lastInsertRowid))
    }

    const insertStakeholder = db.prepare(`
      INSERT INTO stakeholders (account_id, name, title, role_type, focus, attitude, influence, core_demand, strategy)
      VALUES (@account_id, @name, @title, @role_type, @focus, @attitude, @influence, @core_demand, @strategy)
    `)
    const stakeholderId = new Map()
    for (const [accountName, people] of Object.entries(STAKEHOLDERS)) {
      for (const p of people) {
        const info = insertStakeholder.run({ ...p, account_id: idByName.get(accountName) })
        stakeholderId.set(`${accountName}/${p.name}`, Number(info.lastInsertRowid))
      }
    }

    const insertInteraction = db.prepare(`
      INSERT INTO interactions (account_id, stakeholder_id, channel, contact_date, summary, pain_point, source)
      VALUES (@account_id, @stakeholder_id, @channel, @contact_date, @summary, @pain_point, 'manual')
    `)
    for (const it of INTERACTIONS) {
      insertInteraction.run({
        account_id: idByName.get(it.account),
        stakeholder_id: it.stakeholder ? stakeholderId.get(`${it.account}/${it.stakeholder}`) : null,
        channel: it.channel,
        contact_date: it.date,
        summary: it.summary,
        pain_point: it.pain_point
      })
    }

    const insertTask = db.prepare(`
      INSERT INTO tasks (account_id, content, due_date, is_done, done_at, priority)
      VALUES (@account_id, @content, @due_date, @is_done, @done_at, @priority)
    `)
    for (const t of TASKS) {
      insertTask.run({
        account_id: idByName.get(t.account),
        content: t.content,
        due_date: t.due,
        is_done: 0,
        done_at: null,
        priority: t.priority
      })
    }
    // 一条已完成任务，让"今日待办"有已完成态可看
    insertTask.run({
      account_id: idByName.get('药明康德'),
      content: '续约方案初稿内部评审',
      due_date: day(-1),
      is_done: 1,
      done_at: `${day(-1)} 18:20:00`,
      priority: 'medium'
    })

    const insertTarget = db.prepare(`
      INSERT INTO sales_targets (month, target_amount) VALUES (?, ?)
      ON CONFLICT(month) DO UPDATE SET target_amount = excluded.target_amount
    `)
    insertTarget.run(currentMonth(), 8_000_000)
    insertTarget.run(nextMonth(), 9_500_000)
  })

  run()
  return {
    accounts: db.prepare('SELECT COUNT(*) n FROM accounts').get().n,
    stakeholders: db.prepare('SELECT COUNT(*) n FROM stakeholders').get().n,
    interactions: db.prepare('SELECT COUNT(*) n FROM interactions').get().n,
    tasks: db.prepare('SELECT COUNT(*) n FROM tasks').get().n
  }
}

// 直接执行时：node server/seed.js [--reset]
if (process.argv[1] && process.argv[1].endsWith('seed.js')) {
  const reset = process.argv.includes('--reset')
  if (!reset && !isEmpty()) {
    console.log('数据库已有数据，跳过种子。需要重置请运行：npm run seed:reset')
  } else {
    console.log('已写入演示数据：', seed({ reset }))
  }
  closeDb()
}
