import type { Request, Response } from 'express'
import { compatChatCompletionSchema, compatImageEditSchema, compatImageGenerationSchema, compatResponsesSchema } from './openaiCompatSchemas.js'
import { OpenAiCompatService } from './openaiCompatService.js'

const openAiCompatService = new OpenAiCompatService()

function sendOpenAiError(res: Response, error: unknown) {
  const { statusCode, body } = openAiCompatService.createErrorResponse(error)
  res.status(statusCode).json(body)
}

export class OpenAiCompatController {
  async listModels(req: Request, res: Response) {
    try {
      await openAiCompatService.authenticate(req)
      res.json(await openAiCompatService.listModels())
    } catch (error) {
      sendOpenAiError(res, error)
    }
  }

  async balance(req: Request, res: Response) {
    try {
      const auth = await openAiCompatService.authenticate(req)
      res.json(openAiCompatService.getBalance(auth))
    } catch (error) {
      sendOpenAiError(res, error)
    }
  }

  async imageGenerations(req: Request, res: Response) {
    try {
      const auth = await openAiCompatService.authenticate(req)
      const input = compatImageGenerationSchema.parse(req.body)
      res.json(await openAiCompatService.generateImage(req, auth, input))
    } catch (error) {
      sendOpenAiError(res, error)
    }
  }

  async imageEdits(req: Request, res: Response) {
    try {
      const auth = await openAiCompatService.authenticate(req)
      const input = compatImageEditSchema.parse(req.body)
      res.json(await openAiCompatService.generateImage(req, auth, input))
    } catch (error) {
      sendOpenAiError(res, error)
    }
  }

  async chatCompletions(req: Request, res: Response) {
    try {
      const auth = await openAiCompatService.authenticate(req)
      const input = compatChatCompletionSchema.parse(req.body)
      if (input.stream) {
        await openAiCompatService.chatCompletionStream(req, res, auth, input)
        return
      }
      res.json(await openAiCompatService.chatCompletion(req, auth, input))
    } catch (error) {
      if (res.headersSent) {
        res.end()
        return
      }
      sendOpenAiError(res, error)
    }
  }

  async responses(req: Request, res: Response) {
    try {
      const auth = await openAiCompatService.authenticate(req)
      const input = compatResponsesSchema.parse(req.body)
      res.json(await openAiCompatService.responses(req, auth, input))
    } catch (error) {
      sendOpenAiError(res, error)
    }
  }
}
