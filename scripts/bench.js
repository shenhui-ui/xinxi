// 性能基准：列表 / 统计场景 100 次采样 p95，结果写入 docs/perf.md
// 导出场景未纳入：POST /api/export/excel 在行数 >5000 时转异步 jobId，自动采样无法覆盖同步分支，由人工验收
const fs = require('node:fs')
const path = require('node:path')
const { initDb } = require('../server/db')
const { createApp } = require('../server/index')

async function sample(base, url, n) {
  const times = []
  for (let i = 0; i < n; i++) {
    const t0 = performance.now()
    const res = await fetch(base + url)
    if (!res.ok) throw new Error(`请求失败 ${url}: ${res.status}`)
    times.push(performance.now() - t0)
  }
  times.sort((a, b) => a - b)
  return times[Math.floor(n * 0.95)]
}

async function main() {
  const db = initDb('data/seed.db')
  const app = createApp(db)
  const server = app.listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  const base = `http://127.0.0.1:${server.address().port}`

  const scenarios = [
    ['列表+keyword', '/api/tasks?page=1&pageSize=20&keyword=任务1', 100, '<200ms'],
    ['统计 monthly', '/api/stats/monthly?year=2026&month=08', 100, '<500ms'],
  ]

  const rows = []
  for (const [name, url, n, target] of scenarios) {
    const p95 = await sample(base, url, n)
    rows.push([name, n, target, `${p95.toFixed(1)}ms`])
    console.log(`${name}: p95=${p95.toFixed(1)}ms (${n} 次采样)`)
  }

  const md = [
    '# 性能基准',
    '',
    '数据量：10000 条 tasks（data/seed.db，`npm run seed 10000` 生成）',
    '运行方式：`npm run bench`',
    '| 场景 | 采样数 | p95 目标 | 实测 p95 |',
    '|---|---|---|---|',
    ...rows.map(([name, n, target, p95]) => `| ${name} | ${n} | ${target} | ${p95} |`),
    '',
    '注：导出场景未纳入自动基准——POST /api/export/excel 在行数 >5000 时转异步 jobId，采样无法覆盖同步分支；同步导出（≤5000 行）的 5s 目标由人工验收。',
    '',
  ].join('\n')
  fs.writeFileSync(path.join(__dirname, '..', 'docs', 'perf.md'), md)
  console.log('已写入 docs/perf.md')

  server.close()
  db.close()
}

main().catch((e) => { console.error(e); process.exit(1) })
