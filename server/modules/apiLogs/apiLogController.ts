import type { Request, Response } from 'express'
import { z } from 'zod'
import { AppError } from '../../shared/AppError.js'
import { getStringParam } from '../../shared/requestParams.js'
import { ApiLogRepository } from './apiLogRepository.js'

const apiLogRepository = new ApiLogRepository()
const publicStatusCacheTtlMs = 20000
let publicStatusCache: { expiresAt: number; data: unknown } | null = null
let publicStatusCachePromise: Promise<unknown> | null = null

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
    res.json({ data: { ...stats, retentionPolicy: apiLogRepository.retentionPolicy() } })
  }

  async detail(req: Request, res: Response) {
    const log = await apiLogRepository.findById(getStringParam(req.params.id, 'id'))
    if (!log) {
      throw new AppError(404, 'API 日志不存在')
    }
    res.json({ data: log })
  }

  async cleanup(_req: Request, res: Response) {
    const result = await apiLogRepository.cleanupExpired()
    res.json({ data: result })
  }

  async publicStatus(_req: Request, res: Response) {
    const now = Date.now()
    if (publicStatusCache && publicStatusCache.expiresAt > now) {
      res.json({ data: publicStatusCache.data })
      return
    }

    publicStatusCachePromise ??= apiLogRepository.getPublicStatus().then((status) => {
      publicStatusCache = {
        data: status,
        expiresAt: Date.now() + publicStatusCacheTtlMs,
      }
      publicStatusCachePromise = null
      return status
    }).catch((error: unknown) => {
      publicStatusCachePromise = null
      throw error
    })

    const status = await publicStatusCachePromise
    res.json({ data: status })
  }
}
