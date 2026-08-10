import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createServer } from 'node:http'

process.env.WENXI_DATA_DIR = path.resolve('data/test-export-data')

const { initDb } = await import('../server/db.js')
const { createApp } = await import('../server/index.js')

const TEST_DB = 'data/test-export.db'
const EXPORTS_DIR = path.join(process.env.WENXI_DATA_DIR, 'exports')
let db, app, server, base

beforeEach(async () => {
  fs.rmSync(TEST_DB, { force: true })
  fs.rmSync(EXPORTS_DIR, { recursive: true, force: true })
  db = initDb(TEST_DB)
  app = createApp(db)
  server = createServer(app)
  await new Promise((r) => server.listen(0, r))
  base = `http://127.0.0.1:${server.address().port}`
})
afterEach(async () => {
  server.close(); db.close()
  fs.rmSync(TEST_DB, { force: true })
  fs.rmSync(EXPORTS_DIR, { recursive: true, force: true })
})

async function call(method, urlPath, body) {
  const res = await fetch(base + urlPath, {
    method, headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => null)
  const data = json && json.code === 0 ? json.data : json
  return { statusCode: res.status, body: data }
}

const html = '<p data-block="body">测试内容</p>'

test('word 导出成功返回 fileId 并写历史', async () => {
  const r = await call('POST', '/api/export/word', { format: 'internal', forceBanji: false, contentHtml: html, title: '测试', docNo: '' })
  assert.equal(r.statusCode, 200)
  assert.ok(r.body.fileId)
  assert.ok(r.body.url.includes('/api/export/download/'))
  const hist = await call('GET', '/api/exports?bizType=word')
  assert.equal(hist.body.list.length, 1)
  assert.equal(hist.body.list[0].status, 'done')
})

test('GB/T 缺文号返回 40003', async () => {
  const r = await call('POST', '/api/export/word', { format: 'gbt', forceBanji: false, contentHtml: html, title: 't', docNo: '' })
  assert.equal(r.statusCode, 400)
  assert.equal(r.body.code, 40003)
})

test('下载成功且 Content-Disposition 带文件名', async () => {
  const r = await call('POST', '/api/export/word', { format: 'internal', forceBanji: false, contentHtml: html, title: '测试公文', docNo: '' })
  const dl = await fetch(base + `/api/export/download/${r.body.fileId}`)
  assert.equal(dl.status, 200)
  assert.ok(decodeURIComponent(dl.headers.get('content-disposition')).includes('测试公文.docx'))
})

test('writings 导出联动：回写 exported 状态，旧 version 冲突 409', async () => {
  const w = await call('POST', '/api/writings', { title: '周报', scenario: 'weekly', content_html: html, status: 'saved' })
  const r = await call('POST', '/api/export/word', { format: 'internal', forceBanji: false, contentHtml: html, title: '周报', docNo: '', writingId: w.body.id, targetVersion: 1 })
  assert.equal(r.statusCode, 200)
  const got = await call('GET', `/api/writings/${w.body.id}`)
  assert.equal(got.body.status, 'exported')
  assert.ok(got.body.exported_at)
  const conflict = await call('POST', '/api/export/word', { format: 'internal', forceBanji: false, contentHtml: html, title: 'x', docNo: '', writingId: w.body.id, targetVersion: 1 })
  assert.equal(conflict.statusCode, 409)
})

test('excel 同步导出（≤5000）', async () => {
  for (let i = 0; i < 10; i++) {
    await call('POST', '/api/tasks', { title: `t${i}`, status: '进行中' })
  }
  const r = await call('POST', '/api/export/excel', { module: 'tasks', filters: {}, fieldKeys: ['title', 'status'], pageSize: 5000 })
  assert.equal(r.statusCode, 200)
  assert.ok(r.body.fileId)
  const dl = await fetch(base + `/api/export/download/${r.body.fileId}`)
  assert.equal(dl.status, 200)
})

test('excel 超 5000 转异步返回 jobId', async () => {
  const insert = db.prepare(`INSERT INTO tasks (id, title, status, created_by, created_at, updated_at, version) VALUES (?,?,?,'','2026-08-01','2026-08-01',1)`)
  for (let i = 0; i < 5001; i++) insert.run(`e${i}`, `任务${i}`, '进行中')
  const r = await call('POST', '/api/export/excel', { module: 'tasks', filters: {}, fieldKeys: ['title'], pageSize: 10000 })
  assert.equal(r.statusCode, 200)
  assert.ok(r.body.jobId)
  for (let i = 0; i < 20; i++) {
    const st = await call('GET', `/api/export/status/${r.body.jobId}`)
    if (st.body.status === 'done') {
      assert.ok(st.body.fileId)
      return
    }
    await new Promise((r2) => setTimeout(r2, 50))
  }
  assert.fail('job 未在超时前完成')
})

test('下载过期文件返回 41001', async () => {
  const r = await call('POST', '/api/export/word', { format: 'internal', forceBanji: false, contentHtml: html, title: 't', docNo: '' })
  db.prepare('UPDATE exports SET expires_at = ? WHERE file_id = ?').run('2020-01-01', r.body.fileId)
  const dl = await fetch(base + `/api/export/download/${r.body.fileId}`)
  assert.equal(dl.status, 410)
  const body = await dl.json()
  assert.equal(body.code, 41001)
})

test('excel 未知 fieldKey 忽略不报错', async () => {
  await call('POST', '/api/tasks', { title: 'a' })
  const r = await call('POST', '/api/export/excel', { module: 'tasks', filters: {}, fieldKeys: ['title', 'hack_col'], pageSize: 5000 })
  assert.equal(r.statusCode, 200)
})

test('writings 导出 409 回滚：不残留 exports 行与文件', async () => {
  const w = await call('POST', '/api/writings', { title: '周报', scenario: 'weekly', content_html: html, status: 'saved' })
  await call('POST', '/api/export/word', { format: 'internal', forceBanji: false, contentHtml: html, title: '周报', docNo: '', writingId: w.body.id, targetVersion: 1 })
  const conflict = await call('POST', '/api/export/word', { format: 'internal', forceBanji: false, contentHtml: html, title: 'x', docNo: '', writingId: w.body.id, targetVersion: 1 })
  assert.equal(conflict.statusCode, 409)
  const hist = await call('GET', `/api/exports?writingId=${w.body.id}`)
  assert.equal(hist.body.list.length, 1, '409 失败不应残留 exports 行')
  const files = fs.readdirSync(EXPORTS_DIR)
  assert.equal(files.length, 1, '409 失败不应残留物理文件')
})

test('pending 超过 1 小时置 failed', async () => {
  db.prepare(`INSERT INTO exports (id, job_id, biz_type, writing_id, format, filter_json, file_id, display_name, status, message, expires_at, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run('t1', 'stale-job', 'excel', null, null, '{}', null, 'x', 'pending', null, '2099-01-01', '2026-01-01T00:00:00+08:00')
  const st = await call('GET', '/api/export/status/stale-job')
  assert.equal(st.body.status, 'failed')
  assert.ok(st.body.message.includes('超时'))
  assert.equal(db.prepare('SELECT status FROM exports WHERE job_id = ?').get('stale-job').status, 'failed', 'DB 状态同步更新')
})
