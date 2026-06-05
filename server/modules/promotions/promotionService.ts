import { randomUUID } from 'node:crypto'
import { AppError } from '../../shared/AppError.js'
import { PromotionRepository } from './promotionRepository.js'
import type { Promotion } from './promotionTypes.js'

type PromotionInput = Pick<
  Promotion,
  'title' | 'content' | 'badge' | 'actionText' | 'actionUrl' | 'status' | 'sortOrder'
>

export class PromotionService {
  constructor(private readonly promotionRepository = new PromotionRepository()) {}

  async listPromotions(options: { publicOnly?: boolean } = {}) {
    return options.publicOnly ? this.promotionRepository.findActive() : this.promotionRepository.findAll()
  }

  async createPromotion(input: PromotionInput) {
    const now = new Date().toISOString()
    const promotion = await this.promotionRepository.create({
      id: randomUUID(),
      title: input.title,
      content: input.content,
      badge: input.badge || null,
      actionText: input.actionText || null,
      actionUrl: input.actionUrl || null,
      status: input.status,
      sortOrder: input.sortOrder,
      createdAt: now,
      updatedAt: now,
    })
    if (!promotion) {
      throw new AppError(500, '创建促销信息失败')
    }
    return promotion
  }

  async updatePromotion(id: string, input: Partial<PromotionInput>) {
    const promotion = await this.promotionRepository.update(id, {
      ...input,
      badge: input.badge || null,
      actionText: input.actionText || null,
      actionUrl: input.actionUrl || null,
    })
    if (!promotion) {
      throw new AppError(404, '促销信息不存在')
    }
    return promotion
  }

  async deletePromotion(id: string) {
    const deleted = await this.promotionRepository.delete(id)
    if (!deleted) {
      throw new AppError(404, '促销信息不存在')
    }
  }
}
