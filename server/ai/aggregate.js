const MAX_INJECT = 200

function fmtTasks(db, from, to) {
  const tasks = db.prepare(`SELECT title, status, progress, deadline FROM tasks WHERE deleted_at IS NULL AND created_at >= ? AND created_at < ? ORDER BY deadline ASC LIMIT ${MAX_INJECT}`).all(from, to)
  const byStatus = {}
  for (const row of db.prepare(`SELECT status s, COUNT(*) c FROM tasks WHERE deleted_at IS NULL AND created_at >= ? AND created_at < ? GROUP BY s`).all(from, to)) {
    byStatus[row.s || '未分类'] = row.c
  }
  const total = tasks.length
  const statusSummary = Object.entries(byStatus).map(([s, c]) => `${s} ${c} 项`).join('；')
  let out = `【任务】共 ${statusSummary}`
  if (total === MAX_INJECT) {
    const allCount = db.prepare(`SELECT COUNT(*) c FROM tasks WHERE deleted_at IS NULL AND created_at >= ? AND created_at < ?`).get(from, to).c
    out += `\n另有 ${allCount - MAX_INJECT} 条未列出`
  }
  for (const t of tasks) {
    out += `\n- ${t.title}（${t.status}，进度 ${t.progress}%，截止 ${t.deadline || '未设'}）`
  }
  return out
}

function fmtMeetings(db, from, to) {
  const rows = db.prepare(`SELECT topic, meeting_time, location FROM meetings WHERE deleted_at IS NULL AND created_at >= ? AND created_at < ? ORDER BY meeting_time ASC LIMIT ${MAX_INJECT}`).all(from, to)
  let out = `【会议】${rows.length} 条`
  for (const m of rows) out += `\n- ${m.topic}（${m.meeting_time || ''}，${m.location || ''}）`
  return out
}

function fmtDocuments(db, from, to) {
  const counts = db.prepare(`SELECT doc_type d, COUNT(*) c FROM documents WHERE deleted_at IS NULL AND created_at >= ? AND created_at < ? GROUP BY doc_type`).all(from, to)
  const summary = counts.map((r) => `${r.d || '未分类'} ${r.c} 条`).join('；') || '0 条'
  return `【文件收发】${summary}`
}

function fmtActivities(db, from, to) {
  const rows = db.prepare(`SELECT title, start_time FROM activities WHERE deleted_at IS NULL AND created_at >= ? AND created_at < ? ORDER BY start_time ASC LIMIT ${MAX_INJECT}`).all(from, to)
  let out = `【外出活动】${rows.length} 条`
  for (const a of rows) out += `\n- ${a.title}（${a.start_time || ''}）`
  return out
}

function aggregateWeekly(db, dateFrom, dateTo) {
  const from = dateFrom ? `${dateFrom}T00:00:00` : '1970-01-01T00:00:00'
  const to = dateTo ? `${dateTo}T23:59:59` : '2099-12-31T23:59:59'
  return [
    fmtTasks(db, from, to),
    fmtMeetings(db, from, to),
    fmtDocuments(db, from, to),
    fmtActivities(db, from, to),
  ].join('\n\n')
}

module.exports = { aggregateWeekly }
