import type { Request, Response } from 'express'
import QRCode from 'qrcode'
import { getRequestOrigin } from '../../shared/origin.js'
import { getStringParam } from '../../shared/requestParams.js'
import { createRechargeOrderSchema, queryRechargeOrderSchema, rechargeOrderListSchema } from './rechargeSchemas.js'
import { RechargeService } from './rechargeService.js'

const rechargeService = new RechargeService()

export class RechargeController {
  async list(req: Request, res: Response) {
    const input = rechargeOrderListSchema.parse(req.query)
    const result = await rechargeService.listOrders(input)
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
    const input = createRechargeOrderSchema.parse(req.body)
    const order = await rechargeService.createOrder({
      ...input,
      origin: getRequestOrigin(req),
    })
    res.status(201).json({ data: order })
  }

  async get(req: Request, res: Response) {
    const query = queryRechargeOrderSchema.parse(req.query)
    const order = await rechargeService.getOrder(getStringParam(req.params.id, 'id'), query.userId)
    res.json({ data: order })
  }

  async sync(req: Request, res: Response) {
    const input = queryRechargeOrderSchema.parse(req.body)
    const order = await rechargeService.syncOrder(getStringParam(req.params.id, 'id'), input.userId)
    res.json({ data: order })
  }

  async qrCode(req: Request, res: Response) {
    const text = String(req.query.text || '')
    if (!text) {
      res.status(400).json({ message: '缺少二维码内容' })
      return
    }
    const buffer = await QRCode.toBuffer(text, {
      margin: 1,
      width: 260,
      color: {
        dark: '#10241a',
        light: '#ffffff',
      },
    })
    res.type('image/png').send(buffer)
  }

  async alipayNotify(req: Request, res: Response) {
    await rechargeService.handleAlipayNotify(req.body)
    res.type('text/plain').send('success')
  }
}
