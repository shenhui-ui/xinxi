import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createServer } from 'node:http'
import { initDb } from '../server/db.js'
import { createApp } from '../server/index.js'

const TEST_DB = 'data/test-writings.db'
let db, app, server, base

beforeEach(async () => {
  fs.rmSync(TEST_DB, { force: true })
  db = initDb(TEST_DB)
  app = createApp(db)
  server = createServer(app)
  await new Promise((r) => server.listen(0, r))
  base = `http://127.0.0.1:${server.address().port}`
})
afterEach(async () => {
  server.closeAllConnections()
  await new Promise((r) => server.close(r))
  db.close()
  fs.rmSync(TEST_DB, { force: true })
})

async function call(method, urlPath, body) {
  const res = await fetch(base + urlPath, {
    method, headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { statusCode: res.status, body: await res.json() }
}

test('writings CRUD 与乐观锁', async () => {
  const created = await call('POST', '/api/writings', { title: '周报', scenario: 'weekly', content_html: '<p data-block="body">内容</p>' })
  assert.equal(created.statusCode, 200)
  const id = created.body.data.id
  const updated = await call('PUT', `/api/writings/${id}`, { title: '周报v2', version: 1 })
  assert.equal(updated.body.data.version, 2)
  const conflict = await call('PUT', `/api/writings/${id}`, { title: 'x', version: 1 })
  assert.equal(conflict.statusCode, 409)
  await call('DELETE', `/api/writings/${id}`)
  const trash = await call('GET', '/api/writings?deleted=1')
  assert.equal(trash.body.data.total, 1)
})
