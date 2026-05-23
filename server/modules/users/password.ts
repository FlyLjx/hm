import { pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto'

const ITERATIONS = 120000
const KEY_LENGTH = 64
const DIGEST = 'sha512'

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex')
  const hash = pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, DIGEST).toString('hex')
  return `${ITERATIONS}:${salt}:${hash}`
}

export function verifyPassword(password: string, passwordHash: string) {
  const [iterationsText, salt, storedHash] = passwordHash.split(':')
  const hash = pbkdf2Sync(password, salt, Number(iterationsText), KEY_LENGTH, DIGEST)
  return timingSafeEqual(Buffer.from(storedHash, 'hex'), hash)
}
