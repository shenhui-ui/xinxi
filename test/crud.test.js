import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { initDb } from '../server/db.js'
import { makeCrud } from '../server/db/crud.js'

const TEST_DB = 'data/test.db'
let db, crud

beforeEach(() => {
  fs.rmSync(TEST_DB, { force: true })
  db = initDb(TEST_DB)
  crud = makeCrud(db, {
    table: 'tasks',
    fields: ['title', 'task_type', 'status', 'deadline', 'cooperators', 'progress'],
    searchFields: ['title', 'assigner', 'source', 'cooperators'],
    sortable: ['created_at', 'deadline', 'status'],
  })
})
afterEach(() => { db.close(); fs.rmSync(TEST_DB, { force: true }) })

const base = { title: '测试任务', task_type: '重点工作', status: '进行中', deadline: '2026-08-30' }

test('create 后 list 分页返回', () => {
  crud.create(base)
  const out = crud.list({ page: '1', pageSize: '10' })
  assert.equal(out.total, 1)
  assert.equal(out.list[0].title, '测试任务')
  assert.equal(out.list[0].version, 1)
  assert.equal(out.list[0].deleted_at, null)
})

test('keyword 跨字段搜索', () => {
  crud.create(base)
  crud.create({ ...base, title: '另一个', assigner: '张三' })
  const out = crud.list({ keyword: '张三' })
  assert.equal(out.total, 1)
  assert.equal(out.list[0].title, '另一个')
})

test('update 带 version 成功，旧 version 失败标记 changed=0', () => {
  const created = crud.create(base)
  const r1 = crud.update(created.id, { ...base, title: '改后', version: 1 })
  assert.equal(r1.changed, 1)
  assert.equal(r1.row.version, 2)
  const r2 = crud.update(created.id, { ...base, title: '旧版本提交', version: 1 })
  assert.equal(r2.changed, 0)
  assert.ok(r2.exists, '行仍存在')
})

test('update 不带 version 返回 changed=0', () => {
  const created = crud.create(base)
  assert.equal(crud.update(created.id, { title: 'x' }).changed, 0)
})

test('remove 软删后 list 不含，deleted=1 含，trashCount 正确', () => {
  const created = crud.create(base)
  crud.remove(created.id)
  assert.equal(crud.list({}).total, 0)
  const trash = crud.list({ deleted: '1' })
  assert.equal(trash.total, 1)
  assert.ok(trash.list[0].deleted_at)
  assert.deepEqual(crud.trashCount(), { count: 1 })
})

test('restore 恢复并 version+1', () => {
  const created = crud.create(base)
  crud.remove(created.id)
  const r = crud.restore(created.id)
  assert.equal(r.changed, 1)
  const row = crud.get(created.id)
  assert.equal(row.deleted_at, null)
  assert.equal(row.version, 3)
})

test('permanent 物理删除且级联 children', () => {
  const s = makeCrud(db, {
    table: 'supplies',
    fields: ['name', 'unit', 'current_stock'],
    searchFields: ['name'],
    sortable: ['created_at'],
    children: [{ table: 'supply_transactions', fk: 'supply_id' }],
  })
  const created = s.create({ name: 'A4纸', unit: '包', current_stock: 10 })
  db.prepare('INSERT INTO supply_transactions (id, supply_id, change_type, quantity, balance_after, transacted_at, created_at) VALUES (?,?,?,?,?,?,?)')
    .run('t1', created.id, '入库', 10, 10, '2026-08-01', '2026-08-01')
  s.permanent(created.id)
  const rows = db.prepare('SELECT COUNT(*) c FROM supply_transactions WHERE supply_id = ?').get(created.id)
  assert.equal(rows.c, 0)
  assert.equal(s.get(created.id), undefined)
})

test('create 只接受白名单字段', () => {
  const created = crud.create({ ...base, evil: 'hack', title: 'ok' })
  const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(created.id)
  assert.equal(row.evil, undefined)
})

test('sortable 校验，非白名单排序列忽略', () => {
  crud.create({ ...base, title: 'a' })
  crud.create({ ...base, title: 'b' })
  const out = crud.list({ sort: 'deadline', order: 'desc' })
  assert.equal(out.list.length, 2)
  const out2 = crud.list({ sort: 'evil_col', order: 'desc' })
  assert.equal(out2.list.length, 2)
})
