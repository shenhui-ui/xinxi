const blocks = require('../../shared/blocks.json')

const DOCX_STYLES = {
  title: 'Title',
  wenhao: 'WenHao',
  h1: 'Heading1',
  h2: 'Heading2',
  body: 'Normal',
  sign: 'RightAlign',
  attachment: 'Attachment',
  kai: 'ItalicBody',
  banji: 'Footer',
}

function validate() {
  const missing = blocks.filter((b) => !DOCX_STYLES[b.block])
  if (missing.length) throw new Error(`docx-styles 缺少映射: ${missing.map((b) => b.block).join(', ')}`)
  return true
}

validate()

module.exports = { DOCX_STYLES, validate }
