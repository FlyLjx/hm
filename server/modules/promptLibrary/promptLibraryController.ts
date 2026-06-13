import type { Request, Response } from 'express'
import { getStringParam } from '../../shared/requestParams.js'
import { PromptLibraryService } from './promptLibraryService.js'

const promptLibraryService = new PromptLibraryService()

export class PromptLibraryController {
  async listOpenNana(req: Request, res: Response) {
    const data = await promptLibraryService.listOpenNanaPrompts(req.query as Record<string, unknown>)
    res.setHeader('Cache-Control', 'public, max-age=300')
    res.json(data)
  }

  async getOpenNana(req: Request, res: Response) {
    const data = await promptLibraryService.getOpenNanaPrompt(getStringParam(req.params.slug, 'slug'))
    res.setHeader('Cache-Control', 'public, max-age=300')
    res.json(data)
  }
}
