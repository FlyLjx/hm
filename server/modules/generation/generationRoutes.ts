import { Router } from 'express'
import { asyncHandler } from '../../shared/asyncHandler.js'
import { GenerationController } from './generationController.js'

const generationController = new GenerationController()

export const generationRoutes = Router()

generationRoutes.post('/image', asyncHandler(generationController.generateImage.bind(generationController)))
generationRoutes.post('/image/stream', asyncHandler(generationController.generateImageStream.bind(generationController)))
