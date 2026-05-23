import { z } from 'zod'

export const generateImageSchema = z.object({
  userId: z.string().min(1).max(36),
  modelId: z.string().min(1).max(36),
  prompt: z.string().min(1).max(4000),
  sizeTier: z.enum(['1k', '2k', '4k']).default('1k'),
  size: z.string().min(1).max(30).optional(),
  quantity: z.number().int().min(1).max(8).default(1),
  referenceImageUrl: z.string().min(1).max(8_000_000).optional(),
})
