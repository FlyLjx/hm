import type { Request, Response } from 'express'
import { z } from 'zod'
import { FinanceStatsRepository } from './financeStatsRepository.js'

const financeStatsRepository = new FinanceStatsRepository()

const costStatsSchema = z.object({
  days: z.coerce.number().int().min(1).max(90).optional(),
})

export class FinanceStatsController {
  async costs(req: Request, res: Response) {
    const input = costStatsSchema.parse(req.query)
    const stats = await financeStatsRepository.getCostStats(input)
    res.json({ data: stats })
  }
}
