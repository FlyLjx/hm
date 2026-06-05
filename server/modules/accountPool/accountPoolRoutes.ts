import { Router } from 'express'
import { requireAdmin } from '../admin/adminAuth.js'
import { asyncHandler } from '../../shared/asyncHandler.js'
import { AccountPoolController } from './accountPoolController.js'

const accountPoolController = new AccountPoolController()

export const accountPoolRoutes = Router()

accountPoolRoutes.use(requireAdmin)
accountPoolRoutes.get('/accounts', asyncHandler(accountPoolController.list.bind(accountPoolController)))
