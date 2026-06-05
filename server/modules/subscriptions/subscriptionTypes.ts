export type SubscriptionPlanStatus = 'active' | 'disabled'
export type UserSubscriptionStatus = 'active' | 'expired' | 'canceled'

export type SubscriptionPlan = {
  id: string
  name: string
  description?: string | null
  amount: number
  durationDays: number
  bonusCredits: number
  discountPercent: number
  allowedProviderIds: string[]
  allowedModelIds: string[]
  badge?: string | null
  sortOrder: number
  status: SubscriptionPlanStatus
  createdAt: string
  updatedAt: string
}

export type UserSubscription = {
  id: string
  userId: string
  planId: string
  planName?: string | null
  status: UserSubscriptionStatus
  startedAt: string
  expiresAt: string
  createdAt: string
  updatedAt: string
}
