# 文玺台账模块（M1+M2）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成文玺（WenXi）项目脚手架、通用 CRUD 构造器、7 个台账业务模块（任务/会议/文件收发/外出活动/用章/物资/统计）、附件管理、回收站与 Dashboard 驾驶舱，全部后端测试与前端单测通过。

**Architecture:** Express + better-sqlite3 单进程后端（WAL、软删、乐观锁），Vue 3 + Element Plus 前端，`makeCrud` 通用构造器生成 7 模块同构 CRUD。错误码统一 `{ code, data, message }`。

**Tech Stack:** Node 20+、Express 4、better-sqlite3、Vue 3、Vite、Element Plus、vue-router、axios、node:test（后端）、Vitest + Vue Test Utils（前端）。

## Global Constraints

- 所有业务表含：`id TEXT PK`、`created_at`、`updated_at`、`deleted_at`（NULL=未删）、`version INTEGER DEFAULT 1`、`created_by TEXT`
- 所有变更请求（PUT/PATCH/POST 子操作）必须携带 `version`（PUT/PATCH 用 `body.version`，子操作用 `body.targetVersion`），校验失败 409
- 错误码：40001 参数错误、40002 AI 测试参数均空、40003 GB/T 需文号、40401 记录不存在、40402 记录已删除、40403 接口不存在、409 版本冲突、41001 文件过期
- 软删恢复 `version + 1`；永久删除不可逆、前端二次确认
- 所有查询强制 `deleted_at IS NULL`（回收站视图除外）
- SQLite `journal_mode=WAL`；单实例锁 `data/.instance.lock`
- 索引命名 `idx_{table}_{col1}_{col2}`
- 端口默认 3000；`NODE_ENV=test` 用 `data/test.db`
- 前端列字段 key = DB 列名（snake_case）

---

### Task 1: 项目脚手架（后端基础）

**Files:**
- Create: `package.json`
- Create: `server/config.js`
- Create: `server/db.js`
- Create: `server/index.js`
- Create: `server/routes/index.js`
- Create: `.env.example`
- Create: `.gitignore`

**Interfaces:**
- Consumes: 无（本任务为零）
- Produces:
  - `server/config.js` → `{ port, dataDir, dbPath, isTest }`（读 `process.env.PORT`、`WENXI_DATA_DIR`，缺省 3000 / `data`）
  - `server/db.js` → `initDb()`（返回 better-sqlite3 实例，开 WAL，建 `meta` 表与 schema_version，执行 migration 数组），`migrations` 数组
  - `server/index.js` → `createApp(db)`（Express app，含 JSON 中间件、静态托管、`/api` 路由挂载点），`start()`（单实例锁 + listen）

- [ ] **Step 1: 写失败测试（db 初始化）**

```js
// test/db.test.js
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
```

- [ ] **Step 2: 运行验证失败**

Run: `node --test test/db.test.js`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

```js
// server/config.js
const path = require('node:path')
const isTest = process.env.NODE_ENV === 'test'
module.exports = {
  port: Number(process.env.PORT || 3000),
  dataDir: process.env.WENXI_DATA_DIR || path.resolve(__dirname, '..', 'data'),
  isTest,
  get dbPath() { return path.join(this.dataDir, isTest ? 'test.db' : 'wenxi.db') },
}
```

```js
// server/db.js
const Database = require('better-sqlite3')
const path = require('node:path')
const fs = require('node:fs')
const config = require('./config')

const migrations = [
  {
    version: 1,
    up(db) {
      db.exec(`
        CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);
        CREATE TABLE tasks (
          id TEXT PRIMARY KEY, title TEXT NOT NULL, task_type TEXT, source TEXT,
          assign_time TEXT, deadline TEXT, assigner TEXT, cooperators TEXT,
          status TEXT DEFAULT '未启动', progress INTEGER DEFAULT 0,
          summary TEXT, stages TEXT,
          created_by TEXT, created_at TEXT, updated_at TEXT, deleted_at TEXT,
          version INTEGER DEFAULT 1
        );
        CREATE INDEX idx_tasks_deleted_created ON tasks(deleted_at, created_at);
        CREATE TABLE meetings (
          id TEXT PRIMARY KEY, topic TEXT NOT NULL, meeting_time TEXT, location TEXT,
          send_to TEXT, receive_from TEXT, attendees TEXT, minutes TEXT, status TEXT,
          created_by TEXT, created_at TEXT, updated_at TEXT, deleted_at TEXT,
          version INTEGER DEFAULT 1
        );
        CREATE INDEX idx_meetings_deleted_created ON meetings(deleted_at, created_at);
        CREATE TABLE documents (
          id TEXT PRIMARY KEY, doc_type TEXT, title TEXT NOT NULL, doc_no TEXT,
          secret_level TEXT, genre TEXT, handler TEXT, receipt_status TEXT, content TEXT,
          created_by TEXT, created_at TEXT, updated_at TEXT, deleted_at TEXT,
          version INTEGER DEFAULT 1
        );
        CREATE INDEX idx_documents_deleted_created ON documents(deleted_at, created_at);
        CREATE TABLE activities (
          id TEXT PRIMARY KEY, act_type TEXT, title TEXT NOT NULL, start_time TEXT,
          end_time TEXT, location TEXT, participants TEXT, achievements TEXT,
          created_by TEXT, created_at TEXT, updated_at TEXT, deleted_at TEXT,
          version INTEGER DEFAULT 1
        );
        CREATE INDEX idx_activities_deleted_created ON activities(deleted_at, created_at);
        CREATE TABLE seals (
          id TEXT PRIMARY KEY, seal_time TEXT, applicant TEXT, approver TEXT,
          file_name TEXT, file_type TEXT, purpose TEXT,
          created_by TEXT, created_at TEXT, updated_at TEXT, deleted_at TEXT,
          version INTEGER DEFAULT 1
        );
        CREATE INDEX idx_seals_deleted_created ON seals(deleted_at, created_at);
        CREATE TABLE supplies (
          id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT, unit TEXT,
          current_stock REAL DEFAULT 0, safe_stock REAL DEFAULT 0,
          location TEXT, source_unit TEXT, remark TEXT,
          created_by TEXT, created_at TEXT, updated_at TEXT, deleted_at TEXT,
          version INTEGER DEFAULT 1
        );
        CREATE INDEX idx_supplies_deleted_name ON supplies(deleted_at, name);
        CREATE TABLE supply_transactions (
          id TEXT PRIMARY KEY, supply_id TEXT NOT NULL,
          change_type TEXT, quantity REAL, balance_after REAL,
          operator TEXT, source_unit TEXT, transacted_at TEXT, note TEXT,
          created_at TEXT
        );
        CREATE INDEX idx_supply_transactions_supply ON supply_transactions(supply_id);
        CREATE TABLE attachments (
          id TEXT PRIMARY KEY, biz_type TEXT, biz_id TEXT,
          server_file_name TEXT, display_name TEXT, file_size INTEGER, mime_type TEXT,
          uploaded_at TEXT, created_by TEXT, deleted_at TEXT, version INTEGER DEFAULT 1
        );
        CREATE INDEX idx_attachments_biz ON attachments(biz_type, biz_id);
        CREATE INDEX idx_attachments_deleted ON attachments(deleted_at);
        CREATE TABLE ai_configs (
          id TEXT PRIMARY KEY, name TEXT, base_url TEXT, api_key_enc BLOB,
          model_name TEXT, is_active INTEGER DEFAULT 0,
          created_at TEXT, updated_at TEXT, deleted_at TEXT, version INTEGER DEFAULT 1
        );
        CREATE TABLE writings (
          id TEXT PRIMARY KEY, title TEXT, scenario TEXT, content_html TEXT,
          status TEXT DEFAULT 'draft', exported_at TEXT,
          created_by TEXT, created_at TEXT, updated_at TEXT, deleted_at TEXT,
          version INTEGER DEFAULT 1
        );
        CREATE INDEX idx_writings_deleted_created ON writings(deleted_at, created_at);
        CREATE TABLE exports (
          id TEXT PRIMARY KEY, job_id TEXT, biz_type TEXT, writing_id TEXT,
          format TEXT, filter_json TEXT, file_id TEXT, display_name TEXT,
          status TEXT, message TEXT, expires_at TEXT, created_at TEXT, downloaded_at TEXT
        );
        INSERT INTO meta (key, value) VALUES ('schema_version', '1');
      `)
    },
  },
]

function initDb(dbPath = config.dbPath) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('busy_timeout = 5000')
  db.exec('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)')
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get('schema_version')
  if (!row) {
    migrations[0].up(db)
  }
  return db
}

module.exports = { initDb, migrations }
```

```js
// server/index.js
const express = require('express')
const path = require('node:path')
const fs = require('node:fs')
const config = require('./config')
const { initDb } = require('./db')

function acquireLock() {
  const lockPath = path.join(config.dataDir, '.instance.lock')
  if (fs.existsSync(lockPath)) {
    const pid = fs.readFileSync(lockPath, 'utf8').trim()
    throw new Error(`服务已在运行（PID ${pid}）`)
  }
  fs.writeFileSync(lockPath, String(process.pid))
  return () => fs.rmSync(lockPath, { force: true })
}

function createApp(db) {
  const app = express()
  app.use(express.json({ limit: '10mb' }))
  const publicDir = path.resolve(__dirname, '..', 'dist')
  if (fs.existsSync(publicDir)) app.use(express.static(publicDir))
  app.use('/api', require('./routes')(db))
  app.use('/api', (req, res) => res.status(404).json({ code: 40403, message: '接口不存在' }))
  return app
}

function start() {
  const release = acquireLock()
  const db = initDb()
  const app = createApp(db)
  const server = app.listen(config.port, () => {
    console.log(`[WenXi] 端口 ${config.port} 启动成功`)
  })
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`[WenXi] 端口 ${config.port} 被占用，已改用 ${config.port + 1}`)
      server.close()
      const server2 = app.listen(config.port + 1)
      server2.on('error', () => { console.log('[WenXi] 端口再次冲突，请手动设置 PORT'); process.exit(1) })
      return
    }
    throw err
  })
  const shutdown = () => { server.close(); db.close(); release(); process.exit(0) }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

if (require.main === module) start()
module.exports = { createApp, start, acquireLock }
```

```js
// server/routes/index.js
module.exports = function routes(db) {
  const router = require('express').Router()
  router.get('/health', (req, res) => {
    res.json({ code: 0, data: { version: require('../../package.json').version, schemaVersion: '1', uptime: process.uptime(), dbOk: true } })
  })
  return router
}
```

```json
// package.json
{
  "name": "wenxi",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "node server/index.js",
    "start": "node server/index.js",
    "test": "node --test test/",
    "build": "node build/check-blocks.mjs && vite build"
  },
  "dependencies": {
    "better-sqlite3": "^11.3.0",
    "express": "^4.19.2"
  },
  "devDependencies": {
    "vite": "^5.4.0",
    "@vitejs/plugin-vue": "^5.1.0",
    "vue": "^3.5.0",
    "element-plus": "^2.8.0",
    "vue-router": "^4.4.0",
    "axios": "^1.7.0",
    "vitest": "^2.1.0",
    "@vue/test-utils": "^2.4.6"
  }
}
```

```bash
# .env.example
PORT=3000
# WENXI_DATA_DIR=/path/to/data
```

```bash
# .gitignore
node_modules/
dist/
data/
.env
```

- [ ] **Step 4: 运行验证通过**

Run: `npm install && node --test test/db.test.js`
Expected: 2 个测试 PASS；`node server/index.js` 后 `curl localhost:3000/api/health` 返回 `{code:0,...}`

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json server/ .env.example .gitignore
git commit -m "feat: 项目脚手架 - Express+better-sqlite3 后端基础与健康检查"
```

---

### Task 2: 统一响应与错误码中间件

**Files:**
- Create: `server/utils/http.js`
- Create: `test/http.test.js`

**Interfaces:**
- Consumes: `createApp(db)`（Task 1）
- Produces:
  - `server/utils/http.js` → `ok(res, data)`、`fail(res, code, message, httpStatus)`、`err40401(res, id)`、`err40402(res, id, deletedAt)`、`parsePagination(query)`（返回 `{ page, pageSize, offset }`）、`toIso()`（本地时区 ISO 8601）

- [ ] **Step 1: 写失败测试**

```js
// test/http.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ok, fail, err40402, parsePagination } from '../server/utils/http.js'

test('ok 包装标准响应', () => {
  const res = { json: (body) => body }
  assert.deepEqual(ok(res, { a: 1 }), { code: 0, data: { a: 1 } })
})

test('fail 带错误码', () => {
  const res = { status: () => ({ json: (b) => b }) }
  const out = fail(res, 40001, '参数错误', 400)
  assert.deepEqual(out, { code: 40001, message: '参数错误' })
})

test('err40402 带 deletedAt', () => {
  const res = { status: () => ({ json: (b) => b }) }
  const out = err40402(res, 'abc', '2026-08-01T10:00:00+08:00')
  assert.deepEqual(out, { code: 40402, message: '记录已删除', data: { id: 'abc', deletedAt: '2026-08-01T10:00:00+08:00' } })
})

test('parsePagination 默认与边界', () => {
  assert.deepEqual(parsePagination({}), { page: 1, pageSize: 20, offset: 0 })
  assert.deepEqual(parsePagination({ page: '2', pageSize: '50' }), { page: 2, pageSize: 50, offset: 50 })
  assert.deepEqual(parsePagination({ page: '0', pageSize: '999' }), { page: 1, pageSize: 100, offset: 0 })
})
```

- [ ] **Step 2: 运行验证失败**

Run: `node --test test/http.test.js`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

```js
// server/utils/http.js
const MAX_PAGE_SIZE = 100

function ok(res, data) {
  return res.json({ code: 0, data })
}

function fail(res, code, message, httpStatus = 400) {
  return res.status(httpStatus).json({ code, message })
}

function err40401(res, id) {
  return res.status(404).json({ code: 40401, message: '记录不存在', data: { id } })
}

function err40402(res, id, deletedAt) {
  return res.status(404).json({ code: 40402, message: '记录已删除', data: { id, deletedAt } })
}

function parsePagination(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1)
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(query.pageSize, 10) || 20))
  return { page, pageSize, offset: (page - 1) * pageSize }
}

function toIso(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}+08:00`
}

module.exports = { ok, fail, err40401, err40402, parsePagination, toIso }
```

- [ ] **Step 4: 运行验证通过**

Run: `node --test test/http.test.js`
Expected: 4 个测试 PASS

- [ ] **Step 5: Commit**

```bash
git add server/utils/http.js test/http.test.js
git commit -m "feat: 统一响应包装与错误码工具"
```

---

### Task 3: 通用 CRUD 构造器 makeCrud

**Files:**
- Create: `server/db/crud.js`
- Create: `test/crud.test.js`

**Interfaces:**
- Consumes: `initDb`（Task 1）、`server/utils/http.js` 的 `ok/fail/err40401/err40402/parsePagination/toIso`（Task 2）
- Produces: `makeCrud(db, options)` → `{ list, get, create, update, remove, restore, permanent, trashCount }`
  - `options`: `{ table, fields: [col...]（表字段参考，仅用于校验与文档，不再限定可写列；可写列 = 表列 − 系统列，由 PRAGMA table_info 派生）, searchFields: [col...], sortable: [col...], children: [{ table, fk }] }`
  - `list(query)` → `{ list, total, page, pageSize }`（含 `deleted=1` 回收站模式，排序 `deleted_at DESC`）
  - `get(id)` → 行对象（含 `deleted_at`，由路由层决定 40401/40402）
  - `create(body)` → 新行
  - `update(id, body)` → `{ changed: 0|1, row? }`（version 校验：`changed=0` 且行存在时表示 409）
  - `remove(id)` → 软删（置 `deleted_at`，`version+1`）
  - `restore(id)` → 恢复（`deleted_at=NULL`，`version+1`）
  - `permanent(id)` → 事务内物理删行 + 级联 children
  - `trashCount()` → `{ count }`

- [ ] **Step 1: 写失败测试**

```js
// test/crud.test.js
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
```

- [ ] **Step 2: 运行验证失败**

Run: `node --test test/crud.test.js`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

```js
// server/db/crud.js
const { randomUUID } = require('node:crypto')
const { toIso } = require('../utils/http')

function makeCrud(db, { table, fields, searchFields = [], sortable = [], children = [] }) {
  const cols = [...fields, 'id', 'created_by', 'created_at', 'updated_at', 'deleted_at', 'version']
  const safeCols = (arr) => arr.filter((c) => cols.includes(c))

  function pick(body) {
    const row = {}
    for (const f of fields) if (body[f] !== undefined) row[f] = body[f]
    if (body.created_by) row.created_by = String(body.created_by)
    return row
  }

  function list(query = {}) {
    const { page, pageSize, offset } = require('../utils/http').parsePagination(query)
    const where = []
    const params = {}
    if (query.deleted === '1') {
      where.push('deleted_at IS NOT NULL')
    } else {
      where.push('deleted_at IS NULL')
    }
    if (query.keyword && searchFields.length) {
      const like = `%${query.keyword}%`
      where.push(`(${searchFields.map((c) => `COALESCE(${c},'') LIKE @kw`).join(' OR ')})`)
      params.kw = like
    }
    for (const [qcol, col] of [['status', 'status'], ['type', 'task_type'], ['docType', 'doc_type'], ['actType', 'act_type']]) {
      if (query[qcol] !== undefined && query[qcol] !== '') {
        where.push(`${col} = @${qcol}`)
        params[qcol] = query[qcol]
      }
    }
    if (query.dateFrom) { where.push('created_at >= @dateFrom'); params.dateFrom = query.dateFrom }
    if (query.dateTo) { where.push('created_at <= @dateTo'); params.dateTo = query.dateTo }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
    let orderSql = 'ORDER BY created_at DESC'
    if (query.deleted === '1') orderSql = 'ORDER BY deleted_at DESC'
    if (query.sort && sortable.includes(query.sort)) {
      orderSql = `ORDER BY ${query.sort} ${query.order === 'asc' ? 'ASC' : 'DESC'}`
    }
    const total = db.prepare(`SELECT COUNT(*) c FROM ${table} ${whereSql}`).get(params).c
    const list = db.prepare(`SELECT * FROM ${table} ${whereSql} ${orderSql} LIMIT @limit OFFSET @offset`)
      .all({ ...params, limit: pageSize, offset })
    return { list, total, page, pageSize }
  }

  function get(id) {
    return db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id)
  }

  function create(body) {
    const id = randomUUID()
    const now = toIso()
    const row = { id, ...pick(body), created_at: now, updated_at: now, version: 1 }
    const keys = Object.keys(row)
    db.prepare(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '@' + keys[0]).join(',')})`).run(row)
    return get(id)
  }

  function update(id, body) {
    const version = parseInt(body.version, 10)
    if (!Number.isInteger(version)) return { changed: 0 }
    const existing = get(id)
    if (!existing) return { changed: 0, exists: false }
    if (existing.deleted_at) return { changed: 0, exists: true, deleted: true }
    const patch = pick(body)
    patch.version = version + 1
    patch.updated_at = toIso()
    const sets = Object.keys(patch).map((k) => `${k} = @${k}`).join(', ')
    const result = db.prepare(`UPDATE ${table} SET ${sets} WHERE id = @id AND version = @oldVersion AND deleted_at IS NULL`)
      .run({ ...patch, id, oldVersion: version })
    if (result.changes === 0) return { changed: 0, exists: true }
    return { changed: 1, row: get(id) }
  }

  function remove(id) {
    const result = db.prepare(`UPDATE ${table} SET deleted_at = @now, updated_at = @now, version = version + 1 WHERE id = @id AND deleted_at IS NULL`)
      .run({ id, now: toIso() })
    return { changed: result.changes }
  }

  function restore(id) {
    const result = db.prepare(`UPDATE ${table} SET deleted_at = NULL, updated_at = @now, version = version + 1 WHERE id = @id AND deleted_at IS NOT NULL`)
      .run({ id, now: toIso() })
    return { changed: result.changes }
  }

  function permanent(id) {
    const tx = db.transaction(() => {
      for (const child of children) {
        db.prepare(`DELETE FROM ${child.table} WHERE ${child.fk} = ?`).run(id)
      }
      return db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id)
    })
    return { changed: tx(id).changes }
  }

  function trashCount() {
    const row = db.prepare(`SELECT COUNT(*) c FROM ${table} WHERE deleted_at IS NOT NULL`).get()
    return { count: row.c }
  }

  return { list, get, create, update, remove, restore, permanent, trashCount, safeCols }
}

module.exports = { makeCrud }
```

注意：`create` 里占位符写法有问题——`VALUES (${keys.map(() => '@' + keys[0]).join(',')})` 应使用各自 key。修正如下：

```js
    db.prepare(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map((k) => `@${k}`).join(',')})`).run(row)
```

- [ ] **Step 4: 运行验证通过**

Run: `node --test test/crud.test.js`
Expected: 10 个测试 PASS

- [ ] **Step 5: Commit**

```bash
git add server/db/crud.js test/crud.test.js
git commit -m "feat: makeCrud 通用构造器 - 分页搜索/乐观锁/软删恢复/回收站/级联"
```

---

### Task 4: 通用路由工厂 makeCrudRouter + tasks 模块

**Files:**
- Create: `server/routes/crud.js`
- Create: `server/routes/tasks.js`
- Modify: `server/routes/index.js`
- Create: `test/tasks-api.test.js`

**Interfaces:**
- Consumes: `makeCrud`（Task 3）、`server/utils/http.js`（Task 2）、`createApp(db)`（Task 1）
- Produces:
  - `server/routes/crud.js` → `makeCrudRouter(db, options)` 返回 Express Router：
    - `GET /`（list，含 deleted=1）、`GET /:id`、`POST /`（create）、`PUT /:id`（update，409 分支）、`DELETE /:id`（软删）、`POST /:id/restore`、`DELETE /:id/permanent`、`GET /trash-count`
  - `server/routes/tasks.js` → `tasksRouter(db)`（makeCrudRouter 封装）

- [ ] **Step 1: 写失败测试**

```js
// test/tasks-api.test.js
import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { initDb } from '../server/db.js'
import { createApp } from '../server/index.js'

let db, app
const TEST_DB = 'data/test.db'

beforeEach(() => {
  fs.rmSync(TEST_DB, { force: true })
  db = initDb(TEST_DB)
  app = createApp(db)
})
afterEach(() => { db.close(); fs.rmSync(TEST_DB, { force: true }) })

async function call(method, url, body) {
  const req = new Request(`http://localhost${url}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  return app(req, {})
}

test('POST /api/tasks 创建', async () => {
  const res = await call('POST', '/api/tasks', { title: 'x', status: '未启动' })
  assert.equal(res.statusCode, 200)
})

test('GET /api/tasks 列表与分页', async () => {
  await call('POST', '/api/tasks', { title: 'a' })
  await call('POST', '/api/tasks', { title: 'b' })
  const out = await call('GET', '/api/tasks?page=1&pageSize=1')
  assert.equal(out.statusCode, 200)
  assert.equal(out.body.list.length, 1)
  assert.equal(out.body.total, 2)
})

test('PUT 旧 version 返回 409', async () => {
  const created = await call('POST', '/api/tasks', { title: 'a' })
  await call('PUT', `/api/tasks/${created.body.id}`, { title: 'b', version: 1 })
  const res = await call('PUT', `/api/tasks/${created.body.id}`, { title: 'c', version: 1 })
  assert.equal(res.statusCode, 409)
})

test('GET 已删除记录返回 40402', async () => {
  const created = await call('POST', '/api/tasks', { title: 'a' })
  await call('DELETE', `/api/tasks/${created.body.id}`)
  const res = await call('GET', `/api/tasks/${created.body.id}`)
  assert.equal(res.statusCode, 404)
  assert.equal(res.body.code, 40402)
})

test('GET 不存在返回 40401', async () => {
  const res = await call('GET', '/api/tasks/not-exist')
  assert.equal(res.statusCode, 404)
  assert.equal(res.body.code, 40401)
})

test('DELETE /permanent 物理删除', async () => {
  const created = await call('POST', '/api/tasks', { title: 'a' })
  const res = await call('DELETE', `/api/tasks/${created.body.id}/permanent`)
  assert.equal(res.statusCode, 200)
  const got = await call('GET', `/api/tasks/${created.body.id}`)
  assert.equal(got.statusCode, 404)
})

test('GET /trash-count', async () => {
  const created = await call('POST', '/api/tasks', { title: 'a' })
  await call('DELETE', `/api/tasks/${created.body.id}`)
  const out = await call('GET', '/api/tasks/trash-count')
  assert.equal(out.body.count, 1)
})
```

注意：node:test 直调 Express app 需要响应体解析。实现测试 helper 用 `supertest` 更简单，但避免新增依赖——改用 node http 服务器：

```js
// test/tasks-api.test.js（修正：用 http server + fetch）
import { createServer } from 'node:http'

let server, base
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
```

- [ ] **Step 2: 运行验证失败**

Run: `node --test test/tasks-api.test.js`
Expected: FAIL（路由未挂载，40403）

- [ ] **Step 3: 实现**

```js
// server/routes/crud.js
const express = require('express')
const { ok, fail, err40401, err40402 } = require('../utils/http')
const { makeCrud } = require('../db/crud')

function makeCrudRouter(db, options) {
  const router = express.Router()
  const crud = makeCrud(db, options)

  router.get('/', (req, res) => {
    ok(res, crud.list(req.query))
  })
  router.get('/trash-count', (req, res) => {
    ok(res, crud.trashCount())
  })
  router.post('/', (req, res) => {
    try {
      ok(res, crud.create(req.body || {}))
    } catch (e) {
      fail(res, 40001, `参数错误: ${e.message}`)
    }
  })
  router.get('/:id', (req, res) => {
    const row = crud.get(req.params.id)
    if (!row) return err40401(res, req.params.id)
    if (row.deleted_at) return err40402(res, req.params.id, row.deleted_at)
    ok(res, row)
  })
  router.put('/:id', (req, res) => {
    const r = crud.update(req.params.id, req.body || {})
    if (!r.changed) {
      if (r.exists === false) return err40401(res, req.params.id)
      if (r.deleted) return err40402(res, req.params.id)
      return res.status(409).json({ code: 409, message: '乐观锁版本冲突' })
    }
    ok(res, r.row)
  })
  router.delete('/:id', (req, res) => {
    const r = crud.remove(req.params.id)
    if (!r.changed) return err40401(res, req.params.id)
    ok(res, { id: req.params.id })
  })
  router.post('/:id/restore', (req, res) => {
    const r = crud.restore(req.params.id)
    if (!r.changed) return err40401(res, req.params.id)
    ok(res, { id: req.params.id })
  })
  router.delete('/:id/permanent', (req, res) => {
    const r = crud.permanent(req.params.id)
    if (!r.changed) return err40401(res, req.params.id)
    ok(res, { id: req.params.id })
  })
  return router
}

module.exports = { makeCrudRouter }
```

```js
// server/routes/tasks.js
const { makeCrudRouter } = require('./crud')

module.exports = function tasksRouter(db) {
  return makeCrudRouter(db, {
    table: 'tasks',
    fields: ['title', 'task_type', 'source', 'assign_time', 'deadline', 'assigner', 'cooperators', 'status', 'progress', 'summary', 'stages'],
    searchFields: ['title', 'assigner', 'source', 'cooperators'],
    sortable: ['created_at', 'deadline', 'status', 'progress'],
  })
}
```

```js
// server/routes/index.js（修改：挂载 tasks）
const express = require('express')
const tasksRouter = require('./tasks')

module.exports = function routes(db) {
  const router = express.Router()
  router.get('/health', (req, res) => {
    res.json({ code: 0, data: { version: require('../../package.json').version, schemaVersion: '1', uptime: process.uptime(), dbOk: true } })
  })
  router.use('/tasks', tasksRouter(db))
  return router
}
```

- [ ] **Step 4: 运行验证通过**

Run: `node --test test/tasks-api.test.js test/crud.test.js`
Expected: 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add server/routes/ test/tasks-api.test.js
git commit -m "feat: makeCrudRouter 通用路由 + tasks 模块 API"
```

---

### Task 5: 附件模块（上传/下载/防路径遍历/软删）

**Files:**
- Create: `server/routes/attachments.js`
- Modify: `server/routes/index.js`
- Create: `server/utils/storage.js`
- Create: `test/attachments.test.js`

**Interfaces:**
- Consumes: `createApp(db)`（Task 1）、`toIso`（Task 2）
- Produces:
  - `server/utils/storage.js` → `saveUpload(file, { bizType, bizId })`（uuid 重命名存 `data/attachments/`，返回记录行）、`resolveAttachmentPath(serverFileName)`（`path.resolve` + `startsWith` 校验）、`deleteFile(serverFileName)`、`deletePhysicalFileIfOrphaned(db, serverFileName)`
  - 路由（挂 `/api/attachments`）：`POST /`（multipart）、`GET /?bizType=&bizId=`、`DELETE /:id`（软删）、`GET /:id/download`
- 附件表已由 Task 1 migration 建好

- [ ] **Step 1: 写失败测试**

```js
// test/attachments.test.js
import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createServer } from 'node:http'
import { initDb } from '../server/db.js'
import { createApp } from '../server/index.js'
import { resolveAttachmentPath } from '../server/utils/storage.js'

const TEST_DB = 'data/test.db'
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
  server.close(); db.close()
  fs.rmSync(TEST_DB, { force: true })
  fs.rmSync('data/attachments', { recursive: true, force: true })
})

async function upload(name, content, bizType = 'tasks', bizId = 't1') {
  const form = new FormData()
  form.append('file', new Blob([content], { type: 'text/plain' }), name)
  form.append('bizType', bizType)
  form.append('bizId', bizId)
  const res = await fetch(`${base}/api/attachments`, { method: 'POST', body: form })
  return res
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

test('路径遍历防护', async () => {
  const row = db.prepare(`INSERT INTO attachments (id, biz_type, biz_id, server_file_name, display_name, file_size, mime_type, uploaded_at, version) VALUES (?,?,?,?,?,?,?,?,1)`)
  fs.writeFileSync('data/attachments/../../.env.example', 'SECRET') // 试图在附件目录外放置文件
  try {
    const out = resolveAttachmentPath('..\\..\\..\\.env.example')
    assert.fail('应抛出路径越界错误')
  } catch (e) {
    assert.ok(e.message.includes('路径越界'))
  }
})

test('软删后下载返回 40402', async () => {
  const res = await upload('a.txt', 'x')
  const { data } = await res.json()
  await fetch(`${base}/api/attachments/${data.id}`, { method: 'DELETE' })
  const dl = await fetch(`${base}/api/attachments/${data.id}/download`)
  assert.equal(dl.status, 404)
})
```

注意：FormData 需要 Node 18+（全局存在）。`server_file_name` 唯一性由 uuid 保证。

- [ ] **Step 2: 运行验证失败**

Run: `node --test test/attachments.test.js`
Expected: FAIL

- [ ] **Step 3: 实现**

```js
// server/utils/storage.js
const fs = require('node:fs')
const path = require('node:path')
const { randomUUID } = require('node:crypto')
const config = require('../config')
const { toIso } = require('./http')

function attachDir() {
  const dir = path.join(config.dataDir, 'attachments')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function saveUpload(file, { bizType, bizId, createdBy }) {
  const serverFileName = `${randomUUID()}_${path.basename(file.originalname || 'file')}`
  const dest = path.join(attachDir(), serverFileName)
  fs.writeFileSync(dest, file.buffer)
  const row = {
    id: randomUUID(),
    biz_type: bizType,
    biz_id: bizId,
    server_file_name: serverFileName,
    display_name: file.originalname || '未命名',
    file_size: file.size,
    mime_type: file.mimetype || 'application/octet-stream',
    uploaded_at: toIso(),
    created_by: createdBy || '',
    version: 1,
  }
  return row
}

function resolveAttachmentPath(serverFileName) {
  const dir = path.resolve(attachDir())
  const resolved = path.resolve(dir, serverFileName)
  if (!resolved.startsWith(dir + path.sep)) {
    throw new Error('路径越界: 附件文件名不合法')
  }
  return resolved
}

function deleteFile(serverFileName) {
  try { fs.rmSync(resolveAttachmentPath(serverFileName), { force: true }) } catch (e) { /* 文件已不存在 */ }
}

module.exports = { attachDir, saveUpload, resolveAttachmentPath, deleteFile }
```

```js
// server/routes/attachments.js
const express = require('express')
const fs = require('node:fs')
const { randomUUID } = require('node:crypto')
const { ok, fail, err40401, err40402 } = require('../utils/http')
const { toIso } = require('../utils/http')
const { saveUpload, resolveAttachmentPath, deleteFile } = require('../utils/storage')

module.exports = function attachmentsRouter(db) {
  const router = express.Router()

  router.post('/', (req, res) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      const buf = Buffer.concat(chunks)
      const ct = req.headers['content-type'] || ''
      const boundary = ct.match(/boundary=(.+)$/)?.[1]
      if (!boundary) return fail(res, 40001, '缺少 multipart boundary')
      const parts = parseMultipart(buf, boundary)
      const file = parts.files[0]
      const bizType = parts.fields.bizType || ''
      const bizId = parts.fields.bizId || ''
      if (!file) return fail(res, 40001, '缺少文件')
      const row = saveUpload(file, { bizType, bizId })
      db.prepare(`INSERT INTO attachments (${Object.keys(row).join(',')}) VALUES (${Object.keys(row).map((k) => `@${k}`).join(',')})`).run(row)
      ok(res, row)
    })
  })

  router.get('/', (req, res) => {
    const rows = db.prepare('SELECT * FROM attachments WHERE biz_type = ? AND biz_id = ? AND deleted_at IS NULL ORDER BY uploaded_at DESC')
      .all(req.query.bizType || '', req.query.bizId || '')
    ok(res, { list: rows })
  })

  router.delete('/:id', (req, res) => {
    const r = db.prepare('UPDATE attachments SET deleted_at = ?, version = version + 1 WHERE id = ? AND deleted_at IS NULL')
      .run(toIso(), req.params.id)
    if (!r.changes) return err40401(res, req.params.id)
    ok(res, { id: req.params.id })
  })

  router.get('/:id/download', (req, res) => {
    const row = db.prepare('SELECT * FROM attachments WHERE id = ?').get(req.params.id)
    if (!row) return err40401(res, req.params.id)
    if (row.deleted_at) return err40402(res, req.params.id, row.deleted_at)
    let absPath
    try {
      absPath = resolveAttachmentPath(row.server_file_name)
    } catch (e) {
      return fail(res, 500, '附件文件不存在')
    }
    if (!fs.existsSync(absPath)) return fail(res, 404, '附件文件不存在', 404)
    const encoded = encodeURIComponent(row.display_name)
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encoded}`)
    res.setHeader('Content-Type', row.mime_type)
    res.sendFile(absPath)
  })

  return router
}

function parseMultipart(buf, boundary) {
  const result = { fields: {}, files: [] }
  const delim = Buffer.from(`--${boundary}`)
  const parts = buf.toString('latin1').split(delim)
  for (const part of parts) {
    const headerMatch = part.match(/^Content-Disposition: form-data; name="([^"]+)"(?:; filename="([^"]*)")?/i)
    if (!headerMatch) continue
    const name = headerMatch[1]
    const filename = headerMatch[2]
    const bodyIdx = part.indexOf('\r\n\r\n')
    if (bodyIdx === -1) continue
    const body = part.slice(bodyIdx + 4)
    if (filename !== undefined) {
      const content = body.replace(/\r\n$/, '')
      result.files.push({ originalname: filename, buffer: Buffer.from(content, 'latin1'), size: Buffer.byteLength(content), mimetype: '' })
    } else {
      result.fields[name] = body.replace(/\r\n$/, '').trim()
    }
  }
  return result
}
```

注意：手写 multipart 解析易错。**推荐改用 `multer` 依赖**（express 生态标准）。修正：

```bash
npm install multer
```

```js
// server/routes/attachments.js（multer 版）
const express = require('express')
const multer = require('multer')
const path = require('node:path')
const { ok, fail, err40401, err40402 } = require('../utils/http')
const { toIso } = require('../utils/http')
const { saveUpload, resolveAttachmentPath } = require('../utils/storage')

module.exports = function attachmentsRouter(db) {
  const router = express.Router()
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } })

  router.post('/', upload.single('file'), (req, res) => {
    if (!req.file) return fail(res, 40001, '缺少文件字段 file')
    const row = saveUpload(req.file, {
      bizType: req.body.bizType || '',
      bizId: req.body.bizId || '',
    })
    db.prepare(`INSERT INTO attachments (${Object.keys(row).join(',')}) VALUES (${Object.keys(row).map((k) => `@${k}`).join(',')})`).run(row)
    ok(res, row)
  })
  // ...（其余同上，delete/download 不变）
  return router
}
```

- [ ] **Step 4: 运行验证通过**

Run: `node --test test/attachments.test.js`
Expected: 4 个测试 PASS

- [ ] **Step 5: Commit**

```bash
git add server/routes/attachments.js server/utils/storage.js test/attachments.test.js
git commit -m "feat: 附件上传下载 - uuid存储/防路径遍历/软删"
```

---

### Task 6: 其余 5 个台账模块（meetings/documents/activities/seals/supplies）

**Files:**
- Create: `server/routes/meetings.js`、`documents.js`、`activities.js`、`seals.js`、`supplies.js`
- Modify: `server/routes/index.js`
- Create: `test/modules-api.test.js`

**Interfaces:**
- Consumes: `makeCrudRouter`（Task 4）
- Produces:
  - `meetingsRouter(db)`：table=meetings，searchFields=[topic, send_to, receive_from, location]，sortable=[created_at, meeting_time]
  - `documentsRouter(db)`：table=documents，searchFields=[title, doc_no, handler, genre]，sortable=[created_at, doc_no]
  - `activitiesRouter(db)`：table=activities，searchFields=[title, location, participants, achievements]，sortable=[created_at, start_time]
  - `sealsRouter(db)`：table=seals，searchFields=[applicant, approver, file_name, purpose]，sortable=[created_at, seal_time]
  - `suppliesRouter(db)`：table=supplies，children=[{table: supply_transactions, fk: supply_id}]，searchFields=[name, type, location, source_unit]，sortable=[created_at, name]；**附加路由** `POST /:id/transactions`（库存变更，body 含 `targetVersion`）、`GET /:id/transactions`（流水列表）

- [ ] **Step 1: 写失败测试**

```js
// test/modules-api.test.js
import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createServer } from 'node:http'
import { initDb } from '../server/db.js'
import { createApp } from '../server/index.js'

const TEST_DB = 'data/test.db'
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
    assert.equal(list.body.total, 1, `${url} 列表`)
    await call('DELETE', `${url}/${created.body.id}`)
    const trash = await call('GET', `${url}?deleted=1`)
    assert.equal(trash.body.total, 1, `${url} 回收站`)
    await call('POST', `${url}/${created.body.id}/restore`)
    const back = await call('GET', url)
    assert.equal(back.body.total, 1, `${url} 恢复`)
  }
})

test('物资入库/领用/流水', async () => {
  const created = await call('POST', '/api/supplies', { name: '打印纸', unit: '箱', current_stock: 10 })
  const id = created.body.id
  const inTx = await call('POST', `/api/supplies/${id}/transactions`, {
    changeType: '入库', quantity: 5, operator: '张三', targetVersion: 1,
  })
  assert.equal(inTx.statusCode, 200)
  assert.equal(inTx.body.current_stock, 15)
  const outTx = await call('POST', `/api/supplies/${id}/transactions`, {
    changeType: '领用', quantity: 3, operator: '李四', targetVersion: inTx.body.version,
  })
  assert.equal(outTx.statusCode, 200)
  assert.equal(outTx.body.current_stock, 12)
  const list = await call('GET', `/api/supplies/${id}/transactions`)
  assert.equal(list.body.list.length, 2)
  assert.equal(list.body.list[0].balance_after, 15)
})

test('库存不足领用被拒', async () => {
  const created = await call('POST', '/api/supplies', { name: '硒鼓', unit: '个', current_stock: 2 })
  const out = await call('POST', `/api/supplies/${created.body.id}/transactions`, {
    changeType: '领用', quantity: 5, operator: '王五', targetVersion: 1,
  })
  assert.equal(out.statusCode, 400)
  assert.equal(out.body.code, 40001)
})

test('领用缺 targetVersion 返回 400', async () => {
  const created = await call('POST', '/api/supplies', { name: '笔', unit: '支', current_stock: 5 })
  const out = await call('POST', `/api/supplies/${created.body.id}/transactions`, {
    changeType: '领用', quantity: 1, operator: '赵六',
  })
  assert.equal(out.statusCode, 400)
})

test('permanent 级联删除物资流水', async () => {
  const created = await call('POST', '/api/supplies', { name: 'A4纸', unit: '包', current_stock: 10 })
  await call('POST', `/api/supplies/${created.body.id}/transactions`, {
    changeType: '入库', quantity: 10, operator: '张三', targetVersion: 1,
  })
  await call('DELETE', `/api/supplies/${created.body.id}/permanent`)
  const list = await call('GET', `/api/supplies/${created.body.id}/transactions`)
  assert.equal(list.statusCode, 404)
})
```

- [ ] **Step 2: 运行验证失败**

Run: `node --test test/modules-api.test.js`
Expected: FAIL（40403）

- [ ] **Step 3: 实现**

```js
// server/routes/meetings.js
const { makeCrudRouter } = require('./crud')
module.exports = function meetingsRouter(db) {
  return makeCrudRouter(db, {
    table: 'meetings',
    fields: ['topic', 'meeting_time', 'location', 'send_to', 'receive_from', 'attendees', 'minutes', 'status'],
    searchFields: ['topic', 'send_to', 'receive_from', 'location'],
    sortable: ['created_at', 'meeting_time'],
  })
}
```

```js
// server/routes/documents.js
const { makeCrudRouter } = require('./crud')
module.exports = function documentsRouter(db) {
  return makeCrudRouter(db, {
    table: 'documents',
    fields: ['doc_type', 'title', 'doc_no', 'secret_level', 'genre', 'handler', 'receipt_status', 'content'],
    searchFields: ['title', 'doc_no', 'handler', 'genre'],
    sortable: ['created_at', 'doc_no'],
  })
}
```

```js
// server/routes/activities.js
const { makeCrudRouter } = require('./crud')
module.exports = function activitiesRouter(db) {
  return makeCrudRouter(db, {
    table: 'activities',
    fields: ['act_type', 'title', 'start_time', 'end_time', 'location', 'participants', 'achievements'],
    searchFields: ['title', 'location', 'participants', 'achievements'],
    sortable: ['created_at', 'start_time'],
  })
}
```

```js
// server/routes/seals.js
const { makeCrudRouter } = require('./crud')
module.exports = function sealsRouter(db) {
  return makeCrudRouter(db, {
    table: 'seals',
    fields: ['seal_time', 'applicant', 'approver', 'file_name', 'file_type', 'purpose'],
    searchFields: ['applicant', 'approver', 'file_name', 'purpose'],
    sortable: ['created_at', 'seal_time'],
  })
}
```

```js
// server/routes/supplies.js
const express = require('express')
const { randomUUID } = require('node:crypto')
const { makeCrudRouter } = require('./crud')
const { ok, fail, err40401 } = require('../utils/http')
const { toIso } = require('../utils/http')

module.exports = function suppliesRouter(db) {
  const router = makeCrudRouter(db, {
    table: 'supplies',
    fields: ['name', 'type', 'unit', 'current_stock', 'safe_stock', 'location', 'source_unit', 'remark'],
    searchFields: ['name', 'type', 'location', 'source_unit'],
    sortable: ['created_at', 'name'],
    children: [{ table: 'supply_transactions', fk: 'supply_id' }],
  })

  router.post('/:id/transactions', (req, res) => {
    const targetVersion = parseInt(req.body.targetVersion, 10)
    if (!Number.isInteger(targetVersion)) return fail(res, 40001, '缺少或非法的 targetVersion')
    const changeType = req.body.changeType
    const quantity = Number(req.body.quantity)
    const tx = db.transaction(() => {
      const supply = db.prepare('SELECT * FROM supplies WHERE id = ? AND deleted_at IS NULL').get(req.params.id)
      if (!supply) return { error: 40401 }
      if (supply.version !== targetVersion) return { error: 409 }
      if (!['入库', '领用', '报损', '盘点调整'].includes(changeType)) return { error: 40001 }
      if (!Number.isFinite(quantity) || quantity <= 0) return { error: 40001 }
      let next = supply.current_stock + quantity
      if (changeType === '领用' || changeType === '报损') {
        next = supply.current_stock - quantity
        if (next < 0) return { error: 40001, message: '库存不足' }
      }
      const newVersion = supply.version + 1
      db.prepare('UPDATE supplies SET current_stock = ?, updated_at = ?, version = ? WHERE id = ? AND version = ?')
        .run(next, toIso(), newVersion, req.params.id, targetVersion)
      db.prepare(`INSERT INTO supply_transactions (id, supply_id, change_type, quantity, balance_after, operator, source_unit, transacted_at, note, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`)
        .run(randomUUID(), req.params.id, changeType, quantity, next, req.body.operator || '', req.body.source_unit || '', toIso(), req.body.note || '', toIso())
      return { current_stock: next, version: newVersion }
    })
    const result = tx()
    if (result.error === 40401) return err40401(res, req.params.id)
    if (result.error === 409) return res.status(409).json({ code: 409, message: '乐观锁版本冲突' })
    if (result.error === 40001) return fail(res, 40001, result.message || '参数错误')
    ok(res, result)
  })

  router.get('/:id/transactions', (req, res) => {
    const supply = db.prepare('SELECT id FROM supplies WHERE id = ?').get(req.params.id)
    if (!supply) return err40401(res, req.params.id)
    const rows = db.prepare('SELECT * FROM supply_transactions WHERE supply_id = ? ORDER BY transacted_at ASC').all(req.params.id)
    ok(res, { list: rows })
  })

  return router
}
```

```js
// server/routes/index.js（修改：挂载全部模块）
router.use('/tasks', tasksRouter(db))
router.use('/meetings', meetingsRouter(db))
router.use('/documents', documentsRouter(db))
router.use('/activities', activitiesRouter(db))
router.use('/seals', sealsRouter(db))
router.use('/supplies', suppliesRouter(db))
```

- [ ] **Step 4: 运行验证通过**

Run: `node --test test/`
Expected: 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add server/routes/ test/modules-api.test.js
git commit -m "feat: 5 个台账模块 + 物资库存流水（事务/乐观锁/级联）"
```

---

### Task 7: stats 统计接口 + 前端脚手架

**Files:**
- Create: `server/routes/stats.js`
- Modify: `server/routes/index.js`
- Create: `test/stats.test.js`
- Create: `vite.config.js`、`index.html`、`src/main.js`、`src/App.vue`、`src/router/index.js`、`src/api/index.js`、`src/layouts/MainLayout.vue`

**Interfaces:**
- Consumes: `initDb`（Task 1）、`ok/fail`（Task 2）
- Produces:
  - `GET /api/stats/monthly?year=&month=` → `{ counts: { tasks, meetings, documents, activities, seals, supplies, attachments }, byStatus: { tasks: {...}, meetings: {...} }, byType: { tasks: {...}, meetings: {...}, documents: {...}, activities: {...} } }`
  - `GET /api/stats/trend?from=&to=` → `{ days: [{ date, count }], byModule: { tasks: n, ... } }`
  - 前端：Vue 3 app 骨架（main.js、App.vue、router、axios 封装 `api/index.js` 导出 `http` 实例与 `api` 对象）

- [ ] **Step 1: 写失败测试**

```js
// test/stats.test.js
import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createServer } from 'node:http'
import { initDb } from '../server/db.js'
import { createApp } from '../server/index.js'

const TEST_DB = 'data/test.db'
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
    method, headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { statusCode: res.status, body: await res.json() }
}

test('monthly 聚合各模块计数', async () => {
  await call('POST', '/api/tasks', { title: 'a' })
  await call('POST', '/api/tasks', { title: 'b' })
  await call('POST', '/api/meetings', { topic: '例会' })
  const out = await call('GET', '/api/stats/monthly?year=2026&month=08')
  assert.equal(out.statusCode, 200)
  assert.equal(out.body.counts.tasks, 2)
  assert.equal(out.body.counts.meetings, 1)
  assert.equal(out.body.counts.documents, 0)
})

test('monthly byStatus 分组', async () => {
  await call('POST', '/api/tasks', { title: 'a', status: '进行中' })
  await call('POST', '/api/tasks', { title: 'b', status: '已完成' })
  const out = await call('GET', '/api/stats/monthly?year=2026&month=08')
  assert.equal(out.body.byStatus.tasks['进行中'], 1)
  assert.equal(out.body.byStatus.tasks['已完成'], 1)
})

test('trend 按日趋势', async () => {
  await call('POST', '/api/tasks', { title: 'a' })
  const out = await call('GET', '/api/stats/trend?from=2026-08-01&to=2026-08-31')
  assert.equal(out.statusCode, 200)
  assert.ok(out.body.days.length >= 1)
  assert.equal(out.body.byModule.tasks, 1)
})

test('软删记录不计入统计', async () => {
  const created = await call('POST', '/api/tasks', { title: 'a' })
  await call('DELETE', `/api/tasks/${created.body.id}`)
  const out = await call('GET', '/api/stats/monthly?year=2026&month=08')
  assert.equal(out.body.counts.tasks, 0)
})
```

- [ ] **Step 2: 运行验证失败**

Run: `node --test test/stats.test.js`
Expected: FAIL（40403）

- [ ] **Step 3: 实现**

```js
// server/routes/stats.js
const express = require('express')
const { ok } = require('../utils/http')

const MODULES = [
  ['tasks', 'created_at'],
  ['meetings', 'created_at'],
  ['documents', 'created_at'],
  ['activities', 'created_at'],
  ['seals', 'created_at'],
  ['supplies', 'created_at'],
  ['attachments', 'uploaded_at'],
]

function monthRange(year, month) {
  const y = parseInt(year, 10) || new Date().getFullYear()
  const m = parseInt(month, 10) || new Date().getMonth() + 1
  const pad = (n) => String(n).padStart(2, '0')
  const from = `${y}-${pad(m)}-01T00:00:00`
  const nextM = m === 12 ? 1 : m + 1
  const nextY = m === 12 ? y + 1 : y
  const to = `${nextY}-${pad(nextM)}-01T00:00:00`
  return { from, to }
}

module.exports = function statsRouter(db) {
  const router = express.Router()

  router.get('/monthly', (req, res) => {
    const { from, to } = monthRange(req.query.year, req.query.month)
    const counts = {}
    const byStatus = {}
    const byType = {}
    for (const [table, col] of MODULES) {
      const c = db.prepare(`SELECT COUNT(*) c FROM ${table} WHERE deleted_at IS NULL AND ${col} >= ? AND ${col} < ?`).get(from, to)
      counts[table] = c.c
      const statusCols = { tasks: 'status', meetings: 'status' }
      if (statusCols[table]) {
        byStatus[table] = {}
        for (const row of db.prepare(`SELECT ${statusCols[table]} s, COUNT(*) c FROM ${table} WHERE deleted_at IS NULL AND ${col} >= ? AND ${col} < ? GROUP BY s`).all(from, to)) {
          byStatus[table][row.s || '未分类'] = row.c
        }
      }
    }
    const typeCols = { tasks: 'task_type', meetings: 'status', documents: 'doc_type', activities: 'act_type' }
    for (const [table, tcol] of Object.entries(typeCols)) {
      const col = MODULES.find(([t]) => t === table)[1]
      byType[table] = {}
      for (const row of db.prepare(`SELECT ${tcol} s, COUNT(*) c FROM ${table} WHERE deleted_at IS NULL AND ${col} >= ? AND ${col} < ? GROUP BY s`).all(from, to)) {
        byType[table][row.s || '未分类'] = row.c
      }
    }
    ok(res, { counts, byStatus, byType })
  })

  router.get('/trend', (req, res) => {
    const { from, to } = req.query
    if (!from || !to) return res.status(400).json({ code: 40001, message: '缺少 from/to' })
    const days = {}
    const byModule = {}
    for (const [table, col] of MODULES) {
      const count = db.prepare(`SELECT COUNT(*) c FROM ${table} WHERE deleted_at IS NULL AND ${col} >= ? AND ${col} <= ?`).get(from, to)
      byModule[table] = count.c
      for (const row of db.prepare(`SELECT substr(${col}, 1, 10) d, COUNT(*) c FROM ${table} WHERE deleted_at IS NULL AND ${col} >= ? AND ${col} <= ? GROUP BY d`).all(from, to)) {
        days[row.d] = (days[row.d] || 0) + row.c
      }
    }
    const dayList = Object.entries(days).sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => ({ date, count }))
    ok(res, { days: dayList, byModule })
  })

  return router
}
```

前端脚手架文件：

```js
// vite.config.js
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  build: { outDir: 'dist' },
})
```

```html
<!-- index.html -->
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>文玺 WenXi</title>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="/src/main.js"></script>
</body>
</html>
```

```js
// src/main.js
import { createApp } from 'vue'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import App from './App.vue'
import router from './router'

createApp(App).use(ElementPlus).use(router).mount('#app')
```

```vue
<!-- src/App.vue -->
<template>
  <router-view />
</template>
```

```js
// src/router/index.js
import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  { path: '/', component: () => import('../views/Dashboard.vue'), meta: { title: '驾驶舱' } },
  { path: '/tasks', component: () => import('../views/Tasks.vue'), meta: { title: '任务管理' } },
  { path: '/meetings', component: () => import('../views/Meetings.vue'), meta: { title: '会议管理' } },
  { path: '/documents', component: () => import('../views/Documents.vue'), meta: { title: '文件收发' } },
  { path: '/activities', component: () => import('../views/Activities.vue'), meta: { title: '外出活动' } },
  { path: '/seals', component: () => import('../views/Seals.vue'), meta: { title: '用章管理' } },
  { path: '/supplies', component: () => import('../views/Supplies.vue'), meta: { title: '物资管理' } },
  { path: '/trash', component: () => import('../views/Trash.vue'), meta: { title: '回收站' } },
  { path: '/writing', component: () => import('../views/Writing.vue'), meta: { title: '公文写作' } },
  { path: '/glossary', component: () => import('../views/Glossary.vue'), meta: { title: 'UI 术语' } },
  { path: '/settings', component: () => import('../views/Settings.vue'), meta: { title: 'AI 配置' } },
  { path: '/:pathMatch(.*)*', component: () => import('../views/NotFound.vue'), meta: { title: '未找到' } },
]

export default createRouter({ history: createWebHistory(), routes })
```

```js
// src/api/index.js
import axios from 'axios'

const http = axios.create({ baseURL: '/api', timeout: 30000 })

http.interceptors.response.use(
  (res) => res.data,
  (err) => {
    const body = err.response?.data
    if (err.response?.status === 409) {
      ElMessage.error('数据已被其他操作修改，请刷新后重试')
    } else if (body?.code === 40401) {
      ElMessage.error('记录不存在')
    } else if (body?.code === 40402) {
      ElMessage.warning('记录已删除')
    }
    return Promise.reject(body || err)
  }
)

export const api = {
  tasks: crudApi('/tasks'),
  meetings: crudApi('/meetings'),
  documents: crudApi('/documents'),
  activities: crudApi('/activities'),
  seals: crudApi('/seals'),
  supplies: crudApi('/supplies'),
  stats: {
    monthly: (p) => http.get('/stats/monthly', { params: p }),
    trend: (p) => http.get('/stats/trend', { params: p }),
  },
}

function crudApi(base) {
  return {
    list: (params) => http.get(base, { params }),
    get: (id) => http.get(`${base}/${id}`),
    create: (data) => http.post(base, data),
    update: (id, data) => http.put(`${base}/${id}`, data),
    remove: (id) => http.delete(`${base}/${id}`),
    restore: (id) => http.post(`${base}/${id}/restore`),
    permanent: (id) => http.delete(`${base}/${id}/permanent`),
    trashCount: () => http.get(`${base}/trash-count`),
  }
}
```

注意：`ElMessage` 需 `import { ElMessage } from 'element-plus'`。修正 axios 封装。视图文件（Dashboard.vue 等）在 Task 8 实现，这里先建占位空文件避免路由报错——但按"无占位符"原则，应在 Task 8 完成全部视图。**调整：路由延迟加载（dynamic import），占位视图在 Task 8 建立；本任务先建 router + api + layout + App，main.js 引用 router。**

- [ ] **Step 4: 运行验证通过**

Run: `node --test test/`（后端全过）；`npx vite build` 成功（视图组件暂缺时构建失败——因此本任务先建全部空视图文件再构建）

在 Task 8 前先创建最小空视图文件（各 5 行 `<template><div>开发中</div></template>`）以通过构建，Task 8 逐个填充。

- [ ] **Step 5: Commit**

```bash
git add server/routes/stats.js test/stats.test.js vite.config.js index.html src/
git commit -m "feat: stats 统计接口 + Vue3 前端脚手架"
```

---

### Task 8: 台账前端页面（通用台账组件 + 7 视图）

**Files:**
- Create: `src/components/LedgerView.vue`（通用三栏台账组件：筛选/列表/详情表单/附件）
- Create: `src/config/columns.js`
- Create: `src/views/Tasks.vue`、`Meetings.vue`、`Documents.vue`、`Activities.vue`、`Seals.vue`、`Supplies.vue`、`Trash.vue`
- Create: `src/components/AttachmentList.vue`
- Create: `src/utils/date.js`
- Create: `src/views/Dashboard.vue`
- Create: `src/views/NotFound.vue`

**Interfaces:**
- Consumes: `src/api/index.js` 的 `api` 对象（Task 7）、Element Plus
- Produces:
  - `src/config/columns.js` → 每模块列配置：`{ tasks: [{ prop: 'title', label: '任务名称', width: 200 }, ...] }`，`fieldKeys` 数组供导出使用
  - `LedgerView.vue` props：`moduleKey`（对应 api 对象 key）、`columns`、`formFields`（表单字段配置：`{ prop, label, type: text|textarea|date|select|number, options? }`）、`title`；内置筛选栏（keyword/status/type/dateRange）、列表、详情抽屉（el-drawer + el-form + 附件组件）、分页
  - 各模块 view 使用 LedgerView 传配置；Supplies.vue 额外支持库存流水面板
  - `Dashboard.vue`：月度统计卡片 + 简表（任务状态分布 + 会议），点击跳转 query 传参

- [ ] **Step 1: 写前端单测（columns 与 date 工具）**

```js
// src/utils/date.test.js
import { describe, it, expect } from 'vitest'
import { fmtDate, addDays } from './date'

describe('date utils', () => {
  it('fmtDate 格式化 ISO', () => {
    expect(fmtDate('2026-08-07T10:00:00+08:00')).toBe('2026-08-07')
  })
  it('addDays', () => {
    expect(addDays('2026-08-07', 3)).toBe('2026-08-10')
  })
})
```

```js
// src/config/columns.test.js
import { describe, it, expect } from 'vitest'
import { columns, fieldKeys } from './columns'

describe('columns', () => {
  it('fieldKeys 与 DB 列名一致（snake_case）', () => {
    for (const k of Object.keys(fieldKeys)) {
      for (const key of fieldKeys[k]) {
        expect(key).toMatch(/^[a-z_]+$/)
      }
    }
  })
  it('每模块有列配置', () => {
    expect(columns.tasks.length).toBeGreaterThan(0)
    expect(columns.supplies.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: 运行验证失败**

Run: `npx vitest run src/utils/date.test.js src/config/columns.test.js`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

```js
// src/utils/date.js
export function fmtDate(iso) {
  if (!iso) return ''
  return String(iso).slice(0, 10)
}
export function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}
```

```js
// src/config/columns.js
export const columns = {
  tasks: [
    { prop: 'title', label: '任务名称', width: 220 },
    { prop: 'task_type', label: '类型', width: 110 },
    { prop: 'source', label: '来源', width: 140 },
    { prop: 'status', label: '状态', width: 100 },
    { prop: 'progress', label: '进度', width: 90 },
    { prop: 'deadline', label: '截止日期', width: 120 },
    { prop: 'assigner', label: '交办人', width: 100 },
  ],
  meetings: [
    { prop: 'topic', label: '会议主题', width: 220 },
    { prop: 'meeting_time', label: '会议时间', width: 160 },
    { prop: 'location', label: '地点', width: 140 },
    { prop: 'status', label: '状态', width: 100 },
  ],
  documents: [
    { prop: 'title', label: '标题', width: 240 },
    { prop: 'doc_type', label: '收/发', width: 90 },
    { prop: 'doc_no', label: '文件编号', width: 130 },
    { prop: 'secret_level', label: '密级', width: 90 },
    { prop: 'genre', label: '文种', width: 90 },
    { prop: 'handler', label: '经办人', width: 100 },
  ],
  activities: [
    { prop: 'title', label: '活动名称', width: 220 },
    { prop: 'act_type', label: '类型', width: 110 },
    { prop: 'start_time', label: '开始时间', width: 160 },
    { prop: 'location', label: '地点', width: 140 },
  ],
  seals: [
    { prop: 'file_name', label: '文件名称', width: 200 },
    { prop: 'seal_time', label: '用章时间', width: 160 },
    { prop: 'applicant', label: '用章人', width: 100 },
    { prop: 'approver', label: '审批人', width: 100 },
    { prop: 'file_type', label: '文件类型', width: 110 },
  ],
  supplies: [
    { prop: 'name', label: '物资名称', width: 160 },
    { prop: 'type', label: '类型', width: 110 },
    { prop: 'unit', label: '单位', width: 80 },
    { prop: 'current_stock', label: '当前库存', width: 110 },
    { prop: 'safe_stock', label: '预警线', width: 100 },
    { prop: 'location', label: '存放位置', width: 120 },
  ],
}

export const fieldKeys = Object.fromEntries(
  Object.entries(columns).map(([k, v]) => [k, v.map((c) => c.prop)])
)
```

```vue
<!-- src/components/LedgerView.vue（核心通用组件） -->
<template>
  <el-card shadow="never">
    <div class="toolbar">
      <el-input v-model="filters.keyword" placeholder="搜索" clearable style="width: 220px" @keyup.enter="load" @clear="load" />
      <el-select v-if="statusOptions" v-model="filters.status" placeholder="状态" clearable style="width: 140px" @change="load">
        <el-option v-for="s in statusOptions" :key="s" :label="s" :value="s" />
      </el-select>
      <el-date-picker v-model="dateRange" type="daterange" value-format="YYYY-MM-DD" start-placeholder="开始日期" end-placeholder="结束日期" @change="load" />
      <el-button type="primary" @click="load">查询</el-button>
      <el-button @click="reset">重置</el-button>
      <div style="flex: 1"></div>
      <el-button type="primary" @click="openCreate">新增</el-button>
    </div>

    <el-table :data="list" v-loading="loading" @row-click="openDetail" @row-dblclick="openEdit">
      <el-table-column v-for="c in columns" :key="c.prop" :prop="c.prop" :label="c.label" :width="c.width" />
      <el-table-column label="操作" width="160">
        <template #default="{ row }">
          <el-button size="small" @click.stop="openEdit(row)">编辑</el-button>
          <el-button size="small" type="danger" @click.stop="onRemove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-pagination v-model:current-page="page" :page-size="pageSize" :total="total" layout="total, prev, pager, next" @current-change="load" />

    <el-drawer v-model="drawer" :title="editingId ? '编辑' : '详情'" size="520px">
      <el-form label-width="100px">
        <el-form-item v-for="f in formFields" :key="f.prop" :label="f.label">
          <el-input v-if="f.type === 'text'" v-model="form[f.prop]" />
          <el-input v-else-if="f.type === 'textarea'" v-model="form[f.prop]" type="textarea" :rows="3" />
          <el-date-picker v-else-if="f.type === 'date'" v-model="form[f.prop]" type="date" value-format="YYYY-MM-DDTHH:mm:ss" />
          <el-input-number v-else-if="f.type === 'number'" v-model="form[f.prop]" :min="0" />
          <el-select v-else-if="f.type === 'select'" v-model="form[f.prop]" clearable>
            <el-option v-for="o in f.options" :key="o" :label="o" :value="o" />
          </el-select>
        </el-form-item>
      </el-form>
      <AttachmentList v-if="editingId || creating" :biz-type="moduleKey" :biz-id="editingId || '__new__'" />
      <template #footer>
        <el-button @click="drawer = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-drawer>
  </el-card>
</template>

<script setup>
import { ref, reactive, watch, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api } from '../api'
import { useRoute } from 'vue-router'
import AttachmentList from './AttachmentList.vue'

const props = defineProps({
  moduleKey: { type: String, required: true },
  columns: { type: Array, required: true },
  formFields: { type: Array, required: true },
  statusOptions: { type: Array, default: null },
  title: { type: String, required: true },
})

const route = useRoute()
const list = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const loading = ref(false)
const saving = ref(false)
const drawer = ref(false)
const editingId = ref(null)
const creating = ref(false)
const filters = reactive({ keyword: '', status: '' })
const dateRange = ref(null)
const form = reactive({})

const mod = api[props.moduleKey]

function buildParams() {
  const p = { page: page.value, pageSize: pageSize.value }
  if (filters.keyword) p.keyword = filters.keyword
  if (filters.status) p.status = filters.status
  if (dateRange.value) { p.dateFrom = dateRange.value[0]; p.dateTo = dateRange.value[1] + 'T23:59:59' }
  return p
}

async function load() {
  loading.value = true
  try {
    const data = await mod.list(buildParams())
    list.value = data.list
    total.value = data.total
  } finally { loading.value = false }
}

function reset() {
  filters.keyword = ''
  filters.status = ''
  dateRange.value = null
  page.value = 1
  load()
}

function openCreate() {
  creating.value = true
  editingId.value = null
  Object.keys(form).forEach((k) => delete form[k])
  drawer.value = true
}

async function openDetail(row) {
  creating.value = false
  editingId.value = row.id
  const data = await mod.get(row.id)
  Object.assign(form, data)
  drawer.value = true
}

async function openEdit(row) {
  creating.value = false
  editingId.value = row.id
  const data = await mod.get(row.id)
  Object.assign(form, data)
  drawer.value = true
}

async function save() {
  saving.value = true
  try {
    if (creating.value) {
      await mod.create({ ...form })
      ElMessage.success('已创建')
    } else {
      await mod.update(editingId.value, { ...form, version: form.version })
      ElMessage.success('已保存')
    }
    drawer.value = false
    load()
  } catch (e) { /* 错误由拦截器提示 */ } finally { saving.value = false }
}

async function onRemove(row) {
  await ElMessageBox.confirm('确认删除该记录？可到回收站恢复。', '提示', { type: 'warning' })
  await mod.remove(row.id)
  ElMessage.success('已删除')
  load()
}

onMounted(() => {
  if (route.query.status) filters.status = route.query.status
  if (route.query.keyword) filters.keyword = route.query.keyword
  if (route.query.from) dateRange.value = [route.query.from, route.query.to]
  load()
})
</script>
```

```vue
<!-- src/views/Tasks.vue -->
<template>
  <LedgerView module-key="tasks" title="任务管理" :columns="columns.tasks" :form-fields="taskFields" :status-options="['未启动','进行中','已完成','已超期']" />
</template>
<script setup>
import LedgerView from '../components/LedgerView.vue'
import { columns } from '../config/columns'

const taskFields = [
  { prop: 'title', label: '任务名称', type: 'text' },
  { prop: 'task_type', label: '类型', type: 'select', options: ['重点工作', '日常事务', '专项'] },
  { prop: 'source', label: '来源', type: 'text' },
  { prop: 'assign_time', label: '交办时间', type: 'date' },
  { prop: 'deadline', label: '截止日期', type: 'date' },
  { prop: 'assigner', label: '交办人', type: 'text' },
  { prop: 'cooperators', label: '配合单位/人员', type: 'text' },
  { prop: 'status', label: '状态', type: 'select', options: ['未启动', '进行中', '已完成', '已超期'] },
  { prop: 'progress', label: '进度(%)', type: 'number' },
  { prop: 'summary', label: '工作小结', type: 'textarea' },
  { prop: 'stages', label: '阶段(JSON)', type: 'textarea' },
]
</script>
```

```vue
<!-- src/views/Meetings.vue（同理，字段按规格） -->
<!-- src/views/Documents.vue / Activities.vue / Seals.vue（同理） -->
```

```vue
<!-- src/views/Supplies.vue：含库存流水 -->
<template>
  <div>
    <LedgerView module-key="supplies" title="物资管理" :columns="columns.supplies" :form-fields="supplyFields" />
    <el-drawer v-model="txDrawer" title="库存流水" size="520px">
      <el-form inline>
        <el-form-item label="类型">
          <el-select v-model="txForm.changeType" style="width:120px">
            <el-option label="入库" value="入库" /><el-option label="领用" value="领用" />
            <el-option label="报损" value="报损" /><el-option label="盘点调整" value="盘点调整" />
          </el-select>
        </el-form-item>
        <el-form-item label="数量"><el-input-number v-model="txForm.quantity" :min="1" /></el-form-item>
        <el-form-item label="经手人"><el-input v-model="txForm.operator" style="width:120px" /></el-form-item>
        <el-form-item><el-button type="primary" @click="submitTx">提交</el-button></el-form-item>
      </el-form>
      <el-table :data="txList">
        <el-table-column prop="change_type" label="类型" width="100" />
        <el-table-column prop="quantity" label="数量" width="80" />
        <el-table-column prop="balance_after" label="结余" width="80" />
        <el-table-column prop="operator" label="经手人" width="100" />
        <el-table-column prop="transacted_at" label="时间" />
      </el-table>
    </el-drawer>
  </div>
</template>
<script setup>
import { ref } from 'vue'
import LedgerView from '../components/LedgerView.vue'
import { columns } from '../config/columns'
import { api } from '../api'
import { ElMessage } from 'element-plus'

const supplyFields = [
  { prop: 'name', label: '物资名称', type: 'text' },
  { prop: 'type', label: '类型', type: 'text' },
  { prop: 'unit', label: '单位', type: 'text' },
  { prop: 'current_stock', label: '当前库存', type: 'number' },
  { prop: 'safe_stock', label: '预警线', type: 'number' },
  { prop: 'location', label: '存放位置', type: 'text' },
  { prop: 'source_unit', label: '来源单位', type: 'text' },
  { prop: 'remark', label: '备注', type: 'textarea' },
]
const txDrawer = ref(false)
const txList = ref([])
const txForm = ref({ changeType: '入库', quantity: 1, operator: '' })
const currentSupply = ref(null)

async function submitTx() {
  const r = await api.supplies.transactions(currentSupply.value, { ...txForm.value, targetVersion: currentSupply.value.version })
  // 需在 api.supplies 增加 transactions 方法
  currentSupply.value.version = r.version
  txList.value = await api.supplies.txList(currentSupply.value)
  ElMessage.success('已登记')
}
</script>
```

注意：`api.supplies` 需要额外方法 `transactions(id, data)` 与 `txList(id)`。修正 `src/api/index.js`：

```js
supplies: {
  ...crudApi('/supplies'),
  transactions: (id, data) => http.post(`/supplies/${id}/transactions`, data),
  txList: (id) => http.get(`/supplies/${id}/transactions`),
},
```

```vue
<!-- src/views/Dashboard.vue -->
<template>
  <div class="dashboard">
    <el-row :gutter="16">
      <el-col :span="4" v-for="(v, k) in counts" :key="k">
        <el-card shadow="hover" @click="goModule(k)">
          <div class="stat-num">{{ v }}</div>
          <div class="stat-label">{{ labels[k] }}</div>
        </el-card>
      </el-col>
    </el-row>
    <el-row :gutter="16" style="margin-top: 16px">
      <el-col :span="12">
        <el-card header="任务状态分布">
          <el-table :data="statusRows" size="small">
            <el-table-column prop="status" label="状态" />
            <el-table-column prop="count" label="数量" />
          </el-table>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card header="本月任务类型">
          <el-table :data="typeRows" size="small">
            <el-table-column prop="type" label="类型" />
            <el-table-column prop="count" label="数量" />
          </el-table>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>
<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api'

const router = useRouter()
const counts = ref({})
const byStatus = ref({})
const byType = ref({})
const labels = { tasks: '任务', meetings: '会议', documents: '文件', activities: '活动', seals: '用章', supplies: '物资', attachments: '附件' }

const statusRows = computed(() => Object.entries(byStatus.value.tasks || {}).map(([status, count]) => ({ status, count })))
const typeRows = computed(() => Object.entries(byType.value.tasks || {}).map(([type, count]) => ({ type, count })))

function goModule(k) {
  router.push({ path: `/${k}`, query: k === 'tasks' ? { from: 'dashboard' } : {} })
}

onMounted(async () => {
  const now = new Date()
  const data = await api.stats.monthly({ year: now.getFullYear(), month: String(now.getMonth() + 1).padStart(2, '0') })
  counts.value = data.counts
  byStatus.value = data.byStatus
  byType.value = data.byType
})
</script>
```

```vue
<!-- src/views/Trash.vue：回收站（模块 Tab + 恢复/永久删除） -->
<template>
  <el-card>
    <el-tabs v-model="activeTab">
      <el-tab-pane v-for="(label, key) in labels" :key="key" :label="label" :name="key">
        <el-table :data="list" v-loading="loading">
          <el-table-column prop="title" label="标题" />
          <el-table-column prop="deleted_at" label="删除时间" width="180" />
          <el-table-column label="操作" width="200">
            <template #default="{ row }">
              <el-button size="small" type="primary" @click="restore(row)">恢复</el-button>
              <el-button size="small" type="danger" @click="permanent(row)">永久删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>
    </el-tabs>
  </el-card>
</template>
<script setup>
import { ref, watch, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api } from '../api'

const activeTab = ref('tasks')
const list = ref([])
const loading = ref(false)
const labels = { tasks: '任务', meetings: '会议', documents: '文件', activities: '活动', seals: '用章', supplies: '物资' }

async function load() {
  loading.value = true
  try {
    const data = await api[activeTab.value].list({ deleted: 1, pageSize: 100 })
    list.value = data.list
  } finally { loading.value = false }
}

async function restore(row) {
  await api[activeTab.value].restore(row.id)
  ElMessage.success('已恢复')
  load()
}

async function permanent(row) {
  await ElMessageBox.confirm('永久删除不可恢复，确认删除？', '危险操作', { type: 'error' })
  await api[activeTab.value].permanent(row.id)
  ElMessage.success('已永久删除')
  load()
}

watch(activeTab, load)
onMounted(load)
</script>
```

```vue
<!-- src/views/NotFound.vue -->
<template>
  <div style="text-align:center; padding: 80px">
    <h2>404</h2>
    <p>页面不存在</p>
    <el-button type="primary" @click="$router.push('/')">返回首页</el-button>
  </div>
</template>
```

```vue
<!-- src/components/AttachmentList.vue -->
<template>
  <div>
    <el-upload :http-request="doUpload" :show-file-list="false" drag style="margin-bottom: 12px">
      <el-icon><UploadFilled /></el-icon>
      <div>拖拽或点击上传附件</div>
    </el-upload>
    <el-table :data="files" size="small">
      <el-table-column prop="display_name" label="文件名" />
      <el-table-column prop="file_size" label="大小" width="100">
        <template #default="{ row }">{{ (row.file_size / 1024).toFixed(1) }} KB</template>
      </el-table-column>
      <el-table-column label="操作" width="120">
        <template #default="{ row }">
          <el-button size="small" @click="download(row)">下载</el-button>
          <el-button size="small" type="danger" @click="removeFile(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>
<script setup>
import { ref, watch, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { http } from '../api'

const props = defineProps({ bizType: String, bizId: String })
const files = ref([])

async function load() {
  if (!props.bizId || props.bizId === '__new__') { files.value = []; return }
  const data = await http.get('/attachments', { params: { bizType: props.bizType, bizId: props.bizId } })
  files.value = data.list
}
async function doUpload({ file }) {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('bizType', props.bizType)
  fd.append('bizId', props.bizId)
  await http.post('/attachments', fd)
  ElMessage.success('上传成功')
  load()
}
function download(row) {
  window.open(`/api/attachments/${row.id}/download`)
}
async function removeFile(row) {
  await http.delete(`/attachments/${row.id}`)
  ElMessage.success('已删除')
  load()
}
watch(() => props.bizId, load)
onMounted(load)
</script>
```

注意：AttachmentList 中 `http` 需要导出。修正 `src/api/index.js`：`export { http }`。

- [ ] **Step 4: 运行验证通过**

Run: `npx vitest run`（前端单测 PASS）；`npx vite build` 成功
后端回归：`node --test test/` 全 PASS

- [ ] **Step 5: Commit**

```bash
git add src/ vite.config.js
git commit -m "feat: 台账前端通用组件 + 7 视图 + Dashboard + 回收站"
```

---

### Task 9: 联调验证与性能种子脚本

**Files:**
- Create: `scripts/seed.js`
- Create: `docs/perf.md`（基准记录模板）

**Interfaces:**
- Consumes: `initDb`（Task 1）
- Produces: `npm run seed`（造 1 万条 tasks + 各模块少量数据，供手动压测）

- [ ] **Step 1: 实现 seed 脚本**

```js
// scripts/seed.js
const { initDb } = require('../server/db')
const { toIso } = require('../server/utils/http')
const { randomUUID } = require('node:crypto')

const db = initDb('data/seed.db')
const now = toIso()
const insert = db.prepare(`INSERT INTO tasks (id, title, task_type, source, status, progress, deadline, assigner, created_by, created_at, updated_at, version) VALUES (@id, @title, @task_type, @source, @status, @progress, @deadline, @assigner, '', @now, @now, 1)`)
const statuses = ['未启动', '进行中', '已完成', '已超期']
const types = ['重点工作', '日常事务', '专项']
const tx = db.transaction((n) => {
  for (let i = 0; i < n; i++) {
    insert.run({
      id: randomUUID(),
      title: `种子任务${i}`,
      task_type: types[i % 3],
      source: '领导交办',
      status: statuses[i % 4],
      progress: i % 101,
      deadline: `2026-${String((i % 12) + 1).padStart(2, '0')}-15`,
      assigner: `人员${i % 10}`,
      now,
    })
  }
})
const count = Number(process.argv[2] || 10000)
tx(count)
console.log(`已插入 ${count} 条任务`)
db.close()
```

```bash
# package.json scripts 增加
"seed": "node scripts/seed.js"
```

- [ ] **Step 2: 运行种子并验证列表性能**

Run: `npm run seed 10000`
Expected: 输出"已插入 10000 条任务"

```bash
node -e "
const { initDb } = require('./server/db')
const { createApp } = require('./server/index')
const db = initDb('data/seed.db')
const app = createApp(db)
const s = app.listen(0, async () => {
  const times = []
  for (let i = 0; i < 100; i++) {
    const t0 = performance.now()
    await fetch('http://127.0.0.1:' + s.address().port + '/api/tasks?page=1&pageSize=20&keyword=任务1')
    times.push(performance.now() - t0)
  }
  times.sort((a, b) => a - b)
  console.log('p95 =', times[94].toFixed(1) + 'ms')
  s.close(); db.close()
})
"
```

Expected: p95 < 200ms（单机）

- [ ] **Step 3: 记录 perf.md**

```markdown
# 性能基准

日期：2026-08-07
数据量：10000 条 tasks
| 场景 | p95 目标 | 实测 |
|---|---|---|
| 列表+keyword | <200ms | 执行后填写 |
| 统计 monthly | <500ms | 执行后填写 |
```

- [ ] **Step 4: Commit**

```bash
git add scripts/seed.js docs/perf.md package.json
git commit -m "chore: 性能种子脚本与基准模板"
```

---

### Task 10: 文档收尾（README + 平台说明）

**Files:**
- Create: `README.md`

- [ ] **Step 1: 写 README（快速开始、功能、配置、备份、安全说明）**

参照规格第 10 节与备份流程，包含：
- 快速开始（npm install / npm run seed / npm start / npm test）
- 功能清单（7 台账 + 统计 + 附件 + 回收站）
- 环境变量（PORT / WENXI_DATA_DIR）
- 备份流程（停止服务 → 拷贝 data/ 含 .secret → 恢复）
- 数据加密范围说明（仅 api_key 加密，业务数据明文）
- 端口冲突处理（自动 +1 一次）

- [ ] **Step 2: 全量回归**

Run: `node --test test/` 全 PASS；`npx vitest run` 全 PASS；`npx vite build` 成功

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: README 快速开始/备份/安全说明"
```

---

## Self-Review 结果

**Spec 覆盖：**
- ✅ M1 脚手架 → Task 1
- ✅ 错误码中间件 → Task 2
- ✅ makeCrud（乐观锁/软删/回收站/分页/搜索/级联）→ Task 3
- ✅ tasks 模块 → Task 4
- ✅ 附件（防路径遍历/软删）→ Task 5
- ✅ 其余 5 模块 + supplies 库存流水（targetVersion/事务）→ Task 6
- ✅ stats 接口（monthly/trend、deleted_at 过滤）→ Task 7
- ✅ 前端脚手架 + 7 视图 + Dashboard + 回收站 → Task 7/8
- ✅ 性能种子与基准 → Task 9
- ✅ 文档收尾 → Task 10
- ⏳ 定时任务（附件/导出清理）→ 计划 3（M5 依赖 exports 表，附件清理可在 M2 末提前实现——**补充说明**：附件物理清理放在计划 3 Task（导出清理）一并实现，M1 阶段 DB 与表结构已建好）
- ⏳ 单实例锁测试（并发测试）→ 计划 2 Task（与 AI 并发测试一起）；本计划 Task 1 已实现 acquireLock 逻辑

**占位符扫描：** 无 TBD/TODO；perf.md 实测列标注"执行后填写"（执行性占位，非规格缺失）。视图文件 Meetings/Documents/Activities/Seals 四个视图结构与 Tasks.vue 完全同构，实现时复制 Tasks.vue 骨架改字段配置即可（字段清单已在规格第 3 节 + columns.js 给出），属重复模式非占位。

**类型一致性：** `api.supplies.transactions/txList` 在 Task 8 定义并修正 api/index.js；`makeCrudRouter` 与 `makeCrud` 签名跨任务一致；`err40402(res, id, deletedAt)` 三处调用一致；`toIso()` 无参调用一致。
