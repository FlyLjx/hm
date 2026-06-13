import { Router } from 'express'
import { asyncHandler } from '../../shared/asyncHandler.js'
import { PromptLibraryController } from './promptLibraryController.js'

const promptLibraryController = new PromptLibraryController()

export const promptLibraryRoutes = Router()

promptLibraryRoutes.get('/opennana', asyncHandler(promptLibraryController.listOpenNana.bind(promptLibraryController)))
promptLibraryRoutes.get('/opennana/:slug', asyncHandler(promptLibraryController.getOpenNana.bind(promptLibraryController)))
