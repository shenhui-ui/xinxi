import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const viewsDir = fileURLToPath(new URL('../src/views', import.meta.url))
const views = readdirSync(viewsDir).filter((f) => f.endsWith('.vue'))
const placeholder = /(开发中|TODO|待实现|占位)/
const allowed = new Set(['Writing.vue', 'Glossary.vue', 'Settings.vue'])

let failed = false
for (const file of views) {
  if (allowed.has(file)) continue
  const content = readFileSync(join(viewsDir, file), 'utf8')
  if (placeholder.test(content)) {
    console.error(`[check-blocks] 占位残留: src/views/${file}`)
    failed = true
  }
}
if (failed) {
  console.error('[check-blocks] 存在未实现的视图占位，构建终止')
  process.exit(1)
}
console.log(`[check-blocks] ${views.length} 视图校验通过（占位允许: ${[...allowed].join(', ')}）`)
