import { randomUUID } from 'node:crypto'
import { AppError } from '../../shared/AppError.js'
import { CreditLogRepository } from '../creditLogs/creditLogRepository.js'
import { UserRepository } from '../users/userRepository.js'
import { userEvents } from '../users/userEvents.js'
import { SubscriptionRepository } from './subscriptionRepository.js'
import type { SubscriptionPlan } from './subscriptionTypes.js'

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

export class SubscriptionService {
  constructor(
    private readonly subscriptionRepository = new SubscriptionRepository(),
    private readonly userRepository = new UserRepository(),
    private readonly creditLogRepository = new CreditLogRepository(),
  ) {}

  async listPlans(publicOnly = false) {
    return publicOnly ? this.subscriptionRepository.findActivePlans() : this.subscriptionRepository.findPlans()
  }

  async getActivePlan(id: string) {
    const plan = await this.subscriptionRepository.findPlanById(id)
    if (!plan || plan.status !== 'active') {
      throw new AppError(404, '订阅套餐不存在或已下架')
    }
    return plan
  }

  async createPlan(input: Omit<SubscriptionPlan, 'id' | 'createdAt' | 'updatedAt'>) {
    const now = new Date().toISOString()
    const plan = await this.subscriptionRepository.createPlan({
      id: randomUUID(),
      ...input,
      createdAt: now,
      updatedAt: now,
    })
    if (!plan) throw new AppError(500, '创建订阅套餐失败')
    return plan
  }

  async updatePlan(id: string, input: Partial<SubscriptionPlan>) {
    const plan = await this.subscriptionRepository.updatePlan(id, input)
    if (!plan) throw new AppError(404, '订阅套餐不存在')
    return plan
  }

  async deletePlan(id: string) {
    const deleted = await this.subscriptionRepository.deletePlan(id)
    if (!deleted) throw new AppError(404, '订阅套餐不存在')
    return { deleted: true }
  }

  async getUserSubscription(userId: string) {
    return this.subscriptionRepository.findActiveUserSubscription(userId)
  }

  async getUserPlan(userId: string) {
    const subscription = await this.subscriptionRepository.findActiveUserSubscription(userId)
    if (!subscription) return null
    const plan = await this.subscriptionRepository.findPlanById(subscription.planId)
    if (!plan || plan.status !== 'active') return null
    return plan
  }

  isPlanAllowedForTarget(plan: SubscriptionPlan, input: { providerId: string; modelId: string; alternateModelIds?: string[] }) {
    const providerRestricted = plan.allowedProviderIds.length > 0
    const modelRestricted = plan.allowedModelIds.length > 0
    if (!providerRestricted && !modelRestricted) return true

    const providerAllowed = !providerRestricted || plan.allowedProviderIds.includes(input.providerId)
    const candidateModelIds = [input.modelId, ...(input.alternateModelIds ?? [])]
    const modelAllowed = !modelRestricted || candidateModelIds.some((modelId) => plan.allowedModelIds.includes(modelId))
    return providerAllowed && modelAllowed
  }

  async getUserDiscountPercent(userId: string, target?: { providerId: string; modelId: string; alternateModelIds?: string[] }) {
    const plan = await this.getUserPlan(userId)
    if (!plan) return 0
    if (target && !this.isPlanAllowedForTarget(plan, target)) return 0
    return Math.min(100, Math.max(0, plan.discountPercent))
  }

  async assertModelAccess(input: { userId: string; providerId: string; modelId: string; alternateModelIds?: string[] }) {
    const plan = await this.getUserPlan(input.userId)
    if (!plan) return
    if (!this.isPlanAllowedForTarget(plan, input)) {
      throw new AppError(403, '当前订阅套餐不支持使用该模型或接口')
    }
  }

  async activateUserPlan(input: { userId: string; plan: SubscriptionPlan; now?: string }) {
    const user = await this.userRepository.findById(input.userId)
    if (!user) throw new AppError(404, '用户不存在')

    const now = new Date(input.now ?? new Date().toISOString())
    const active = await this.subscriptionRepository.findActiveUserSubscription(input.userId)
    const start = active && new Date(active.expiresAt) > now ? new Date(active.expiresAt) : now
    const expiresAt = addDays(start, input.plan.durationDays).toISOString()
    const subscription = await this.subscriptionRepository.upsertUserSubscription({
      id: active?.id ?? randomUUID(),
      userId: input.userId,
      planId: input.plan.id,
      startedAt: now.toISOString(),
      expiresAt,
    })

    if (input.plan.bonusCredits > 0) {
      const updatedUser = await this.userRepository.addCredits(input.userId, input.plan.bonusCredits)
      if (!updatedUser) throw new AppError(404, '用户不存在')
      const { passwordHash: _passwordHash, ...publicUser } = updatedUser
      await this.creditLogRepository.create({
        id: randomUUID(),
        userId: input.userId,
        type: 'recharge',
        amount: input.plan.bonusCredits,
        balanceAfter: updatedUser.credits,
        remark: `订阅赠送：${input.plan.name}`,
        createdAt: now.toISOString(),
      })
      userEvents.emitUpdated(publicUser)
    }

    return subscription
  }
}
