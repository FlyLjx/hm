import type { Request, Response } from 'express'
import { getRequestIp } from '../../shared/requestIp.js'
import { getStringParam } from '../../shared/requestParams.js'
import { checkinListSchema, checkinSchema } from './checkinSchemas.js'
import { CheckinService } from './checkinService.js'

const checkinService = new CheckinService()

export class CheckinController {
  async list(req: Request, res: Response) {
    const input = checkinListSchema.parse(req.query)
    const result = await checkinService.listCheckins(input)
    res.json({
      data: result.items,
      pagination: {
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
      },
    })
  }

  async status(req: Request, res: Response) {
    const input = checkinSchema.parse(req.query)
    const result = await checkinService.getStatus(input.userId)
    res.json({ data: result })
  }

  async checkin(req: Request, res: Response) {
    const input = checkinSchema.parse(req.body)
    const result = await checkinService.checkin({
      userId: input.userId,
      userIp: getRequestIp(req),
    })
    res.json({ data: result })
  }

  async delete(req: Request, res: Response) {
    const id = getStringParam(req.params.id, 'id')
    const result = await checkinService.deleteCheckin(id)
    res.json({ data: result })
  }
}
