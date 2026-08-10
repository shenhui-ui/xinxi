import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { initDb } from '../server/db.js'
import { startJobs, stopJobs } from '../server/jobs/index.js'

test('startJobs 注册定时任务并 stopJobs 停止', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wenxi-jobs-'))
  const db = initDb(path.join(tmpDir, 'test.db'))
  let ran = false
  const jobs = startJobs(db, { now: '2026-08-07', attachMs: 50, exportMs: 50, onRun: () => { ran = true } })
  assert.ok(jobs.timers.length >= 2)
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      try {
        stopJobs(jobs)
        db.close()
        fs.rmSync(tmpDir, { recursive: true, force: true })
        assert.ok(ran)
        resolve()
      } catch (e) {
        reject(e)
      }
    }, 150)
  })
})
