import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getSkill, buildSystemPrompt, SKILL_MAP } from '../server/skills/index.js'

test('gongwen SKILL 含核心方法论', () => {
  const s = getSkill('gongwen')
  assert.ok(s.includes('按·拿·推'))
  assert.ok(s.includes('基因层'))
})

test('biganzi SKILL 含五步法', () => {
  const s = getSkill('biganzi')
  assert.ok(s.includes('磨刀子'))
  assert.ok(s.includes('收果子'))
})

test('SKILL_MAP 装配规则', () => {
  assert.deepEqual(SKILL_MAP.weekly, ['gongwen'])
  assert.deepEqual(SKILL_MAP.report, ['gongwen', 'biganzi'])
  assert.deepEqual(SKILL_MAP.draft, ['gongwen'])
  assert.deepEqual(SKILL_MAP.polish, [])
})

test('buildSystemPrompt 拼接 SKILL+模板+素材', () => {
  const p = buildSystemPrompt('weekly', { dateFrom: '2026-08-01', dateTo: '2026-08-07', materials: '任务A；任务B' })
  assert.ok(p.includes('公文写作算法'))
  assert.ok(p.includes('周报'))
  assert.ok(p.includes('任务A'))
})
