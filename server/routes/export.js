const express = require('express')
const fs = require('node:fs')
const path = require('node:path')
const { randomUUID } = require('node:crypto')
const { ok, fail, err40401, toIso } = require('../utils/http')
const { buildWordDocx } = require('../export/word')
const { exportsDir } = require('../export/cleanup')
const { EXPORT_SYNC_LIMIT, EXPORT_TTL_MS, EXPORT_HISTORY_DAYS } = require('../export/const')

const TABLE_MAP = {
  tasks: { table: 'tasks', searchFields: ['title', 'assigner', 'source', 'cooperators'] },
  meetings: { table: 'meetings', searchFields: ['topic', 'send_to', 'receive_from', 'location'] },
  documents: { table: 'documents', searchFields: ['title', 'doc_no', 'handler', 'genre'] },
  activities: { table: 'activities', searchFields: ['title', 'location', 'participants', 'achievements'] },
  seals: { table: 'seals', searchFields: ['applicant', 'approver', 'file_name', 'purpose'] },
  supplies: { table: 'supplies', searchFields: ['name', 'type', 'location', 'source_unit'] },
}

function countRows(db, module, filters) {
  const cfg = TABLE_MAP[module]
  const where = ['deleted_at IS NULL']
  const params = {}
  if (filters.keyword && cfg.searchFields.length) {
    where.push(`(${cfg.searchFields.map((c) => `COALESCE(${c},'') LIKE @kw`).join(' OR ')})`)
    params.kw = `%${filters.keyword}%`
  }
  if (filters.status) { where.push('status = @status'); params.status = filters.status }
  if (filters.dateFrom) { where.push('created_at >= @dateFrom'); params.dateFrom = filters.dateFrom }
  if (filters.dateTo) { where.push('created_at <= @dateTo'); params.dateTo = filters.dateTo }
  return { whereSql: `WHERE ${where.join(' AND ')}`, params }
}

async function generateExcel(db, module, filters, fieldKeys) {
  const { whereSql, params } = countRows(db, module, filters)
  const cfg = TABLE_MAP[module]
  const rows = db.prepare(`SELECT * FROM ${cfg.table} ${whereSql}`).all(params)
  const XLSX = require('xlsx')
  const wb = XLSX.utils.book_new()
  const data = rows.map((r) => {
    const out = {}
    for (const key of fieldKeys || []) {
      if (key in r) out[key] = r[key]
      else console.warn(`[export] 未知字段 ${key} 已忽略`)
    }
    return out
  })
  const ws = XLSX.utils.json_to_sheet(data)
  XLSX.utils.book_append_sheet(wb, ws, '明细')
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  return { buffer, displayName: `${module}-${filters.dateFrom || ''}.xlsx` }
}

function writeExportFile(db, { bizType, writingId, displayName, buffer, format, filterJson }) {
  const fileId = randomUUID()
  const dir = exportsDir()
  fs.writeFileSync(path.join(dir, fileId), buffer)
  const now = toIso()
  const expires = toIso(new Date(Date.now() + EXPORT_TTL_MS))
  const row = {
    id: randomUUID(), job_id: null, biz_type: bizType, writing_id: writingId || null,
    format: format || null, filter_json: filterJson || null, file_id: fileId,
    display_name: displayName, status: 'done', message: null,
    expires_at: expires, created_at: now, downloaded_at: null,
  }
  db.prepare(`INSERT INTO exports (${Object.keys(row).join(',')}) VALUES (${Object.keys(row).map((k) => `@${k}`).join(',')})`).run(row)
  return { fileId, url: `/api/export/download/${fileId}` }
}

function linkWriting(db, writingId, targetVersion) {
  if (!writingId) return
  const version = parseInt(targetVersion, 10)
  if (!Number.isInteger(version)) {
    const e = new Error('writingId 关联需携带 targetVersion')
    e.code = 40001
    throw e
  }
  const w = db.prepare('SELECT * FROM writings WHERE id = ?').get(writingId)
  if (!w) { const e = new Error('writings 记录不存在'); e.code = 40401; throw e }
  const r = db.prepare('UPDATE writings SET status = ?, exported_at = ?, updated_at = ?, version = version + 1 WHERE id = ? AND version = ? AND deleted_at IS NULL')
    .run('exported', toIso(), toIso(), writingId, version)
  if (!r.changes) { const e = new Error('乐观锁版本冲突'); e.code = 409; throw e }
}

function historyHandler(db) {
  return (req, res) => {
    const where = ['created_at >= ?']
    const params = [toIso(new Date(Date.now() - EXPORT_HISTORY_DAYS * 86400000))]
    if (req.query.bizType) { where.push('biz_type = ?'); params.push(req.query.bizType) }
    if (req.query.writingId) { where.push('writing_id = ?'); params.push(req.query.writingId) }
    if (req.query.status) { where.push('status = ?'); params.push(req.query.status) }
    const rows = db.prepare(`SELECT * FROM exports WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT 100`).all(...params)
    ok(res, { list: rows })
  }
}

module.exports = function exportRouter(db) {
  const router = express.Router()
  const jobs = new Map()

  router.post('/word', async (req, res) => {
    const body = req.body || {}
    try {
      const { buffer, displayName } = await buildWordDocx(body)
      if (body.writingId) linkWriting(db, body.writingId, body.targetVersion)
      const r = writeExportFile(db, {
        bizType: 'word', writingId: body.writingId, displayName,
        buffer, format: body.format, filterJson: JSON.stringify({ title: body.title }),
      })
      ok(res, r)
    } catch (e) {
      if (e.code === 40003) return fail(res, 40003, 'GB/T 格式需填写发文字号')
      if (e.code === 40001) return fail(res, 40001, 'writingId 关联需携带 targetVersion')
      if (e.code === 40401) return err40401(res, body.writingId)
      if (e.code === 409) return res.status(409).json({ code: 409, message: '乐观锁版本冲突' })
      fail(res, 40001, `导出失败: ${e.message}`)
    }
  })

  router.post('/excel', (req, res) => {
    const body = req.body || {}
    const module = body.module
    if (!TABLE_MAP[module]) return fail(res, 40001, `不支持的模块: ${module}`)
    const { whereSql, params } = countRows(db, module, body.filters || {})
    const cfg = TABLE_MAP[module]
    const total = db.prepare(`SELECT COUNT(*) c FROM ${cfg.table} ${whereSql}`).get(params).c
    if (total <= EXPORT_SYNC_LIMIT) {
      generateExcel(db, module, body.filters || {}, body.fieldKeys || []).then(({ buffer, displayName }) => {
        const r = writeExportFile(db, {
          bizType: 'excel', writingId: null, displayName,
          buffer, format: null, filterJson: JSON.stringify(body.filters || {}),
        })
        ok(res, r)
      }).catch((e) => fail(res, 40001, `导出失败: ${e.message}`))
    } else {
      const jobId = randomUUID()
      jobs.set(jobId, { status: 'pending', message: null, fileId: null })
      const now = toIso()
      const expires = toIso(new Date(Date.now() + EXPORT_TTL_MS))
      db.prepare(`INSERT INTO exports (id, job_id, biz_type, writing_id, format, filter_json, file_id, display_name, status, message, expires_at, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(randomUUID(), jobId, 'excel', null, null, JSON.stringify(body.filters || {}), null, `${module}-export`, 'pending', null, expires, now)
      setTimeout(() => {
        generateExcel(db, module, body.filters || {}, body.fieldKeys || []).then(({ buffer, displayName }) => {
          const fileId = randomUUID()
          fs.writeFileSync(path.join(exportsDir(), fileId), buffer)
          db.prepare("UPDATE exports SET status = 'done', file_id = ?, display_name = ?, message = NULL WHERE job_id = ?").run(fileId, displayName, jobId)
          jobs.set(jobId, { status: 'done', fileId })
        }).catch((e) => {
          db.prepare("UPDATE exports SET status = 'failed', message = ? WHERE job_id = ?").run(e.message.slice(0, 200), jobId)
          jobs.set(jobId, { status: 'failed', message: e.message })
        })
      }, 0)
      ok(res, { jobId })
    }
  })

  router.get('/status/:jobId', (req, res) => {
    const row = db.prepare('SELECT job_id, status, file_id, message FROM exports WHERE job_id = ?').get(req.params.jobId)
    if (!row) return fail(res, 40401, '任务不存在')
    const out = { jobId: row.job_id, status: row.status }
    if (row.status === 'done') out.fileId = row.file_id
    if (row.status === 'failed') out.message = row.message
    ok(res, out)
  })

  router.get('/download/:fileId', (req, res) => {
    const row = db.prepare('SELECT * FROM exports WHERE file_id = ? AND status = ?').get(req.params.fileId, 'done')
    if (!row) return fail(res, 41001, '文件已过期或不存在', 410)
    if (row.expires_at < toIso()) return fail(res, 41001, '文件已过期', 410)
    const abs = path.join(exportsDir(), row.file_id)
    if (!fs.existsSync(abs)) return fail(res, 41001, '文件已清理', 410)
    const encoded = encodeURIComponent(row.display_name)
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encoded}`)
    res.sendFile(abs)
  })

  router.get('/exports', historyHandler(db))

  return router
}

module.exports.historyHandler = historyHandler
