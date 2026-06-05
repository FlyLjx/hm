import { Router } from 'express'
import { asyncHandler } from '../../shared/asyncHandler.js'
import { DashboardController } from './dashboardController.js'

const dashboardController = new DashboardController()

export const dashboardRoutes = Router()

dashboardRoutes.get('/', asyncHandler(dashboardController.overview.bind(dashboardController)))
