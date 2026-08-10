import { describe, it, expect } from 'vitest'
import blocks from '../../shared/blocks.json'
import { BLOCK_CSS } from './block-styles'

describe('block-styles', () => {
  it('BLOCK_CSS 覆盖 blocks.json 全部枚举', () => {
    for (const b of blocks) {
      expect(BLOCK_CSS[b.block], `${b.block} 缺前端 CSS`).toBeTruthy()
    }
  })
  it('枚举包含 9 类', () => {
    expect(blocks.map((b) => b.block)).toEqual(['title', 'wenhao', 'h1', 'h2', 'body', 'sign', 'attachment', 'kai', 'banji'])
  })
})
