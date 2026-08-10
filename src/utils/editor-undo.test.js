import { describe, it, expect } from 'vitest'
import { createUndoStack } from './editor-undo'

describe('undo stack', () => {
  it('push/undo/redo', () => {
    const s = createUndoStack(3)
    s.push({ html: '<p>a</p>' })
    s.push({ html: '<p>b</p>' })
    expect(s.undo().html).toBe('<p>a</p>')
    expect(s.redo().html).toBe('<p>b</p>')
  })
  it('超过上限丢最旧', () => {
    const s = createUndoStack(2)
    s.push({ html: '1' }); s.push({ html: '2' }); s.push({ html: '3' })
    expect(s.stack.length).toBe(2)
  })
  it('AI 操作强制 push', () => {
    const s = createUndoStack(10)
    s.push({ html: 'old' })
    s.push({ html: 'new' })
    expect(s.undo().html).toBe('old')
  })
  it('reset 清栈并建立新基线', () => {
    const s = createUndoStack(10)
    s.push({ html: 'A1' })
    s.reset({ html: 'B0' })
    s.push({ html: 'B1' })
    expect(s.undo().html).toBe('B0')
    expect(s.undo()).toBe(null)
  })
  it('reset 不带参数则完全清空', () => {
    const s = createUndoStack(10)
    s.push({ html: 'A1' })
    s.push({ html: 'A2' })
    s.reset()
    expect(s.stack.length).toBe(0)
    expect(s.canUndo).toBe(false)
    expect(s.undo()).toBe(null)
    expect(s.redo()).toBe(null)
  })
})
