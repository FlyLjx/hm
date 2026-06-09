import { Router } from 'express'
import { asyncHandler } from '../../shared/asyncHandler.js'
import { SiteChatController } from './siteChatController.js'

const siteChatController = new SiteChatController()

export const siteChatRoutes = Router()

siteChatRoutes.post('/completions', asyncHandler(siteChatController.complete.bind(siteChatController)))
