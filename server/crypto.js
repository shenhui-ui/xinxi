const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const config = require('./config')

function getSecretPath() {
  return process.env.WENXI_SECRET_PATH || path.join(config.dataDir, '.secret')
}

function getSecretKey() {
  const secretPath = getSecretPath()
  if (fs.existsSync(secretPath)) {
    const key = fs.readFileSync(secretPath)
    if (key.length >= 32) return key
    throw new Error('密钥文件损坏（不足 32 字节），请恢复备份')
  }
  const key = crypto.randomBytes(32)
  fs.mkdirSync(path.dirname(secretPath), { recursive: true })
  fs.writeFileSync(secretPath, key, { mode: 0o600 })
  try { fs.chmodSync(secretPath, 0o600) } catch (e) { /* Windows 忽略 */ }
  return key
}

function encryptText(plain) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', getSecretKey(), iv)
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, enc])
}

function decryptText(enc) {
  if (enc.length < 28) throw new Error('密文不完整')
  const iv = enc.subarray(0, 12)
  const tag = enc.subarray(12, 28)
  const data = enc.subarray(28)
  const decipher = crypto.createDecipheriv('aes-256-gcm', getSecretKey(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
}

module.exports = { getSecretKey, encryptText, decryptText, _getSecretPath: getSecretPath }
