export type CreditLogType = 'recharge' | 'deduct'

export type CreditLog = {
  id: string
  userId: string
  userEmail?: string
  type: CreditLogType
  amount: number
  balanceAfter: number
  remark?: string | null
  createdAt: string
}
