import type { Request, Response } from 'express'
import { getStringParam } from '../../shared/requestParams.js'
import { createRechargeProductSchema, updateRechargeProductSchema } from './shopSchemas.js'
import { ShopService } from './shopService.js'

const shopService = new ShopService()

export class ShopController {
  async list(_req: Request, res: Response) {
    const products = await shopService.listProducts()
    res.json({ data: products })
  }

  async listPublic(_req: Request, res: Response) {
    const products = await shopService.listProducts({ publicOnly: true })
    res.json({ data: products })
  }

  async create(req: Request, res: Response) {
    const input = createRechargeProductSchema.parse(req.body)
    const product = await shopService.createProduct(input)
    res.status(201).json({ data: product })
  }

  async update(req: Request, res: Response) {
    const input = updateRechargeProductSchema.parse(req.body)
    const product = await shopService.updateProduct(getStringParam(req.params.id, 'id'), input)
    res.json({ data: product })
  }

  async delete(req: Request, res: Response) {
    await shopService.deleteProduct(getStringParam(req.params.id, 'id'))
    res.status(204).send()
  }
}
