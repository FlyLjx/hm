import type { Request, Response } from 'express'
import { getStringParam } from '../../shared/requestParams.js'
import {
  createRedeemCodeSchema,
  redeemCodeListSchema,
  redeemSchema,
  updateRedeemCodeSchema,
} from './redeemCodeSchemas.js'
import { RedeemCodeService } from './redeemCodeService.js'

const redeemCodeService = new RedeemCodeService()

export class RedeemCodeController {
  async list(req: Request, res: Response) {
    const input = redeemCodeListSchema.parse(req.query)
    const result = await redeemCodeService.listCodes(input)
    res.json({
      data: result.items,
      pagination: {
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
      },
    })
  }

  async create(req: Request, res: Response) {
    const input = createRedeemCodeSchema.parse(req.body)
    const codes = await redeemCodeService.createCodes(input)
    res.status(201).json({ data: codes })
  }

  async update(req: Request, res: Response) {
    const input = updateRedeemCodeSchema.parse(req.body)
    const code = await redeemCodeService.updateCode(getStringParam(req.params.id, 'id'), input)
    res.json({ data: code })
  }

  async delete(req: Request, res: Response) {
    await redeemCodeService.deleteCode(getStringParam(req.params.id, 'id'))
    res.status(204).send()
  }

  async redeem(req: Request, res: Response) {
    const input = redeemSchema.parse(req.body)
    const result = await redeemCodeService.redeem(input)
    res.json({ data: result })
  }
}
