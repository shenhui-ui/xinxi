const { makeCrudRouter } = require('./crud')
module.exports = function sealsRouter(db) {
  return makeCrudRouter(db, {
    table: 'seals',
    fields: ['seal_time', 'applicant', 'approver', 'file_name', 'file_type', 'purpose'],
    searchFields: ['applicant', 'approver', 'file_name', 'purpose'],
    sortable: ['created_at', 'seal_time'],
  })
}
