import { Router } from 'express'
import { requireAdmin } from '../admin/adminAuth.js'
import { asyncHandler } from '../../shared/asyncHandler.js'
import { ShopController } from './shopController.js'

const shopController = new ShopController()

export const shopRoutes = Router()

shopRoutes.get('/public/recharge-products', asyncHandler(shopController.listPublic.bind(shopController)))
shopRoutes.use(requireAdmin)
shopRoutes.get('/recharge-products', asyncHandler(shopController.list.bind(shopController)))
shopRoutes.post('/recharge-products', asyncHandler(shopController.create.bind(shopController)))
shopRoutes.patch('/recharge-products/:id', asyncHandler(shopController.update.bind(shopController)))
shopRoutes.delete('/recharge-products/:id', asyncHandler(shopController.delete.bind(shopController)))
