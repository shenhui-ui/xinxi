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
  const dest = resolveAttachmentPath(serverFileName)
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
