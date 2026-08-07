require('dotenv').config()
const path = require('node:path')
const isTest = process.env.NODE_ENV === 'test'
module.exports = {
  port: Number(process.env.PORT || 3000),
  dataDir: process.env.WENXI_DATA_DIR || path.resolve(__dirname, '..', 'data'),
  isTest,
  get dbPath() { return path.join(this.dataDir, isTest ? 'test.db' : 'wenxi.db') },
}
