import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildWordDocx, buildParagraphs, parseBlocks } from '../server/export/word.js'

const sampleHtml = `
<p data-block="wenhao">×局〔2026〕12号</p>
<p data-block="title">关于开展自查工作的通知</p>
<p data-block="body">按照上级部署要求，我单位开展了自查工作。</p>
<p data-block="body">现将有关情况报告如下。</p>
<p data-block="sign">××单位</p>
<p data-block="sign">2026年8月7日</p>
<p data-block="banji">印发机关：××单位办公室&nbsp;&nbsp;2026年8月7日印发</p>
`

test('GB/T 导出：缺 docNo 抛 40003', async () => {
  await assert.rejects(() => buildWordDocx({ format: 'gbt', forceBanji: false, contentHtml: sampleHtml, title: 't', docNo: '' }), (e) => e.code === 40003)
})

test('GB/T 导出成功且生成 docx buffer', async () => {
  const { buffer } = await buildWordDocx({ format: 'gbt', forceBanji: false, contentHtml: sampleHtml, title: 't', docNo: '×局〔2026〕12号' })
  assert.ok(Buffer.isBuffer(buffer))
  assert.ok(buffer.length > 1000, 'docx 为 zip 压缩格式，体积应显著')
  // docx 以 PK 魔数开头
  assert.equal(buffer.subarray(0, 2).toString(), 'PK')
})

test('internal 导出：默认不含版记，forceBanji 时含', async () => {
  const noBanji = await buildWordDocx({ format: 'internal', forceBanji: false, contentHtml: sampleHtml, title: 't', docNo: '' })
  assert.ok(Buffer.isBuffer(noBanji.buffer))
  const withBanji = await buildWordDocx({ format: 'internal', forceBanji: true, contentHtml: sampleHtml, title: 't', docNo: '' })
  assert.ok(Buffer.isBuffer(withBanji.buffer))
})

test('internal 导出不要求 docNo', async () => {
  const r = await buildWordDocx({ format: 'internal', forceBanji: false, contentHtml: '<p data-block="body">内容</p>', title: 't', docNo: '' })
  assert.ok(Buffer.isBuffer(r.buffer))
})

test('版记仅输出一次：gbt 1 / internal+false 0 / internal+true 1', () => {
  const blocks = parseBlocks(sampleHtml)
  const banji = '印发机关：××单位办公室  2026年8月7日印发'
  const countFooter = (paragraphs) => paragraphs.filter((p) => p.style === 'Footer' && p.text === banji).length
  assert.equal(countFooter(buildParagraphs('gbt', false, blocks)), 1)
  assert.equal(countFooter(buildParagraphs('internal', false, blocks)), 0)
  assert.equal(countFooter(buildParagraphs('internal', true, blocks)), 1)
})

test('版记不在正文段重复输出（gbt 全段落断言）', () => {
  const blocks = parseBlocks(sampleHtml)
  const paragraphs = buildParagraphs('gbt', false, blocks)
  const banjiTexts = paragraphs.filter((p) => p.text.includes('印发机关'))
  assert.equal(banjiTexts.length, 1)
  assert.equal(banjiTexts[0].style, 'Footer')
})

test('无 data-block 的手工段落按 body 导出', async () => {
  const html = '<p data-block="title">标题</p><p>手工输入的内容</p><div>另一个段落</div>'
  const { buffer } = await buildWordDocx({ format: 'internal', forceBanji: false, contentHtml: html, title: 't', docNo: '' })
  assert.ok(Buffer.isBuffer(buffer))
  const blocks = parseBlocks(html)
  const paras = buildParagraphs('internal', false, blocks)
  assert.equal(paras.find((p) => p.text === '标题').style, 'Title')
  assert.ok(paras.some((p) => p.text === '手工输入的内容' && p.style === 'Normal'))
  assert.ok(paras.some((p) => p.text === '另一个段落' && p.style === 'Normal'))
})

test('parseBlocks 过滤空段与仅空白段', () => {
  const blocks = parseBlocks('<p data-block="body">正文</p><p> </p><p data-block="sign">&nbsp;</p><div>   </div>')
  assert.deepEqual(blocks, [{ block: 'body', text: '正文' }])
})
