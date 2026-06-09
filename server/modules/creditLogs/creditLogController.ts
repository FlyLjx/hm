import type { Request, Response } from 'express'
import { z } from 'zod'
import { AppError } from '../../shared/AppError.js'
import { getStringParam } from '../../shared/requestParams.js'
import { CreditLogRepository } from './creditLogRepository.js'

const creditLogRepository = new CreditLogRepository()

const creditLogListSchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  days: z.coerce.number().int().min(1).max(365).optional(),
  type: z.enum(['all', 'recharge', 'deduct']).optional(),
  keyword: z.string().max(120).optional(),
})

export class CreditLogController {
  async list(req: Request, res: Response) {
    const input = creditLogListSchema.parse(req.query)
    const result = await creditLogRepository.findAll(input)
    res.json({
      data: result.items,
      pagination: {
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
      },
    })
  }

  async stats(req: Request, res: Response) {
    const input = creditLogListSchema.pick({ days: true }).parse(req.query)
    const stats = await creditLogRepository.getStats(input)
    res.json({ data: stats })
  }

  async delete(req: Request, res: Response) {
    const deleted = await creditLogRepository.delete(getStringParam(req.params.id, 'id'))
    if (!deleted) {
      throw new AppError(404, '积分流水不存在')
    }
    res.status(204).send()
  }
}
