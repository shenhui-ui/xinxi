import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

let tmpDir
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wenxi-crypto-'))
  process.env.WENXI_SECRET_PATH = path.join(tmpDir, '.secret')
})
afterEach(() => {
  delete process.env.WENXI_SECRET_PATH
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

test('首启自动生成密钥并可加解密', async () => {
  const { getSecretKey, encryptText, decryptText } = await import('../server/crypto.js')
  const key = getSecretKey()
  assert.equal(key.length, 32)
  const enc = encryptText('sk-test-1234567890')
  assert.ok(Buffer.isBuffer(enc))
  assert.equal(decryptText(enc), 'sk-test-1234567890')
})

test('密钥文件权限 600', async () => {
  const { getSecretKey } = await import('../server/crypto.js')
  getSecretKey()
  const mode = fs.statSync(path.join(tmpDir, '.secret')).mode & 0o777
  assert.equal(mode, 0o600)
})

test('解密篡改密文抛错', async () => {
  const { getSecretKey, encryptText, decryptText } = await import('../server/crypto.js')
  getSecretKey()
  const enc = encryptText('secret')
  const tampered = Buffer.concat([enc.subarray(0, enc.length - 1), Buffer.from([enc[enc.length - 1] ^ 0xff])])
  assert.throws(() => decryptText(tampered))
})

test('已有密钥时复用（内容不变）', async () => {
  const { getSecretKey } = await import('../server/crypto.js')
  const k1 = getSecretKey()
  const k2 = getSecretKey()
  assert.deepEqual(k1, k2)
})
