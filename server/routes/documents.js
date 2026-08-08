const { makeCrudRouter } = require('./crud')
module.exports = function documentsRouter(db) {
  return makeCrudRouter(db, {
    table: 'documents',
    fields: ['doc_type', 'title', 'doc_no', 'secret_level', 'genre', 'handler', 'receipt_status', 'content'],
    searchFields: ['title', 'doc_no', 'handler', 'genre'],
    sortable: ['created_at', 'doc_no'],
  })
}
