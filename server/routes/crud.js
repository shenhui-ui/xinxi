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
