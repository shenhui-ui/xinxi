import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createServer } from 'node:http'
import { initDb } from '../server/db.js'
import { createApp } from '../server/index.js'
import { resolveAttachmentPath } from '../server/utils/storage.js'

const TEST_DB = 'data/test-attachments.db'
let db, app, server, base

beforeEach(async () => {
  fs.rmSync(TEST_DB, { force: true })
  fs.rmSync('data/attachments', { recursive: true, force: true })
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
  fs.rmSync('data/attachments', { recursive: true, force: true })
})

async function upload(name, content, bizType = 'tasks', bizId = 't1') {
  const form = new FormData()
  form.append('file', new Blob([content], { type: 'text/plain' }), name)
  form.append('bizType', bizType)
  form.append('bizId', bizId)
  return fetch(`${base}/api/attachments`, { method: 'POST', body: form })
}

test('上传并列出', async () => {
  const res = await upload('a.txt', 'hello')
  assert.equal(res.status, 200)
  const row = await res.json()
  assert.equal(row.data.display_name, 'a.txt')
  assert.ok(row.data.server_file_name !== 'a.txt', '磁盘名必须 uuid')
  const list = await (await fetch(`${base}/api/attachments?bizType=tasks&bizId=t1`)).json()
  assert.equal(list.data.list.length, 1)
})

test('下载内容正确且文件名取自 display_name', async () => {
  const res = await upload('报告.txt', '公文内容')
  const { data } = await res.json()
  const dl = await fetch(`${base}/api/attachments/${data.id}/download`)
  assert.equal(dl.status, 200)
  assert.equal(await dl.text(), '公文内容')
  assert.ok(dl.headers.get('content-disposition').includes('filename*=UTF-8'))
})

test('路径遍历防护', () => {
  assert.throws(() => resolveAttachmentPath('../../../.env.example'), /路径越界/)
  assert.throws(() => resolveAttachmentPath('/etc/passwd'), /路径越界/)
  // 正常 uuid 文件名不抛
  assert.doesNotThrow(() => resolveAttachmentPath('abc-def.bin'))
})

test('软删后下载返回 40402', async () => {
  const res = await upload('a.txt', 'x')
  const { data } = await res.json()
  await fetch(`${base}/api/attachments/${data.id}`, { method: 'DELETE' })
  const dl = await fetch(`${base}/api/attachments/${data.id}/download`)
  assert.equal(dl.status, 404)
  const body = await dl.json()
  assert.equal(body.code, 40402)
  assert.ok(body.data.deletedAt, 'deletedAt 应随 40402 返回')
})
