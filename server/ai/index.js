const { createProvider } = require('./provider')

let providerFactory = null

function setProviderFactory(fn) {
  providerFactory = fn
}

function getProvider(config) {
  return providerFactory ? providerFactory(config) : createProvider(config)
}

const SSE_HEADERS = { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' }

module.exports = { setProviderFactory, getProvider, SSE_HEADERS }
