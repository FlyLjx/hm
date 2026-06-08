import { z } from 'zod'

export const createApiKeySchema = z.object({
  userId: z.string().min(1).max(80),
  name: z.string().min(1).max(120).default('API Key'),
})

export const updateApiKeyStatusSchema = z.object({
  userId: z.string().min(1).max(80).optional(),
  status: z.enum(['active', 'disabled']),
})
