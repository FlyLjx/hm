export type RedeemCodeStatus = 'active' | 'used' | 'disabled'

export type RedeemCode = {
  id: string
  code: string
  credits: number
  status: RedeemCodeStatus
  remark?: string | null
  userId?: string | null
  userEmail?: string | null
  usedAt?: string | null
  expiresAt?: string | null
  createdAt: string
  updatedAt: string
}
