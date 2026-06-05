import { Router } from 'express'
import { requireAdmin } from '../admin/adminAuth.js'
import { asyncHandler } from '../../shared/asyncHandler.js'
import { RechargeController } from './rechargeController.js'

const rechargeController = new RechargeController()

export const rechargeRoutes = Router()

rechargeRoutes.post('/', asyncHandler(rechargeController.create.bind(rechargeController)))
rechargeRoutes.get('/qr-code', asyncHandler(rechargeController.qrCode.bind(rechargeController)))
rechargeRoutes.post('/alipay/notify', asyncHandler(rechargeController.alipayNotify.bind(rechargeController)))
rechargeRoutes.get('/orders', requireAdmin, asyncHandler(rechargeController.list.bind(rechargeController)))
rechargeRoutes.get('/:id', asyncHandler(rechargeController.get.bind(rechargeController)))
rechargeRoutes.post('/:id/sync', asyncHandler(rechargeController.sync.bind(rechargeController)))
