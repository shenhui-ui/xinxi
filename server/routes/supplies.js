const express = require('express')
const { randomUUID } = require('node:crypto')
const { makeCrudRouter } = require('./crud')
const { ok, fail, err40401, toIso } = require('../utils/http')

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
