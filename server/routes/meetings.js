const { makeCrudRouter } = require('./crud')
module.exports = function meetingsRouter(db) {
  return makeCrudRouter(db, {
    table: 'meetings',
    fields: ['topic', 'meeting_time', 'location', 'send_to', 'receive_from', 'attendees', 'minutes', 'status'],
    searchFields: ['topic', 'send_to', 'receive_from', 'location'],
    sortable: ['created_at', 'meeting_time'],
  })
}
