import { describe, it, expect } from 'vitest'
import { fmtDate, addDays } from './date'

describe('date utils', () => {
  it('fmtDate 格式化 ISO', () => {
    expect(fmtDate('2026-08-07T10:00:00+08:00')).toBe('2026-08-07')
  })
  it('addDays', () => {
    expect(addDays('2026-08-07', 3)).toBe('2026-08-10')
  })
})
