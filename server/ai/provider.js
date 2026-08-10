function parseSseLine(line) {
  const t = line.trim()
  if (!t.startsWith('data:')) return null
  const payload = t.slice(5).trim()
  if (payload === '[DONE]') return { done: true }
  try {
    const obj = JSON.parse(payload)
    const delta = typeof obj.delta === 'string' ? obj.delta : obj.choices?.[0]?.delta?.content || obj.choices?.[0]?.message?.content || ''
    return { delta }
  } catch (e) {
    return null
  }
}

function createProvider(config) {
  async function chatStream({ messages, signal, onChunk }) {
    const baseUrl = config.baseUrl.replace(/\/$/, '')
    const timeoutSignal = AbortSignal.timeout(120000)
    const combined = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal
    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({ model: config.model, messages, stream: true }),
      signal: combined,
    })
    if (!res.ok) {
      throw new Error(`上游服务返回 ${res.status} ${res.statusText}`)
    }
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let firstTokenAt = Date.now()
    let firstTokenSeen = false
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let idx
      while ((idx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, idx)
        buffer = buffer.slice(idx + 1)
        const parsed = parseSseLine(line)
        if (!parsed) continue
        if (parsed.done) return
        if (parsed.delta) {
          if (!firstTokenSeen) {
            firstTokenSeen = true
            if (Date.now() - firstTokenAt > 60000) throw new Error('上游响应超时（首 token 60s）')
          }
          onChunk(parsed.delta)
        }
      }
    }
    if (!firstTokenSeen && Date.now() - firstTokenAt > 60000) throw new Error('上游响应超时（首 token 60s）')
  }

  async function testConnection({ baseUrl, apiKey, model }) {
    const t0 = Date.now()
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/v1/models`, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`)
    return { ok: true, latencyMs: Date.now() - t0 }
  }

  return { chatStream, testConnection }
}

module.exports = { createProvider, parseSseLine }
