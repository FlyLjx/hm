import type { Request, Response } from 'express'
import { getStringParam } from '../../shared/requestParams.js'
import { createSubscriptionPlanSchema, updateSubscriptionPlanSchema } from './subscriptionSchemas.js'
import { SubscriptionService } from './subscriptionService.js'

const subscriptionService = new SubscriptionService()

export class SubscriptionController {
  async list(req: Request, res: Response) {
    const plans = await subscriptionService.listPlans(req.path.includes('/public/'))
    res.json({ data: plans })
  }

  async current(req: Request, res: Response) {
    const userId = String(req.query.userId || '')
    const subscription = userId ? await subscriptionService.getUserSubscription(userId) : null
    res.json({ data: subscription })
  }

  async create(req: Request, res: Response) {
    const input = createSubscriptionPlanSchema.parse(req.body)
    const plan = await subscriptionService.createPlan(input)
    res.status(201).json({ data: plan })
  }

  async update(req: Request, res: Response) {
    const input = updateSubscriptionPlanSchema.parse(req.body)
    const plan = await subscriptionService.updatePlan(getStringParam(req.params.id, 'id'), input)
    res.json({ data: plan })
  }

  async delete(req: Request, res: Response) {
    await subscriptionService.deletePlan(getStringParam(req.params.id, 'id'))
    res.status(204).send()
  }
}
