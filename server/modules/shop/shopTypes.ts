export type RechargeProductStatus = 'active' | 'disabled'

export type RechargeProduct = {
  id: string
  name: string
  amount: number
  credits: number
  badge?: string | null
  sortOrder: number
  status: RechargeProductStatus
  createdAt: string
  updatedAt: string
}
