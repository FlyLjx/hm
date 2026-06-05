import type { Request, Response } from 'express'
import { mailBroadcastSchema } from './mailBroadcastSchemas.js'
import { MailBroadcastService } from './mailBroadcastService.js'

const mailBroadcastService = new MailBroadcastService()

export class MailBroadcastController {
  async send(req: Request, res: Response) {
    const input = mailBroadcastSchema.parse(req.body)
    const result = await mailBroadcastService.send(input)
    res.json({ data: result })
  }
}
