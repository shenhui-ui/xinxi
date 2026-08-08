const { makeCrudRouter } = require('./crud')

module.exports = function tasksRouter(db) {
  return makeCrudRouter(db, {
    table: 'tasks',
    fields: ['title', 'task_type', 'source', 'assign_time', 'deadline', 'assigner', 'cooperators', 'status', 'progress', 'summary', 'stages'],
    searchFields: ['title', 'assigner', 'source', 'cooperators'],
    sortable: ['created_at', 'deadline', 'status', 'progress'],
  })
}
