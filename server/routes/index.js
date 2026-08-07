module.exports = function routes(db) {
  const router = require('express').Router()
  router.get('/health', (req, res) => {
    res.json({ code: 0, data: { version: require('../../package.json').version, schemaVersion: '1', uptime: process.uptime(), dbOk: true } })
  })
  router.use('/tasks', require('./tasks')(db))
  return router
}
