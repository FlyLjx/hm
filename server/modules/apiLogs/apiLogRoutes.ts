import { Router } from 'express'
import { asyncHandler } from '../../shared/asyncHandler.js'
import { ApiLogController } from './apiLogController.js'

const apiLogController = new ApiLogController()

export const apiLogRoutes = Router()

apiLogRoutes.get('/', asyncHandler(apiLogController.list.bind(apiLogController)))
apiLogRoutes.get('/stats', asyncHandler(apiLogController.stats.bind(apiLogController)))
apiLogRoutes.get('/:id', asyncHandler(apiLogController.detail.bind(apiLogController)))
