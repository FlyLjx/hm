import { z } from 'zod'

export const createSubscriptionPlanSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(300).optional().nullable(),
  amount: z.number().positive().max(999999),
  durationDays: z.number().int().min(1).max(3650),
  bonusCredits: z.number().min(0).max(999999).default(0),
  discountPercent: z.number().min(0).max(100).default(0),
  allowedProviderIds: z.array(z.uuid()).default([]),
  allowedModelIds: z.array(z.uuid()).default([]),
  badge: z.string().max(40).optional().nullable(),
  sortOrder: z.number().int().min(0).max(999999).default(0),
  status: z.enum(['active', 'disabled']).default('active'),
})

export const updateSubscriptionPlanSchema = createSubscriptionPlanSchema.partial().refine(
  (input) => Object.keys(input).length > 0,
  { message: '请至少填写一个要修改的字段' },
)
