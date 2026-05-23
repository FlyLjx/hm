import { Router } from 'express'
import { asyncHandler } from '../../shared/asyncHandler.js'
import { SettingController } from './settingController.js'

const settingController = new SettingController()

export const settingRoutes = Router()

settingRoutes.get('/', asyncHandler(settingController.get.bind(settingController)))
settingRoutes.patch('/', asyncHandler(settingController.update.bind(settingController)))
settingRoutes.post('/test-email', asyncHandler(settingController.testEmail.bind(settingController)))
