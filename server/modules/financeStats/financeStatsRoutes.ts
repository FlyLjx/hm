import { Router } from 'express'
import { asyncHandler } from '../../shared/asyncHandler.js'
import { FinanceStatsController } from './financeStatsController.js'

const financeStatsController = new FinanceStatsController()

export const financeStatsRoutes = Router()

financeStatsRoutes.get('/costs', asyncHandler(financeStatsController.costs.bind(financeStatsController)))
