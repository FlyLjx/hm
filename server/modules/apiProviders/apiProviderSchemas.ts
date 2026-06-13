import { z } from 'zod'

export const createApiProviderSchema = z.object({
  name: z.string().min(1).max(80),
  type: z.enum(['sub2api', 'custom', 'newapi']).default('sub2api'),
  capability: z.literal('chat_image').default('chat_image'),
  baseUrl: z.string().url().max(255),
  apiKey: z.string().min(1).max(255),
})

export const updateApiProviderSchema = createApiProviderSchema.partial().extend({
  status: z.enum(['active', 'disabled']).optional(),
})

export const fetchApiProviderModelsSchema = z.object({
  type: z.enum(['sub2api', 'custom', 'newapi']).default('sub2api'),
  capability: z.literal('chat_image').default('chat_image'),
  baseUrl: z.string().url().max(255),
  apiKey: z.string().min(1).max(255),
})
