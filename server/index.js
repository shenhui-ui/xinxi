const express = require('express')
const path = require('node:path')
const fs = require('node:fs')
const config = require('./config')
const { initDb } = require('./db')

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (e) {
    return e.code === 'EPERM'
  }
}

function acquireLock() {
  const lockPath = path.join(config.dataDir, '.instance.lock')
  if (fs.existsSync(lockPath)) {
    const pid = Number(fs.readFileSync(lockPath, 'utf8').trim())
    if (!Number.isInteger(pid) || pid <= 0 || !isProcessAlive(pid)) {
      fs.rmSync(lockPath, { force: true })
    } else {
      throw new Error(`服务已在运行（PID ${pid}）`)
    }
  }
  fs.writeFileSync(lockPath, String(process.pid))
  return () => fs.rmSync(lockPath, { force: true })
}

function createApp(db) {
  const app = express()
  app.use(express.json({ limit: '10mb' }))
  const publicDir = path.resolve(__dirname, '..', 'dist')
  if (fs.existsSync(publicDir)) {
    app.use(express.static(publicDir))
    // SPA history fallback：非 /api 的 GET 回退 index.html
    app.get(/^\/(?!api\/).*/, (req, res, next) => {
      if (req.method !== 'GET') return next()
      res.sendFile(path.join(publicDir, 'index.html'))
    })
  }
  app.use('/api', require('./routes')(db))
  app.use('/api', (req, res) => res.status(404).json({ code: 40403, message: '接口不存在' }))
  // 全局错误处理（Express 4 需四参数签名）
  app.use((err, req, res, next) => {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ code: 40001, message: '附件超过 20MB 限制' })
    }
    console.error('[WenXi] 未处理错误:', err.message)
    res.status(500).json({ code: 500, message: '服务器内部错误' })
  })
  return app
}

function start() {
  const release = acquireLock()
  const db = initDb()
  const app = createApp(db)
  const server = app.listen(config.port, () => {
    console.log(`[WenXi] 端口 ${config.port} 启动成功`)
  })
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`[WenXi] 端口 ${config.port} 被占用，已改用 ${config.port + 1}`)
      server.close()
      const server2 = app.listen(config.port + 1)
      server2.on('error', () => { console.log('[WenXi] 端口再次冲突，请手动设置 PORT'); process.exit(1) })
      return
    }
    throw err
  })
  const shutdown = () => { server.close(); db.close(); release(); process.exit(0) }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

if (require.main === module) start()
module.exports = { createApp, start, acquireLock }
