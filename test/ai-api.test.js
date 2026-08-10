import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createServer } from 'node:http'
import { initDb } from '../server/db.js'
import { createApp } from '../server/index.js'
import { setProviderFactory } from '../server/ai/index.js'

const TEST_DB = 'data/test-ai.db'
let tmpDir, db, app, server, base

function fakeProvider(opts = {}) {
  return () => ({
    chatStream: async ({ onChunk }) => {
      if (opts.error) throw new Error(opts.error)
      for (const c of (opts.chunks || ['生成', '内容'])) onChunk(c)
    },
    testConnection: async () => ({ ok: true, latencyMs: 1 }),
  })
}

beforeEach(async () => {
  fs.rmSync(TEST_DB, { force: true })
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wenxi-ai-'))
  process.env.WENXI_SECRET_PATH = path.join(tmpDir, '.secret')
  db = initDb(TEST_DB)
  app = createApp(db)
  server = createServer(app)
  await new Promise((r) => server.listen(0, r))
  base = `http://127.0.0.1:${server.address().port}`
  setProviderFactory(fakeProvider())
  const { encryptText } = await import('../server/crypto.js')
  db.prepare(`INSERT INTO ai_configs (id, name, base_url, api_key_enc, model_name, is_active, created_at, updated_at, version) VALUES ('cfg1','fake','http://fake/v1',?,'m',1,'2026-08-01','2026-08-01',1)`).run(encryptText('sk-fake'))
})
afterEach(async () => {
  server.closeAllConnections()
  await new Promise((r) => server.close(r))
  db.close()
  setProviderFactory(null)
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
  const text = await res.text()
  return { statusCode: res.status, text, body: safeJson(text) }
}
function safeJson(t) { try { return JSON.parse(t) } catch { return null } }

test('write weekly 流式返回生成内容', async () => {
  const res = await call('POST', '/api/ai/write', { scenario: 'weekly', dateFrom: '2026-08-01', dateTo: '2026-08-07' })
  assert.equal(res.statusCode, 200)
  assert.ok(res.text.includes('生成'))
  assert.ok(res.text.includes('内容'))
})

test('write report bizRefs 超 50 条拒绝', async () => {
  const ids = Array.from({ length: 51 }, (_, i) => `t${i}`)
  const res = await call('POST', '/api/ai/write', { scenario: 'report', bizRefs: [{ bizType: 'tasks', ids }] })
  assert.equal(res.statusCode, 400)
})

test('write report bizRefs 为空且无 extraNotes 拒绝', async () => {
  const res = await call('POST', '/api/ai/write', { scenario: 'report' })
  assert.equal(res.statusCode, 400)
})

test('write draft 两种输入冲突拒绝', async () => {
  const res = await call('POST', '/api/ai/write', { scenario: 'draft', genre: '通知', subject: 'x', keyPoints: ['a'], pasteText: 'y' })
  assert.equal(res.statusCode, 400)
})

test('polish 超 20000 字符拒绝', async () => {
  const res = await call('POST', '/api/ai/polish', { text: 'x'.repeat(20001), mode: 'polish' })
  assert.equal(res.statusCode, 400)
})

test('polish 正常流式返回', async () => {
  const res = await call('POST', '/api/ai/polish', { text: '这段文字需要润色。', mode: 'polish' })
  assert.equal(res.statusCode, 200)
  assert.ok(res.text.includes('生成'))
})

test('chat 返回流式内容', async () => {
  const res = await call('POST', '/api/ai/chat', { messages: [{ role: 'user', content: 'hi' }] })
  assert.equal(res.statusCode, 200)
  assert.ok(res.text.includes('内容'))
})

test('无激活配置时 write 返回 400', async () => {
  db.prepare('UPDATE ai_configs SET is_active = 0 WHERE id = ?').run('cfg1')
  const res = await call('POST', '/api/ai/write', { scenario: 'draft', genre: '通知', subject: 'x', keyPoints: ['a'] })
  assert.equal(res.statusCode, 400)
})

test('上游错误脱敏（SSE error 事件不含 key）', async () => {
  setProviderFactory(fakeProvider({ error: 'boom sk-leak-123' }))
  const res = await call('POST', '/api/ai/chat', { messages: [{ role: 'user', content: 'hi' }] })
  assert.ok(res.text.includes('event: error'))
  assert.ok(!res.text.includes('sk-leak-123'), '错误事件不得透传上游原始信息')
})

test('weekly 聚合排除软删', async () => {
  await call('POST', '/api/tasks', { title: '活任务' })
  const created = await call('POST', '/api/tasks', { title: '删掉' })
  await call('DELETE', `/api/tasks/${created.body.data.id}`)
  const { aggregateWeekly } = await import('../server/ai/aggregate.js')
  const out = aggregateWeekly(db, '2026-01-01', '2026-12-31')
  assert.ok(out.includes('活任务'))
  assert.ok(!out.includes('删掉'))
})

test('weekly 聚合 200 条截断并注明', async () => {
  const { aggregateWeekly } = await import('../server/ai/aggregate.js')
  for (let i = 0; i < 250; i++) {
    db.prepare(`INSERT INTO tasks (id, title, status, created_by, created_at, updated_at, version) VALUES (?,?,?,?,'2026-08-01T00:00:00','2026-08-01',1)`)
      .run(`seed${i}`, `批量任务${i}`, '进行中', '')
  }
  const out = aggregateWeekly(db, '2026-08-01', '2026-08-31')
  assert.ok(out.includes('另有 50 条未列出') || out.includes('未列出'))
  assert.ok(!out.includes('批量任务249'), '超限记录不注入')
})
