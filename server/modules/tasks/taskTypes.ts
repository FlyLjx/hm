import type { AiModelCapability } from '../models/modelTypes.js'

export type GenerationTaskStatus = 'queued' | 'processing' | 'pending' | 'success' | 'failed' | 'canceled'
export type GenerationSizeTier = '1k' | '2k' | '4k'
export type GenerationPublicStatus = 'private' | 'pending' | 'approved' | 'rejected'

export type GenerationTask = {
  id: string
  userId: string
  userEmail?: string
  userSubscriptionPlanName?: string | null
  userSubscriptionExpiresAt?: string | null
  modelId: string
  modelName?: string
  modelDisplayName?: string
  providerId: string
  providerName?: string
  capability: AiModelCapability
  prompt: string
  referenceImageUrl?: string | null
  sizeTier: GenerationSizeTier
  size?: string | null
  transparentBackground?: boolean
  quantity: number
  userIp: string
  costCredits: number
  remainingCredits: number
  durationSeconds: number
  status: GenerationTaskStatus
  errorMessage?: string | null
  resultJson?: unknown
  resultUrl?: string | null
  resultUrls?: string[]
  thumbnailUrl?: string | null
  thumbnailUrls?: string[]
  favoriteEnabled: boolean
  publicStatus: GenerationPublicStatus
  publicRequestedAt?: string | null
  publicReviewedAt?: string | null
  displayEnabled: boolean
  displayNote?: string | null
  createdAt: string
  updatedAt: string
}
