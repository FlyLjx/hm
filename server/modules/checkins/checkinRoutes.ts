import { Router } from 'express'
import { requireAdmin } from '../admin/adminAuth.js'
import { asyncHandler } from '../../shared/asyncHandler.js'
import { CheckinController } from './checkinController.js'

const checkinController = new CheckinController()

export const checkinRoutes = Router()

checkinRoutes.get('/status', asyncHandler(checkinController.status.bind(checkinController)))
checkinRoutes.post('/', asyncHandler(checkinController.checkin.bind(checkinController)))
checkinRoutes.get('/', requireAdmin, asyncHandler(checkinController.list.bind(checkinController)))
checkinRoutes.delete('/:id', requireAdmin, asyncHandler(checkinController.delete.bind(checkinController)))
