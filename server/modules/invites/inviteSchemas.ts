import { z } from 'zod'

export const inviteListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  keyword: z.string().max(80).optional(),
})

export const inviteSummarySchema = z.object({
  userId: z.string().min(1).max(36),
})
