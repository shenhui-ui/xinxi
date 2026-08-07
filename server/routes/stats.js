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
