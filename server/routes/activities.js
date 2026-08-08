const { makeCrudRouter } = require('./crud')
module.exports = function activitiesRouter(db) {
  return makeCrudRouter(db, {
    table: 'activities',
    fields: ['act_type', 'title', 'start_time', 'end_time', 'location', 'participants', 'achievements'],
    searchFields: ['title', 'location', 'participants', 'achievements'],
    sortable: ['created_at', 'start_time'],
  })
}
