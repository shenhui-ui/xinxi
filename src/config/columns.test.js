import { describe, it, expect } from 'vitest'
import { columns, fieldKeys } from './columns'

describe('columns', () => {
  it('fieldKeys 与 DB 列名一致（snake_case）', () => {
    for (const k of Object.keys(fieldKeys)) {
      for (const key of fieldKeys[k]) {
        expect(key).toMatch(/^[a-z_]+$/)
      }
    }
  })
  it('每模块有列配置', () => {
    expect(columns.tasks.length).toBeGreaterThan(0)
    expect(columns.supplies.length).toBeGreaterThan(0)
  })
})
