const express = require('express')
const { randomUUID } = require('node:crypto')
const { ok, fail, err40401, toIso } = require('../utils/http')
const { encryptText, decryptText } = require('../crypto')

const TEST_TIMEOUT_MS = 15000

function maskKey(key) {
  if (!key) return ''
  if (key.length <= 8) return '****'
  return `${key.slice(0, 3)}****${key.slice(-4)}`
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

  return router
}

function makeTestRouter(db) {
  const router = express.Router()
  router.post('/', async (req, res) => {
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
    let createProvider
    try { ({ createProvider } = require('../ai/provider')) } catch (e) {
      return res.status(502).json({ code: 40001, message: 'AI 服务模块未就绪' })
    }
    const provider = createProvider(target)
    let timer
    try {
      const result = await Promise.race([
        provider.testConnection(target),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`连接超时（${TEST_TIMEOUT_MS / 1000}s）`)), TEST_TIMEOUT_MS) }),
      ])
      clearTimeout(timer)
      ok(res, result)
    } catch (e) {
      clearTimeout(timer)
      res.status(502).json({ code: 40001, message: `连接失败: ${e.message}` })
    }
  })
  return router
}

module.exports.maskKey = maskKey
module.exports.makeTestRouter = makeTestRouter
