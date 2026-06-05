import { randomUUID } from 'node:crypto'
import { AppError } from '../../shared/AppError.js'
import { ShopRepository } from './shopRepository.js'
import type { RechargeProduct } from './shopTypes.js'

export class ShopService {
  constructor(private readonly shopRepository = new ShopRepository()) {}

  async listProducts(options: { publicOnly?: boolean } = {}) {
    return options.publicOnly ? this.shopRepository.findActive() : this.shopRepository.findAll()
  }

  async getActiveProduct(id: string) {
    const product = await this.shopRepository.findById(id)
    if (!product || product.status !== 'active') {
      throw new AppError(404, '充值商品不存在或已下架')
    }
    return product
  }

  async createProduct(input: Pick<RechargeProduct, 'name' | 'amount' | 'credits' | 'badge' | 'sortOrder' | 'status'>) {
    const now = new Date().toISOString()
    const product = await this.shopRepository.create({
      id: randomUUID(),
      name: input.name,
      amount: input.amount,
      credits: input.credits,
      badge: input.badge || null,
      sortOrder: input.sortOrder,
      status: input.status,
      createdAt: now,
      updatedAt: now,
    })
    if (!product) {
      throw new AppError(500, '创建充值商品失败')
    }
    return product
  }

  async updateProduct(id: string, input: Partial<RechargeProduct>) {
    const product = await this.shopRepository.update(id, {
      ...input,
      badge: input.badge || null,
    })
    if (!product) {
      throw new AppError(404, '充值商品不存在')
    }
    return product
  }

  async deleteProduct(id: string) {
    const deleted = await this.shopRepository.delete(id)
    if (!deleted) {
      throw new AppError(404, '充值商品不存在')
    }
  }
}
