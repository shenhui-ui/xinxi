import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('axios', () => {
  const handlers = { ok: null, err: null }
  const http = {
    interceptors: {
      response: { use: vi.fn((ok, err) => { handlers.ok = ok; handlers.err = err }) },
    },
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  }
  return { default: { create: () => http } }
})

vi.mock('element-plus', () => ({
  ElMessage: { error: vi.fn(), warning: vi.fn() },
}))

import axios from 'axios'
import { api } from './index'

const handlers = axios.create().interceptors.response
const okHandler = handlers.use.mock.calls[0][0]
const errHandler = handlers.use.mock.calls[0][1]

describe('api 响应解包', () => {
  it('code === 0 时解包出业务 data', () => {
    const out = okHandler({ data: { code: 0, data: { list: [{ id: 1 }], total: 1 } } })
    expect(out).toEqual({ list: [{ id: 1 }], total: 1 })
  })
  it('非 code 0 响应原样透传', () => {
    const out = okHandler({ data: { code: 40001, message: '参数错误' } })
    expect(out).toEqual({ code: 40001, message: '参数错误' })
  })
  it('错误响应被拒绝并带出 body', async () => {
    const body = { code: 409, message: '乐观锁版本冲突' }
    await expect(errHandler({ response: { status: 409, data: body } })).rejects.toEqual(body)
  })
})
