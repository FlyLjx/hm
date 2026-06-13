import { Router } from 'express'
import { SystemLogController } from './systemLogController.js'
import { requireAdmin } from '../admin/adminAuth.js'
import { asyncHandler } from '../../shared/asyncHandler.js'

const systemLogController = new SystemLogController()

export const systemLogRoutes = Router()

systemLogRoutes.use((req, _res, next) => {
  const token = typeof req.query.token === 'string' ? req.query.token : ''
  if (token && !req.headers.authorization) {
    req.headers.authorization = `Bearer ${token}`
  }
  next()
})

systemLogRoutes.get('/', requireAdmin, systemLogController.list.bind(systemLogController))
systemLogRoutes.get('/detail', requireAdmin, systemLogController.detail.bind(systemLogController))
systemLogRoutes.delete('/:name', requireAdmin, systemLogController.remove.bind(systemLogController))
systemLogRoutes.get('/stream', requireAdmin, asyncHandler(async (req, res) => {
  systemLogController.stream(req, res)
}))
