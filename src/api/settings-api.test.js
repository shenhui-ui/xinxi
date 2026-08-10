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
import { http } from './index'

const handlers = axios.create().interceptors.response
const okHandler = handlers.use.mock.calls[0][0]
const errHandler = handlers.use.mock.calls[0][1]

describe('settings api 封装', () => {
  beforeEach(() => vi.clearAllMocks())

  it('configs 列表解包为 { list }（蛇形字段）', async () => {
    http.get.mockResolvedValue({ data: { code: 0, data: { list: [{ id: 'c1', base_url: 'https://x', model_name: 'm', api_key_mask: 'sk-****', is_active: 1 }] } } })
    const res = await okHandler(await http.get('/ai/configs'))
    expect(http.get).toHaveBeenCalledWith('/ai/configs')
    expect(res.list[0]).toMatchObject({ id: 'c1', base_url: 'https://x', model_name: 'm', api_key_mask: 'sk-****', is_active: 1 })
  })

  it('active 接口解包为配置对象（无配置为 null）', async () => {
    http.get.mockResolvedValue({ data: { code: 0, data: { id: 'c1' } } })
    const res = await okHandler(await http.get('/ai/configs/active'))
    expect(http.get).toHaveBeenCalledWith('/ai/configs/active')
    expect(res.id).toBe('c1')
    http.get.mockResolvedValue({ data: { code: 0, data: null } })
    const none = await okHandler(await http.get('/ai/configs/active'))
    expect(none).toBeNull()
  })

  it('新增/更新走 POST /ai/configs（camelCase 载荷）', async () => {
    const payload = { id: 'c1', name: 'deepseek', baseUrl: 'https://api.deepseek.com/v1', modelName: 'deepseek-chat', apiKey: '', isActive: true, version: 3 }
    await http.post('/ai/configs', payload)
    expect(http.post).toHaveBeenCalledWith('/ai/configs', expect.objectContaining({ id: 'c1', baseUrl: expect.any(String), isActive: true, version: 3 }))
    expect(http.put).not.toHaveBeenCalled()
  })

  it('测试连接 POST /ai/test 返回 latencyMs', async () => {
    http.post.mockResolvedValue({ data: { code: 0, data: { ok: true, latencyMs: 321 } } })
    const res = await okHandler(await http.post('/ai/test', { configId: 'c1' }))
    expect(http.post).toHaveBeenCalledWith('/ai/test', { configId: 'c1' })
    expect(res.latencyMs).toBe(321)
  })

  it('连接失败（502/40001）被拒绝并带出 body', async () => {
    const body = { code: 40001, message: '连接失败: ECONNREFUSED' }
    await expect(errHandler({ response: { status: 502, data: body } })).rejects.toEqual(body)
  })
})
