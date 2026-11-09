/**
 * API 契约测试：直接起一个真实 HTTP 服务，验证路由、校验、级联删除、鉴权与导出。
 * 不 mock 数据库，跑的就是生产同一套 SQL。
 */
process.env.DB_PATH = ':memory:'
process.env.OLLAMA_BASE_URL = 'http://127.0.0.1:9'

import test from 'node:test'
import assert from 'node:assert/strict'

const { createApp } = await import('../server/app.js')
const app = createApp()
const server = app.listen(0)
await new Promise((resolve) => server.once('listening', resolve))
const base = `http://127.0.0.1:${server.address().port}`

test.after(() => server.close())

let cookie = ''

async function login (username = 'admin', password = 'admin123') {
  const res = await fetch(base + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  })
  const setCookies = res.headers.getSetCookie?.() || []
  const raw = setCookies[0] || res.headers.get('set-cookie') || ''
  const token = raw.split(';')[0]
  if (token) cookie = token
  return res
}

const json = async (path, options = {}) => {
  const headers = {}
  if (options.body) headers['Content-Type'] = 'application/json'
  if (cookie) headers.Cookie = cookie
  const res = await fetch(base + path, { ...options, headers: { ...headers, ...(options.headers || {}) } })
  const text = await res.text()
  return { status: res.status, body: text ? JSON.parse(text) : null, headers: res.headers }
}

/* ------------------------------ 鉴权 ------------------------------ */

test('未登录访问业务接口返回 401', async () => {
  const res = await fetch(base + '/api/dashboard')
  assert.equal(res.status, 401)
  const body = await res.json()
  assert.match(body.error, /登录/)
})

test('错误密码登录失败，且不泄露账号是否存在', async () => {
  const wrong = await login('admin', 'wrong-password')
  assert.equal(wrong.status, 401)

  const ghost = await login('nobody-here', 'whatever')
  assert.equal(ghost.status, 401)
  const a = await wrong.json()
  const b = await ghost.json()
  assert.match(a.error, /用户名或密码/)
  assert.match(b.error, /用户名或密码/)
})

test('正确密码登录成功并下发 HttpOnly 会话 Cookie', async () => {
  const res = await login()
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.user.username, 'admin')
  assert.equal(body.user.role, 'admin')

  const raw = (res.headers.getSetCookie?.() || [res.headers.get('set-cookie')]).join(';')
  assert.match(raw, /ka_session=/)
  assert.match(raw, /HttpOnly/i)
  assert.match(raw, /SameSite=Lax/i)
  assert.ok(!raw.includes('admin123'), 'Cookie 里不能出现密码')
})

test('登录后可读取当前用户', async () => {
  const { status, body } = await json('/api/auth/me')
  assert.equal(status, 200)
  assert.equal(body.user.username, 'admin')
  assert.equal(body.user.password_hash, undefined, '绝不能把密码哈希返回给前端')
})

/* ------------------------------ 业务 ------------------------------ */

test('启动即写入种子数据', async () => {
  const { status, body } = await json('/api/health')
  assert.equal(status, 200)
  assert.ok(body.counts.accounts >= 10)
  assert.ok(body.counts.stakeholders > 0)
})

test('看板接口返回四张卡所需的字段', async () => {
  const { status, body } = await json('/api/dashboard')
  assert.equal(status, 200)
  assert.equal(typeof body.stats.followingCustomers.value, 'number')
  assert.equal(typeof body.stats.monthlyTarget.completion, 'number')
  assert.equal(typeof body.stats.overdueTasks.value, 'number')
  assert.equal(typeof body.stats.highRiskAccounts.value, 'number')
  assert.ok(Array.isArray(body.todayTasks))
  assert.ok(body.opportunities.length > 0)
  assert.ok(body.funnel.length === 4)
})

test('客户列表支持按阶段筛选与搜索', async () => {
  const { body } = await json('/api/accounts?stage=following')
  assert.ok(body.items.every((a) => a.stage === 'following'))
  assert.equal(typeof body.summary.pipeline, 'number')

  const search = await json('/api/accounts?q=恒瑞')
  assert.equal(search.body.items.length, 1)
  assert.equal(search.body.items[0].name, '恒瑞医药')
})

test('创建客户：成功 201、重名 409、缺名称 400', async () => {
  const created = await json('/api/accounts', {
    method: 'POST',
    body: JSON.stringify({ name: '测试科技', industry: '软件', estimated_amount: 500000 })
  })
  assert.equal(created.status, 201)
  assert.equal(created.body.name, '测试科技')

  const dup = await json('/api/accounts', { method: 'POST', body: JSON.stringify({ name: '测试科技' }) })
  assert.equal(dup.status, 409)

  const bad = await json('/api/accounts', { method: 'POST', body: JSON.stringify({ name: '' }) })
  assert.equal(bad.status, 400)
  assert.ok(Array.isArray(bad.body.details) && bad.body.details.length > 0)
})

test('决策链：新增关键人后汇总与风险提示同步变化', async () => {
  const accountId = 1
  const before = await json(`/api/accounts/${accountId}/stakeholders`)
  const beforeTotal = before.body.summary.total

  const created = await json(`/api/accounts/${accountId}/stakeholders`, {
    method: 'POST',
    body: JSON.stringify({
      name: '新决策人', title: 'CTO', role_type: 'decision_maker',
      attitude: 'oppose', influence: 5, core_demand: '关心稳定性', strategy: '提供压测报告'
    })
  })
  assert.equal(created.status, 201)

  const after = await json(`/api/accounts/${accountId}/stakeholders`)
  assert.equal(after.body.summary.total, beforeTotal + 1)
  assert.ok(after.body.summary.flags.some((f) => f.includes('决策者')))

  const del = await json(`/api/stakeholders/${created.body.id}`, { method: 'DELETE' })
  assert.equal(del.status, 200)
})

test('决策人的非法角色会被拒绝', async () => {
  const res = await json('/api/accounts/1/stakeholders', {
    method: 'POST',
    body: JSON.stringify({ name: '某人', role_type: 'boss' })
  })
  assert.equal(res.status, 400)
})

test('待办：勾选后 is_done / done_at 同步', async () => {
  const open = await json('/api/tasks?scope=open')
  const task = open.body.items[0]
  const res = await json(`/api/tasks/${task.id}`, { method: 'PATCH', body: JSON.stringify({ is_done: true }) })
  assert.equal(res.body.is_done, 1)
  assert.ok(res.body.done_at)

  const back = await json(`/api/tasks/${task.id}`, { method: 'PATCH', body: JSON.stringify({ is_done: 0 }) })
  assert.equal(back.body.is_done, 0)
  assert.equal(back.body.done_at, null)
})

test('删除客户后其决策链与跟进一并消失（级联）', async () => {
  const created = await json('/api/accounts', {
    method: 'POST',
    body: JSON.stringify({ name: '待删除客户', industry: '测试' })
  })
  const id = created.body.id

  await json(`/api/accounts/${id}/stakeholders`, {
    method: 'POST',
    body: JSON.stringify({ name: '临时联系人', role_type: 'user' })
  })
  await json(`/api/accounts/${id}/interactions`, {
    method: 'POST',
    body: JSON.stringify({ channel: 'call', summary: '临时纪要' })
  })

  const del = await json(`/api/accounts/${id}`, { method: 'DELETE' })
  assert.equal(del.status, 200)

  const gone = await json(`/api/accounts/${id}`)
  assert.equal(gone.status, 404)

  const sk = await json(`/api/accounts/${id}/stakeholders`)
  assert.equal(sk.status, 404)
})

/* ------------------------------ 导出 ------------------------------ */

test('Excel 导出：返回真 xlsx、按筛选生效、文件名可用', async () => {
  const res = await fetch(`${base}/api/accounts/export.xlsx?stage=following`, { headers: { Cookie: cookie } })
  assert.equal(res.status, 200)
  assert.match(res.headers.get('content-type'), /spreadsheetml\.sheet/)

  const disposition = res.headers.get('content-disposition')
  assert.match(disposition, /attachment/)
  assert.match(disposition, /filename\*=UTF-8''/)
  assert.match(decodeURIComponent(disposition), /KAM客户台账/)

  const buffer = Buffer.from(await res.arrayBuffer())
  // xlsx 本质是 zip，前两字节必须是 PK
  assert.equal(buffer.subarray(0, 2).toString(), 'PK')
  assert.ok(buffer.length > 5000, '文件不应为空壳')

  // 用 exceljs 反向读一遍，确认表结构与筛选结果
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer)
  assert.deepEqual(wb.worksheets.map((w) => w.name), ['客户明细', '商机汇总'])

  const ws = wb.getWorksheet('客户明细')
  assert.equal(ws.getCell(3, 2).value, '客户名称')
  assert.equal(ws.getCell(1, 1).value, 'Key Account Management · 客户台账')

  // 表头下面每行都应是"跟进"阶段（第 5 列），遇到空行即数据结束
  let r = 4
  while (true) {
    const stage = ws.getCell(r, 5).value
    if (!stage || String(stage).startsWith('合计')) break
    assert.equal(stage, '跟进', `第 ${r} 行不应出现其它阶段`)
    r += 1
  }
  assert.ok(r > 4, '至少要导出一行数据')
})

test('未登录不能导出', async () => {
  const res = await fetch(`${base}/api/accounts/export.xlsx`)
  assert.equal(res.status, 401)
})

/* ------------------------------ 个人信息 ------------------------------ */

test('个人资料：姓名/职务/邮箱/手机号可修改并持久化', async () => {
  const res = await json('/api/auth/profile', {
    method: 'PATCH',
    body: JSON.stringify({
      display_name: '张伟', username: 'admin',
      title: 'KA 销售总监', email: 'zhang@example.com', phone: '13800000000'
    })
  })
  assert.equal(res.status, 200)
  assert.equal(res.body.user.title, 'KA 销售总监')
  assert.equal(res.body.user.phone, '13800000000')

  const me = await json('/api/auth/me')
  assert.equal(me.body.user.email, 'zhang@example.com')
  assert.ok(me.body.user.created_at, '注册时间要能返回')
})

test('个人资料校验：非法邮箱 / 非法用户名 / 用户名被占用', async () => {
  const base = { display_name: '张伟', username: 'admin' }

  const badEmail = await json('/api/auth/profile', {
    method: 'PATCH', body: JSON.stringify({ ...base, email: 'not-an-email' })
  })
  assert.equal(badEmail.status, 400)

  const badName = await json('/api/auth/profile', {
    method: 'PATCH', body: JSON.stringify({ ...base, username: 'a b' })
  })
  assert.equal(badName.status, 400)

  const { db } = await import('../server/db.js')
  db.prepare("INSERT OR IGNORE INTO users (username, display_name, password_hash) VALUES ('taken', '占位账号', 'x')").run()

  const dup = await json('/api/auth/profile', {
    method: 'PATCH', body: JSON.stringify({ ...base, username: 'TAKEN' })
  })
  assert.equal(dup.status, 409, '用户名比较应忽略大小写')
})

test('改用户名后新用户名可登录、旧用户名失效', async () => {
  const res = await json('/api/auth/profile', {
    method: 'PATCH',
    body: JSON.stringify({ display_name: '张伟', username: 'admin2', title: '', email: '', phone: '' })
  })
  assert.equal(res.status, 200)

  const oldLogin = await login('admin', 'admin123')
  assert.equal(oldLogin.status, 401)

  const newLogin = await login('admin2', 'admin123')
  assert.equal(newLogin.status, 200)

  // 还原，避免影响后续用例
  const back = await json('/api/auth/profile', {
    method: 'PATCH',
    body: JSON.stringify({ display_name: '张伟', username: 'admin', title: 'KA 销售总监', email: 'zhang@example.com', phone: '' })
  })
  assert.equal(back.status, 200)
  assert.equal(back.body.user.username, 'admin')
})

/* ------------------------------ AI ------------------------------ */

test('AI 健康检查：Ollama 不可用时也返回 200 + reachable=false', async () => {
  const { status, body } = await json('/api/ai/health')
  assert.equal(status, 200)
  assert.equal(body.reachable, false)
  assert.ok(Array.isArray(body.models))
})

test('AI 提取：文本过短 400；连不上 Ollama 时 200 + degraded', async () => {
  const short = await json('/api/ai/extract', { method: 'POST', body: JSON.stringify({ text: '太短' }) })
  assert.equal(short.status, 400)

  const long = await json('/api/ai/extract', {
    method: 'POST',
    body: JSON.stringify({ text: '客户反复说预算被占了，希望尽快演示，但担心实施周期太长导致业务部门抵触。', accountId: 1 })
  })
  assert.equal(long.status, 200)
  assert.equal(long.body.ok, true)
  assert.equal(long.body.degraded, true)
  assert.ok(long.body.analysisId, '降级结果也要留痕')
  assert.ok(Array.isArray(long.body.data.real_pain_points))
})

/* ------------------------------ 会话 ------------------------------ */

test('改密后旧密码失效、新密码可登录', async () => {
  const changed = await json('/api/auth/password', {
    method: 'PATCH',
    body: JSON.stringify({ current_password: 'admin123', new_password: 'newpass123' })
  })
  assert.equal(changed.status, 200)

  const oldLogin = await login('admin', 'admin123')
  assert.equal(oldLogin.status, 401)

  const newLogin = await login('admin', 'newpass123')
  assert.equal(newLogin.status, 200)

  // 改回默认，避免影响其它用例/重复运行
  const revert = await json('/api/auth/password', {
    method: 'PATCH',
    body: JSON.stringify({ current_password: 'newpass123', new_password: 'admin123' })
  })
  assert.equal(revert.status, 200)
})

test('登出后会话立即失效', async () => {
  const out = await json('/api/auth/logout', { method: 'POST' })
  assert.equal(out.status, 200)

  const me = await json('/api/auth/me')
  assert.equal(me.status, 401)
})

test('未知接口返回 404 JSON', async () => {
  const loginAgain = await login()
  assert.equal(loginAgain.status, 200)
  const { status, body } = await json('/api/nope')
  assert.equal(status, 404)
  assert.equal(body.error, '接口不存在')
})
