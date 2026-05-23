import { z } from 'zod'

export const taskEstimateSchema = z.object({
  modelId: z.string().min(1).max(36),
  capability: z.enum(['image', 'video', 'chat_image', 'workflow']),
  sizeTier: z.enum(['1k', '2k', '4k']),
  size: z.string().min(1).max(30),
  quantity: z.coerce.number().int().min(1).max(8),
})
