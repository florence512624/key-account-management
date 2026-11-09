import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import cors from 'cors'

import { db, isEmpty, DB_FILE } from './db.js'
import { seed } from './seed.js'
import { HttpError } from './http.js'
import { ensureDefaultUser, requireAuth } from './auth.js'
import { authRouter } from './routes/auth.js'
import { dashboardRouter } from './routes/dashboard.js'
import { accountsRouter } from './routes/accounts.js'
import { accountStakeholdersRouter, stakeholdersRouter } from './routes/stakeholders.js'
import { accountInteractionsRouter, interactionsRouter } from './routes/interactions.js'
import { tasksRouter } from './routes/tasks.js'
import { aiRouter } from './routes/ai.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const distDir = path.resolve(here, '../client/dist')

export function createApp ({ seedIfEmpty = true } = {}) {
  if (seedIfEmpty && isEmpty()) {
    const counts = seed()
    console.log('[seed] 首次启动，已写入演示数据：', counts)
  }
  // 已有库可能是升级前建的：这里补初始账号，不覆盖任何已存在的用户
  ensureDefaultUser()

  const app = express()
  app.disable('x-powered-by')
  app.use(cors())
  app.use(express.json({ limit: '1mb' }))

  // 简易访问日志（本地部署够用，不引第三方中间件）
  app.use((req, res, next) => {
    if (!req.path.startsWith('/api')) return next()
    const startedAt = Date.now()
    res.on('finish', () => {
      if (res.statusCode >= 400) {
        console.log(`[api] ${req.method} ${req.originalUrl} → ${res.statusCode} (${Date.now() - startedAt}ms)`)
      }
    })
    next()
  })

  app.get('/api/health', (req, res) => {
    res.json({
      ok: true,
      service: 'ka-sales-api',
      db: DB_FILE,
      counts: {
        accounts: db.prepare('SELECT COUNT(*) n FROM accounts').get().n,
        stakeholders: db.prepare('SELECT COUNT(*) n FROM stakeholders').get().n,
        interactions: db.prepare('SELECT COUNT(*) n FROM interactions').get().n,
        tasks: db.prepare('SELECT COUNT(*) n FROM tasks').get().n
      }
    })
  })

  // 登录相关接口必须放在鉴权中间件之前
  app.use('/api/auth', authRouter)
  // 之后所有 /api 接口都要求有效会话（前端未登录会拿到 401，由路由层送回登录页）
  app.use('/api', requireAuth)

  app.use('/api/dashboard', dashboardRouter)
  app.use('/api/accounts/:accountId/stakeholders', accountStakeholdersRouter)
  app.use('/api/accounts/:accountId/interactions', accountInteractionsRouter)
  app.use('/api/accounts', accountsRouter)
  app.use('/api/stakeholders', stakeholdersRouter)
  app.use('/api/interactions', interactionsRouter)
  app.use('/api/tasks', tasksRouter)
  app.use('/api/ai', aiRouter)

  app.use('/api', (req, res) => {
    res.status(404).json({ error: '接口不存在', path: req.originalUrl })
  })

  // 生产模式：Express 直接托管前端构建产物，实现"一个端口跑完"
  if (fs.existsSync(path.join(distDir, 'index.html'))) {
    app.use(express.static(distDir, { index: false }))
    app.get(/^(?!\/api\/).*/, (req, res, next) => {
      if (!req.accepts('html')) return next()
      res.sendFile(path.join(distDir, 'index.html'))
    })
  } else {
    app.get('/', (req, res) => {
      res.status(200).type('html').send(`
        <body style="font-family:system-ui;padding:40px;line-height:1.7">
          <h2>KA 销售系统 API 已启动</h2>
          <p>前端构建产物不存在。开发模式请访问 <a href="http://127.0.0.1:5173">http://127.0.0.1:5173</a>，
             或先执行 <code>npm run build</code> 后重新启动。</p>
          <p>接口自检：<a href="/api/health">/api/health</a></p>
        </body>`)
    })
  }

  // 统一错误出口：校验错误 400、未找到 404、其余 500，前端只认 message/details
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err)

    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: err.message, details: err.details })
    }
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: '请求体不是合法 JSON' })
    }
    console.error('[error]', err)
    res.status(500).json({ error: '服务器内部错误', message: err.message })
  })

  return app
}
