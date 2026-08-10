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

test('chatStream 正常流式不误杀（mock fetch）', async () => {
  const origFetch = global.fetch
  const chunks = []
  global.fetch = async () => ({
    ok: true,
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"delta":"你"}\n\n'))
        controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'))
        controller.close()
      },
    }),
  })
  try {
    const p = createProvider({ baseUrl: 'http://fake/v1', apiKey: 'k', model: 'm' })
    await p.chatStream({ messages: [], onChunk: (d) => chunks.push(d) })
    assert.deepEqual(chunks, ['你'])
  } finally {
    global.fetch = origFetch
  }
})

test('obj.delta 为对象时不污染输出', async () => {
  const { parseSseLine } = await import('../server/ai/provider.js')
  assert.deepEqual(parseSseLine('data: {"delta":{"content":"x"}}'), { delta: '' })
  assert.deepEqual(parseSseLine('data: {"delta":"你"}'), { delta: '你' })
})

test('baseUrl 带 /v1 或尾斜杠时请求路径不重复拼接', async () => {
  const origFetch = global.fetch
  const urls = []
  global.fetch = async (url) => {
    urls.push(url)
    return { ok: true, body: new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'))
        controller.close()
      },
    }) }
  }
  try {
    const p = createProvider({ baseUrl: 'https://api.deepseek.com/v1/', apiKey: 'k', model: 'm' })
    await p.chatStream({ messages: [], onChunk: () => {} })
    assert.deepEqual(urls, ['https://api.deepseek.com/v1/chat/completions'])
    const p2 = createProvider({ baseUrl: 'https://api.deepseek.com', apiKey: 'k', model: 'm' })
    await p2.chatStream({ messages: [], onChunk: () => {} })
    assert.deepEqual(urls[1], 'https://api.deepseek.com/v1/chat/completions')
  } finally {
    global.fetch = origFetch
  }
})
