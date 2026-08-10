import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createProvider } from '../server/ai/provider.js'
import { setProviderFactory, getProvider } from '../server/ai/index.js'

test('parseSseLine 解析 data 行与 DONE', async () => {
  const { parseSseLine } = await import('../server/ai/provider.js')
  assert.deepEqual(parseSseLine('data: {"delta":"你"}'), { delta: '你' })
  assert.deepEqual(parseSseLine('data: [DONE]'), { done: true })
  assert.equal(parseSseLine('event: error\ndata: {"message":"x"}'), null)
})

test('fake provider 注入生效', async () => {
  const calls = []
  setProviderFactory((cfg) => ({
    chatStream: async ({ messages, onChunk }) => { calls.push(cfg); onChunk('fake') },
    testConnection: async () => ({ ok: true, latencyMs: 5 }),
  }))
  const p = getProvider({ baseUrl: 'u' })
  await p.chatStream({ messages: [], onChunk: (c) => assert.equal(c, 'fake') })
  assert.equal(calls.length, 1)
  setProviderFactory(null)
})

test('真实 provider 错误脱敏（连接失败只含基本信息）', async () => {
  const p = createProvider({ baseUrl: 'http://127.0.0.1:1/v1', apiKey: 'sk-abc', model: 'm' })
  try {
    await p.testConnection({ baseUrl: 'http://127.0.0.1:1/v1', apiKey: 'sk-abc', model: 'm' })
    assert.fail('应失败')
  } catch (e) {
    assert.ok(!e.message.includes('sk-abc'), '错误信息不得含 apiKey')
  }
})
