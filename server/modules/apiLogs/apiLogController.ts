import type { Request, Response } from 'express'
import { z } from 'zod'
import { AppError } from '../../shared/AppError.js'
import { getStringParam } from '../../shared/requestParams.js'
import { ApiLogRepository } from './apiLogRepository.js'

const apiLogRepository = new ApiLogRepository()

const apiLogListSchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  days: z.coerce.number().int().min(1).max(90).optional(),
  status: z.enum(['all', 'success', 'failed']).optional(),
  direction: z.enum(['all', 'upstream', 'downstream']).optional(),
  keyword: z.string().max(120).optional(),
  apiKeyId: z.string().max(80).optional(),
})

export class ApiLogController {
  async list(req: Request, res: Response) {
    const input = apiLogListSchema.parse(req.query)
    const result = await apiLogRepository.findAll(input)
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
    const input = apiLogListSchema.pick({ days: true }).parse(req.query)
    const stats = await apiLogRepository.getStats(input)
    res.json({ data: stats })
  }

  async detail(req: Request, res: Response) {
    const log = await apiLogRepository.findById(getStringParam(req.params.id, 'id'))
    if (!log) {
      throw new AppError(404, 'API 日志不存在')
    }
    res.json({ data: log })
  }

  async publicStatus(_req: Request, res: Response) {
    const status = await apiLogRepository.getPublicStatus()
    res.json({ data: status })
  }
}
