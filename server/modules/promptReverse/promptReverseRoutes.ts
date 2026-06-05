import { Router } from 'express'
import { asyncHandler } from '../../shared/asyncHandler.js'
import { PromptReverseController } from './promptReverseController.js'

const promptReverseController = new PromptReverseController()

export const promptReverseRoutes = Router()

promptReverseRoutes.post('/', asyncHandler(promptReverseController.reverse.bind(promptReverseController)))
