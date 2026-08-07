import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createServer } from 'node:http'
import { initDb } from '../server/db.js'
import { createApp } from '../server/index.js'

const TEST_DB = 'data/test-stats.db'
let db, app, server, base

beforeEach(async () => {
  fs.rmSync(TEST_DB, { force: true })
  db = initDb(TEST_DB)
  app = createApp(db)
  server = createServer(app)
  await new Promise((r) => server.listen(0, r))
  base = `http://127.0.0.1:${server.address().port}`
})
afterEach(async () => { server.close(); db.close(); fs.rmSync(TEST_DB, { force: true }) })

async function call(method, path, body) {
  const res = await fetch(base + path, {
    method, headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { statusCode: res.status, body: await res.json() }
}

function thisMonth() {
  const now = new Date()
  return { year: now.getFullYear(), month: String(now.getMonth() + 1).padStart(2, '0') }
}

const ym = () => `year=${thisMonth().year}&month=${thisMonth().month}`

test('monthly 聚合各模块计数', async () => {
  await call('POST', '/api/tasks', { title: 'a' })
  await call('POST', '/api/tasks', { title: 'b' })
  await call('POST', '/api/meetings', { topic: '例会' })
  const out = await call('GET', `/api/stats/monthly?${ym()}`)
  assert.equal(out.statusCode, 200)
  assert.equal(out.body.data.counts.tasks, 2)
  assert.equal(out.body.data.counts.meetings, 1)
  assert.equal(out.body.data.counts.documents, 0)
})

test('monthly byStatus 分组', async () => {
  await call('POST', '/api/tasks', { title: 'a', status: '进行中' })
  await call('POST', '/api/tasks', { title: 'b', status: '已完成' })
  const out = await call('GET', `/api/stats/monthly?${ym()}`)
  assert.equal(out.body.data.byStatus.tasks['进行中'], 1)
  assert.equal(out.body.data.byStatus.tasks['已完成'], 1)
})

test('trend 按日趋势', async () => {
  await call('POST', '/api/tasks', { title: 'a' })
  const { year, month } = thisMonth()
  const lastDay = new Date(year, month, 0).getDate()
  const out = await call('GET', `/api/stats/trend?from=${year}-${month}-01&to=${year}-${month}-${String(lastDay).padStart(2, '0')}`)
  assert.equal(out.statusCode, 200)
  assert.ok(out.body.data.days.length >= 1)
  assert.equal(out.body.data.byModule.tasks, 1)
})

test('trend to 当天记录计入', async () => {
  await call('POST', '/api/tasks', { title: '月末任务' })
  const { year, month } = thisMonth()
  const lastDay = new Date(year, month, 0).getDate()
  const out = await call('GET', `/api/stats/trend?from=${year}-${month}-01&to=${year}-${month}-${String(lastDay).padStart(2, '0')}`)
  assert.equal(out.statusCode, 200)
  assert.equal(out.body.data.byModule.tasks, 1)
  const today = new Date().toISOString().slice(0, 10)
  assert.ok(out.body.data.days.some((d) => d.date === today), '今天应出现在 days 中')
})

test('软删记录不计入统计', async () => {
  const created = await call('POST', '/api/tasks', { title: 'a' })
  await call('DELETE', `/api/tasks/${created.body.data.id}`)
  const out = await call('GET', `/api/stats/monthly?${ym()}`)
  assert.equal(out.body.data.counts.tasks, 0)
})
