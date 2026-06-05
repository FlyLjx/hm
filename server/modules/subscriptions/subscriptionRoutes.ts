import { Router } from 'express'
import { asyncHandler } from '../../shared/asyncHandler.js'
import { requireAdmin } from '../admin/adminAuth.js'
import { SubscriptionController } from './subscriptionController.js'

const subscriptionController = new SubscriptionController()

export const subscriptionRoutes = Router()

subscriptionRoutes.get('/public/plans', asyncHandler(subscriptionController.list.bind(subscriptionController)))
subscriptionRoutes.get('/public/current', asyncHandler(subscriptionController.current.bind(subscriptionController)))
subscriptionRoutes.use(requireAdmin)
subscriptionRoutes.get('/plans', asyncHandler(subscriptionController.list.bind(subscriptionController)))
subscriptionRoutes.post('/plans', asyncHandler(subscriptionController.create.bind(subscriptionController)))
subscriptionRoutes.patch('/plans/:id', asyncHandler(subscriptionController.update.bind(subscriptionController)))
subscriptionRoutes.delete('/plans/:id', asyncHandler(subscriptionController.delete.bind(subscriptionController)))
