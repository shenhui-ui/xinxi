import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ok, fail, err40402, parsePagination } from '../server/utils/http.js'

test('ok 包装标准响应', () => {
  const res = { json: (body) => body }
  assert.deepEqual(ok(res, { a: 1 }), { code: 0, data: { a: 1 } })
})

test('fail 带错误码', () => {
  const res = { status: () => ({ json: (b) => b }) }
  const out = fail(res, 40001, '参数错误', 400)
  assert.deepEqual(out, { code: 40001, message: '参数错误' })
})

test('err40402 带 deletedAt', () => {
  const res = { status: () => ({ json: (b) => b }) }
  const out = err40402(res, 'abc', '2026-08-01T10:00:00+08:00')
  assert.deepEqual(out, { code: 40402, message: '记录已删除', data: { id: 'abc', deletedAt: '2026-08-01T10:00:00+08:00' } })
})

test('parsePagination 默认与边界', () => {
  assert.deepEqual(parsePagination({}), { page: 1, pageSize: 20, offset: 0 })
  assert.deepEqual(parsePagination({ page: '2', pageSize: '50' }), { page: 2, pageSize: 50, offset: 50 })
  assert.deepEqual(parsePagination({ page: '0', pageSize: '999' }), { page: 1, pageSize: 100, offset: 0 })
})
