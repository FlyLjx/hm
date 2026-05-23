import { Router } from 'express'
import { asyncHandler } from '../../shared/asyncHandler.js'
import { UserController } from './userController.js'

const userController = new UserController()

export const userRoutes = Router()

userRoutes.get('/', asyncHandler(userController.list.bind(userController)))
userRoutes.post('/', asyncHandler(userController.create.bind(userController)))
userRoutes.post('/register', asyncHandler(userController.register.bind(userController)))
userRoutes.post('/login', asyncHandler(userController.login.bind(userController)))
userRoutes.post('/verify-email', asyncHandler(userController.verifyEmail.bind(userController)))
userRoutes.post('/password/forgot', asyncHandler(userController.forgotPassword.bind(userController)))
userRoutes.post('/password/reset', asyncHandler(userController.resetPassword.bind(userController)))
userRoutes.get('/:id/profile', asyncHandler(userController.profile.bind(userController)))
userRoutes.get('/:id/details', asyncHandler(userController.details.bind(userController)))
userRoutes.post('/:id/recharge', asyncHandler(userController.recharge.bind(userController)))
userRoutes.patch('/:id', asyncHandler(userController.update.bind(userController)))
userRoutes.patch('/:id/status', asyncHandler(userController.updateStatus.bind(userController)))
userRoutes.delete('/:id', asyncHandler(userController.delete.bind(userController)))
