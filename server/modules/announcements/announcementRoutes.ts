import { Router } from 'express'
import { requireAdmin } from '../admin/adminAuth.js'
import { asyncHandler } from '../../shared/asyncHandler.js'
import { AnnouncementController } from './announcementController.js'

const announcementController = new AnnouncementController()

export const announcementRoutes = Router()

announcementRoutes.get('/public', asyncHandler(announcementController.listPublic.bind(announcementController)))
announcementRoutes.post('/:id/sign', asyncHandler(announcementController.sign.bind(announcementController)))
announcementRoutes.use(requireAdmin)
announcementRoutes.get('/', asyncHandler(announcementController.list.bind(announcementController)))
announcementRoutes.post('/', asyncHandler(announcementController.create.bind(announcementController)))
announcementRoutes.patch('/:id', asyncHandler(announcementController.update.bind(announcementController)))
announcementRoutes.delete('/:id', asyncHandler(announcementController.delete.bind(announcementController)))
