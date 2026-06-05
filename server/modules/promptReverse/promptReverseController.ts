import type { Request, Response } from 'express'
import { reversePromptSchema } from './promptReverseSchemas.js'
import { PromptReverseService } from './promptReverseService.js'

const promptReverseService = new PromptReverseService()

export class PromptReverseController {
  async reverse(req: Request, res: Response) {
    const input = reversePromptSchema.parse(req.body)
    const result = await promptReverseService.reverse(input)
    res.json({ data: result })
  }
}
