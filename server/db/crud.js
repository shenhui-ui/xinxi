const { randomUUID } = require('node:crypto')
const { toIso } = require('../utils/http')

function makeCrud(db, { table, fields, searchFields = [], sortable = [], children = [] }) {
  const cols = [...fields, 'id', 'created_by', 'created_at', 'updated_at', 'deleted_at', 'version']
  const safeCols = (arr) => arr.filter((c) => cols.includes(c))
  const tableCols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name)
  const sysCols = ['id', 'created_at', 'updated_at', 'deleted_at', 'version']
  const writableCols = tableCols.filter((c) => !sysCols.includes(c))

  function pick(body) {
    const row = {}
    for (const f of writableCols) if (body[f] !== undefined) row[f] = body[f]
    if (body.created_by) row.created_by = String(body.created_by)
    return row
  }

  function list(query = {}) {
    const { page, pageSize, offset } = require('../utils/http').parsePagination(query)
    const where = []
    const params = {}
    if (query.deleted === '1') {
      where.push('deleted_at IS NOT NULL')
    } else {
      where.push('deleted_at IS NULL')
    }
    if (query.keyword && searchFields.length) {
      const like = `%${query.keyword}%`
      where.push(`(${searchFields.map((c) => `COALESCE(${c},'') LIKE @kw`).join(' OR ')})`)
      params.kw = like
    }
    for (const [qcol, col] of [['status', 'status'], ['type', 'task_type'], ['docType', 'doc_type'], ['actType', 'act_type']]) {
      if (query[qcol] !== undefined && query[qcol] !== '') {
        where.push(`${col} = @${qcol}`)
        params[qcol] = query[qcol]
      }
    }
    if (query.dateFrom) { where.push('created_at >= @dateFrom'); params.dateFrom = query.dateFrom }
    if (query.dateTo) { where.push('created_at <= @dateTo'); params.dateTo = query.dateTo }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
    let orderSql = 'ORDER BY created_at DESC'
    if (query.deleted === '1') orderSql = 'ORDER BY deleted_at DESC'
    if (query.sort && sortable.includes(query.sort)) {
      orderSql = `ORDER BY ${query.sort} ${query.order === 'asc' ? 'ASC' : 'DESC'}`
    }
    const total = db.prepare(`SELECT COUNT(*) c FROM ${table} ${whereSql}`).get(params).c
    const list = db.prepare(`SELECT * FROM ${table} ${whereSql} ${orderSql} LIMIT @limit OFFSET @offset`)
      .all({ ...params, limit: pageSize, offset })
    return { list, total, page, pageSize }
  }

  function get(id) {
    return db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id)
  }

  function create(body) {
    const id = randomUUID()
    const now = toIso()
    const row = { id, ...pick(body), created_at: now, updated_at: now, version: 1 }
    const keys = Object.keys(row)
    db.prepare(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map((k) => `@${k}`).join(',')})`).run(row)
    return get(id)
  }

  function update(id, body) {
    const version = parseInt(body.version, 10)
    if (!Number.isInteger(version)) return { changed: 0 }
    const existing = get(id)
    if (!existing) return { changed: 0, exists: false }
    if (existing.deleted_at) return { changed: 0, exists: true, deleted: true }
    const patch = pick(body)
    patch.version = version + 1
    patch.updated_at = toIso()
    const sets = Object.keys(patch).map((k) => `${k} = @${k}`).join(', ')
    const result = db.prepare(`UPDATE ${table} SET ${sets} WHERE id = @id AND version = @oldVersion AND deleted_at IS NULL`)
      .run({ ...patch, id, oldVersion: version })
    if (result.changes === 0) return { changed: 0, exists: true }
    return { changed: 1, row: get(id) }
  }

  function remove(id) {
    const result = db.prepare(`UPDATE ${table} SET deleted_at = @now, updated_at = @now, version = version + 1 WHERE id = @id AND deleted_at IS NULL`)
      .run({ id, now: toIso() })
    return { changed: result.changes }
  }

  function restore(id) {
    const result = db.prepare(`UPDATE ${table} SET deleted_at = NULL, updated_at = @now, version = version + 1 WHERE id = @id AND deleted_at IS NOT NULL`)
      .run({ id, now: toIso() })
    return { changed: result.changes }
  }

  function permanent(id) {
    const tx = db.transaction(() => {
      for (const child of children) {
        db.prepare(`DELETE FROM ${child.table} WHERE ${child.fk} = ?`).run(id)
      }
      return db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id)
    })
    return { changed: tx(id).changes }
  }

  function trashCount() {
    const row = db.prepare(`SELECT COUNT(*) c FROM ${table} WHERE deleted_at IS NOT NULL`).get()
    return { count: row.c }
  }

  return { list, get, create, update, remove, restore, permanent, trashCount, safeCols }
}

module.exports = { makeCrud }
