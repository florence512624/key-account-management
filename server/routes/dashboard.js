import express from 'express'
import { z } from 'zod'
import { db, todayLocal, currentMonth } from '../db.js'
import { HttpError, validate } from '../http.js'

export const dashboardRouter = express.Router()

const STAGES = ['lead', 'following', 'negotiation', 'signed']

dashboardRouter.get('/', (req, res) => {
  const today = todayLocal()
  const month = currentMonth()

  /* ---------- 1. 跟进中客户 ---------- */
  const stageCounts = Object.fromEntries(
    db.prepare('SELECT stage, COUNT(*) AS n, COALESCE(SUM(estimated_amount), 0) AS amount FROM accounts GROUP BY stage')
      .all()
      .map((r) => [r.stage, { count: r.n, amount: r.amount }])
  )
  const pipelineStages = ['lead', 'following', 'negotiation']
  const followingCustomers = pipelineStages.reduce((sum, s) => sum + (stageCounts[s]?.count || 0), 0)
  const pipelineAmount = pipelineStages.reduce((sum, s) => sum + (stageCounts[s]?.amount || 0), 0)

  /* ---------- 2. 本月目标金额 ---------- */
  const target = db.prepare('SELECT target_amount FROM sales_targets WHERE month = ?').get(month)?.target_amount ?? 0
  const achieved = db.prepare(`
    SELECT COALESCE(SUM(estimated_amount), 0) AS v
    FROM accounts
    WHERE stage = 'signed' AND substr(COALESCE(signed_at, ''), 1, 7) = ?
  `).get(month).v

  /* ---------- 3. 逾期任务 ---------- */
  const overdue = db.prepare(`
    SELECT COUNT(*) AS n, MIN(due_date) AS oldest
    FROM tasks WHERE is_done = 0 AND due_date < ?
  `).get(today)
  const oldestOverdueDays = overdue.oldest
    ? Math.round((new Date(`${today}T00:00:00`) - new Date(`${overdue.oldest}T00:00:00`)) / 86_400_000)
    : 0

  /* ---------- 4. 高风险客户 ---------- */
  const risky = db.prepare(`
    SELECT COUNT(*) AS n FROM accounts WHERE health_score < 60 AND stage != 'signed'
  `).get()

  /* ---------- 今日待办 ---------- */
  const todayTasks = db.prepare(`
    SELECT t.id, t.content, t.due_date, t.priority, t.is_done,
           a.id AS account_id, a.name AS account_name
    FROM tasks t
    JOIN accounts a ON a.id = t.account_id
    WHERE t.is_done = 0 AND t.due_date <= ?
    ORDER BY t.due_date ASC,
             CASE t.priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END ASC,
             t.id ASC
    LIMIT 12
  `).all(today)

  const doneToday = db.prepare(`
    SELECT COUNT(*) AS n FROM tasks WHERE is_done = 1 AND substr(COALESCE(done_at, ''), 1, 10) = ?
  `).get(today).n

  /* ---------- 高潜客户商机 ---------- */
  const opportunities = db.prepare(`
    SELECT id, name, industry, stage, estimated_amount, health_score, owner,
           stakeholder_count, opposer_count, last_contact_date, overdue_task_count
    FROM v_account_overview
    WHERE stage IN ('lead', 'following', 'negotiation')
    ORDER BY estimated_amount DESC
    LIMIT 6
  `).all()

  res.json({
    generatedAt: new Date().toISOString(),
    month,
    stats: {
      followingCustomers: {
        value: followingCustomers,
        breakdown: { lead: stageCounts.lead?.count || 0, following: stageCounts.following?.count || 0, negotiation: stageCounts.negotiation?.count || 0 },
        pipelineAmount
      },
      monthlyTarget: {
        value: target,
        achieved,
        completion: target > 0 ? Math.min(1, achieved / target) : 0
      },
      overdueTasks: {
        value: overdue.n,
        oldestOverdueDays
      },
      highRiskAccounts: {
        value: risky.n
      }
    },
    funnel: STAGES.map((stage) => ({
      stage,
      count: stageCounts[stage]?.count || 0,
      amount: stageCounts[stage]?.amount || 0
    })),
    todayTasks,
    doneToday,
    opportunities
  })
})

/* 快速勾选 / 取消勾选待办 */
const toggleSchema = z.object({ is_done: z.union([z.boolean(), z.literal(0), z.literal(1)]) })

dashboardRouter.patch('/tasks/:id/toggle', (req, res) => {
  const id = Number(req.params.id)
  const { is_done: raw } = validate(toggleSchema, req.body)
  const isDone = raw === true || raw === 1 ? 1 : 0
  const info = db.prepare('UPDATE tasks SET is_done = ?, done_at = ? WHERE id = ?')
    .run(isDone, isDone ? `${todayLocal()} ${new Date().toTimeString().slice(0, 8)}` : null, id)
  if (info.changes === 0) throw new HttpError(404, '任务不存在')
  res.json({ ok: true, id, is_done: isDone })
})
