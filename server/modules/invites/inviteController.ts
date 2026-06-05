import type { Request, Response } from 'express'
import { getStringParam } from '../../shared/requestParams.js'
import { inviteListSchema, inviteSummarySchema } from './inviteSchemas.js'
import { InviteService } from './inviteService.js'

const inviteService = new InviteService()

export class InviteController {
  async list(req: Request, res: Response) {
    const input = inviteListSchema.parse(req.query)
    const result = await inviteService.listInvites(input)
    res.json({
      data: result.items,
      pagination: {
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
      },
    })
  }

  async summary(req: Request, res: Response) {
    const input = inviteSummarySchema.parse(req.query)
    const result = await inviteService.getSummary(input.userId)
    res.json({ data: result })
  }

  async delete(req: Request, res: Response) {
    const result = await inviteService.deleteInvite(getStringParam(req.params.id, 'id'))
    res.json({ data: result })
  }
}
