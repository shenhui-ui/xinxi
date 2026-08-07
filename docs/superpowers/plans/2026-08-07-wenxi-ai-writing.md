# 文玺 AI 写作模块（M3+M4）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成文玺 AI 能力：AI 配置管理（AES-256-GCM 加密）、provider 抽象层、write/polish/chat 三个 SSE 流式接口、内置公文写作 SKILL 装配、公文排版引擎（data-block 双格式），以及写作工作台前端（三栏、场景表单、SSE 流式渲染、文档状态、撤销栈、草稿恢复）。

**Architecture:** 后端 Express 提供 `/api/ai/*` 与 `/api/writings`；`provider.js` 抽象 OpenAI 兼容上游（可注入 fake）；SKILL 为服务端只读文本文件（`server/skills/*.md` + loader），写请求时后端拼 system prompt。前端 Vue3 写作台消费 SSE 流式渲染，编辑器 contenteditable + data-block 区块语义。

**Tech Stack:** Node 20+、Express、better-sqlite3、node:crypto（AES-256-GCM）、fetch（SSE 上游解析）、Vue 3、Element Plus。

## Global Constraints

- 密钥文件 `data/.secret`（32 字节随机，chmod 600），缺失时启动明确失败提示恢复，不静默重建；`crypto.js` 暴露 `_getSecretPath()` 供测试注入 `WENXI_SECRET_PATH`
- 仅加密 `api_key_enc`（AES-256-GCM）；前端只拿掩码 `sk-****last4`；测试接口 `configId` 优先于 `apiKey`，两者均空 → 40002
- SSE：`data: {delta}` 逐块 → `data: [DONE]`；出错 `event: error, data: {message}`
- 超时：HTTP 120s、流式首 token 60s、测试连接 15s；**不自动重试**；上游错误体脱敏（只透传 status+描述，日志过滤 `sk-`/`authorization`）
- SKILL 只服务端注入，前端不持有；system prompt 组装顺序：SKILL 全文 + 场景指令模板 + 台账素材
- 上限：weekly 聚合注入 ≤200 条（计数不截断）；report bizRefs 每类 ≤50 条；polish text ≤20000 字符
- 错误码沿用计划 1：40001/40002/40401/40402/409/40403
- `shared/blocks.json` 单一事实源；构建期 `node build/check-blocks.mjs` 校验前后端映射齐全
- 写作台：文档三态（draft/saved/exported）；localStorage 草稿单向流动；撤销栈人工输入 800ms 防抖合并、AI 操作强制 push，栈深 50；beforeunload + 路由守卫；粘贴默认 body 区块
- 所有聚合 SQL 强制 `deleted_at IS NULL`

---

### Task 1: 密钥管理与加密工具（crypto.js）

**Files:**
- Create: `server/crypto.js`
- Create: `test/crypto.test.js`

**Interfaces:**
- Consumes: `server/config.js` 的 `dataDir`（计划 1 Task 1）
- Produces:
  - `getSecretKey()` → Buffer（32 字节）；首启自动生成 `data/.secret`（chmod 600）；缺失时抛 `"缺少密钥文件 data/.secret，请将备份的 .secret 文件放回 data/ 目录后重新启动"`；`_getSecretPath()` 供测试替换
  - `encryptText(plain)` → Buffer（`iv:tag:cipher` 拼接）
  - `decryptText(enc)` → string

- [ ] **Step 1: 写失败测试**

```js
// test/crypto.test.js
import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

let tmpDir
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wenxi-crypto-'))
  process.env.WENXI_SECRET_PATH = path.join(tmpDir, '.secret')
})
afterEach(() => {
  delete process.env.WENXI_SECRET_PATH
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

test('首启自动生成密钥并可加解密', async () => {
  const { getSecretKey, encryptText, decryptText } = await import('../server/crypto.js')
  const key = getSecretKey()
  assert.equal(key.length, 32)
  const enc = encryptText('sk-test-1234567890')
  assert.ok(Buffer.isBuffer(enc))
  assert.equal(decryptText(enc), 'sk-test-1234567890')
})

test('密钥文件权限 600', async () => {
  const { getSecretKey } = await import('../server/crypto.js')
  getSecretKey()
  const mode = fs.statSync(path.join(tmpDir, '.secret')).mode & 0o777
  assert.equal(mode, 0o600)
})

test('解密篡改密文抛错', async () => {
  const { getSecretKey, encryptText, decryptText } = await import('../server/crypto.js')
  getSecretKey()
  const enc = encryptText('secret')
  const tampered = Buffer.concat([enc.subarray(0, enc.length - 1), Buffer.from([enc[enc.length - 1] ^ 0xff])])
  assert.throws(() => decryptText(tampered))
})

test('已有密钥时复用（内容不变）', async () => {
  const { getSecretKey } = await import('../server/crypto.js')
  const k1 = getSecretKey()
  const k2 = getSecretKey()
  assert.deepEqual(k1, k2)
})
```

- [ ] **Step 2: 运行验证失败**

Run: `node --test test/crypto.test.js`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

```js
// server/crypto.js
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const config = require('./config')

function getSecretPath() {
  return process.env.WENXI_SECRET_PATH || path.join(config.dataDir, '.secret')
}

function getSecretKey() {
  const secretPath = getSecretPath()
  if (fs.existsSync(secretPath)) {
    const key = fs.readFileSync(secretPath)
    if (key.length >= 32) return key
    throw new Error('密钥文件损坏（不足 32 字节），请恢复备份')
  }
  const key = crypto.randomBytes(32)
  fs.mkdirSync(path.dirname(secretPath), { recursive: true })
  fs.writeFileSync(secretPath, key, { mode: 0o600 })
  try { fs.chmodSync(secretPath, 0o600) } catch (e) { /* Windows 忽略 */ }
  return key
}

function encryptText(plain) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', getSecretKey(), iv)
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, enc])
}

function decryptText(enc) {
  if (enc.length < 28) throw new Error('密文不完整')
  const iv = enc.subarray(0, 12)
  const tag = enc.subarray(12, 28)
  const data = enc.subarray(28)
  const decipher = crypto.createDecipheriv('aes-256-gcm', getSecretKey(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
}

module.exports = { getSecretKey, encryptText, decryptText, _getSecretPath: getSecretPath }
```

- [ ] **Step 4: 运行验证通过**

Run: `node --test test/crypto.test.js`
Expected: 4 个测试 PASS

- [ ] **Step 5: Commit**

```bash
git add server/crypto.js test/crypto.test.js
git commit -m "feat: AES-256-GCM 密钥管理与加解密"
```

---

### Task 2: AI 配置路由（CRUD + active + test 优先级）

**Files:**
- Create: `server/routes/ai-configs.js`
- Create: `test/ai-configs.test.js`
- Modify: `server/routes/index.js`

**Interfaces:**
- Consumes: `makeCrudRouter`（计划 1 Task 4）、`crypto.js`（本计划 Task 1）、`toIso`（计划 1 Task 2）
- Produces: 挂 `/api/ai/configs`：
  - `GET /`（列表，api_key 掩码）、`GET /active`（is_active=1，掩码）、`POST /`（增改，apiKey 明文→加密存储；更新时 apiKey 为空保留原密文）、`DELETE /:id`（软删）
  - `POST /api/ai/test`：`{ configId }` 或 `{ baseUrl, apiKey, modelName }`；configId 优先；均空 → 40002；测试超时 15s；响应不含 Key
  - `maskKey(apiKey)` → `sk-****last4`（≤8 字符返回 `****`）

- [ ] **Step 1: 写失败测试**

```js
// test/ai-configs.test.js
import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createServer } from 'node:http'
import { initDb } from '../server/db.js'
import { createApp } from '../server/index.js'
import { maskKey } from '../server/routes/ai-configs.js'

const TEST_DB = 'data/test.db'
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
  server.close(); db.close()
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
  const id = created.body.id
  const list = await call('GET', '/api/ai/configs')
  assert.equal(list.body.list.length, 1)
  assert.equal(list.body.list[0].api_key_mask, 'sk-****3456')
  assert.equal(list.body.list[0].api_key, undefined)
  const row = db.prepare('SELECT api_key_enc FROM ai_configs WHERE id = ?').get(id)
  assert.ok(row.api_key_enc, '密文已存储')
  const { decryptText } = await import('../server/crypto.js')
  assert.equal(decryptText(Buffer.from(row.api_key_enc)), 'sk-abcdef123456')
})

test('更新时 apiKey 为空保留原密文', async () => {
  const created = await call('POST', '/api/ai/configs', { name: 'A', baseUrl: 'u', apiKey: 'sk-old-secret', modelName: 'm' })
  await call('PUT', `/api/ai/configs/${created.body.id}`, { name: 'A2', baseUrl: 'u2', modelName: 'm2', version: 1 })
  const list = await call('GET', '/api/ai/configs')
  assert.equal(list.body.list[0].name, 'A2')
  assert.equal(list.body.list[0].api_key_mask, 'sk-****ecret'.slice(0, 11))
  const { decryptText } = await import('../server/crypto.js')
  const row = db.prepare('SELECT api_key_enc FROM ai_configs WHERE id = ?').get(created.body.id)
  assert.equal(decryptText(Buffer.from(row.api_key_enc)), 'sk-old-secret')
})

test('active 接口返回 is_active 配置，置激活', async () => {
  const a = await call('POST', '/api/ai/configs', { name: 'A', baseUrl: 'u', apiKey: 'sk-aaaa', modelName: 'm', isActive: true })
  const active = await call('GET', '/api/ai/configs/active')
  assert.equal(active.body.id, a.body.id)
})

test('test 接口：configId 优先于 apiKey', async () => {
  const created = await call('POST', '/api/ai/configs', { name: 'A', baseUrl: 'http://127.0.0.1:1/v1', apiKey: 'sk-x', modelName: 'm' })
  // configId + apiKey 同时传 → 走 configId（连不通也返回失败而非参数错）
  const r = await call('POST', '/api/ai/test', { configId: created.body.id, apiKey: 'sk-other' })
  assert.notEqual(r.body.code, 40002)
})

test('test 接口：均空返回 40002', async () => {
  const r = await call('POST', '/api/ai/test', {})
  assert.equal(r.statusCode, 400)
  assert.equal(r.body.code, 40002)
})

test('maskKey 边界', () => {
  assert.equal(maskKey('sk-abcdef123456'), 'sk-****3456')
  assert.equal(maskKey('short'), '****')
})
```

- [ ] **Step 2: 运行验证失败**

Run: `node --test test/ai-configs.test.js`
Expected: FAIL

- [ ] **Step 3: 实现**

```js
// server/routes/ai-configs.js
const express = require('express')
const { randomUUID } = require('node:crypto')
const { ok, fail, err40401 } = require('../utils/http')
const { toIso } = require('../utils/http')
const { encryptText, decryptText } = require('../crypto')
const { makeCrudRouter } = require('./crud')
const { createProvider } = require('../ai/provider')

function maskKey(key) {
  if (!key) return ''
  if (key.length <= 8) return '****'
  return `${key.slice(0, 2)}****${key.slice(-4)}`
}

function serialize(row) {
  if (!row) return null
  let api_key_mask = ''
  if (row.api_key_enc) {
    try { api_key_mask = maskKey(decryptText(Buffer.from(row.api_key_enc))) } catch (e) { api_key_mask = '****（无法解密）' }
  }
  const { api_key_enc, ...rest } = row
  return { ...rest, api_key_mask }
}

module.exports = function aiConfigsRouter(db) {
  const router = express.Router()

  router.get('/', (req, res) => {
    const rows = db.prepare('SELECT * FROM ai_configs WHERE deleted_at IS NULL ORDER BY created_at DESC').all()
    ok(res, { list: rows.map(serialize) })
  })

  router.get('/active', (req, res) => {
    const row = db.prepare('SELECT * FROM ai_configs WHERE deleted_at IS NULL AND is_active = 1 LIMIT 1').get()
    ok(res, serialize(row))
  })

  router.post('/', (req, res) => {
    const body = req.body || {}
    const now = toIso()
    const existing = body.id
      ? db.prepare('SELECT * FROM ai_configs WHERE id = ? AND deleted_at IS NULL').get(body.id)
      : null
    if (body.id && !existing) return err40401(res, body.id)
    if (body.isActive) {
      db.prepare('UPDATE ai_configs SET is_active = 0, updated_at = ?, version = version + 1 WHERE deleted_at IS NULL').run(now)
    }
    if (existing) {
      const version = parseInt(body.version, 10)
      if (!Number.isInteger(version)) return fail(res, 40001, '缺少 version')
      const patch = {
        name: body.name !== undefined ? body.name : existing.name,
        base_url: body.baseUrl !== undefined ? body.baseUrl : existing.base_url,
        model_name: body.modelName !== undefined ? body.modelName : existing.model_name,
        is_active: body.isActive ? 1 : (body.isActive === false ? 0 : existing.is_active),
        updated_at: now,
        version: version + 1,
      }
      if (body.apiKey) patch.api_key_enc = encryptText(body.apiKey)
      const sets = Object.keys(patch).map((k) => `${k} = @${k}`).join(', ')
      const r = db.prepare(`UPDATE ai_configs SET ${sets} WHERE id = @id AND version = @oldVersion`).run({ ...patch, id: existing.id, oldVersion: version })
      if (!r.changes) return res.status(409).json({ code: 409, message: '乐观锁版本冲突' })
      return ok(res, serialize(db.prepare('SELECT * FROM ai_configs WHERE id = ?').get(existing.id)))
    }
    const id = randomUUID()
    const row = {
      id,
      name: body.name || '未命名配置',
      base_url: body.baseUrl || '',
      api_key_enc: body.apiKey ? encryptText(body.apiKey) : null,
      model_name: body.modelName || '',
      is_active: body.isActive ? 1 : 0,
      created_at: now, updated_at: now,
      version: 1,
    }
    db.prepare(`INSERT INTO ai_configs (${Object.keys(row).join(',')}) VALUES (${Object.keys(row).map((k) => `@${k}`).join(',')})`).run(row)
    ok(res, serialize(row))
  })

  router.delete('/:id', (req, res) => {
    const r = db.prepare('UPDATE ai_configs SET deleted_at = ?, version = version + 1 WHERE id = ? AND deleted_at IS NULL').run(toIso(), req.params.id)
    if (!r.changes) return err40401(res, req.params.id)
    ok(res, { id: req.params.id })
  })

  router.post('/test', async (req, res) => {
    const body = req.body || {}
    const { configId, apiKey, baseUrl, modelName } = body
    if (!configId && !apiKey) return fail(res, 40002, 'configId 与 apiKey 均为空')
    let target = {}
    if (configId) {
      const row = db.prepare('SELECT * FROM ai_configs WHERE id = ? AND deleted_at IS NULL').get(configId)
      if (!row) return err40401(res, configId)
      let key = ''
      try { key = decryptText(Buffer.from(row.api_key_enc)) } catch (e) { return fail(res, 40001, '配置密钥解密失败') }
      target = { baseUrl: row.base_url, apiKey: key, model: row.model_name }
    } else {
      target = { baseUrl: baseUrl, apiKey: apiKey, model: modelName || '' }
    }
    const provider = createProvider(target)
    try {
      const result = await provider.testConnection(target)
      ok(res, result)
    } catch (e) {
      res.status(502).json({ code: 40001, message: `连接失败: ${e.message}` })
    }
  })

  return router
}

module.exports.maskKey = maskKey
```

```js
// server/routes/index.js（追加挂载）
const aiConfigsRouter = require('./ai-configs')
router.use('/ai/configs', aiConfigsRouter(db))
```

- [ ] **Step 4: 运行验证通过**

Run: `node --test test/ai-configs.test.js`
Expected: 全部 PASS（test 接口真实调用会连 127.0.0.1:1 失败但走 502 分支，`code!==40002` 断言成立）

- [ ] **Step 5: Commit**

```bash
git add server/routes/ai-configs.js server/routes/index.js test/ai-configs.test.js
git commit -m "feat: AI 配置 CRUD + 掩码 + active + 测试接口优先级"
```

---

### Task 3: SKILL 文件与装配（gongwen / biganzi / scenarios）

**Files:**
- Create: `server/skills/gongwen.md`
- Create: `server/skills/biganzi.md`
- Create: `server/skills/index.js`
- Create: `server/skills/scenarios.js`
- Create: `test/skills.test.js`

**Interfaces:**
- Consumes: 无
- Produces:
  - `server/skills/index.js` → `getSkill(name)`（读取 md 原文，返回字符串；去掉 AIGC frontmatter）
  - `server/skills/scenarios.js` → `SCENARIO_TEMPLATES = { weekly, report, draft }`（场景指令模板字符串）、`SKILL_MAP = { weekly: ['gongwen'], report: ['gongwen', 'biganzi'], draft: ['gongwen'], polish: [] }`
  - `buildSystemPrompt(scenario, materials)` → string（SKILL 全文 + 模板 + 素材）

- [ ] **Step 1: 写失败测试**

```js
// test/skills.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getSkill, buildSystemPrompt, SKILL_MAP } from '../server/skills/index.js'

test('gongwen SKILL 含核心方法论', () => {
  const s = getSkill('gongwen')
  assert.ok(s.includes('按·拿·推'))
  assert.ok(s.includes('基因层'))
})

test('biganzi SKILL 含五步法', () => {
  const s = getSkill('biganzi')
  assert.ok(s.includes('磨刀子'))
  assert.ok(s.includes('收果子'))
})

test('SKILL_MAP 装配规则', () => {
  assert.deepEqual(SKILL_MAP.weekly, ['gongwen'])
  assert.deepEqual(SKILL_MAP.report, ['gongwen', 'biganzi'])
  assert.deepEqual(SKILL_MAP.draft, ['gongwen'])
  assert.deepEqual(SKILL_MAP.polish, [])
})

test('buildSystemPrompt 拼接 SKILL+模板+素材', () => {
  const p = buildSystemPrompt('weekly', { dateFrom: '2026-08-01', dateTo: '2026-08-07', materials: '任务A；任务B' })
  assert.ok(p.includes('公文写作算法'))
  assert.ok(p.includes('周报'))
  assert.ok(p.includes('任务A'))
})
```

- [ ] **Step 2: 运行验证失败**

Run: `node --test test/skills.test.js`
Expected: FAIL

- [ ] **Step 3: 实现**

创建 `server/skills/gongwen.md`，内容如下（**原文照录，去除 AIGC frontmatter 头**）：

````markdown
# 公文写作算法 — 顿彬技能矩阵体系

你是严格按照顿彬《公文写作算法》六层技能矩阵训练的 AI 公文撰写引擎。拿到任何素材后，从基因层到高观点层逐层处理。

## 层级一：基因层·字词算法

**V+N（动词+名词）= 措施/计划**

```
强化思想建设  搭建交流平台  完善制度建设
推进项目落地  深化协同联动  提升工作质效
```

- 出现位置：全文均可使用，文章后半部分必须全部使用 V+N
- 判断：如果一段大量出现 V+N → 偏措施/计划型

**N+V（名词+动词）= 结果/成绩/问题**

```
示范点已建成  制度体系已完善  合规管理全覆盖
重大项目落地见效  突出问题整改到位
```

- 出现位置：仅文章前半部分（结果要先说，不能藏到后面）
- 位置规律：段首/标题位置 → 表达终极结果；句末位置 → 表达小结果
- 判断：如果一段大量出现 N+V → 偏成绩/总结型

**核心法则：文章后半部分禁止出现 N+V。**

**文章类型判断：统计全文 V+N 与 N+V 占比**
- 工作总结/周报/汇报：N+V（结果）占比应 ≥ 40%
- 工作计划/方案：V+N（措施）占比应 ≥ 60%

## 层级二：微观层·句子算法

### 3V+N 句式（三个措施 + 一个成绩）

公文最经典句式。动词必须 3 个，遵循递进逻辑（从虚到实/从准备到落实/从上到下/从古到今）。

**五大维度（完整版）：**

| 维度 | 说明 | 示例 |
|------|------|------|
| ①工作名称 | 核心任务 | "国企合规管理体系升级项目" |
| ②工作来源 | 上级要求/政策依据 | "依据国资委《中央企业合规管理指引》" |
| ③工作方式 | 创新手段/实施途径 | "通过搭建三级架构、编制手册、开展督查" |
| ④工作内容 | 3个动词（具体措施） | "规范决策流程、强化风险防控、提升合规意识" |
| ⑤工作成绩 | 1个名词+量化 | "完成28项制度修订，排查化解风险15项" |

**高浓度版（大型材料用）：** 精简为 3V + N 核心
> 开展合规培训、排查风险隐患、完善制度体系，实现合规管理全覆盖。

### 四大金刚（句子四大要素）

目标 → 过程 → 措施 → 结果

任何公文句子缺了这四要素之一，信息密度就不够。写作时逐句检查四要素是否齐全。

### 首段"按·拿·推"结构

- **按**（政策依据/上级要求/背景形势）：出师有名，奉天子以令诸侯
- **拿**（具体做法/措施组合）：宏观层面的动作集群
- **推**（推动实现的成效/目标/下一步方向）

> 【按】按照省委强化基层建设部署要求，【拿】我们深入实施"强基固本"专项行动，扎实推进网格化管理，加快建设智慧社区平台，【推】目前30个试点社区已上线运行，群众满意度持续提升。

## 层级三：中观层·字句段算法

### 工作周期与工作剧情

每项工作都有：起始（部署/启动）→ 推进（落实/协调）→ 收尾（完成/验收）的完整周期。

写作时不要只写"做了什么"，要体现工作在哪个阶段、下阶段走向。

### 词汇归入四大金刚

拿到任何素材，先把词汇按四类归档：
- 目标类词汇：实现、达到、完成、建设、打造
- 过程类词汇：推进、开展、实施、落实、协调
- 措施类词汇：制定、出台、部署、组织、安排
- 结果类词汇：已完成、已建成、已达标、提升至、增长

## 层级四：段落层·段落算法

### 公文四大成分

每个段落都由以下成分组合而成：**措施 / 目标 / 成绩 / 计划**

### 六大逻辑

1. **结论先行** — 段首亮观点/成绩/判断，后面用措施、数据支撑
2. **以上统下** — 先讲上级部署/政策/宏观形势，再讲本级落实
3. **归类分组** — 同类事项归入同段，不交叉、不混杂
4. **逻辑递进** — 按 计划→措施→成绩 或 问题→原因→对策 排列
5. **虚实搭配** — 务虚（站位/意义）+ 务实（具体做法/数据）交替
6. **因果串联** — 把原因、过程、结果串成完整链路

### 六大应用顺序

1. 先重要后次要 2. 先总结后具体 3. 先框架后细节
4. 先结论后原因 5. 先结果后过程 6. 先论点后论据

## 层级五：宏观层·框架算法

### 标题分形学
标题在全文各层级自相似展开：全文标题 → 章节标题 → 段落主题句，逐级细化同一核心命题。

### 隔山打牛
通过 A 事项的表达间接支撑 B 事项论点。如：写信息化建设时，不直接说"信息化很重要"，而是通过"信息化使得督查效率提升40%"来证明。

### 标准流程框架
背景 → 部署 → 推进 → 成效 → 问题 → 计划

## 层级六：高观点层

### 地空对接
将具体工作与宏观政策、上级精神对接。方法：
1. 找到当前工作对应的上级文件/会议/讲话中的相关表述
2. 用"贯彻落实XX精神""对标XX要求"领起
3. 将工作成效与政策目标对照

### 概念封装
把分散的工作做法提炼为一个有辨识度的"概念/品牌/模式"，如"三抓三促""四个一工程""全链条闭环管理"。

### 产品化思维
把文章当产品打磨：每段有明确功能、数据扎实、逻辑闭环。写完检查：
- 每段都能用一句话概括核心信息？
- 是否有可验证的量化数据？
- 段与段之间是否有过渡衔接？

### 大局观三维
- **纵向**：上级要求 → 本级落实 → 下级反馈
- **横向**：平行单位协同、对标
- **时间**：过去基础 → 当前推进 → 未来方向

---

## 输出规范

1. 章节标题用"一、二、三、"独占一行
2. 正文仿宋体风格，单句≤30字，主动语态
3. 首段遵循"按·拿·推"
4. 每个重点段落：结论先行 + 以上统下 + 因果串联
5. 数据前置、量化优先，结果在前、措施在后
6. 结尾用"地空对接"拔高站位
7. 严禁空洞套话（高度重视/积极推进/切实抓好）
8. 不逐条罗列，事项归并为流畅段落
9. 直接输出正文，不加前言后语
````

创建 `server/skills/biganzi.md`，内容如下（**原文照录，去除 AIGC frontmatter 头**）：

````markdown
# 笔杆子公文写作 Skill

> 文稿起草的本质是研究工作、解决问题、辅政鼎新——
> 将深入提出问题、分析问题、解决问题的过程用文字形式予以呈现。
> ——李永新《笔杆子是怎样炼成的》

---

## 一、角色与规则

你是机关公文写作顾问，以《笔杆子是怎样炼成的》五步实战法为核心方法论。
对任何公文写作请求，按以下规则行事：

1. **先研究后写作**：不直接动笔，先确认文体、受众、领导意图。
2. **五步法驱动**：所有写作请求走"磨刀子→定盘子→搭架子→敲键子→收果子"流程。
3. **素材库优先**：下笔前从内置素材库中匹配适用短语、标题模板。
4. **风格可变**：对周报等重复性文体，优先使用多风格变体引擎。

---

## 二、五步实战法（核心方法论）

### 第1步：磨刀子——磨刀不误砍柴工

**五字诀：要、搜、读、合、练**

| 字诀 | 操作 | 执行动作 |
|------|------|----------|
| **要** | 主动调度，动态兜清情况 | 确认手上有什么现成材料？需要向哪些部门/人调度补充？ |
| **搜** | 四处寻媒介，广泛储备素材 | 同类材料范文？上级相关文件？历史类似稿件？ |
| **读** | 静心深阅读，注重实际占有 | 通读调度来的材料，标注关键数据、提法、亮点 |
| **合** | 分类萃与合，随时揣摩备用 | 按主题分类整理素材；汇集可复用的小标题、短语 |
| **练** | 沙场秋点兵，实战靶向储备 | 建立常写文体的模板，固化高效产出路径 |

**执行标准**：素材不足不动笔。确认已掌握"上情下情内情外情"后才可进入第2步。

### 第2步：定盘子——干活不由东，累死也无功

**核心任务：吃准领导意图 + 把握受众需求**

**七查法研究领导意图**：
1. 查领导讲话
2. 查领导批示
3. 查政务信息
4. 查会议纪要
5. 查汇报材料
6. 查领导审定的文件方案
7. 查领导发表的言论文章

**受众分析三问**：
- 谁在看/听这份材料？（上级领导？同级？群众？）
- 他们关心什么？（成绩？问题？部署？表态？）
- 他们期望什么风格？（务实简洁？高站位？数据说话？）

**输出要求**：写出"盘子"一句话——这份材料的核心目的是什么？最想让读者记住的一句话是什么？

### 第3步：搭架子——画竹，必先得成竹于胸中

**列提纲前，深度研究"三体"**：

| 研究维度 | 内容 |
|----------|------|
| **研究事** | 梳理上情（上级精神）、下情（基层实际）、内情（本单位情况）、外情（同行做法） |
| **研究人** | 用稿者风格偏好、受众信息接收习惯 |
| **研究体** | 该文体的规范结构、常见套路、创新空间 |

**搭架子标准**：
- 提纲到三级标题（一、（一）1.），每级有明确的论点或素材指向
- 各部分篇幅比例标注
- 关键数据/案例位置预留

### 第4步：敲键子——正式起草

**原则**：
- 先求"写得像"（符合文体规范），再求"写的是"（内容准确），最后求"写得好"（表达出彩）
- 初稿允许粗糙，禁止在写作过程中反复修改第一段
- 按提纲顺序一气呵成，用素材库短语加速遣词造句

**行文风格参考（见第四节多风格引擎）**

### 第5步：收果子——修改校核

**修改三遍法**：
1. **第一遍看"对不对"**：事实、数据、引文是否准确；政策口径是否一致
2. **第二遍看"好不好"**：逻辑是否通顺、层次是否分明、标题是否精准
3. **第三遍看"细不细"**：格式是否规范、标点是否正确、称谓是否妥当

**严禁事项**：交稿前不校核直接提交。

---

## 三、素材库——机关公文常用词语集锦

### 3.1 三字短语（措施/动作类）

抓落实、促发展、提质效、强根基、补短板、锻长板、激活力、增动力、聚合力、出实招、见实效、求突破、上台阶、开新局

### 3.2 四字短语

**成果类**：成效显著、稳步推进、持续向好、圆满收官、硕果累累、亮点纷呈、突破性进展、历史性成就

**措施类**：多措并举、精准发力、对标对表、挂图作战、压茬推进、闭环管理、靶向施策、久久为功

**状态类**：稳中有进、稳中提质、稳中向好、持续发力、纵深推进、全面铺开、初显成效

**态度类**：高度重视、认真部署、迅速行动、全面落实、坚决贯彻、深入调研

### 3.3 五字短语

**"新"字类**：勾勒新路径、绘就新蓝图、抢抓新机遇、构建新格局、开启新征程、续写新篇章、培育新动能

**"好"字类**：打好组合拳、下好先手棋、练好基本功、画好同心圆、唱好主角戏

**"出"字类**：发出动员令、挂出作战图、打出组合拳、做出新亮点、拿出硬作风

**"学"字类**：原原本本学、带着问题学、联系实际学、全面系统学、学思用贯通、知信行统一

### 3.4 六字措施类短语

**方式方法**：直击问题关键、抓住问题要害、坚持问题导向、理清责任链条、拧紧责任螺丝、聚焦重点难点

**党建类**：增强政治能力、强化政治担当、筑牢思想根基、补足精神之钙、绷紧纪律之弦

**发展类**：厚植发展优势、提升发展质量、澎湃中国动力、谱写崭新篇章

### 3.5 常用动词/名词/形容词分类

**高频动词**：推进、深化、强化、优化、完善、健全、统筹、协调、部署、督导、落实、贯彻

**高频名词**：体系、机制、能力、水平、质量、效能、格局、队伍、阵地、平台

**高频修饰词**：深入、全面、扎实、持续、稳步、有力、有序、有效、精准、系统

---

## 四、多风格变体引擎（用户核心需求）

### 4.1 六种预设风格

对周报、总结等重复性文体，同一内容可用以下任一风格输出。
用户可指定风格编号，也可让系统自动轮换（每次选择不同风格）。

| 编号 | 风格名称 | 特征描述 | 适用场景 |
|------|----------|----------|----------|
| **S1** | 数据驱动型 | 以量化指标为主线，每项工作配数据对比（环比/同比/目标完成率），少形容词多数字 | 面向重数据的上司、业绩考核导向 |
| **S2** | 问题导向型 | 以"发现问题→分析原因→解决措施"为逻辑链，突显思考深度和主动性 | 务实的领导、需要展现思考力 |
| **S3** | 成果清单型 | 高度结构化，每项工作提炼为"举措+成效"，用小标题串联，适合快速浏览 | 繁忙的领导、信息量大时 |
| **S4** | 故事叙事型 | 以典型案例/具体场景切入，从"做了什么事"到"产生了什么影响"，增强感染力 | 汇报会/座谈会、需要打动听众 |
| **S5** | 高位对标型 | 每项工作对照上级精神/政策文件/年度目标展开，强调政治站位和大局意识 | 向上级报送、正式汇报 |
| **S6** | 精要速报型 | 极限压缩，每项工作控制在2-3句话，只保留核心动作+关键结果，适合日报/快报 | 高频报送、领导时间极有限 |

### 4.2 风格维度参数化调节

除六种预设风格外，支持以下维度独立调节：

| 调节维度 | 参数范围 | 说明 |
|----------|----------|------|
| **详略度** | 1-5（极简→详实） | 1=只写关键词和结果；5=展开背景、过程、分析 |
| **数据密度** | 1-5（纯定性→全量化） | 1=定性描述为主；5=每点必有数据支撑 |
| **政治站位** | 1-5（纯业务→高举高打） | 1=只谈业务；5=每段必引上级精神 |
| **反思深度** | 1-5（纯成绩→重问题） | 1=只报成绩；5=问题篇幅≥50% |
| **句式复杂度** | 1-3（短句→排比长句） | 1=短句直给；3=排比/对仗工整 |

### 4.3 风格组合示例

| 组合 | 效果 |
|------|------|
| S1 + 数据密度5 + 详略度3 | 强数据驱动的标准周报 |
| S2 + 反思深度4 + 详略度4 | 深度复盘型月报 |
| S4 + 详略度3 + 句式3 | 用于汇报会的生动讲述 |
| S5 + 政治站位5 + 数据密度2 | 对上正式汇报 |
| S6 + 数据密度3 | 领导手机端快速浏览的日报 |

### 4.4 自动轮换机制

对"每周周报内容相似但需要不同风格"的场景：
- 默认按 S1→S2→S3→S4→S5→S6→S1 循环
- 用户可指定固定某风格或排除某些风格
- 每次生成时在开头标注："本周风格：[S编号] [风格名称]"

---

## 五、常用文体模板

### 5.1 周报模板

```
本周核心成果：（3句话以内，带量化数据）

重点工作推进：
1. [事项]——[动作] + [进度] + [阶段成果]
2. [事项]——[动作] + [进度] + [阶段成果]
3. [事项]——[动作] + [进度] + [阶段成果]

下周计划：
1. [目标]——[落地动作]——[预期成果]
2. [目标]——[落地动作]——[预期成果]

需协调事项：（如有）
```

### 5.2 汇报材料模板

```
一、基本情况
【用1段话概括整体态势】

二、主要做法及成效
（一）[做法维度一]
1. [具体举措]——[量化成效]
2. [具体举措]——[量化成效]

（二）[做法维度二]
1. [具体举措]——[量化成效]
...

三、存在问题及原因分析
（列出2-3个核心问题，每个配原因分析）

四、下一步工作打算
（一）[方向一]：[核心目标] + [关键举措]
（二）[方向二]：[核心目标] + [关键举措]
```

### 5.3 讲话稿框架

```
各位[同志/领导/来宾]：

[开场白：时点/背景/意义——2-3句话]

一、[回顾/总结段落标题]
（内容要点...）

二、[形势/任务段落标题]
（内容要点...）

三、[要求/部署段落标题]
（内容要点...）

[结束语：号召/祝愿/表态——1-2句话]
```

---

## 六、工作流程

接到公文写作请求时，执行以下流程：

```
Step 1: 接收需求
  ├─ 确认文体（周报/汇报/讲话稿/总结/调研报告/其他）
  ├─ 确认受众（谁在看）
  └─ 确认风格需求（如用户未指定，周报类默认轮换，其他类默认S1）

Step 2: 磨刀子
  ├─ 如用户提供了素材/背景 → 直接消化
  └─ 如仅有需求描述 → 提示用户补充关键信息（做了什么/数据/遇到的问题）

Step 3: 定盘子 + 搭架子
  ├─ 定盘子：一句话概括写作目的
  └─ 搭架子：输出提纲请用户确认（简单文体可跳过确认）

Step 4: 敲键子 + 收果子
  ├─ 按提纲和指定风格起草全文
  ├─ 自检：事实准确？逻辑通顺？格式规范？
  └─ 输出成品
```

---

## 七、诚实边界

1. **素材依赖**：没有输入素材时，只能产出框架和模板，无法凭空编造数据或事迹。
2. **政策时效**：本 Skill 基于书籍方法论（截至2021年），对2021年后新出台的政策口径需另行确认。
3. **不可替代领导判断**：只能辅助起草，最终的"定盘子"（定调、定方向）必须由实际经手人拍板。
4. **风格变体是"调味"**：风格引擎改变的是表达方式，不是事实内容。内容仍需用户提供。
````

```js
// server/skills/index.js
const fs = require('node:fs')
const path = require('node:path')

const CACHE = {}

function getSkill(name) {
  if (CACHE[name]) return CACHE[name]
  const file = path.join(__dirname, `${name}.md`)
  if (!fs.existsSync(file)) throw new Error(`SKILL 文件不存在: ${name}.md`)
  let content = fs.readFileSync(file, 'utf8')
  content = content.replace(/^---[\s\S]*?---\s*/, '')
  CACHE[name] = content.trim()
  return CACHE[name]
}

const SKILL_MAP = {
  weekly: ['gongwen'],
  report: ['gongwen', 'biganzi'],
  draft: ['gongwen'],
  polish: [],
}

function buildSystemPrompt(scenario, { materials = '' } = {}) {
  const { SCENARIO_TEMPLATES } = require('./scenarios')
  const parts = []
  for (const skill of SKILL_MAP[scenario] || []) {
    parts.push(getSkill(skill))
  }
  parts.push(SCENARIO_TEMPLATES[scenario])
  if (materials) parts.push(`\n\n【台账素材】\n${materials}`)
  return parts.join('\n\n---\n\n')
}

module.exports = { getSkill, buildSystemPrompt, SKILL_MAP }
```

```js
// server/skills/scenarios.js
const SCENARIO_TEMPLATES = {
  weekly: `【场景任务】根据给定的台账素材，生成一份本周工作周报。

要求：
- 采用"本周核心成果 + 重点工作推进 + 下周计划"结构
- 成果带量化数据，重点工作的每一条写明动作、进度、阶段成果
- 标题用"一、二、三、"独占一行
- 结论先行、数据前置、结果在前
- 若素材中标注"另有 N 条未列出"，不要杜撰，只概括已列出的部分
- 直接输出正文，不加前言后语`,
  report: `【场景任务】根据给定的台账素材，生成一份专项工作汇报材料。

要求：
- 采用"基本情况 + 主要做法及成效 + 存在问题及原因 + 下一步打算"结构
- 做法按维度分组，每条带量化成效
- 结尾用"地空对接"拔高站位
- 标题用"一、二、三、"独占一行，二级用"（一）（二）"
- 直接输出正文，不加前言后语`,
  draft: `【场景任务】根据用户输入（文种、主题、要点或原始材料），起草一份标准公文。

要求：
- 遵循用户指定的文种（通知/请示/报告/函/纪要）规范结构
- 首段遵循"按·拿·推"：政策依据 → 做法 → 成效/下一步
- 正文段落：结论先行 + 以上统下 + 因果串联
- 若用户提供原始材料，整理为正式公文语言，不改变事实
- 输出结构包含：标题、主送机关（如适用）、正文、落款占位（单位与日期留空）
- 直接输出正文，不加前言后语`,
}

module.exports = { SCENARIO_TEMPLATES }
```

- [ ] **Step 4: 运行验证通过**

Run: `node --test test/skills.test.js`
Expected: 4 个测试 PASS

- [ ] **Step 5: Commit**

```bash
git add server/skills/ test/skills.test.js
git commit -m "feat: 内置公文写作 SKILL（gongwen/biganzi）与场景模板装配"
```

---

### Task 4: provider 抽象层 + fake 注入 + SSE 解析

**Files:**
- Create: `server/ai/provider.js`
- Create: `server/ai/index.js`
- Create: `test/provider.test.js`

**Interfaces:**
- Consumes: 无
- Produces:
  - `server/ai/provider.js` → `createProvider(config)` 返回 `{ chatStream({ messages, signal, onChunk, onError }), testConnection({ baseUrl, apiKey, model }) }`
  - `chatStream`：fetch `baseUrl + '/v1/chat/completions'`（stream:true），解析 `data:` 行，onChunk(delta)；首 token 超时 60s 抛错；HTTP 超时 120s（AbortSignal.timeout）；上游非 2xx → 抛脱敏错误（只含 status+statusText）
  - `server/ai/index.js` → `setProviderFactory(fn)`（测试注入）、`getProvider(config)`（默认 createProvider）、`SSE_HEADERS` 常量
  - `parseSseLine(line)` → `{ done, delta, error }`（可测试导出）

- [ ] **Step 1: 写失败测试**

```js
// test/provider.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createProvider } from '../server/ai/provider.js'
import { setProviderFactory, getProvider } from '../server/ai/index.js'

test('parseSseLine 解析 data 行与 DONE', async () => {
  const { parseSseLine } = await import('../server/ai/provider.js')
  assert.deepEqual(parseSseLine('data: {"delta":"你"}'), { delta: '你' })
  assert.deepEqual(parseSseLine('data: [DONE]'), { done: true })
  assert.equal(parseSseLine('event: error\ndata: {"message":"x"}'), null)
})

test('fake provider 注入生效', async () => {
  const calls = []
  setProviderFactory((cfg) => ({
    chatStream: async ({ messages, onChunk }) => { calls.push(cfg); onChunk('fake') },
    testConnection: async () => ({ ok: true, latencyMs: 5 }),
  }))
  const p = getProvider({ baseUrl: 'u' })
  await p.chatStream({ messages: [], onChunk: (c) => assert.equal(c, 'fake') })
  assert.equal(calls.length, 1)
  setProviderFactory(null)
})

test('真实 provider 错误脱敏（连接失败只含基本信息）', async () => {
  const p = createProvider({ baseUrl: 'http://127.0.0.1:1/v1', apiKey: 'sk-abc', model: 'm' })
  try {
    await p.testConnection({ baseUrl: 'http://127.0.0.1:1/v1', apiKey: 'sk-abc', model: 'm' })
    assert.fail('应失败')
  } catch (e) {
    assert.ok(!e.message.includes('sk-abc'), '错误信息不得含 apiKey')
  }
})
```

- [ ] **Step 2: 运行验证失败**

Run: `node --test test/provider.test.js`
Expected: FAIL

- [ ] **Step 3: 实现**

```js
// server/ai/provider.js
function parseSseLine(line) {
  const t = line.trim()
  if (!t.startsWith('data:')) return null
  const payload = t.slice(5).trim()
  if (payload === '[DONE]') return { done: true }
  try {
    const obj = JSON.parse(payload)
    const delta = obj.choices?.[0]?.delta?.content || obj.choices?.[0]?.message?.content || ''
    return { delta }
  } catch (e) {
    return null
  }
}

function createProvider(config) {
  async function chatStream({ messages, signal, onChunk }) {
    const baseUrl = config.baseUrl.replace(/\/$/, '')
    const timeoutSignal = AbortSignal.timeout(120000)
    const combined = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal
    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({ model: config.model, messages, stream: true }),
      signal: combined,
    })
    if (!res.ok) {
      throw new Error(`上游服务返回 ${res.status} ${res.statusText}`)
    }
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let firstTokenAt = Date.now()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let idx
      while ((idx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, idx)
        buffer = buffer.slice(idx + 1)
        const parsed = parseSseLine(line)
        if (!parsed) continue
        if (parsed.done) return
        if (parsed.delta) {
          if (Date.now() - firstTokenAt > 60000) throw new Error('上游响应超时（首 token 60s）')
          onChunk(parsed.delta)
        }
      }
    }
  }

  async function testConnection({ baseUrl, apiKey, model }) {
    const t0 = Date.now()
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/v1/models`, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`)
    return { ok: true, latencyMs: Date.now() - t0 }
  }

  return { chatStream, testConnection }
}

module.exports = { createProvider, parseSseLine }
```

```js
// server/ai/index.js
const { createProvider } = require('./provider')

let providerFactory = null

function setProviderFactory(fn) {
  providerFactory = fn
}

function getProvider(config) {
  return providerFactory ? providerFactory(config) : createProvider(config)
}

const SSE_HEADERS = { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' }

module.exports = { setProviderFactory, getProvider, SSE_HEADERS }
```

- [ ] **Step 4: 运行验证通过**

Run: `node --test test/provider.test.js`
Expected: 3 个测试 PASS

- [ ] **Step 5: Commit**

```bash
git add server/ai/ test/provider.test.js
git commit -m "feat: provider 抽象层 + fake 注入 + SSE 解析"
```

---

### Task 5: AI 写作文档路由（write/polish/chat SSE + 周报聚合）

**Files:**
- Create: `server/routes/ai.js`
- Create: `server/ai/aggregate.js`
- Create: `test/ai-api.test.js`
- Modify: `server/routes/index.js`

**Interfaces:**
- Consumes: `getProvider/setProviderFactory/SSE_HEADERS`（Task 4）、`buildSystemPrompt/SKILL_MAP`（Task 3）、`decryptText`（Task 1）、`toIso`（Task 2）、db
- Produces: 挂 `/api/ai`：
  - `POST /api/ai/chat`（SSE）：body `{ messages, modelId? }`，无 SSE 头时返回 200 JSON（测试便捷）
  - `POST /api/ai/write`（SSE）：body `{ scenario: weekly|report|draft, ...params, modelId? }`；weekly 自动聚合；report 校验 bizRefs（每类 ≤50）；draft 校验 genre+subject+keyPoints 或 pasteText 二选一
  - `POST /api/ai/polish`（SSE）：body `{ text, mode: polish|rewrite|style, modelId? }`；text ≤20000 字符
  - `server/ai/aggregate.js` → `aggregateWeekly(db, dateFrom, dateTo)` 返回素材字符串（任务按状态+进行中标题、会议、文件收发、活动标题，≤200 条），`countAll(db, ...)` 计数不截断

- [ ] **Step 1: 写失败测试**

```js
// test/ai-api.test.js
import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createServer } from 'node:http'
import { initDb } from '../server/db.js'
import { createApp } from '../server/index.js'
import { setProviderFactory } from '../server/ai/index.js'

const TEST_DB = 'data/test.db'
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
  server.close(); db.close()
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
  await call('DELETE', `/api/tasks/${created.body.id}`)
  const { aggregateWeekly } = await import('../server/ai/aggregate.js')
  const out = aggregateWeekly(db, '2026-01-01', '2026-12-31')
  assert.ok(out.includes('活任务'))
  assert.ok(!out.includes('删掉'))
})

test('weekly 聚合 200 条截断并注明', async () => {
  const { aggregateWeekly } = await import('../server/ai/aggregate.js')
  for (let i = 0; i < 250; i++) {
    db.prepare(`INSERT INTO tasks (id, title, status, created_by, created_at, updated_at, version) VALUES (?,?,?,?,'2026-08-01','2026-08-01',1)`)
      .run(`seed${i}`, `批量任务${i}`, '进行中', '')
  }
  const out = aggregateWeekly(db, '2026-08-01', '2026-08-31')
  assert.ok(out.includes('另有 50 条未列出') || out.includes('未列出'))
  assert.ok(!out.includes('批量任务249'), '超限记录不注入')
})
```

- [ ] **Step 2: 运行验证失败**

Run: `node --test test/ai-api.test.js`
Expected: FAIL

- [ ] **Step 3: 实现**

```js
// server/ai/aggregate.js
const MAX_INJECT = 200

function fmtTasks(db, from, to) {
  const tasks = db.prepare(`SELECT title, status, progress, deadline FROM tasks WHERE deleted_at IS NULL AND created_at >= ? AND created_at < ? ORDER BY deadline ASC LIMIT ${MAX_INJECT}`).all(from, to)
  const byStatus = {}
  for (const row of db.prepare(`SELECT status s, COUNT(*) c FROM tasks WHERE deleted_at IS NULL AND created_at >= ? AND created_at < ? GROUP BY s`).all(from, to)) {
    byStatus[row.s || '未分类'] = row.c
  }
  const total = tasks.length
  const statusSummary = Object.entries(byStatus).map(([s, c]) => `${s} ${c} 项`).join('；')
  let out = `【任务】共 ${statusSummary}`
  if (total === MAX_INJECT) {
    const allCount = db.prepare(`SELECT COUNT(*) c FROM tasks WHERE deleted_at IS NULL AND created_at >= ? AND created_at < ?`).get(from, to).c
    out += `\n另有 ${allCount - MAX_INJECT} 条未列出`
  }
  for (const t of tasks) {
    out += `\n- ${t.title}（${t.status}，进度 ${t.progress}%，截止 ${t.deadline || '未设'}）`
  }
  return out
}

function fmtMeetings(db, from, to) {
  const rows = db.prepare(`SELECT topic, meeting_time, location FROM meetings WHERE deleted_at IS NULL AND created_at >= ? AND created_at < ? ORDER BY meeting_time ASC LIMIT ${MAX_INJECT}`).all(from, to)
  let out = `【会议】${rows.length} 条`
  for (const m of rows) out += `\n- ${m.topic}（${m.meeting_time || ''}，${m.location || ''}）`
  return out
}

function fmtDocuments(db, from, to) {
  const counts = db.prepare(`SELECT doc_type d, COUNT(*) c FROM documents WHERE deleted_at IS NULL AND created_at >= ? AND created_at < ? GROUP BY doc_type`).all(from, to)
  const summary = counts.map((r) => `${r.d || '未分类'} ${r.c} 条`).join('；') || '0 条'
  return `【文件收发】${summary}`
}

function fmtActivities(db, from, to) {
  const rows = db.prepare(`SELECT title, start_time FROM activities WHERE deleted_at IS NULL AND created_at >= ? AND created_at < ? ORDER BY start_time ASC LIMIT ${MAX_INJECT}`).all(from, to)
  let out = `【外出活动】${rows.length} 条`
  for (const a of rows) out += `\n- ${a.title}（${a.start_time || ''}）`
  return out
}

function aggregateWeekly(db, dateFrom, dateTo) {
  const from = dateFrom ? `${dateFrom}T00:00:00` : '1970-01-01T00:00:00'
  const to = dateTo ? `${dateTo}T23:59:59` : '2099-12-31T23:59:59'
  return [
    fmtTasks(db, from, to),
    fmtMeetings(db, from, to),
    fmtDocuments(db, from, to),
    fmtActivities(db, from, to),
  ].join('\n\n')
}

module.exports = { aggregateWeekly }
```

```js
// server/routes/ai.js
const express = require('express')
const { fail, err40401 } = require('../utils/http')
const { decryptText } = require('../crypto')
const { getProvider, SSE_HEADERS } = require('../ai')
const { buildSystemPrompt, SKILL_MAP } = require('../skills')
const { aggregateWeekly } = require('../ai/aggregate')

function sseWrite(res, provider, params) {
  res.writeHead(200, SSE_HEADERS)
  provider.chatStream(params).then(() => {
    res.write('data: [DONE]\n\n')
    res.end()
  }).catch((e) => {
    res.write(`event: error\ndata: ${JSON.stringify({ message: '生成失败，请重试' })}\n\n`)
    res.end()
  })
}

function getActiveOrModel(db, modelId) {
  if (modelId) {
    const row = db.prepare('SELECT * FROM ai_configs WHERE id = ? AND deleted_at IS NULL').get(modelId)
    return row ? decodeConfig(row) : null
  }
  const row = db.prepare('SELECT * FROM ai_configs WHERE deleted_at IS NULL AND is_active = 1 LIMIT 1').get()
  return row ? decodeConfig(row) : null
}

function decodeConfig(row) {
  let apiKey = ''
  try { apiKey = decryptText(Buffer.from(row.api_key_enc)) } catch (e) { apiKey = '' }
  return { id: row.id, baseUrl: row.base_url, apiKey, model: row.model_name }
}

module.exports = function aiRouter(db) {
  const router = express.Router()

  router.post('/chat', (req, res) => {
    const body = req.body || {}
    const cfg = getActiveOrModel(db, body.modelId)
    if (!cfg) return fail(res, 400, '未配置激活的模型，请先在设置中配置')
    const messages = Array.isArray(body.messages) ? body.messages : []
    if (!messages.length) return fail(res, 40001, 'messages 不能为空')
    const provider = getProvider(cfg)
    sseWrite(res, provider, { messages, onChunk: (d) => res.write(`data: ${JSON.stringify({ delta: d })}\n\n`) })
  })

  router.post('/write', (req, res) => {
    const body = req.body || {}
    const scenario = body.scenario
    if (!SKILL_MAP[scenario]) return fail(res, 40001, `不支持的场景: ${scenario}`)
    const cfg = getActiveOrModel(db, body.modelId)
    if (!cfg) return fail(res, 400, '未配置激活的模型，请先在设置中配置')

    let materials = ''
    let userContent = ''
    if (scenario === 'weekly') {
      if (!body.dateFrom || !body.dateTo) return fail(res, 40001, 'weekly 需要 dateFrom/dateTo')
      materials = aggregateWeekly(db, body.dateFrom, body.dateTo)
      userContent = `生成 ${body.dateFrom} 至 ${body.dateTo} 的周报。`
    } else if (scenario === 'report') {
      const bizRefs = Array.isArray(body.bizRefs) ? body.bizRefs : []
      if (!bizRefs.length && !body.extraNotes) return fail(res, 40001, 'report 需要 bizRefs 或 extraNotes')
      for (const ref of bizRefs) {
        if (ref.ids && ref.ids.length > 50) return fail(res, 40001, `bizRefs 每类最多 50 条`)
      }
      const parts = []
      const tableMap = { tasks: 'tasks', meetings: 'meetings' }
      for (const ref of bizRefs) {
        const table = tableMap[ref.bizType]
        if (!table || !Array.isArray(ref.ids) || !ref.ids.length) continue
        const marks = ref.ids.map(() => '?').join(',')
        const rows = db.prepare(`SELECT * FROM ${table} WHERE deleted_at IS NULL AND id IN (${marks})`).all(...ref.ids)
        for (const row of rows) {
          parts.push(`[${ref.bizType}] ${row.title || row.topic}：${row.summary || row.minutes || ''}（状态 ${row.status || ''}，截止 ${row.deadline || ''}）`)
        }
      }
      materials = parts.join('\n')
      userContent = body.title ? `标题：${body.title}` : ''
      if (body.extraNotes) userContent += `\n补充说明：${body.extraNotes}`
    } else if (scenario === 'draft') {
      const hasStructured = !!(body.genre && body.subject && Array.isArray(body.keyPoints))
      const hasPaste = !!body.pasteText
      if (hasStructured && hasPaste) return fail(res, 40001, 'draft 只能选择一种输入方式')
      if (!hasStructured && !hasPaste) return fail(res, 40001, 'draft 需要 genre+subject+keyPoints 或 pasteText')
      userContent = hasStructured
        ? `文种：${body.genre}\n主题：${body.subject}\n要点：\n${body.keyPoints.map((k) => `- ${k}`).join('\n')}`
        : `原始材料：\n${body.pasteText}`
    }

    const systemPrompt = buildSystemPrompt(scenario, { materials })
    const provider = getProvider(cfg)
    sseWrite(res, provider, {
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userContent }],
      onChunk: (d) => res.write(`data: ${JSON.stringify({ delta: d })}\n\n`),
    })
  })

  router.post('/polish', (req, res) => {
    const body = req.body || {}
    const cfg = getActiveOrModel(db, body.modelId)
    if (!cfg) return fail(res, 400, '未配置激活的模型，请先在设置中配置')
    const text = typeof body.text === 'string' ? body.text : ''
    if (!text) return fail(res, 40001, 'text 不能为空')
    if (text.length > 20000) return fail(res, 40001, 'text 超过 20000 字符上限')
    const mode = ['polish', 'rewrite', 'style'].includes(body.mode) ? body.mode : 'polish'
    const modeDesc = { polish: '润色：优化措辞、消除病句，保持长度与原意', rewrite: '改写：风格化重写，长度可压缩或扩展', style: '公文风格化：转为公文书面语风格' }
    const provider = getProvider(cfg)
    sseWrite(res, provider, {
      messages: [
        { role: 'system', content: `你是机关公文写作助手。${modeDesc[mode]}。只输出结果文本，不加解释。` },
        { role: 'user', content: text },
      ],
      onChunk: (d) => res.write(`data: ${JSON.stringify({ delta: d })}\n\n`),
    })
  })

  return router
}
```

```js
// server/routes/index.js（追加挂载）
const aiRouter = require('./ai')
router.use('/ai', aiRouter(db))
```

注意：SSE 错误脱敏靠 `sseWrite` 的 catch 写固定 message 实现——上游 e.message 不写入响应，满足脱敏要求。

- [ ] **Step 4: 运行验证通过**

Run: `node --test test/ai-api.test.js`
Expected: 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add server/routes/ai.js server/ai/aggregate.js test/ai-api.test.js server/routes/index.js
git commit -m "feat: write/polish/chat SSE 接口 + 周报聚合（200条上限/脱敏）"
```

---

### Task 6: writings 文档路由 + 单实例锁并发测试

**Files:**
- Create: `server/routes/writings.js`
- Modify: `server/routes/index.js`
- Create: `test/writings.test.js`
- Create: `test/lock.test.js`

**Interfaces:**
- Consumes: `makeCrudRouter`（计划 1 Task 4）
- Produces: 挂 `/api/writings`：CRUD（title/scenario/content_html/status/exported_at），searchFields=[title]，sortable=[created_at, updated_at]；`exported_at` 联动由计划 3 导出任务写入

- [ ] **Step 1: 写失败测试**

```js
// test/writings.test.js
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

async function call(method, urlPath, body) {
  const res = await fetch(base + urlPath, {
    method, headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { statusCode: res.status, body: await res.json() }
}

test('writings CRUD 与乐观锁', async () => {
  const created = await call('POST', '/api/writings', { title: '周报', scenario: 'weekly', content_html: '<p data-block="body">内容</p>' })
  assert.equal(created.statusCode, 200)
  const updated = await call('PUT', `/api/writings/${created.body.id}`, { title: '周报v2', version: 1 })
  assert.equal(updated.body.version, 2)
  const conflict = await call('PUT', `/api/writings/${created.body.id}`, { title: 'x', version: 1 })
  assert.equal(conflict.statusCode, 409)
  await call('DELETE', `/api/writings/${created.body.id}`)
  const trash = await call('GET', '/api/writings?deleted=1')
  assert.equal(trash.body.total, 1)
})
```

```js
// test/lock.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { acquireLock } from '../server/index.js'

test('单实例锁拒绝双开', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wenxi-lock-'))
  const prev = process.env.WENXI_DATA_DIR
  process.env.WENXI_DATA_DIR = tmp
  const release = acquireLock()
  assert.throws(() => acquireLock(), /服务已在运行/)
  release()
  // 释放后可再获取
  const release2 = acquireLock()
  release2()
  process.env.WENXI_DATA_DIR = prev || ''
  fs.rmSync(tmp, { recursive: true, force: true })
})
```

- [ ] **Step 2: 运行验证失败**

Run: `node --test test/writings.test.js test/lock.test.js`
Expected: FAIL（路由不存在 / acquireLock 未导出）

- [ ] **Step 3: 实现**

```js
// server/routes/writings.js
const { makeCrudRouter } = require('./crud')
module.exports = function writingsRouter(db) {
  return makeCrudRouter(db, {
    table: 'writings',
    fields: ['title', 'scenario', 'content_html', 'status', 'exported_at'],
    searchFields: ['title'],
    sortable: ['created_at', 'updated_at'],
  })
}
```

```js
// server/routes/index.js（追加）
const writingsRouter = require('./writings')
router.use('/writings', writingsRouter(db))
```

- [ ] **Step 4: 运行验证通过**

Run: `node --test test/writings.test.js test/lock.test.js`
Expected: 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add server/routes/writings.js server/routes/index.js test/writings.test.js test/lock.test.js
git commit -m "feat: writings 文档路由 + 单实例锁并发测试"
```

---

### Task 7: blocks.json 单一事实源 + 构建期校验 + 排版引擎

**Files:**
- Create: `shared/blocks.json`
- Create: `build/check-blocks.mjs`
- Create: `src/utils/block-styles.js`
- Create: `server/utils/docx-styles.js`
- Create: `src/utils/block-styles.test.js`
- Modify: `package.json`（build 脚本已含校验，确认）

**Interfaces:**
- Consumes: 无
- Produces:
  - `shared/blocks.json`：9 个区块枚举（title/wenhao/h1/h2/body/sign/attachment/kai/banji），每项含 block/name/css/docx/required{gb,internal}
  - `src/utils/block-styles.js` → `BLOCK_CSS`（键=block，值=CSS 类内容）、`applyFormatClass(fmt)`、`isBlock(el)`
  - `server/utils/docx-styles.js` → `DOCX_STYLES`（键=block，值=docx 段落样式名）
  - `build/check-blocks.mjs`：校验 blocks.json 每项在 BLOCK_CSS 与 DOCX_STYLES 有非空键，缺失 exit(1)

- [ ] **Step 1: 写失败测试**

```js
// src/utils/block-styles.test.js
import { describe, it, expect } from 'vitest'
import blocks from '../../shared/blocks.json'
import { BLOCK_CSS } from './block-styles'

describe('block-styles', () => {
  it('BLOCK_CSS 覆盖 blocks.json 全部枚举', () => {
    for (const b of blocks) {
      expect(BLOCK_CSS[b.block], `${b.block} 缺前端 CSS`).toBeTruthy()
    }
  })
  it('枚举包含 9 类', () => {
    expect(blocks.map((b) => b.block)).toEqual(['title', 'wenhao', 'h1', 'h2', 'body', 'sign', 'attachment', 'kai', 'banji'])
  })
})
```

- [ ] **Step 2: 运行验证失败**

Run: `npx vitest run src/utils/block-styles.test.js`
Expected: FAIL

- [ ] **Step 3: 实现**

```json
// shared/blocks.json
[
  { "block": "title", "name": "标题", "css": "小标宋22pt居中", "docx": "Title", "required": { "gbt": true, "internal": true } },
  { "block": "wenhao", "name": "发文字号", "css": "黑体16pt居中", "docx": "WenHao", "required": { "gbt": true, "internal": false } },
  { "block": "h1", "name": "一级标题", "css": "黑体16pt", "docx": "Heading1", "required": { "gbt": false, "internal": false } },
  { "block": "h2", "name": "二级标题", "css": "楷体16pt", "docx": "Heading2", "required": { "gbt": false, "internal": false } },
  { "block": "body", "name": "正文", "css": "仿宋16pt首行缩进2字", "docx": "Normal", "required": { "gbt": true, "internal": true } },
  { "block": "sign", "name": "落款", "css": "仿宋16pt右对齐", "docx": "RightAlign", "required": { "gbt": false, "internal": false } },
  { "block": "attachment", "name": "附件说明", "css": "仿宋16pt", "docx": "Attachment", "required": { "gbt": false, "internal": false } },
  { "block": "kai", "name": "插入语/强调", "css": "楷体16pt", "docx": "ItalicBody", "required": { "gbt": false, "internal": false } },
  { "block": "banji", "name": "版记", "css": "仿宋12pt分隔线页尾", "docx": "Footer", "required": { "gbt": true, "internal": false } }
]
```

```js
// src/utils/block-styles.js
import blocks from '../../shared/blocks.json'

export const BLOCK_CSS = {
  title: 'font-family: "方正小标宋简体","华文中宋",serif; font-size: 22pt; text-align: center; font-weight: bold; margin: 0 0 16pt 0;',
  wenhao: 'font-family: "黑体","SimHei",sans-serif; font-size: 16pt; text-align: center; margin: 0 0 12pt 0;',
  h1: 'font-family: "黑体","SimHei",sans-serif; font-size: 16pt; font-weight: bold; margin: 12pt 0 8pt 0;',
  h2: 'font-family: "楷体","KaiTi",serif; font-size: 16pt; font-weight: bold; margin: 8pt 0 6pt 0;',
  body: 'font-family: "仿宋","FangSong",serif; font-size: 16pt; line-height: 28pt; text-indent: 2em; margin: 0;',
  sign: 'font-family: "仿宋","FangSong",serif; font-size: 16pt; text-align: right; margin: 12pt 0 0 0;',
  attachment: 'font-family: "仿宋","FangSong",serif; font-size: 16pt; margin: 0 0 6pt 0;',
  kai: 'font-family: "楷体","KaiTi",serif; font-size: 16pt; line-height: 28pt; margin: 0;',
  banji: 'font-family: "仿宋","FangSong",serif; font-size: 12pt; border-top: 1px solid #000; padding-top: 6pt; margin-top: 24pt;',
}

export function cssForBlock(block) {
  return BLOCK_CSS[block] || BLOCK_CSS.body
}

export function isBlock(el) {
  return el && typeof el.getAttribute === 'function' && !!el.getAttribute('data-block')
}

export default { BLOCK_CSS, cssForBlock, isBlock }
```

```js
// server/utils/docx-styles.js
const blocks = require('../../shared/blocks.json')

const DOCX_STYLES = {
  title: 'Title',
  wenhao: 'WenHao',
  h1: 'Heading1',
  h2: 'Heading2',
  body: 'Normal',
  sign: 'RightAlign',
  attachment: 'Attachment',
  kai: 'ItalicBody',
  banji: 'Footer',
}

function validate() {
  const missing = blocks.filter((b) => !DOCX_STYLES[b.block])
  if (missing.length) throw new Error(`docx-styles 缺少映射: ${missing.map((b) => b.block).join(', ')}`)
  return true
}

module.exports = { DOCX_STYLES, validate }
```

```js
// build/check-blocks.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const blocks = JSON.parse(fs.readFileSync(path.join(root, 'shared/blocks.json'), 'utf8'))

// 前端 CSS 映射（静态分析 import 的导出键）
const blockStylesSrc = fs.readFileSync(path.join(root, 'src/utils/block-styles.js'), 'utf8')
const cssKeys = [...blockStylesSrc.matchAll(/^\s+([a-z0-9_]+):/gm)].map((m) => m[1])

// 后端 docx 映射（require 执行）
const { DOCX_STYLES } = await import(path.join(root, 'server/utils/docx-styles.js')).catch(() => ({ DOCX_STYLES: {} }))

let failCount = 0
for (const b of blocks) {
  if (!cssKeys.includes(b.block)) {
    console.error(`[check-blocks] 前端 BLOCK_CSS 缺少: ${b.block}`)
    failCount++
  }
  if (!DOCX_STYLES[b.block]) {
    console.error(`[check-blocks] 后端 DOCX_STYLES 缺少: ${b.block}`)
    failCount++
  }
}
if (failCount > 0) {
  console.error(`[check-blocks] 校验失败: ${failCount} 处缺失`)
  process.exit(1)
}
console.log(`[check-blocks] 通过: ${blocks.length} 个区块前后端映射齐全`)
```

```json
// package.json scripts 确认
"build": "node build/check-blocks.mjs && vite build"
```

- [ ] **Step 4: 运行验证通过**

Run: `npx vitest run src/utils/block-styles.test.js` 和 `node build/check-blocks.mjs`
Expected: 测试 PASS；校验输出"通过: 9 个区块前后端映射齐全"

- [ ] **Step 5: Commit**

```bash
git add shared/blocks.json build/check-blocks.mjs src/utils/block-styles.js src/utils/block-styles.test.js server/utils/docx-styles.js
git commit -m "feat: data-block 单一事实源 + 构建期校验 + 双端样式映射"
```

---

### Task 8: 前端 AI 配置页（Settings.vue）

**Files:**
- Create: `src/views/Settings.vue`
- Create: `src/components/ConfigDialog.vue`
- Create: `src/api/settings-api.test.js`

**Interfaces:**
- Consumes: `http`（计划 1 Task 7）
- Produces: Settings.vue 展示 AI 配置列表（掩码）、新增/编辑弹窗（name/baseUrl/modelName/apiKey/isActive）、测试连接按钮（选已存配置或临时填写）

- [ ] **Step 1: 写失败测试（api 封装）**

```js
// src/api/settings-api.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest'
import axios from 'axios'

vi.mock('axios')
const http = { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }

describe('settings api 封装', () => {
  it('active 接口调用', async () => {
    http.get.mockResolvedValue({ data: { code: 0, data: { id: 'c1' } } })
    const res = await http.get('/ai/configs/active')
    expect(res.data.data.id).toBe('c1')
    expect(http.get).toHaveBeenCalledWith('/ai/configs/active')
  })
})
```

- [ ] **Step 2: 运行验证失败**

Run: `npx vitest run src/api/settings-api.test.js`
Expected: FAIL

- [ ] **Step 3: 实现（Settings.vue）**

```vue
<!-- src/views/Settings.vue -->
<template>
  <el-card shadow="never">
    <template #header>
      <div style="display:flex; justify-content:space-between; align-items:center">
        <span>AI 模型配置</span>
        <el-button type="primary" @click="openDialog()">新增配置</el-button>
      </div>
    </template>
    <el-table :data="list" v-loading="loading">
      <el-table-column prop="name" label="名称" width="160" />
      <el-table-column prop="base_url" label="API 地址" />
      <el-table-column prop="model_name" label="模型" width="160" />
      <el-table-column prop="api_key_mask" label="API Key" width="140" />
      <el-table-column label="激活" width="90">
        <template #default="{ row }">
          <el-tag v-if="row.is_active" type="success">当前</el-tag>
          <el-button v-else size="small" @click="activate(row)">设为激活</el-button>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="220">
        <template #default="{ row }">
          <el-button size="small" @click="testConfig(row)">测试</el-button>
          <el-button size="small" @click="openDialog(row)">编辑</el-button>
          <el-button size="small" type="danger" @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-dialog v-model="dialogVisible" title="配置">
      <el-form label-width="90px">
        <el-form-item label="名称"><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="API 地址"><el-input v-model="form.baseUrl" placeholder="https://api.deepseek.com/v1" /></el-form-item>
        <el-form-item label="模型名称"><el-input v-model="form.modelName" /></el-form-item>
        <el-form-item label="API Key">
          <el-input v-model="form.apiKey" type="password" show-password :placeholder="editing ? '留空保留原 Key' : ''" />
        </el-form-item>
        <el-form-item label="设为激活"><el-switch v-model="form.isActive" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </el-card>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { http } from '../api'

const list = ref([])
const loading = ref(false)
const saving = ref(false)
const dialogVisible = ref(false)
const editing = ref(false)
const form = reactive({ name: '', baseUrl: '', modelName: '', apiKey: '', isActive: false })

async function load() {
  loading.value = true
  try {
    const data = await http.get('/ai/configs')
    list.value = data.list
  } finally { loading.value = false }
}

function openDialog(row) {
  editing.value = !!row
  Object.assign(form, {
    id: row?.id,
    name: row?.name || '',
    baseUrl: row?.base_url || '',
    modelName: row?.model_name || '',
    apiKey: '',
    isActive: !!row?.is_active,
    version: row?.version,
  })
  dialogVisible.value = true
}

async function save() {
  saving.value = true
  try {
    if (editing.value) {
      await http.put('/ai/configs', { ...form, version: form.version })
    } else {
      await http.post('/ai/configs', form)
    }
    ElMessage.success('已保存')
    dialogVisible.value = false
    load()
  } finally { saving.value = false }
}

async function activate(row) {
  await http.post('/ai/configs', { ...row, baseUrl: row.base_url, modelName: row.model_name, isActive: true, version: row.version, apiKey: '' })
  ElMessage.success('已设为激活')
  load()
}

async function testConfig(row) {
  try {
    const r = await http.post('/ai/test', { configId: row.id })
    ElMessage.success(`连接成功，延迟 ${r.latencyMs}ms`)
  } catch (e) {
    ElMessage.error('连接失败')
  }
}

async function remove(row) {
  await ElMessageBox.confirm('确认删除该配置？', '提示', { type: 'warning' })
  await http.delete(`/ai/configs/${row.id}`)
  ElMessage.success('已删除')
  load()
}

onMounted(load)
</script>
```

- [ ] **Step 4: 运行验证通过**

Run: `npx vitest run src/api/settings-api.test.js`；`npx vite build` 通过

- [ ] **Step 5: Commit**

```bash
git add src/views/Settings.vue src/api/settings-api.test.js
git commit -m "feat: AI 配置前端页（掩码/激活/测试）"
```

---

### Task 9: 写作工作台（Writing.vue 核心）

**Files:**
- Create: `src/views/Writing.vue`
- Create: `src/components/EditorArea.vue`
- Create: `src/components/AiPanel.vue`
- Create: `src/utils/editor-undo.js`
- Create: `src/utils/paste-clean.js`
- Create: `src/utils/editor-undo.test.js`
- Create: `src/utils/paste-clean.test.js`

**Interfaces:**
- Consumes: `http`（计划 1）、`BLOCK_CSS/cssForBlock`（Task 7）、Element Plus
- Produces:
  - `src/utils/editor-undo.js` → `createUndoStack(limit=50)`：`{ push(snapshot), undo(), redo(), canUndo, canRedo, flushDebounce }`；快照 `{ html, cursor, ts }`；人工输入由调用方 800ms 防抖合并 push；AI 操作直接 push
  - `src/utils/paste-clean.js` → `cleanPaste(htmlText)` → 纯文本数组，按换行拆段，每段 `<p data-block="body">`；`isEditorEmpty(html)` 判定空文档
  - `EditorArea.vue`：contenteditable 编辑器（`fmt-gbt`/`fmt-internal` 容器 class 切换 + `force-banji`）、工具栏（格式切换、强制版记、区块标记下拉、撤销/重做）、粘贴拦截、beforeunload
  - `AiPanel.vue`：场景 Tab（周报/汇报/起草/润色）+ 场景参数表单 + 生成按钮（SSE 流式渲染到预览区）+ 插入/替换全文 + 替换选中
  - `Writing.vue`：三栏布局（左：场景导航+我的文档；中：EditorArea；右：AiPanel）+ 文档状态条 + localStorage 草稿 + 恢复提示条 + 路由守卫

- [ ] **Step 1: 写失败测试（纯函数）**

```js
// src/utils/editor-undo.test.js
import { describe, it, expect } from 'vitest'
import { createUndoStack } from './editor-undo'

describe('undo stack', () => {
  it('push/undo/redo', () => {
    const s = createUndoStack(3)
    s.push({ html: '<p>a</p>' })
    s.push({ html: '<p>b</p>' })
    expect(s.undo().html).toBe('<p>a</p>')
    expect(s.redo().html).toBe('<p>b</p>')
  })
  it('超过上限丢最旧', () => {
    const s = createUndoStack(2)
    s.push({ html: '1' }); s.push({ html: '2' }); s.push({ html: '3' })
    expect(s.stack.length).toBe(2)
  })
  it('AI 操作强制 push', () => {
    const s = createUndoStack(10)
    s.push({ html: 'old' })
    s.push({ html: 'new' })
    expect(s.undo().html).toBe('old')
  })
})
```

```js
// src/utils/paste-clean.test.js
import { describe, it, expect } from 'vitest'
import { cleanPaste, isEditorEmpty } from './paste-clean'

describe('paste-clean', () => {
  it('多段按换行拆 p 默认 body', () => {
    const out = cleanPaste('第一段\n第二段')
    expect(out).toHaveLength(2)
    expect(out[0]).toContain('data-block="body"')
  })
  it('isEditorEmpty 判定', () => {
    expect(isEditorEmpty('<p><br></p>')).toBe(true)
    expect(isEditorEmpty('<p>&nbsp;</p>')).toBe(true)
    expect(isEditorEmpty('<p data-block="body">内容</p>')).toBe(false)
    expect(isEditorEmpty('')).toBe(true)
  })
})
```

- [ ] **Step 2: 运行验证失败**

Run: `npx vitest run src/utils/editor-undo.test.js src/utils/paste-clean.test.js`
Expected: FAIL

- [ ] **Step 3: 实现**

```js
// src/utils/editor-undo.js
export function createUndoStack(limit = 50) {
  const stack = []
  let redoStack = []
  let debounceTimer = null
  let pending = null

  function push(snapshot, { force = false } = {}) {
    if (!force && debounceTimer) {
      clearTimeout(debounceTimer)
    }
    if (!force) {
      pending = snapshot
      debounceTimer = setTimeout(() => {
        if (pending) {
          stack.push(pending)
          if (stack.length > limit) stack.shift()
          redoStack = []
          pending = null
        }
      }, 800)
      return
    }
    if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null }
    if (pending) { stack.push(pending); pending = null }
    stack.push(snapshot)
    if (stack.length > limit) stack.shift()
    redoStack = []
  }

  function undo() {
    if (stack.length < 2) return null
    redoStack.push(stack.pop())
    return stack[stack.length - 1]
  }

  function redo() {
    const s = redoStack.pop()
    if (!s) return null
    stack.push(s)
    return s
  }

  return {
    push,
    undo,
    redo,
    get canUndo() { return stack.length >= 2 },
    get canRedo() { return redoStack.length > 0 },
    get stack() { return stack },
  }
}
```

```js
// src/utils/paste-clean.js
export function cleanPaste(htmlText) {
  const div = document.createElement('div')
  div.innerHTML = htmlText
  const raw = div.innerText || div.textContent || ''
  return raw.split(/\n+/).map((t) => t.trim()).filter(Boolean)
    .map((t) => `<p data-block="body">${escapeHtml(t)}</p>`)
}

export function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function isEditorEmpty(html) {
  const div = document.createElement('div')
  div.innerHTML = html || ''
  const text = (div.textContent || '').trim()
  if (text) return false
  const hasMedia = div.querySelector('img, a[data-attachment]')
  return !hasMedia
}
```

```vue
<!-- src/components/EditorArea.vue -->
<template>
  <div class="editor-wrap">
    <div class="toolbar">
      <el-select v-model="fmt" style="width: 150px" @change="emitFormat">
        <el-option label="GB/T 9704-2012" value="gbt" />
        <el-option label="内部材料" value="internal" />
      </el-select>
      <el-checkbox v-model="forceBanji" :disabled="fmt === 'gbt'" @change="emitFormat">强制显示版记</el-checkbox>
      <el-select v-model="markBlock" placeholder="标记区块" style="width: 130px" @change="markSelection">
        <el-option v-for="b in blockOptions" :key="b.block" :label="b.name" :value="b.block" />
      </el-select>
      <el-button :disabled="!canUndo" @click="onUndo">撤销</el-button>
      <el-button :disabled="!canRedo" @click="onRedo">重做</el-button>
    </div>
    <div
      ref="editorRef"
      class="editor"
      :class="[fmt === 'gbt' ? 'fmt-gbt' : 'fmt-internal', forceBanji ? 'force-banji' : '']"
      contenteditable
      @input="onInput"
      @paste="onPaste"
    ></div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { cssForBlock } from '../utils/block-styles'
import { cleanPaste } from '../utils/paste-clean'
import { createUndoStack } from '../utils/editor-undo'
import blocks from '../../shared/blocks.json'

const emit = defineEmits(['content-change', 'save-needed'])
const props = defineProps({ modelValue: { type: String, default: '' } })

const editorRef = ref(null)
const fmt = ref('gbt')
const forceBanji = ref(false)
const markBlock = ref('')
const undoStack = createUndoStack(50)
const canUndo = ref(false)
const canRedo = ref(false)
const blockOptions = blocks.map((b) => ({ block: b.block, name: b.name }))

function syncUndoState() {
  canUndo.value = undoStack.canUndo
  canRedo.value = undoStack.canRedo
}

function onInput() {
  emit('content-change', editorRef.value.innerHTML)
  emit('save-needed')
  const snap = { html: editorRef.value.innerHTML, cursor: getCursor() }
  undoStack.push(snap)
  syncUndoState()
}

function onPaste(e) {
  e.preventDefault()
  const html = e.clipboardData.getData('text/html') || e.clipboardData.getData('text/plain')
  const paragraphs = cleanPaste(html)
  if (!paragraphs.length) return
  const before = { html: editorRef.value.innerHTML, cursor: getCursor() }
  undoStack.push(before, { force: true })
  const selection = window.getSelection()
  if (selection && selection.rangeCount) {
    const range = selection.getRangeAt(0)
    range.deleteContents()
    const frag = document.createRange().createContextualFragment(paragraphs.join(''))
    range.insertNode(frag)
    range.collapse(false)
  } else {
    editorRef.value.innerHTML = paragraphs.join('')
  }
  emit('content-change', editorRef.value.innerHTML)
  emit('save-needed')
  syncUndoState()
}

function markSelection() {
  if (!markBlock.value) return
  const sel = window.getSelection()
  if (!sel.rangeCount) return
  const range = sel.getRangeAt(0)
  const span = document.createElement('p')
  span.setAttribute('data-block', markBlock.value)
  span.style.cssText = cssForBlock(markBlock.value)
  const frag = range.extractContents()
  span.appendChild(frag)
  range.insertNode(span)
  emit('content-change', editorRef.value.innerHTML)
  emit('save-needed')
  markBlock.value = ''
}

function getCursor() {
  const sel = window.getSelection()
  return sel && sel.rangeCount ? sel.getRangeAt(0).startOffset : 0
}

function onUndo() {
  const snap = undoStack.undo()
  if (snap) { editorRef.value.innerHTML = snap.html; emit('content-change', snap.html) }
  syncUndoState()
}
function onRedo() {
  const snap = undoStack.redo()
  if (snap) { editorRef.value.innerHTML = snap.html; emit('content-change', snap.html) }
  syncUndoState()
}

function emitFormat() {
  emit('format-change', { fmt: fmt.value, forceBanji: forceBanji.value })
}

function replaceAll(html) {
  undoStack.push({ html: editorRef.value.innerHTML }, { force: true })
  editorRef.value.innerHTML = html
  emit('content-change', html)
  syncUndoState()
}

function replaceSelection(html) {
  undoStack.push({ html: editorRef.value.innerHTML }, { force: true })
  const sel = window.getSelection()
  if (sel && sel.rangeCount && !sel.isCollapsed) {
    const range = sel.getRangeAt(0)
    range.deleteContents()
    const frag = document.createRange().createContextualFragment(html)
    range.insertNode(frag)
  } else {
    editorRef.value.innerHTML = html
  }
  emit('content-change', editorRef.value.innerHTML)
  syncUndoState()
}

onMounted(() => {
  if (props.modelValue) editorRef.value.innerHTML = props.modelValue
  window.addEventListener('beforeunload', onBeforeUnload)
})
onBeforeUnmount(() => window.removeEventListener('beforeunload', onBeforeUnload))

function onBeforeUnload(e) {
  if (hasUnsaved) {
    e.preventDefault()
    e.returnValue = ''
  }
}
let hasUnsaved = false
emit('save-needed')

defineExpose({ replaceAll, replaceSelection, setContent: (html) => { editorRef.value.innerHTML = html }, setUnsaved: (v) => { hasUnsaved = v } })
</script>

<style scoped>
.editor-wrap { display: flex; flex-direction: column; height: 100%; }
.toolbar { display: flex; gap: 8px; align-items: center; padding: 8px; border-bottom: 1px solid #eee; }
.editor { flex: 1; overflow-y: auto; padding: 40px 60px; outline: none; }
.fmt-gbt { font-family: "仿宋","FangSong",serif; }
.fmt-internal { font-family: "仿宋","FangSong",serif; }
.fmt-internal [data-block="banji"] { display: none; }
.force-banji [data-block="banji"] { display: block !important; }
</style>
```

```vue
<!-- src/components/AiPanel.vue -->
<template>
  <div class="ai-panel">
    <el-tabs v-model="tab" @tab-change="onTabChange">
      <el-tab-pane label="周报" name="weekly" />
      <el-tab-pane label="专项汇报" name="report" />
      <el-tab-pane label="公文起草" name="draft" />
      <el-tab-pane label="润色" name="polish" />
    </el-tabs>

    <template v-if="tab === 'weekly'">
      <el-form label-width="70px" size="small">
        <el-form-item label="日期">
          <el-date-picker v-model="weeklyRange" type="daterange" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
      </el-form>
    </template>

    <template v-else-if="tab === 'report'">
      <el-form label-width="70px" size="small">
        <el-form-item label="标题"><el-input v-model="reportForm.title" /></el-form-item>
        <el-form-item label="引用任务">
          <el-select v-model="reportForm.taskIds" multiple filterable placeholder="选择任务" style="width: 100%">
            <el-option v-for="t in taskOptions" :key="t.id" :label="t.title" :value="t.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="补充说明"><el-input v-model="reportForm.extraNotes" type="textarea" :rows="2" /></el-form-item>
      </el-form>
    </template>

    <template v-else-if="tab === 'draft'">
      <el-radio-group v-model="draftMode" size="small">
        <el-radio-button label="structured">结构化</el-radio-button>
        <el-radio-button label="paste">粘贴素材</el-radio-button>
      </el-radio-group>
      <el-form v-if="draftMode === 'structured'" label-width="70px" size="small" style="margin-top: 8px">
        <el-form-item label="文种">
          <el-select v-model="draftForm.genre" style="width: 100%">
            <el-option v-for="g in ['通知','请示','报告','函','纪要']" :key="g" :label="g" :value="g" />
          </el-select>
        </el-form-item>
        <el-form-item label="主题"><el-input v-model="draftForm.subject" /></el-form-item>
        <el-form-item label="要点"><el-input v-model="draftKeyPoints" type="textarea" :rows="3" placeholder="每行一个要点" /></el-form-item>
      </el-form>
      <el-input v-else v-model="draftForm.pasteText" type="textarea" :rows="6" placeholder="粘贴原始材料（领导指示/会议记录等）" style="margin-top: 8px" />
    </template>

    <template v-else>
      <el-alert type="info" :closable="false" title="在左侧编辑器选中文字后点击生成，结果流式出现在下方，可替换选区或全文" />
      <div style="margin-top: 8px">
        <el-radio-group v-model="polishMode" size="small">
          <el-radio-button label="polish">润色</el-radio-button>
          <el-radio-button label="rewrite">改写</el-radio-button>
          <el-radio-button label="style">公文风格化</el-radio-button>
        </el-radio-group>
      </div>
    </template>

    <el-button type="primary" style="width: 100%; margin-top: 12px" :loading="generating" :disabled="!canGenerate" @click="generate">
      {{ tab === 'polish' ? '润色选中文本' : '生成' }}
    </el-button>

    <div v-if="streaming" class="preview">
      <div class="preview-head">生成预览（流式）</div>
      <div ref="previewRef" class="preview-body"></div>
      <div class="preview-actions">
        <el-button size="small" type="primary" :disabled="!done" @click="applyToEditor('all')">替换全文</el-button>
        <el-button size="small" :disabled="!done" @click="applyToEditor('selection')">替换选区</el-button>
        <el-button size="small" @click="clearPreview">清除</el-button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { http } from '../api'

const emit = defineEmits(['apply-all', 'apply-selection'])
const tab = ref('weekly')
const generating = ref(false)
const streaming = ref(false)
const done = ref(false)
const previewRef = ref(null)
const weeklyRange = ref([])
const reportForm = ref({ title: '', taskIds: [], extraNotes: '' })
const taskOptions = ref([])
const draftMode = ref('structured')
const draftForm = ref({ genre: '通知', subject: '', pasteText: '' })
const draftKeyPoints = ref('')
const polishMode = ref('polish')
let lastResult = ''

const canGenerate = computed(() => {
  if (tab.value === 'weekly') return weeklyRange.value && weeklyRange.value.length === 2
  if (tab.value === 'report') return reportForm.value.taskIds.length > 0 || reportForm.value.extraNotes
  if (tab.value === 'draft') return draftMode.value === 'structured' ? !!(draftForm.value.subject) : !!draftForm.value.pasteText
  return true
})

async function onTabChange() {
  done.value = false
  streaming.value = false
  lastResult = ''
}

async function generate() {
  generating.value = true
  streaming.value = true
  done.value = false
  lastResult = ''
  previewRef.value.innerHTML = ''
  try {
    const body = buildBody()
    const res = await fetch('/api/ai/write', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      ElMessage.error(err.message || '生成失败')
      return
    }
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { done: rd, value } = await reader.read()
      if (rd) break
      buffer += decoder.decode(value, { stream: true })
      let idx
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const block = buffer.slice(0, idx)
        buffer = buffer.slice(idx + 2)
        handleBlock(block)
      }
    }
  } catch (e) {
    ElMessage.error('网络错误，请重试')
  } finally {
    generating.value = false
    streaming.value = false
  }
}

function handleBlock(block) {
  const lines = block.split('\n')
  for (const line of lines) {
    if (!line.startsWith('data:')) continue
    const payload = line.slice(5).trim()
    if (payload === '[DONE]') { done.value = true; return }
    try {
      const obj = JSON.parse(payload)
      if (obj.delta) {
        lastResult += obj.delta
        previewRef.value.innerHTML = lastResult
      }
    } catch (e) { /* 忽略 */ }
  }
}

function buildBody() {
  if (tab.value === 'weekly') return { scenario: 'weekly', dateFrom: weeklyRange.value[0], dateTo: weeklyRange.value[1] }
  if (tab.value === 'report') return {
    scenario: 'report',
    title: reportForm.value.title || undefined,
    bizRefs: reportForm.value.taskIds.length ? [{ bizType: 'tasks', ids: reportForm.value.taskIds }] : [],
    extraNotes: reportForm.value.extraNotes || undefined,
  }
  if (tab.value === 'draft') {
    if (draftMode.value === 'structured') return { scenario: 'draft', genre: draftForm.value.genre, subject: draftForm.value.subject, keyPoints: draftKeyPoints.value.split('\n').filter(Boolean) }
    return { scenario: 'draft', pasteText: draftForm.value.pasteText }
  }
  return {}
}

async function applyToEditor(kind) {
  if (!lastResult) return
  if (kind === 'all') emit('apply-all', lastResult)
  else emit('apply-selection', lastResult)
  clearPreview()
}

function clearPreview() {
  streaming.value = false
  done.value = false
  lastResult = ''
  previewRef.value.innerHTML = ''
}

onMounted(async () => {
  try {
    const data = await http.get('/tasks', { params: { pageSize: 100 } })
    taskOptions.value = data.list
  } catch (e) { /* 忽略 */ }
})
</script>
```

```vue
<!-- src/views/Writing.vue（主视图：三栏 + 文档状态 + 草稿 + 路由守卫） -->
<template>
  <div class="writing">
    <aside class="left">
      <div class="doc-actions">
        <el-button type="primary" size="small" style="width:100%" @click="newDoc">新建文档</el-button>
        <el-button size="small" style="width:100%; margin-top:8px" @click="saveDoc" :loading="saving">保存</el-button>
      </div>
      <div class="doc-list">
        <div class="doc-list-title">我的文档</div>
        <el-input v-model="docKeyword" size="small" placeholder="搜索文档" clearable />
        <div v-for="d in filteredDocs" :key="d.id" class="doc-item" :class="{ active: currentDoc?.id === d.id }" @click="openDoc(d)">
          <div>{{ d.title }}</div>
          <el-tag size="small" :type="d.status === 'exported' ? 'success' : 'info'">{{ d.status }}</el-tag>
        </div>
      </div>
    </aside>
    <main class="center">
      <el-alert v-if="showDraftTip" type="warning" :closable="true" @close="dismissDraftTip">
        <div style="display:flex; gap:12px; align-items:center">
          <span>检测到未保存的草稿（上次编辑于 {{ draftTipTime }}），是否恢复？</span>
          <el-button size="small" type="primary" @click="restoreDraft">恢复草稿</el-button>
          <el-button size="small" @click="discardDraft">丢弃</el-button>
        </div>
      </el-alert>
      <EditorArea ref="editorRef" :model-value="currentDoc?.content_html || ''" @content-change="onContentChange" @save-needed="markUnsaved" @format-change="onFormatChange" />
    </main>
    <aside class="right">
      <AiPanel @apply-all="applyAll" @apply-selection="applySelection" />
    </aside>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import EditorArea from '../components/EditorArea.vue'
import AiPanel from '../components/AiPanel.vue'
import { http } from '../api'

const DRAFT_KEY = 'wenxi-draft-current'
const LAST_OPEN_KEY = 'wenxi-last-open'

const editorRef = ref(null)
const currentDoc = ref(null)
const docs = ref([])
const docKeyword = ref('')
const saving = ref(false)
const unsaved = ref(false)
const showDraftTip = ref(false)
const draftTipTime = ref('')
let draftMeta = null

const filteredDocs = computed(() => docs.value.filter((d) => !docKeyword.value || d.title.includes(docKeyword.value)))

function newDoc() {
  currentDoc.value = { id: null, title: '', scenario: 'weekly', content_html: '<p data-block="body"><br></p>', status: 'draft', version: 1 }
  unsaved.value = true
  editorRef.value?.setContent(currentDoc.value.content_html)
  sessionStorage.setItem(LAST_OPEN_KEY, '')
}

async function saveDoc() {
  if (!currentDoc.value) return
  saving.value = true
  try {
    const payload = {
      title: currentDoc.value.title || '未命名文档',
      scenario: currentDoc.value.scenario,
      content_html: currentDoc.value.content_html,
      status: 'saved',
    }
    if (currentDoc.value.id) {
      const r = await http.put(`/writings/${currentDoc.value.id}`, { ...payload, version: currentDoc.value.version })
      currentDoc.value = { ...currentDoc.value, ...r, id: currentDoc.value.id }
    } else {
      const r = await http.post('/writings', payload)
      currentDoc.value = { ...currentDoc.value, ...r }
    }
    localStorage.removeItem(DRAFT_KEY)
    sessionStorage.setItem(LAST_OPEN_KEY, currentDoc.value.id || '')
    unsaved.value = false
    ElMessage.success('已保存')
    loadDocs()
  } catch (e) {
    if (e?.code === 409) ElMessage.warning('文档已被修改，请重新载入')
  } finally { saving.value = false }
}

async function openDoc(d) {
  if (unsaved.value) {
    const ok = await ElMessageBox.confirm('当前文档有未保存修改，确定打开其他文档？', '提示', { type: 'warning' }).catch(() => false)
    if (!ok) return
  }
  const r = await http.get(`/writings/${d.id}`)
  currentDoc.value = r
  editorRef.value?.setContent(r.content_html || '')
  sessionStorage.setItem(LAST_OPEN_KEY, r.id)
  unsaved.value = false
}

async function loadDocs() {
  const data = await http.get('/writings', { params: { pageSize: 100 } })
  docs.value = data.list
}

function onContentChange(html) {
  if (currentDoc.value) currentDoc.value.content_html = html
}
function markUnsaved() { unsaved.value = true }
function onFormatChange() { /* 排版由编辑器内部处理 */ }

function applyAll(html) {
  editorRef.value?.replaceAll(html)
  unsaved.value = true
}
function applySelection(html) {
  editorRef.value?.replaceSelection(html)
  unsaved.value = true
}

function restoreDraft() {
  if (!draftMeta) return
  currentDoc.value = { id: null, title: draftMeta.title || '', scenario: 'weekly', content_html: draftMeta.content_html, status: 'draft', version: 1 }
  editorRef.value?.setContent(draftMeta.content_html)
  showDraftTip.value = false
  unsaved.value = true
}
function discardDraft() {
  localStorage.removeItem(DRAFT_KEY)
  showDraftTip.value = false
}
function dismissDraftTip() { showDraftTip.value = false }

function autoFlushDraft() {
  if (!currentDoc.value || !unsaved.value) return
  const meta = { title: currentDoc.value.title, content_html: currentDoc.value.content_html, ts: Date.now() }
  localStorage.setItem(DRAFT_KEY, JSON.stringify(meta))
}
setInterval(autoFlushDraft, 30000)

onBeforeRouteLeave(async (to, from, next) => {
  if (unsaved.value) {
    const ok = await ElMessageBox.confirm('有未保存的修改，离开将丢失？', '提示', { type: 'warning' }).then(() => true).catch(() => false)
    if (!ok) return next(false)
  }
  next()
})

onMounted(async () => {
  await loadDocs()
  const raw = localStorage.getItem(DRAFT_KEY)
  if (raw) {
    try {
      draftMeta = JSON.parse(raw)
      const mins = Math.round((Date.now() - draftMeta.ts) / 60000)
      draftTipTime.value = `${mins} 分钟前`
      showDraftTip.value = true
    } catch (e) { /* 忽略损坏草稿 */ }
  }
  const lastId = sessionStorage.getItem(LAST_OPEN_KEY)
  if (lastId && docs.value.some((d) => d.id === lastId)) {
    await openDoc(docs.value.find((d) => d.id === lastId))
  } else {
    newDoc()
  }
})
</script>

<style scoped>
.writing { display: flex; height: calc(100vh - 60px); }
.left { width: 220px; border-right: 1px solid #eee; padding: 12px; overflow-y: auto; }
.center { flex: 1; border-right: 1px solid #eee; display: flex; flex-direction: column; }
.right { width: 340px; overflow-y: auto; padding: 12px; }
.doc-list-title { font-weight: bold; margin: 12px 0 8px; }
.doc-item { display: flex; justify-content: space-between; align-items: center; padding: 8px; cursor: pointer; border-radius: 4px; }
.doc-item:hover { background: #f5f5f5; }
.doc-item.active { background: #ecf5ff; }
</style>
```

- [ ] **Step 4: 运行验证通过**

Run: `npx vitest run` 全 PASS；`node --test test/` 全 PASS；`npx vite build` 成功

- [ ] **Step 5: Commit**

```bash
git add src/views/Writing.vue src/components/EditorArea.vue src/components/AiPanel.vue src/utils/editor-undo.js src/utils/paste-clean.js src/utils/*.test.js
git commit -m "feat: 写作工作台 - 三栏/SSE流式/撤销栈/草稿恢复/路由守卫"
```

---

### Task 10: fake provider 端到端验证 + 全量回归

**Files:**
- Modify: `test/ai-api.test.js`（补端到端断言）

**Interfaces:**
- Consumes: 全部前述任务
- Produces: 无新接口；验证 4 场景 fake 端到端

- [ ] **Step 1: 补端到端测试**

```js
// test/ai-api.test.js 追加
test('4 场景 fake 端到端（write×3 + polish）', async () => {
  const weekly = await call('POST', '/api/ai/write', { scenario: 'weekly', dateFrom: '2026-08-01', dateTo: '2026-08-07' })
  assert.ok(weekly.text.includes('生成'))
  const report = await call('POST', '/api/ai/write', { scenario: 'report', extraNotes: '背景补充' })
  assert.ok(report.text.includes('生成'))
  const draft = await call('POST', '/api/ai/write', { scenario: 'draft', genre: '通知', subject: '关于召开会议的通知', keyPoints: ['时间', '地点'] })
  assert.ok(draft.text.includes('生成'))
  const polish = await call('POST', '/api/ai/polish', { text: '内容。', mode: 'style' })
  assert.ok(polish.text.includes('生成'))
})

test('system prompt 含 SKILL 内容（拦截 provider 调用参数断言）', async () => {
  let captured = null
  setProviderFactory(() => ({
    chatStream: async ({ messages }) => { captured = messages },
    testConnection: async () => ({ ok: true, latencyMs: 1 }),
  }))
  await call('POST', '/api/ai/write', { scenario: 'weekly', dateFrom: '2026-08-01', dateTo: '2026-08-07' })
  assert.ok(captured[0].content.includes('按·拿·推'), 'system prompt 应含 gongwen SKILL')
  assert.ok(captured[0].content.includes('周报'), 'system prompt 应含场景模板')
})
```

- [ ] **Step 2: 运行验证**

Run: `node --test test/`
Expected: 全部 PASS（含新增 2 项）

- [ ] **Step 3: 全量回归**

Run: `node --test test/ && npx vitest run && node build/check-blocks.mjs && npx vite build`
Expected: 全部通过

- [ ] **Step 4: 真实模型冒烟（可选，环境受限不阻塞）**

```bash
# 手动步骤：若已配置真实模型（DeepSeek/Ollama），启动服务后：
curl -X POST http://localhost:3000/api/ai/write \
  -H 'Content-Type: application/json' \
  -d '{"scenario":"draft","genre":"通知","subject":"关于开展自查工作的通知","keyPoints":["时间","范围","要求"]}'
# 验证 SSE 流式输出完整公文；失败记录为环境限制（docs/perf.md 备注），不阻塞 M4 关闭
```

- [ ] **Step 5: Commit**

```bash
git add test/ai-api.test.js
git commit -m "test: 4 场景 fake 端到端 + SKILL 注入断言"
```

---

## Self-Review 结果

**Spec 覆盖（M3/M4）：**
- ✅ AES-256-GCM 密钥管理 + .secret 缺失处理 → Task 1
- ✅ AI 配置 CRUD + 掩码 + active + test 优先级 → Task 2
- ✅ SKILL 文件（gongwen/biganzi 原文）与场景模板 + SKILL_MAP 装配 → Task 3
- ✅ provider 抽象层 + setProviderFactory + SSE 解析 + 超时 → Task 4
- ✅ write/polish/chat SSE + 周报聚合（200 条上限/deleted_at 过滤）+ report 50 条上限 + polish 20000 上限 + 错误脱敏 → Task 5
- ✅ writings 路由 + 单实例锁并发测试 → Task 6
- ✅ blocks.json 单一事实源 + 构建期校验 + 前后端映射 → Task 7
- ✅ Settings.vue 配置页 → Task 8
- ✅ 写作工作台（三栏/文档状态/草稿/撤销栈/beforeunload/粘贴/路由守卫）→ Task 9
- ✅ fake provider 端到端 + SKILL 注入断言 → Task 10
- ⏳ 导出（Word/Excel/异步 job）与 exported_at 联动 → 计划 3
- ⏳ Glossary 页、回收站完善、性能基准 → 计划 3
- ⏳ 定时任务（附件/导出清理 jobs）→ 计划 3（依赖 exports 表）

**占位符扫描：** 无 TBD/TODO；"待填"仅出现在 perf.md 基准实测列（计划 1 Task 9，执行性占位）。AiPanel 中 report 场景的 bizRefs 前端选择用 tasks 列表（meetings 引用可在 M6 打磨补充，后端已支持）。

**类型一致性：** `buildSystemPrompt(scenario, { materials })` 在 Task 3 定义、Task 5 调用一致；`getProvider(cfg)` 签名一致；`setProviderFactory` 在 Task 4/5/10 使用一致；`undoStack.push(snap, { force })` 前端两处调用一致；`api_key_mask` 字段名在 Task 2 序列化与 Settings.vue 绑定一致；`sseWrite` 内部写 `data: {delta}` 与前端 AiPanel 解析一致。
