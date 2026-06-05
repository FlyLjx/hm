import { Router } from 'express'
import { requireAdmin } from '../admin/adminAuth.js'
import { asyncHandler } from '../../shared/asyncHandler.js'
import { MailBroadcastController } from './mailBroadcastController.js'

const mailBroadcastController = new MailBroadcastController()

export const mailBroadcastRoutes = Router()

mailBroadcastRoutes.use(requireAdmin)
mailBroadcastRoutes.post('/', asyncHandler(mailBroadcastController.send.bind(mailBroadcastController)))
