import { z } from 'zod'

export const reversePromptSchema = z.object({
  userId: z.string().min(1).max(36),
  modelId: z.string().min(1).max(36),
  imageUrl: z.string().min(1).max(10_000_000),
  language: z.enum(['zh', 'en']).default('zh'),
})
