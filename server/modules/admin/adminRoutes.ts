import { Router } from 'express'
import { z } from 'zod'
import { asyncHandler } from '../../shared/asyncHandler.js'
import { loginAdmin, parseAdminToken, requireAdmin } from './adminAuth.js'

const loginSchema = z.object({
  email: z.string().min(1).max(120),
  password: z.string().min(6),
})

export const adminRoutes = Router()

adminRoutes.post('/login', asyncHandler(async (req, res) => {
  const input = loginSchema.parse(req.body)
  const result = await loginAdmin(input)
  res.json({ data: result })
}))

adminRoutes.get('/session', requireAdmin, asyncHandler(async (req, res) => {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  const session = parseAdminToken(token)
  res.json({ data: { userId: session.userId, expiresAt: new Date(session.exp).toISOString() } })
}))
