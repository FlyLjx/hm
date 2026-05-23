import { Router } from 'express'
import { asyncHandler } from '../../shared/asyncHandler.js'
import { ApiProviderController } from './apiProviderController.js'

const apiProviderController = new ApiProviderController()

export const apiProviderRoutes = Router()

apiProviderRoutes.get('/', asyncHandler(apiProviderController.list.bind(apiProviderController)))
apiProviderRoutes.post('/', asyncHandler(apiProviderController.create.bind(apiProviderController)))
apiProviderRoutes.post('/models', asyncHandler(apiProviderController.models.bind(apiProviderController)))
apiProviderRoutes.patch('/:id', asyncHandler(apiProviderController.update.bind(apiProviderController)))
apiProviderRoutes.delete('/:id', asyncHandler(apiProviderController.delete.bind(apiProviderController)))
