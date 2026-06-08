import { Router } from 'express'
import { requireAdmin } from '../admin/adminAuth.js'
import { asyncHandler } from '../../shared/asyncHandler.js'
import { ApiProviderController } from './apiProviderController.js'

const apiProviderController = new ApiProviderController()

export const apiProviderRoutes = Router()

apiProviderRoutes.use(requireAdmin)
apiProviderRoutes.get('/', asyncHandler(apiProviderController.list.bind(apiProviderController)))
apiProviderRoutes.post('/', asyncHandler(apiProviderController.create.bind(apiProviderController)))
apiProviderRoutes.post('/model-details', asyncHandler(apiProviderController.modelDetails.bind(apiProviderController)))
apiProviderRoutes.post('/models', asyncHandler(apiProviderController.models.bind(apiProviderController)))
apiProviderRoutes.post('/:id/test', asyncHandler(apiProviderController.test.bind(apiProviderController)))
apiProviderRoutes.patch('/:id', asyncHandler(apiProviderController.update.bind(apiProviderController)))
apiProviderRoutes.delete('/:id', asyncHandler(apiProviderController.delete.bind(apiProviderController)))
