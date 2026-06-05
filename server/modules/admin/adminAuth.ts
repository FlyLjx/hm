import { createHmac, timingSafeEqual } from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'
import { env } from '../../config/env.js'
import { AppError } from '../../shared/AppError.js'
import { UserRepository } from '../users/userRepository.js'
import { verifyPassword } from '../users/password.js'

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000
const TOKEN_VERSION = 'v1'

const userRepository = new UserRepository()

function base64UrlEncode(value: string) {
  return Buffer.from(value, 'utf8').toString('base64url')
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, 'base64url').toString('utf8')
}

function secret() {
  return `${env.mysql.password}:${env.mysql.rootPassword}:${env.mysql.database}`
}

function signPayload(payload: string) {
  return createHmac('sha256', secret()).update(payload).digest('base64url')
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

export function createAdminToken(userId: string) {
  const payload = base64UrlEncode(JSON.stringify({
    version: TOKEN_VERSION,
    userId,
    exp: Date.now() + TOKEN_TTL_MS,
  }))
  return `${payload}.${signPayload(payload)}`
}

export function parseAdminToken(token: string) {
  const [payload, signature] = token.split('.')
  if (!payload || !signature || !safeEqual(signPayload(payload), signature)) {
    throw new AppError(401, '后台登录已失效，请重新登录')
  }

  const data = JSON.parse(base64UrlDecode(payload)) as {
    version?: string
    userId?: string
    exp?: number
  }
  if (data.version !== TOKEN_VERSION || !data.userId || !data.exp || data.exp < Date.now()) {
    throw new AppError(401, '后台登录已过期，请重新登录')
  }
  return {
    userId: data.userId,
    exp: data.exp,
  }
}

export async function loginAdmin(input: { email: string; password: string }) {
  const account = input.email.trim()
  const email = account.includes('@') ? account : `${account}@local.com`
  const user = await userRepository.findByEmail(email)
  if (!user || !verifyPassword(input.password, user.passwordHash)) {
    throw new AppError(401, '管理员账号或密码错误')
  }
  if (user.role !== 'admin') {
    throw new AppError(403, '当前账号不是管理员')
  }
  if (user.status !== 'active') {
    throw new AppError(403, '管理员账号已被禁用')
  }
  return {
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
    },
    token: createAdminToken(user.id),
  }
}

export async function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization || ''
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
    if (!token) {
      throw new AppError(401, '请先登录后台')
    }

    const payload = parseAdminToken(token)
    const user = await userRepository.findById(payload.userId)
    if (!user || user.role !== 'admin' || user.status !== 'active') {
      throw new AppError(403, '后台权限不足')
    }
    next()
  } catch (error) {
    next(error)
  }
}
