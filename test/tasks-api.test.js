import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createServer } from 'node:http'
import { initDb } from '../server/db.js'
import { createApp } from '../server/index.js'

let db, server, base
const TEST_DB = 'data/test-tasks.db'

beforeEach(async () => {
  fs.rmSync(TEST_DB, { force: true })
  db = initDb(TEST_DB)
  server = createServer(createApp(db))
  await new Promise((r) => server.listen(0, r))
  base = `http://127.0.0.1:${server.address().port}`
})
afterEach(async () => {
  server.closeAllConnections()
  await new Promise((r) => server.close(r))
  db.close()
  fs.rmSync(TEST_DB, { force: true })
})

async function call(method, path, body) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { statusCode: res.status, body: await res.json() }
}

test('POST /api/tasks 创建', async () => {
  const res = await call('POST', '/api/tasks', { title: 'x', status: '未启动' })
  assert.equal(res.statusCode, 200)
  assert.equal(res.body.code, 0)
  assert.equal(res.body.data.title, 'x')
  assert.ok(res.body.data.id)
})

test('GET /api/tasks 列表与分页', async () => {
  await call('POST', '/api/tasks', { title: 'a' })
  await call('POST', '/api/tasks', { title: 'b' })
  const out = await call('GET', '/api/tasks?page=1&pageSize=1')
  assert.equal(out.statusCode, 200)
  assert.equal(out.body.code, 0)
  assert.equal(out.body.data.list.length, 1)
  assert.equal(out.body.data.total, 2)
})

test('PUT 旧 version 返回 409', async () => {
  const created = await call('POST', '/api/tasks', { title: 'a' })
  await call('PUT', `/api/tasks/${created.body.data.id}`, { title: 'b', version: 1 })
  const res = await call('PUT', `/api/tasks/${created.body.data.id}`, { title: 'c', version: 1 })
  assert.equal(res.statusCode, 409)
  assert.equal(res.body.code, 409)
})

test('GET 已删除记录返回 40402', async () => {
  const created = await call('POST', '/api/tasks', { title: 'a' })
  await call('DELETE', `/api/tasks/${created.body.data.id}`)
  const res = await call('GET', `/api/tasks/${created.body.data.id}`)
  assert.equal(res.statusCode, 404)
  assert.equal(res.body.code, 40402)
})

test('GET 不存在返回 40401', async () => {
  const res = await call('GET', '/api/tasks/not-exist')
  assert.equal(res.statusCode, 404)
  assert.equal(res.body.code, 40401)
})

test('DELETE /permanent 物理删除', async () => {
  const created = await call('POST', '/api/tasks', { title: 'a' })
  const res = await call('DELETE', `/api/tasks/${created.body.data.id}/permanent`)
  assert.equal(res.statusCode, 200)
  const got = await call('GET', `/api/tasks/${created.body.data.id}`)
  assert.equal(got.statusCode, 404)
})

test('GET /trash-count', async () => {
  const created = await call('POST', '/api/tasks', { title: 'a' })
  await call('DELETE', `/api/tasks/${created.body.data.id}`)
  const out = await call('GET', '/api/tasks/trash-count')
  assert.equal(out.statusCode, 200)
  assert.equal(out.body.data.count, 1)
})
