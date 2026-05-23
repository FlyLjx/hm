import { Router } from 'express'
import { asyncHandler } from '../../shared/asyncHandler.js'
import { TaskController } from './taskController.js'

const taskController = new TaskController()

export const taskRoutes = Router()

taskRoutes.get('/estimate', asyncHandler(taskController.estimate.bind(taskController)))
taskRoutes.get('/', asyncHandler(taskController.list.bind(taskController)))
taskRoutes.post('/:id/cancel', asyncHandler(taskController.cancel.bind(taskController)))
taskRoutes.get('/:id/images/:index', asyncHandler(taskController.image.bind(taskController)))
taskRoutes.get('/:id/thumbnails/:index', asyncHandler(taskController.thumbnail.bind(taskController)))
taskRoutes.get('/:id', asyncHandler(taskController.detail.bind(taskController)))
