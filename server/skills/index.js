const fs = require('node:fs')
const path = require('node:path')

const CACHE = {}

function getSkill(name) {
  if (CACHE[name]) return CACHE[name]
  const file = path.join(__dirname, `${name}.md`)
  if (!fs.existsSync(file)) throw new Error(`SKILL 文件不存在: ${name}.md`)
  let content = fs.readFileSync(file, 'utf8')
  content = content.replace(/^---[\s\S]*?---\s*/, '')
  CACHE[name] = content.trim()
  return CACHE[name]
}

const SKILL_MAP = {
  weekly: ['gongwen'],
  report: ['gongwen', 'biganzi'],
  draft: ['gongwen'],
  polish: [],
}

function buildSystemPrompt(scenario, { materials = '' } = {}) {
  const { SCENARIO_TEMPLATES } = require('./scenarios')
  const parts = []
  for (const skill of SKILL_MAP[scenario] || []) {
    parts.push(getSkill(skill))
  }
  parts.push(SCENARIO_TEMPLATES[scenario])
  if (materials) parts.push(`\n\n【台账素材】\n${materials}`)
  return parts.join('\n\n---\n\n')
}

module.exports = { getSkill, buildSystemPrompt, SKILL_MAP }
