import { Router } from 'express'
import { requireAdmin } from '../admin/adminAuth.js'
import { asyncHandler } from '../../shared/asyncHandler.js'
import { PromotionController } from './promotionController.js'

const promotionController = new PromotionController()

export const promotionRoutes = Router()

promotionRoutes.get('/public', asyncHandler(promotionController.listPublic.bind(promotionController)))
promotionRoutes.use(requireAdmin)
promotionRoutes.get('/', asyncHandler(promotionController.list.bind(promotionController)))
promotionRoutes.post('/', asyncHandler(promotionController.create.bind(promotionController)))
promotionRoutes.patch('/:id', asyncHandler(promotionController.update.bind(promotionController)))
promotionRoutes.delete('/:id', asyncHandler(promotionController.delete.bind(promotionController)))
