import type { Request, Response } from 'express'
import { getStringParam } from '../../shared/requestParams.js'
import { createPromotionSchema, updatePromotionSchema } from './promotionSchemas.js'
import { PromotionService } from './promotionService.js'

const promotionService = new PromotionService()

export class PromotionController {
  async list(_req: Request, res: Response) {
    const promotions = await promotionService.listPromotions()
    res.json({ data: promotions })
  }

  async listPublic(_req: Request, res: Response) {
    const promotions = await promotionService.listPromotions({ publicOnly: true })
    res.json({ data: promotions })
  }

  async create(req: Request, res: Response) {
    const input = createPromotionSchema.parse(req.body)
    const promotion = await promotionService.createPromotion(input)
    res.status(201).json({ data: promotion })
  }

  async update(req: Request, res: Response) {
    const input = updatePromotionSchema.parse(req.body)
    const promotion = await promotionService.updatePromotion(getStringParam(req.params.id, 'id'), input)
    res.json({ data: promotion })
  }

  async delete(req: Request, res: Response) {
    await promotionService.deletePromotion(getStringParam(req.params.id, 'id'))
    res.status(204).send()
  }
}
