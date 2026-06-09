import { Router } from 'express'
import { requireAdmin } from '../admin/adminAuth.js'
import { asyncHandler } from '../../shared/asyncHandler.js'
import { SettingController } from './settingController.js'

const settingController = new SettingController()

export const settingRoutes = Router()

settingRoutes.get('/public', asyncHandler(settingController.getPublic.bind(settingController)))
settingRoutes.use(requireAdmin)
settingRoutes.get('/', asyncHandler(settingController.get.bind(settingController)))
settingRoutes.patch('/', asyncHandler(settingController.update.bind(settingController)))
settingRoutes.get('/account-pool', asyncHandler(settingController.getAccountPool.bind(settingController)))
settingRoutes.patch('/account-pool', asyncHandler(settingController.updateAccountPool.bind(settingController)))
settingRoutes.post('/test-email', asyncHandler(settingController.testEmail.bind(settingController)))
settingRoutes.post('/test-bark', asyncHandler(settingController.testBark.bind(settingController)))
