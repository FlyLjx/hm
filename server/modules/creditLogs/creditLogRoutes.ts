import { Router } from 'express'
import { asyncHandler } from '../../shared/asyncHandler.js'
import { CreditLogController } from './creditLogController.js'

const creditLogController = new CreditLogController()

export const creditLogRoutes = Router()

creditLogRoutes.get('/', asyncHandler(creditLogController.list.bind(creditLogController)))
creditLogRoutes.get('/stats', asyncHandler(creditLogController.stats.bind(creditLogController)))
creditLogRoutes.delete('/:id', asyncHandler(creditLogController.delete.bind(creditLogController)))
