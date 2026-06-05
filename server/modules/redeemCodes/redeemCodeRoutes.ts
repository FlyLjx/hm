import { Router } from 'express'
import { requireAdmin } from '../admin/adminAuth.js'
import { asyncHandler } from '../../shared/asyncHandler.js'
import { RedeemCodeController } from './redeemCodeController.js'

const redeemCodeController = new RedeemCodeController()

export const redeemCodeRoutes = Router()

redeemCodeRoutes.post('/redeem', asyncHandler(redeemCodeController.redeem.bind(redeemCodeController)))
redeemCodeRoutes.use(requireAdmin)
redeemCodeRoutes.get('/', asyncHandler(redeemCodeController.list.bind(redeemCodeController)))
redeemCodeRoutes.post('/', asyncHandler(redeemCodeController.create.bind(redeemCodeController)))
redeemCodeRoutes.patch('/:id', asyncHandler(redeemCodeController.update.bind(redeemCodeController)))
redeemCodeRoutes.delete('/:id', asyncHandler(redeemCodeController.delete.bind(redeemCodeController)))
