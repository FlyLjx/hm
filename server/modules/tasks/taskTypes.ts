import type { AiModelCapability } from '../models/modelTypes.js'

export type GenerationTaskStatus = 'queued' | 'processing' | 'pending' | 'success' | 'failed' | 'canceled'
export type GenerationSizeTier = '1k' | '2k' | '4k'

export type GenerationTask = {
  id: string
  userId: string
  userEmail?: string
  modelId: string
  modelName?: string
  providerId: string
  providerName?: string
  capability: AiModelCapability
  prompt: string
  referenceImageUrl?: string | null
  sizeTier: GenerationSizeTier
  size?: string | null
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
  createdAt: string
  updatedAt: string
}
