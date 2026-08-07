const { initDb } = require('../server/db')
const { toIso } = require('../server/utils/http')
const { randomUUID } = require('node:crypto')

const db = initDb('data/seed.db')
const now = toIso()
const insert = db.prepare(`INSERT INTO tasks (id, title, task_type, source, status, progress, deadline, assigner, created_by, created_at, updated_at, version) VALUES (@id, @title, @task_type, @source, @status, @progress, @deadline, @assigner, '', @now, @now, 1)`)
const statuses = ['未启动', '进行中', '已完成', '已超期']
const types = ['重点工作', '日常事务', '专项']
const tx = db.transaction((n) => {
  for (let i = 0; i < n; i++) {
    insert.run({
      id: randomUUID(),
      title: `种子任务${i}`,
      task_type: types[i % 3],
      source: '领导交办',
      status: statuses[i % 4],
      progress: i % 101,
      deadline: `2026-${String((i % 12) + 1).padStart(2, '0')}-15`,
      assigner: `人员${i % 10}`,
      now,
    })
  }
})
const count = Number(process.argv[2] || 10000)
tx(count)
console.log(`已插入 ${count} 条任务`)
db.close()
