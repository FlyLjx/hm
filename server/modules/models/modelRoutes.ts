import { Router } from 'express'
import { requireAdmin } from '../admin/adminAuth.js'
import { asyncHandler } from '../../shared/asyncHandler.js'
import { ModelController } from './modelController.js'

const modelController = new ModelController()

export const modelRoutes = Router()

modelRoutes.get('/', asyncHandler(modelController.list.bind(modelController)))
modelRoutes.use(requireAdmin)
modelRoutes.post('/', asyncHandler(modelController.create.bind(modelController)))
modelRoutes.post('/sync', asyncHandler(modelController.sync.bind(modelController)))
modelRoutes.post('/delete-many', asyncHandler(modelController.deleteMany.bind(modelController)))
modelRoutes.patch('/:id', asyncHandler(modelController.update.bind(modelController)))
modelRoutes.delete('/:id', asyncHandler(modelController.delete.bind(modelController)))
