import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { initDb } from '../server/db.js'
import { cleanupExports, cleanupAttachments, exportsDir } from '../server/export/cleanup.js'
import { attachDir } from '../server/utils/storage.js'

const TEST_DB = 'data/test-cleanup.db'
let db

beforeEach(() => {
  fs.rmSync(TEST_DB, { force: true })
  fs.rmSync('data/exports', { recursive: true, force: true })
  fs.rmSync('data/attachments', { recursive: true, force: true })
  db = initDb(TEST_DB)
})
afterEach(() => {
  db.close()
  fs.rmSync(TEST_DB, { force: true })
  fs.rmSync('data/exports', { recursive: true, force: true })
  fs.rmSync('data/attachments', { recursive: true, force: true })
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
