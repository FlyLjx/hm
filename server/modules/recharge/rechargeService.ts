import { randomUUID } from 'node:crypto'
import { AppError } from '../../shared/AppError.js'
import { CreditLogRepository } from '../creditLogs/creditLogRepository.js'
import { SettingRepository } from '../settings/settingRepository.js'
import { ShopService } from '../shop/shopService.js'
import { SubscriptionService } from '../subscriptions/subscriptionService.js'
import { UserRepository } from '../users/userRepository.js'
import { userEvents } from '../users/userEvents.js'
import { AlipayService } from './alipayService.js'
import { RechargeRepository } from './rechargeRepository.js'
import type { RechargeOrder } from './rechargeTypes.js'

function buildOutTradeNo() {
  const time = new Date()
    .toISOString()
    .replace(/\D/g, '')
    .slice(0, 14)
  return `AIPI${time}${Math.random().toString(36).slice(2, 10).toUpperCase()}`
}

function parseTradeSuccess(value: unknown) {
  return value === 'TRADE_SUCCESS' || value === 'TRADE_FINISHED'
}

export class RechargeService {
  constructor(
    private readonly rechargeRepository = new RechargeRepository(),
    private readonly userRepository = new UserRepository(),
    private readonly creditLogRepository = new CreditLogRepository(),
    private readonly settingRepository = new SettingRepository(),
    private readonly shopService = new ShopService(),
    private readonly subscriptionService = new SubscriptionService(),
    private readonly alipayService = new AlipayService(),
  ) {}

  async createOrder(input: { userId: string; productId?: string; subscriptionPlanId?: string; amount?: number; origin?: string }) {
    const [settings, user] = await Promise.all([
      this.settingRepository.getSettings(),
      this.userRepository.findById(input.userId),
    ])

    if (!user || user.status !== 'active') {
      throw new AppError(404, '用户不存在或已被禁用')
    }
    if (!settings.rechargeEnabled) {
      throw new AppError(403, '充值暂未开放')
    }

    let amount: number
    let credits: number
    let subject: string
    let orderType: RechargeOrder['orderType'] = 'recharge'
    let subscriptionPlanId: string | null = null

    if (input.subscriptionPlanId) {
      const plan = await this.subscriptionService.getActivePlan(input.subscriptionPlanId)
      amount = plan.amount
      credits = plan.bonusCredits
      subject = `${settings.siteName}${plan.name}`
      orderType = 'subscription'
      subscriptionPlanId = plan.id
    } else if (input.productId) {
      const product = await this.shopService.getActiveProduct(input.productId)
      amount = product.amount
      credits = product.credits
      subject = `${settings.siteName}${product.name}`
    } else {
      amount = Number(input.amount ?? 0)
      if (amount < settings.rechargeMinAmount) {
        throw new AppError(400, `自定义充值最低 ${settings.rechargeMinAmount.toFixed(2)} 元`)
      }
      credits = amount * settings.rechargeRate
      subject = `${settings.siteName}自定义充值`
    }

    const order = await this.rechargeRepository.create({
      id: randomUUID(),
      userId: user.id,
      outTradeNo: buildOutTradeNo(),
      tradeNo: null,
      orderType,
      subscriptionPlanId,
      amount: Number(amount.toFixed(2)),
      credits: Number(credits.toFixed(4)),
      status: 'pending',
      payUrl: null,
      qrCode: null,
      paidAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })

    if (!order) {
      throw new AppError(500, '创建充值订单失败')
    }

    const payment = await this.alipayService.createFaceToFaceOrder({
      settings,
      outTradeNo: order.outTradeNo,
      amount: order.amount,
      subject,
      notifyOrigin: input.origin,
    })

    const updatedOrder = await this.rechargeRepository.updatePaymentInfo(order.id, {
      qrCode: null,
      payUrl: payment.qrCode,
    })

    return updatedOrder ?? order
  }

  async listOrders(input: { page?: number; pageSize?: number; status?: 'all' | 'pending' | 'paid' | 'closed' | 'failed'; keyword?: string }) {
    return this.rechargeRepository.findAll(input)
  }

  async getOrder(id: string, userId: string) {
    const order = await this.rechargeRepository.findById(id)
    if (!order || order.userId !== userId) {
      throw new AppError(404, '充值订单不存在')
    }
    return order
  }

  async syncOrder(id: string, userId: string) {
    const order = await this.getOrder(id, userId)
    if (order.status !== 'pending') {
      return order
    }

    const settings = await this.settingRepository.getSettings()
    const queried = await this.alipayService.queryOrder(settings, order.outTradeNo)
    if (!queried.paid) {
      return order
    }

    return this.completeOrder(order, queried.tradeNo)
  }

  async handleAlipayNotify(payload: Record<string, unknown>) {
    const settings = await this.settingRepository.getSettings()
    const signValid = this.alipayService.verifyNotify(settings, payload)
    if (!signValid) {
      throw new AppError(400, '支付宝通知验签失败')
    }

    const outTradeNo = String(payload.out_trade_no || '')
    if (!outTradeNo || !parseTradeSuccess(payload.trade_status)) {
      return null
    }

    const order = await this.rechargeRepository.findByOutTradeNo(outTradeNo)
    if (!order) {
      throw new AppError(404, '充值订单不存在')
    }

    return this.completeOrder(order, payload.trade_no ? String(payload.trade_no) : null)
  }

  private async completeOrder(order: RechargeOrder, tradeNo?: string | null) {
    if (order.status === 'paid') {
      return order
    }

    const now = new Date().toISOString()
    const paidResult = await this.rechargeRepository.markPaid(order.id, {
      tradeNo,
      paidAt: now,
    })
    const paidOrder = paidResult.order ?? order
    if (!paidResult.changed) {
      return paidOrder
    }

    if (order.orderType === 'subscription') {
      if (!order.subscriptionPlanId) throw new AppError(400, '订阅订单缺少套餐信息')
      const plan = await this.subscriptionService.getActivePlan(order.subscriptionPlanId)
      await this.subscriptionService.activateUserPlan({ userId: order.userId, plan, now })
    } else {
      const updatedUser = await this.userRepository.addCredits(order.userId, order.credits)
      if (!updatedUser) {
        throw new AppError(404, '用户不存在')
      }
      const { passwordHash: _passwordHash, ...publicUser } = updatedUser

      await this.creditLogRepository.create({
        id: randomUUID(),
        userId: order.userId,
        type: 'recharge',
        amount: order.credits,
        balanceAfter: updatedUser.credits,
        remark: `支付宝充值 ${order.amount.toFixed(2)} 元`,
        createdAt: now,
      })

      userEvents.emitUpdated(publicUser)
    }
    return paidOrder
  }
}
