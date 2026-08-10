const { makeCrudRouter } = require('./crud')
module.exports = function writingsRouter(db) {
  return makeCrudRouter(db, {
    table: 'writings',
    fields: ['title', 'scenario', 'content_html', 'status', 'exported_at'],
    searchFields: ['title'],
    sortable: ['created_at', 'updated_at'],
  })
}
