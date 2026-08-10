const { cleanupExports, cleanupAttachments } = require('../export/cleanup')
const { toIso } = require('../utils/http')

function startJobs(db, { attachMs = 24 * 3600000, exportMs = 3600000, onRun } = {}) {
  const timers = []
  const attachTimer = setTimeout(function attachTick() {
    try { cleanupAttachments(db, { now: new Date().toISOString() }) } catch (e) { console.error('[jobs] 附件清理失败:', e.message) }
    if (onRun) onRun()
    timers[0] = setTimeout(attachTick, attachMs)
  }, attachMs)
  const exportTimer = setTimeout(function exportTick() {
    try { cleanupExports(db, { now: toIso() }) } catch (e) { console.error('[jobs] 导出清理失败:', e.message) }
    if (onRun) onRun()
    timers[1] = setTimeout(exportTick, exportMs)
  }, exportMs)
  timers[0] = attachTimer
  timers[1] = exportTimer
  return { timers }
}

function stopJobs(jobs) {
  for (const t of jobs.timers || []) clearTimeout(t)
}

module.exports = { startJobs, stopJobs }
