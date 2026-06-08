import { Router } from 'express'
import { requireAdmin } from '../admin/adminAuth.js'
import { asyncHandler } from '../../shared/asyncHandler.js'
import { UserController } from './userController.js'
import { ApiKeyController } from '../apiKeys/apiKeyController.js'

const userController = new UserController()
const apiKeyController = new ApiKeyController()

export const userRoutes = Router()

userRoutes.post('/register', asyncHandler(userController.register.bind(userController)))
userRoutes.post('/login', asyncHandler(userController.login.bind(userController)))
userRoutes.post('/verify-email', asyncHandler(userController.verifyEmail.bind(userController)))
userRoutes.post('/password/forgot', asyncHandler(userController.forgotPassword.bind(userController)))
userRoutes.post('/password/reset', asyncHandler(userController.resetPassword.bind(userController)))
userRoutes.get('/:id/profile', asyncHandler(userController.profile.bind(userController)))
userRoutes.get('/:id/public-details', asyncHandler(userController.publicDetails.bind(userController)))
userRoutes.patch('/:id/password', asyncHandler(userController.changePassword.bind(userController)))
userRoutes.get('/:id/api-keys', asyncHandler(apiKeyController.listUserKeys.bind(apiKeyController)))
userRoutes.post('/:id/api-keys', asyncHandler(apiKeyController.createUserKey.bind(apiKeyController)))
userRoutes.patch('/:id/api-keys/:keyId', asyncHandler(apiKeyController.updateUserKeyStatus.bind(apiKeyController)))
userRoutes.delete('/:id/api-keys/:keyId', asyncHandler(apiKeyController.deleteUserKey.bind(apiKeyController)))

userRoutes.use(requireAdmin)
userRoutes.get('/', asyncHandler(userController.list.bind(userController)))
userRoutes.post('/', asyncHandler(userController.create.bind(userController)))
userRoutes.get('/:id/details', asyncHandler(userController.details.bind(userController)))
userRoutes.post('/:id/recharge', asyncHandler(userController.recharge.bind(userController)))
userRoutes.patch('/:id', asyncHandler(userController.update.bind(userController)))
userRoutes.patch('/:id/status', asyncHandler(userController.updateStatus.bind(userController)))
userRoutes.delete('/:id', asyncHandler(userController.delete.bind(userController)))
