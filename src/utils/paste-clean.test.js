import { describe, it, expect } from 'vitest'
import { cleanPaste, isEditorEmpty } from './paste-clean'

describe('paste-clean', () => {
  it('多段按换行拆 p 默认 body', () => {
    const out = cleanPaste('第一段\n第二段')
    expect(out).toHaveLength(2)
    expect(out[0]).toContain('data-block="body"')
  })
  it('isEditorEmpty 判定', () => {
    expect(isEditorEmpty('<p><br></p>')).toBe(true)
    expect(isEditorEmpty('<p>&nbsp;</p>')).toBe(true)
    expect(isEditorEmpty('<p data-block="body">内容</p>')).toBe(false)
    expect(isEditorEmpty('')).toBe(true)
  })
})
