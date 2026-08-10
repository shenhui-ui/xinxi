export const BLOCK_CSS = {
  title: 'font-family: "方正小标宋简体","华文中宋",serif; font-size: 22pt; text-align: center; font-weight: bold; margin: 0 0 16pt 0;',
  wenhao: 'font-family: "黑体","SimHei",sans-serif; font-size: 16pt; text-align: center; margin: 0 0 12pt 0;',
  h1: 'font-family: "黑体","SimHei",sans-serif; font-size: 16pt; font-weight: bold; margin: 12pt 0 8pt 0;',
  h2: 'font-family: "楷体","KaiTi",serif; font-size: 16pt; font-weight: bold; margin: 8pt 0 6pt 0;',
  body: 'font-family: "仿宋","FangSong",serif; font-size: 16pt; line-height: 28pt; text-indent: 2em; margin: 0;',
  sign: 'font-family: "仿宋","FangSong",serif; font-size: 16pt; text-align: right; margin: 12pt 0 0 0;',
  attachment: 'font-family: "仿宋","FangSong",serif; font-size: 16pt; margin: 0 0 6pt 0;',
  kai: 'font-family: "楷体","KaiTi",serif; font-size: 16pt; line-height: 28pt; margin: 0;',
  banji: 'font-family: "仿宋","FangSong",serif; font-size: 12pt; border-top: 1px solid #000; padding-top: 6pt; margin-top: 24pt;',
}

export function cssForBlock(block) {
  return BLOCK_CSS[block] || BLOCK_CSS.body
}

export function isBlock(el) {
  return el && typeof el.getAttribute === 'function' && !!el.getAttribute('data-block')
}

export default { BLOCK_CSS, cssForBlock, isBlock }
