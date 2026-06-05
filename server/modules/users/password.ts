import { pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto'
import bcrypt from 'bcryptjs'

const ITERATIONS = 120000
const KEY_LENGTH = 64
const DIGEST = 'sha512'

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex')
  const hash = pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, DIGEST).toString('hex')
  return `${ITERATIONS}:${salt}:${hash}`
}

export function verifyPassword(password: string, passwordHash: string) {
  if (/^\$2[aby]\$\d{2}\$/.test(passwordHash)) {
    return bcrypt.compareSync(password, passwordHash)
  }

  const [iterationsText, salt, storedHash] = passwordHash.split(':')
  const hash = pbkdf2Sync(password, salt, Number(iterationsText), KEY_LENGTH, DIGEST)
  return timingSafeEqual(Buffer.from(storedHash, 'hex'), hash)
}
