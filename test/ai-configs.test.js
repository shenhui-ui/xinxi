import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createServer } from 'node:http'
import { initDb } from '../server/db.js'
import { createApp, checkSecretWithEncryptedData } from '../server/index.js'
import { maskKey } from '../server/routes/ai-configs.js'

const TEST_DB = 'data/test-ai-configs.db'
let tmpDir, db, app, server, base

beforeEach(async () => {
  fs.rmSync(TEST_DB, { force: true })
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wenxi-aicfg-'))
  process.env.WENXI_SECRET_PATH = path.join(tmpDir, '.secret')
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
  delete process.env.WENXI_SECRET_PATH
  fs.rmSync(TEST_DB, { force: true })
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

async function call(method, urlPath, body) {
  const res = await fetch(base + urlPath, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { statusCode: res.status, body: await res.json() }
}

test('创建配置后列表只回掩码，库里存密文', async () => {
  const created = await call('POST', '/api/ai/configs', { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', apiKey: 'sk-abcdef123456', modelName: 'deepseek-chat' })
  assert.equal(created.statusCode, 200)
  const id = created.body.data.id
  const list = await call('GET', '/api/ai/configs')
  assert.equal(list.body.data.list.length, 1)
  assert.equal(list.body.data.list[0].api_key_mask, 'sk-****3456')
  assert.equal(list.body.data.list[0].api_key, undefined)
  const row = db.prepare('SELECT api_key_enc FROM ai_configs WHERE id = ?').get(id)
  assert.ok(row.api_key_enc, '密文已存储')
  const { decryptText } = await import('../server/crypto.js')
  assert.equal(decryptText(Buffer.from(row.api_key_enc)), 'sk-abcdef123456')
})

test('更新时 apiKey 为空保留原密文', async () => {
  const created = await call('POST', '/api/ai/configs', { name: 'A', baseUrl: 'u', apiKey: 'sk-old-secret', modelName: 'm' })
  const id = created.body.data.id
  const updated = await call('POST', '/api/ai/configs', { id, name: 'A2', baseUrl: 'u2', modelName: 'm2', version: 1 })
  assert.equal(updated.statusCode, 200)
  assert.equal(updated.body.data.name, 'A2')
  const list = await call('GET', '/api/ai/configs')
  assert.equal(list.body.data.list[0].api_key_mask, maskKey('sk-old-secret'))
  const { decryptText } = await import('../server/crypto.js')
  const row = db.prepare('SELECT api_key_enc FROM ai_configs WHERE id = ?').get(id)
  assert.equal(decryptText(Buffer.from(row.api_key_enc)), 'sk-old-secret')
})

test('active 接口返回 is_active 配置，置激活', async () => {
  const a = await call('POST', '/api/ai/configs', { name: 'A', baseUrl: 'u', apiKey: 'sk-aaaa', modelName: 'm', isActive: true })
  const active = await call('GET', '/api/ai/configs/active')
  assert.equal(active.body.data.id, a.body.data.id)
  assert.equal(active.body.data.is_active, 1)
})

test('test 接口：configId 优先于 apiKey', async () => {
  const created = await call('POST', '/api/ai/configs', { name: 'A', baseUrl: 'http://127.0.0.1:1/v1', apiKey: 'sk-x', modelName: 'm' })
  const r = await call('POST', '/api/ai/test', { configId: created.body.data.id, apiKey: 'sk-other' })
  assert.notEqual(r.body.code, 40002)
  assert.equal(r.statusCode, 502)
})

test('test 接口：configId 不存在返回 40401', async () => {
  const r = await call('POST', '/api/ai/test', { configId: 'not-exist' })
  assert.equal(r.statusCode, 404)
  assert.equal(r.body.code, 40401)
})

test('test 接口：均空返回 40002', async () => {
  const r = await call('POST', '/api/ai/test', {})
  assert.equal(r.statusCode, 400)
  assert.equal(r.body.code, 40002)
})

test('test 接口：密文无法解密返回 40001', async () => {
  const created = await call('POST', '/api/ai/configs', { name: 'A', baseUrl: 'u', apiKey: 'sk-x', modelName: 'm' })
  db.prepare('UPDATE ai_configs SET api_key_enc = ? WHERE id = ?').run(Buffer.from('garbage-not-encrypted'), created.body.data.id)
  const r = await call('POST', '/api/ai/test', { configId: created.body.data.id })
  assert.equal(r.statusCode, 400)
  assert.equal(r.body.code, 40001)
})

test('更新 active 配置自身不冲突且保持 active', async () => {
  const a = await call('POST', '/api/ai/configs', { name: 'A', baseUrl: 'u1', apiKey: 'sk-aaaa', modelName: 'm', isActive: true })
  await call('POST', '/api/ai/configs', { name: 'B', baseUrl: 'u2', apiKey: 'sk-bbbb', modelName: 'm2', isActive: true })
  const up = await call('POST', '/api/ai/configs', { id: a.body.data.id, name: 'A2', baseUrl: 'u1x', apiKey: '', modelName: 'm', isActive: true, version: 1 })
  assert.equal(up.statusCode, 200)
  const active = await call('GET', '/api/ai/configs/active')
  assert.equal(active.body.data.id, a.body.data.id)
})

test('创建新 active 配置时旧配置被清除', async () => {
  await call('POST', '/api/ai/configs', { name: 'A', baseUrl: 'u', apiKey: 'sk-a', modelName: 'm', isActive: true })
  await call('POST', '/api/ai/configs', { name: 'B', baseUrl: 'u', apiKey: 'sk-b', modelName: 'm', isActive: true })
  const active = await call('GET', '/api/ai/configs/active')
  assert.equal(active.body.data.name, 'B')
})

test('maskKey 边界', () => {
  assert.equal(maskKey('sk-abcdef123456'), 'sk-****3456')
  assert.equal(maskKey('short'), '****')
  assert.equal(maskKey(''), '')
})

test('缺少密钥文件且有加密配置 → 拒绝启动', async () => {
  await call('POST', '/api/ai/configs', { name: 'A', baseUrl: 'u', apiKey: 'sk-abc', modelName: 'm' })
  fs.rmSync(process.env.WENXI_SECRET_PATH, { force: true })
  assert.throws(() => checkSecretWithEncryptedData(db), /缺少密钥文件/)
})
