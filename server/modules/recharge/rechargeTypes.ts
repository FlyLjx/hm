export type RechargeOrderStatus = 'pending' | 'paid' | 'closed' | 'failed'
export type RechargeOrderType = 'recharge' | 'subscription'

export type RechargeOrder = {
  id: string
  userId: string
  userEmail?: string | null
  outTradeNo: string
  tradeNo?: string | null
  orderType: RechargeOrderType
  subscriptionPlanId?: string | null
  amount: number
  credits: number
  status: RechargeOrderStatus
  payUrl?: string | null
  qrCode?: string | null
  paidAt?: string | null
  createdAt: string
  updatedAt: string
}
