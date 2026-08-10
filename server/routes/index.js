module.exports = function routes(db) {
  const router = require('express').Router()
  router.get('/health', (req, res) => {
    res.json({ code: 0, data: { version: require('../../package.json').version, schemaVersion: '1', uptime: process.uptime(), dbOk: true } })
  })
  router.use('/tasks', require('./tasks')(db))
  router.use('/attachments', require('./attachments')(db))
  router.use('/meetings', require('./meetings')(db))
  router.use('/documents', require('./documents')(db))
  router.use('/activities', require('./activities')(db))
  router.use('/seals', require('./seals')(db))
  router.use('/supplies', require('./supplies')(db))
  router.use('/stats', require('./stats')(db))
  const aiConfigs = require('./ai-configs')
  router.use('/ai/configs', aiConfigs(db))
  router.use('/ai/test', aiConfigs.makeTestRouter(db))
  const aiRouter = require('./ai')
  router.use('/ai', aiRouter(db))
  return router
}
