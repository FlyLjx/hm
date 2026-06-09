import { Router } from 'express'
import { SystemLogController } from './systemLogController.js'

const systemLogController = new SystemLogController()

export const systemLogRoutes = Router()

systemLogRoutes.get('/', systemLogController.list.bind(systemLogController))
systemLogRoutes.get('/detail', systemLogController.detail.bind(systemLogController))
