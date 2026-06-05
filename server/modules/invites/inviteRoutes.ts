import { Router } from 'express'
import { requireAdmin } from '../admin/adminAuth.js'
import { asyncHandler } from '../../shared/asyncHandler.js'
import { InviteController } from './inviteController.js'

const inviteController = new InviteController()

export const inviteRoutes = Router()

inviteRoutes.get('/summary', asyncHandler(inviteController.summary.bind(inviteController)))
inviteRoutes.get('/', requireAdmin, asyncHandler(inviteController.list.bind(inviteController)))
inviteRoutes.delete('/:id', requireAdmin, asyncHandler(inviteController.delete.bind(inviteController)))
