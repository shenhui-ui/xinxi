import { describe, it, expect } from 'vitest'
import glossary from './glossary.json'

describe('glossary', () => {
  it('60 术语 6 分类', () => {
    const cats = Object.keys(glossary)
    expect(cats.length).toBe(6)
    const total = cats.reduce((n, c) => n + glossary[c].length, 0)
    expect(total).toBe(60)
  })
  it('每项含 cn/en/def', () => {
    for (const cat of Object.keys(glossary)) {
      for (const item of glossary[cat]) {
        expect(item.cn).toBeTruthy()
        expect(item.en).toBeTruthy()
        expect(item.def).toBeTruthy()
      }
    }
  })
})
