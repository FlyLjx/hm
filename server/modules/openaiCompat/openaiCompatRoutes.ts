import { Router } from 'express'
import type { NextFunction, Request, Response } from 'express'
import multer from 'multer'
import { asyncHandler } from '../../shared/asyncHandler.js'
import { OpenAiCompatController } from './openaiCompatController.js'

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024, files: 6 } })
const openAiCompatController = new OpenAiCompatController()

function mergeMultipartBody(req: Request, _res: Response, next: NextFunction) {
  const files = (req.files as Express.Multer.File[] | undefined) ?? []
  if (files.length) {
    const images = files
      .filter((file) => file.fieldname === 'image')
      .map((file) => `data:${file.mimetype || 'image/png'};base64,${file.buffer.toString('base64')}`)
    const mask = files.find((file) => file.fieldname === 'mask')
    req.body = {
      ...req.body,
      ...(images.length ? { image: images } : {}),
      ...(mask ? { mask: `data:${mask.mimetype || 'image/png'};base64,${mask.buffer.toString('base64')}` } : {}),
      n: req.body?.n ? Number(req.body.n) : req.body?.n,
    }
  }
  next()
}

export const openAiCompatRoutes = Router()

openAiCompatRoutes.get('/models', asyncHandler(openAiCompatController.listModels.bind(openAiCompatController)))
openAiCompatRoutes.post('/images/generations', asyncHandler(openAiCompatController.imageGenerations.bind(openAiCompatController)))
openAiCompatRoutes.post('/images/edits', upload.any(), mergeMultipartBody, asyncHandler(openAiCompatController.imageEdits.bind(openAiCompatController)))
openAiCompatRoutes.post('/chat/completions', asyncHandler(openAiCompatController.chatCompletions.bind(openAiCompatController)))
openAiCompatRoutes.post('/responses', asyncHandler(openAiCompatController.responses.bind(openAiCompatController)))
