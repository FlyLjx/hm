import { Router } from 'express'
import { asyncHandler } from '../../shared/asyncHandler.js'
import { AdminApiKeyController } from './adminApiKeyController.js'

const adminApiKeyController = new AdminApiKeyController()

export const adminApiKeyRoutes = Router()

adminApiKeyRoutes.get('/', asyncHandler(adminApiKeyController.list.bind(adminApiKeyController)))
adminApiKeyRoutes.patch('/:id', asyncHandler(adminApiKeyController.updateStatus.bind(adminApiKeyController)))
adminApiKeyRoutes.delete('/:id', asyncHandler(adminApiKeyController.delete.bind(adminApiKeyController)))
adminApiKeyRoutes.get('/:id/logs', asyncHandler(adminApiKeyController.logs.bind(adminApiKeyController)))
