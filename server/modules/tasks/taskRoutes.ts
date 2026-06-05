import { Router } from 'express'
import { requireAdmin } from '../admin/adminAuth.js'
import { asyncHandler } from '../../shared/asyncHandler.js'
import { TaskController } from './taskController.js'

const taskController = new TaskController()

export const taskRoutes = Router()

taskRoutes.get('/estimate', asyncHandler(taskController.estimate.bind(taskController)))
taskRoutes.get('/public-display', asyncHandler(taskController.listPublicDisplay.bind(taskController)))
taskRoutes.patch('/:id/display', asyncHandler(taskController.updateDisplay.bind(taskController)))
taskRoutes.get('/:id/images/:index/download', asyncHandler(taskController.downloadImage.bind(taskController)))
taskRoutes.get('/:id/images/:index', asyncHandler(taskController.image.bind(taskController)))
taskRoutes.get('/:id/thumbnails/:index', asyncHandler(taskController.thumbnail.bind(taskController)))
taskRoutes.get('/export', requireAdmin, asyncHandler(taskController.export.bind(taskController)))
taskRoutes.get('/images', requireAdmin, asyncHandler(taskController.listImages.bind(taskController)))
taskRoutes.get('/stats', requireAdmin, asyncHandler(taskController.stats.bind(taskController)))
taskRoutes.get('/', requireAdmin, asyncHandler(taskController.list.bind(taskController)))
taskRoutes.post('/:id/cancel', requireAdmin, asyncHandler(taskController.cancel.bind(taskController)))
taskRoutes.get('/:id', asyncHandler(taskController.detail.bind(taskController)))
