export type PromotionStatus = 'active' | 'disabled'

export type Promotion = {
  id: string
  title: string
  content: string
  badge?: string | null
  actionText?: string | null
  actionUrl?: string | null
  status: PromotionStatus
  sortOrder: number
  createdAt: string
  updatedAt: string
}
