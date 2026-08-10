const { Document, Packer, Paragraph, TextRun, AlignmentType } = require('docx')
const { DOCX_STYLES } = require('../utils/docx-styles')

const STYLE_RUNS = {
  Title: { size: 44, bold: true, font: '宋体' },      // 22pt
  WenHao: { size: 32, bold: false, font: '黑体' },    // 16pt
  Heading1: { size: 32, bold: true, font: '黑体' },
  Heading2: { size: 32, bold: true, font: '楷体' },
  Normal: { size: 32, font: '仿宋' },
  RightAlign: { size: 32, font: '仿宋' },
  Attachment: { size: 32, font: '仿宋' },
  ItalicBody: { size: 32, italics: true, font: '楷体' },
  Footer: { size: 24, font: '仿宋' },                 // 12pt
}

function parseBlocks(contentHtml) {
  const out = []
  const re = /<p\s+data-block="([^"]+)"[^>]*>([\s\S]*?)<\/p>|<p[^>]*>([\s\S]*?)<\/p>|<div[^>]*>([\s\S]*?)<\/div>/g
  let m
  while ((m = re.exec(contentHtml))) {
    const block = m[1] || 'body'
    const inner = (m[2] ?? m[3] ?? m[4] ?? '')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .trim()
    if (inner) out.push({ block, text: inner })
  }
  return out
}

function styleName(block) {
  return DOCX_STYLES[block] || 'Normal'
}

function buildParagraphs(format, forceBanji, blocks) {
  const out = []
  for (const { block, text } of blocks) {
    if (!text) continue
    if (block === 'banji') continue // 版记统一走末尾段，避免重复输出
    if (format === 'internal' && block === 'wenhao' && !forceBanji) continue
    out.push({ style: styleName(block), text })
  }
  const banjiText = blocks.find((b) => b.block === 'banji')?.text
  if (format === 'gbt' || (format === 'internal' && forceBanji)) {
    out.push({ style: 'Footer', text: banjiText || ' ' })
  }
  return out
}

function toParagraph({ style, text }) {
  const st = style
  const runCfg = STYLE_RUNS[st] || STYLE_RUNS.Normal
  const alignment = st === 'RightAlign' ? AlignmentType.RIGHT : st === 'Title' || st === 'WenHao' ? AlignmentType.CENTER : AlignmentType.LEFT
  return new Paragraph({
    children: [new TextRun({ text, ...runCfg })],
    alignment,
    indent: st === 'Normal' ? { firstLine: 480 } : undefined, // 2 字符≈480 twip
    ...(st === 'Footer' ? { pageBreakBefore: false } : {}),
  })
}

async function buildWordDocx({ format, forceBanji, contentHtml, title, docNo }) {
  if (format === 'gbt' && !docNo) {
    const e = new Error('GB/T 格式需填写发文字号')
    e.code = 40003
    throw e
  }
  const blocks = parseBlocks(contentHtml)
  const paragraphs = buildParagraphs(format, forceBanji, blocks).map(toParagraph)

  const doc = new Document({
    sections: [{ properties: {}, children: paragraphs }],
  })

  const buffer = await Packer.toBuffer(doc)
  return { buffer, displayName: `${title || '未命名公文'}.docx` }
}

module.exports = { buildWordDocx, buildParagraphs, parseBlocks }
