import type { Request, Response } from 'express'
import { siteChatCompletionSchema } from './siteChatSchemas.js'
import { SiteChatService } from './siteChatService.js'

const siteChatService = new SiteChatService()

export class SiteChatController {
  async complete(req: Request, res: Response) {
    const input = siteChatCompletionSchema.parse(req.body)
    await siteChatService.completeStream(req, res, input)
  }
}
