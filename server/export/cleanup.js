const fs = require('node:fs')
const path = require('node:path')
const config = require('../config')
const { deleteFile } = require('../utils/storage')

function exportsDir() {
  const dir = path.join(config.dataDir, 'exports')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function cleanupExports(db, { now }) {
  const rows = db.prepare('SELECT * FROM exports WHERE expires_at < ?').all(now)
  for (const row of rows) {
    if (row.file_id) {
      try { fs.rmSync(path.join(exportsDir(), row.file_id), { force: true }) } catch (e) { /* 忽略 */ }
    }
  }
  db.prepare('DELETE FROM exports WHERE expires_at < ?').run(now)
  return rows.length
}

function cleanupAttachments(db, { now }) {
  const sevenDaysAgo = new Date(now)
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  const cutoff = sevenDaysAgo.toISOString().slice(0, 10)
  const rows = db.prepare('SELECT server_file_name FROM attachments WHERE deleted_at IS NOT NULL AND substr(deleted_at, 1, 10) <= ?').all(cutoff)
  for (const row of rows) {
    deleteFile(row.server_file_name)
  }
  return rows.length
}

module.exports = { cleanupExports, cleanupAttachments, exportsDir }
