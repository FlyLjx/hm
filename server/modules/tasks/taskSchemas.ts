import { z } from 'zod'

export const taskEstimateSchema = z.object({
  modelId: z.string().min(1).max(36),
  capability: z.literal('chat_image'),
  sizeTier: z.enum(['1k', '2k', '4k']),
  size: z.string().min(1).max(30),
  quantity: z.coerce.number().int().min(1).max(8),
})

export const taskListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})

export const taskImageListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(24),
  keyword: z.string().max(120).optional(),
  display: z.enum(['all', 'public', 'private']).default('all'),
})

export const taskDisplaySchema = z.object({
  displayEnabled: z.boolean(),
  displayNote: z.string().max(500).optional().nullable(),
  userId: z.string().min(1).max(36).optional(),
})
