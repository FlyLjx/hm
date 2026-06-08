import type { Request, Response } from 'express'
import { z } from 'zod'
import { getStringParam } from '../../shared/requestParams.js'
import { ApiLogRepository } from '../apiLogs/apiLogRepository.js'
import { ApiKeyRepository } from './apiKeyRepository.js'
import { ApiKeyService } from './apiKeyService.js'

const apiKeyRepository = new ApiKeyRepository()
const apiKeyService = new ApiKeyService()
const apiLogRepository = new ApiLogRepository()

const adminApiKeyListSchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  status: z.enum(['all', 'active', 'disabled']).optional(),
  keyword: z.string().max(120).optional(),
})

const adminApiKeyLogSchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  days: z.coerce.number().int().min(1).max(90).optional(),
  status: z.enum(['all', 'success', 'failed']).optional(),
  direction: z.enum(['all', 'upstream', 'downstream']).optional(),
  keyword: z.string().max(120).optional(),
})

const adminUpdateApiKeyStatusSchema = z.object({
  status: z.enum(['active', 'disabled']),
})

export class AdminApiKeyController {
  async list(req: Request, res: Response) {
    const input = adminApiKeyListSchema.parse(req.query)
    const [result, stats] = await Promise.all([
      apiKeyRepository.findAllForAdmin(input),
      apiKeyRepository.getAdminStats(),
    ])
    res.json({
      data: result.items,
      stats,
      pagination: {
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
      },
    })
  }

  async updateStatus(req: Request, res: Response) {
    const input = adminUpdateApiKeyStatusSchema.parse(req.body)
    const key = await apiKeyService.updateUserKeyStatus(getStringParam(req.params.id, 'id'), input)
    res.json({ data: key })
  }

  async delete(req: Request, res: Response) {
    await apiKeyService.deleteUserKey(getStringParam(req.params.id, 'id'))
    res.status(204).send()
  }

  async logs(req: Request, res: Response) {
    const apiKeyId = getStringParam(req.params.id, 'id')
    const input = adminApiKeyLogSchema.parse(req.query)
    const [result, stats] = await Promise.all([
      apiLogRepository.findAll({ ...input, apiKeyId }),
      apiLogRepository.getStats({ days: input.days, apiKeyId }),
    ])
    res.json({
      data: result.items,
      stats,
      pagination: {
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
      },
    })
  }
}
