const MAX_PAGE_SIZE = 100

function ok(res, data) {
  return res.json({ code: 0, data })
}

function fail(res, code, message, httpStatus = 400) {
  return res.status(httpStatus).json({ code, message })
}

function err40401(res, id) {
  return res.status(404).json({ code: 40401, message: '记录不存在', data: { id } })
}

function err40402(res, id, deletedAt) {
  return res.status(404).json({ code: 40402, message: '记录已删除', data: { id, deletedAt } })
}

function parsePagination(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1)
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(query.pageSize, 10) || 20))
  return { page, pageSize, offset: (page - 1) * pageSize }
}

function toIso(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}+08:00`
}

module.exports = { ok, fail, err40401, err40402, parsePagination, toIso }
