import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

test('单实例锁拒绝双开', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wenxi-lock-'))
  const prev = process.env.WENXI_DATA_DIR
  process.env.WENXI_DATA_DIR = tmp
  const { acquireLock } = await import('../server/index.js')
  const release = acquireLock()
  assert.throws(() => acquireLock(), /服务已在运行/)
  release()
  const release2 = acquireLock()
  release2()
  if (prev === undefined) delete process.env.WENXI_DATA_DIR
  else process.env.WENXI_DATA_DIR = prev
  fs.rmSync(tmp, { recursive: true, force: true })
})
