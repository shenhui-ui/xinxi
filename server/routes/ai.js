const express = require('express')
const { fail, err40401 } = require('../utils/http')
const { decryptText } = require('../crypto')
const { getProvider, SSE_HEADERS } = require('../ai')
const { buildSystemPrompt, SKILL_MAP } = require('../skills')
const { aggregateWeekly } = require('../ai/aggregate')

function sseWrite(req, res, provider, params) {
  const controller = new AbortController()
  res.on('close', () => { if (!res.writableEnded) controller.abort() })
  res.on('error', () => {})
  const safeWrite = (chunk) => { try { res.write(chunk) } catch (e) { /* 客户端已断开 */ } }
  const onChunk = (d) => {
    if (controller.signal.aborted) return
    try { params.onChunk(d) } catch (e) { /* 客户端已断开 */ }
  }
  res.writeHead(200, SSE_HEADERS)
  provider.chatStream({ ...params, onChunk, signal: controller.signal })
    .then(() => {
      if (controller.signal.aborted) return
      safeWrite('data: [DONE]\n\n')
      res.end()
    })
    .catch((e) => {
      if (controller.signal.aborted) return
      safeWrite(`event: error\ndata: ${JSON.stringify({ message: '生成失败，请重试' })}\n\n`)
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
    sseWrite(req, res, provider, { messages, onChunk: (d) => res.write(`data: ${JSON.stringify({ delta: d })}\n\n`) })
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
    sseWrite(req, res, provider, {
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
    sseWrite(req, res, provider, {
      messages: [
        { role: 'system', content: `你是机关公文写作助手。${modeDesc[mode]}。只输出结果文本，不加解释。` },
        { role: 'user', content: text },
      ],
      onChunk: (d) => res.write(`data: ${JSON.stringify({ delta: d })}\n\n`),
    })
  })

  return router
}
