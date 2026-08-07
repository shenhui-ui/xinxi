const express = require('express')
const fs = require('node:fs')
const multer = require('multer')
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
