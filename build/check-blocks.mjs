import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const blocks = JSON.parse(fs.readFileSync(path.join(root, 'shared/blocks.json'), 'utf8'))

// 前端 CSS 映射（静态分析 import 的导出键）
const blockStylesSrc = fs.readFileSync(path.join(root, 'src/utils/block-styles.js'), 'utf8')
const cssKeys = [...blockStylesSrc.matchAll(/^\s+([a-z0-9_]+):/gm)].map((m) => m[1])

// 后端 docx 映射（docx-styles.js 为 CJS，createRequire 加载；启动校验失败时视为空映射上报）
const require = createRequire(import.meta.url)
let DOCX_STYLES = {}
try {
  DOCX_STYLES = require(path.join(root, 'server/utils/docx-styles.js')).DOCX_STYLES
} catch (e) {
  console.error(`[check-blocks] 加载 DOCX_STYLES 失败: ${e.message}`)
}

let failCount = 0
for (const b of blocks) {
  if (!cssKeys.includes(b.block)) {
    console.error(`[check-blocks] 前端 BLOCK_CSS 缺少: ${b.block}`)
    failCount++
  }
  if (!DOCX_STYLES[b.block]) {
    console.error(`[check-blocks] 后端 DOCX_STYLES 缺少: ${b.block}`)
    failCount++
  }
}
if (failCount > 0) {
  console.error(`[check-blocks] 校验失败: ${failCount} 处缺失`)
  process.exit(1)
}
console.log(`[check-blocks] 通过: ${blocks.length} 个区块前后端映射齐全`)
