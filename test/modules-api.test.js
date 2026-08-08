import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createServer } from 'node:http'
import { initDb } from '../server/db.js'
import { createApp } from '../server/index.js'

const TEST_DB = 'data/test-modules.db'
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
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { statusCode: res.status, body: await res.json() }
}

test('5 模块基本 CRUD 冒烟', async () => {
  const cases = [
    ['/api/meetings', { topic: '周例会', meeting_time: '2026-08-10' }],
    ['/api/documents', { title: '关于开展自查的通知', doc_type: '发文', doc_no: '2026-12号' }],
    ['/api/activities', { title: '赴基层调研', act_type: '调研', start_time: '2026-08-05' }],
    ['/api/seals', { applicant: '张三', approver: '李四', file_name: '合同', seal_time: '2026-08-06' }],
    ['/api/supplies', { name: 'A4纸', unit: '包', current_stock: 20 }],
  ]
  for (const [url, payload] of cases) {
    const created = await call('POST', url, payload)
    assert.equal(created.statusCode, 200, `${url} 创建`)
    const list = await call('GET', url)
    assert.equal(list.body.data.total, 1, `${url} 列表`)
    await call('DELETE', `${url}/${created.body.data.id}`)
    const trash = await call('GET', `${url}?deleted=1`)
    assert.equal(trash.body.data.total, 1, `${url} 回收站`)
    await call('POST', `${url}/${created.body.data.id}/restore`)
    const back = await call('GET', url)
    assert.equal(back.body.data.total, 1, `${url} 恢复`)
  }
})

test('物资入库/领用/流水', async () => {
  const created = await call('POST', '/api/supplies', { name: '打印纸', unit: '箱', current_stock: 10 })
  const id = created.body.data.id
  const inTx = await call('POST', `/api/supplies/${id}/transactions`, {
    changeType: '入库', quantity: 5, operator: '张三', targetVersion: 1,
  })
  assert.equal(inTx.statusCode, 200)
  assert.equal(inTx.body.data.current_stock, 15)
  const outTx = await call('POST', `/api/supplies/${id}/transactions`, {
    changeType: '领用', quantity: 3, operator: '李四', targetVersion: inTx.body.data.version,
  })
  assert.equal(outTx.statusCode, 200)
  assert.equal(outTx.body.data.current_stock, 12)
  const list = await call('GET', `/api/supplies/${id}/transactions`)
  assert.equal(list.body.data.list.length, 2)
  assert.equal(list.body.data.list[0].balance_after, 15)
})

test('库存不足领用被拒', async () => {
  const created = await call('POST', '/api/supplies', { name: '硒鼓', unit: '个', current_stock: 2 })
  const out = await call('POST', `/api/supplies/${created.body.data.id}/transactions`, {
    changeType: '领用', quantity: 5, operator: '王五', targetVersion: 1,
  })
  assert.equal(out.statusCode, 400)
  assert.equal(out.body.code, 40001)
})

test('领用缺 targetVersion 返回 400', async () => {
  const created = await call('POST', '/api/supplies', { name: '笔', unit: '支', current_stock: 5 })
  const out = await call('POST', `/api/supplies/${created.body.data.id}/transactions`, {
    changeType: '领用', quantity: 1, operator: '赵六',
  })
  assert.equal(out.statusCode, 400)
})

test('permanent 级联删除物资流水', async () => {
  const created = await call('POST', '/api/supplies', { name: 'A4纸', unit: '包', current_stock: 10 })
  await call('POST', `/api/supplies/${created.body.data.id}/transactions`, {
    changeType: '入库', quantity: 10, operator: '张三', targetVersion: 1,
  })
  await call('DELETE', `/api/supplies/${created.body.data.id}/permanent`)
  const list = await call('GET', `/api/supplies/${created.body.data.id}/transactions`)
  assert.equal(list.statusCode, 404)
})
