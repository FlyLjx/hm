import { z } from 'zod'

export const createPromotionSchema = z.object({
  title: z.string().min(1).max(120),
  content: z.string().min(1).max(1000),
  badge: z.string().max(40).optional().nullable(),
  actionText: z.string().max(40).optional().nullable(),
  actionUrl: z.string().url().max(255).or(z.literal('')).optional().nullable(),
  status: z.enum(['active', 'disabled']).default('active'),
  sortOrder: z.coerce.number().int().min(0).max(999999).default(0),
})

export const updatePromotionSchema = createPromotionSchema.partial().refine(
  (input) => Object.keys(input).length > 0,
  { message: '请至少填写一个要修改的字段' },
)
