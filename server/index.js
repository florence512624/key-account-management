import { createApp } from './app.js'
import { closeDb, DB_FILE } from './db.js'
import { OLLAMA_BASE, DEFAULT_MODEL, TIMEOUT_MS } from './ollama.js'

const PORT = Number(process.env.PORT || 5174)
const HOST = process.env.HOST || '127.0.0.1'

const app = createApp()

const server = app.listen(PORT, HOST, () => {
  console.log(`
  Key Account Management · 大客户销售管理系统
  ────────────────────────────────────────────
  API   http://${HOST}:${PORT}/api/health
  前端  ${process.env.NODE_ENV === 'production' ? `http://${HOST}:${PORT}` : '开发模式请另开 vite: http://127.0.0.1:5173'}
  数据库 ${DB_FILE}
  Ollama ${OLLAMA_BASE}  模型 ${DEFAULT_MODEL}  超时 ${TIMEOUT_MS / 1000}s
  ────────────────────────────────────────────`)
})

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`端口 ${PORT} 已被占用。可执行：PORT=5180 npm start`)
    process.exit(1)
  }
  throw err
})

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    server.close(() => {
      closeDb()
      process.exit(0)
    })
  })
}
