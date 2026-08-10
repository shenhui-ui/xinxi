import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

process.env.WENXI_DATA_DIR = path.resolve('data', 'test-cleanup-data')

const { initDb } = await import('../server/db.js')
const { cleanupExports, cleanupAttachments, exportsDir } = await import('../server/export/cleanup.js')
const { attachDir } = await import('../server/utils/storage.js')

const TEST_DATA_DIR = path.resolve('data/test-cleanup-data')
const TEST_DB = path.join(TEST_DATA_DIR, 'cleanup.db')
let db

beforeEach(() => {
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true })
  db = initDb(TEST_DB)
})
afterEach(() => {
  db.close()
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true })
})

test('cleanupExports 删除过期行+文件', () => {
  fs.mkdirSync(exportsDir(), { recursive: true })
  fs.writeFileSync(path.join(exportsDir(), 'expired.docx'), 'x')
  fs.writeFileSync(path.join(exportsDir(), 'live.docx'), 'y')
  db.prepare(`INSERT INTO exports (id, biz_type, file_id, display_name, status, expires_at, created_at) VALUES ('e1','word','expired.docx','a.docx','done','2026-07-01','2026-07-01')`).run()
  db.prepare(`INSERT INTO exports (id, biz_type, file_id, display_name, status, expires_at, created_at) VALUES ('e2','word','live.docx','b.docx','done','2099-01-01','2026-08-01')`).run()
  cleanupExports(db, { now: '2026-08-07' })
  assert.equal(db.prepare('SELECT COUNT(*) c FROM exports').get().c, 1)
  assert.ok(!fs.existsSync(path.join(exportsDir(), 'expired.docx')))
  assert.ok(fs.existsSync(path.join(exportsDir(), 'live.docx')))
})

test('cleanupAttachments 删除 7 天前软删附件', () => {
  fs.mkdirSync(attachDir(), { recursive: true })
  fs.writeFileSync(path.join(attachDir(), 'old.bin'), 'x')
  fs.writeFileSync(path.join(attachDir(), 'new.bin'), 'y')
  db.prepare(`INSERT INTO attachments (id, biz_type, biz_id, server_file_name, display_name, file_size, mime_type, uploaded_at, deleted_at, version) VALUES ('a1','tasks','t1','old.bin','o',1,'txt','2026-07-01','2026-07-30T10:00:00+08:00',1)`).run()
  db.prepare(`INSERT INTO attachments (id, biz_type, biz_id, server_file_name, display_name, file_size, mime_type, uploaded_at, deleted_at, version) VALUES ('a2','tasks','t1','new.bin','n',1,'txt','2026-08-06','2026-08-06T10:00:00+08:00',1)`).run()
  cleanupAttachments(db, { now: '2026-08-07' })
  assert.ok(!fs.existsSync(path.join(attachDir(), 'old.bin')))
  assert.ok(fs.existsSync(path.join(attachDir(), 'new.bin')), '7 天内软删保留')
})

test('清理操作不触碰真实 data/attachments 与 data/exports', () => {
  const realAttach = path.resolve('data/attachments')
  const realExports = path.resolve('data/exports')
  fs.mkdirSync(realAttach, { recursive: true })
  fs.mkdirSync(realExports, { recursive: true })
  fs.writeFileSync(path.join(realAttach, 'keep.bin'), 'real')
  fs.writeFileSync(path.join(realExports, 'keep.xlsx'), 'real')
  try {
    fs.mkdirSync(exportsDir(), { recursive: true })
    fs.mkdirSync(attachDir(), { recursive: true })
    cleanupExports(db, { now: '2099-01-01' })
    cleanupAttachments(db, { now: '2099-01-01' })
    assert.ok(fs.existsSync(path.join(realAttach, 'keep.bin')), '真实附件目录未被清理')
    assert.ok(fs.existsSync(path.join(realExports, 'keep.xlsx')), '真实导出目录未被清理')
  } finally {
    fs.rmSync(path.join(realAttach, 'keep.bin'), { force: true })
    fs.rmSync(path.join(realExports, 'keep.xlsx'), { force: true })
  }
})
