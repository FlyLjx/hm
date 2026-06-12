import { createHmac, timingSafeEqual } from 'node:crypto'
import { env } from '../../config/env.js'
import { AppError } from '../../shared/AppError.js'

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000
const TOKEN_VERSION = 'user-v1'

function base64UrlEncode(value: string) {
  return Buffer.from(value, 'utf8').toString('base64url')
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, 'base64url').toString('utf8')
}

function secret() {
  return `${env.mysql.password}:${env.mysql.rootPassword}:${env.mysql.database}:user`
}

function signPayload(payload: string) {
  return createHmac('sha256', secret()).update(payload).digest('base64url')
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

export function createUserToken(userId: string) {
  const payload = base64UrlEncode(JSON.stringify({
    version: TOKEN_VERSION,
    userId,
    exp: Date.now() + TOKEN_TTL_MS,
  }))
  return `${payload}.${signPayload(payload)}`
}

export function parseUserToken(token: string) {
  const [payload, signature] = token.split('.')
  if (!payload || !signature || !safeEqual(signPayload(payload), signature)) {
    throw new AppError(401, '登录已失效，请重新登录')
  }

  let data: {
    version?: string
    userId?: string
    exp?: number
  }
  try {
    data = JSON.parse(base64UrlDecode(payload))
  } catch {
    throw new AppError(401, '登录已失效，请重新登录')
  }
  if (data.version !== TOKEN_VERSION || !data.userId || !data.exp || data.exp < Date.now()) {
    throw new AppError(401, '登录已过期，请重新登录')
  }
  return {
    userId: data.userId,
    exp: data.exp,
  }
}
