import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { initDb } from '../server/db.js'

const TEST_DB = 'data/test.db'

beforeEach(() => { fs.rmSync(TEST_DB, { force: true }) })
afterEach(() => { fs.rmSync(TEST_DB, { force: true }) })

test('initDb 创建 meta 表与 schema_version', () => {
  const db = initDb(TEST_DB)
  const meta = db.prepare('SELECT value FROM meta WHERE key = ?').get('schema_version')
  assert.ok(meta, 'meta.schema_version 应存在')
  assert.equal(meta.value, '1')
  db.close()
})

test('WAL 模式生效', () => {
  const db = initDb(TEST_DB)
  const row = db.prepare('PRAGMA journal_mode').get()
  assert.equal(row.journal_mode, 'wal')
  db.close()
})
