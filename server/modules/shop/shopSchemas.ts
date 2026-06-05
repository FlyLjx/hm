import { z } from 'zod'

export const createRechargeProductSchema = z.object({
  name: z.string().min(1).max(80),
  amount: z.number().positive().max(999999),
  credits: z.number().positive().max(999999),
  badge: z.string().max(40).optional().nullable(),
  sortOrder: z.number().int().min(0).max(999999).default(0),
  status: z.enum(['active', 'disabled']).default('active'),
})

export const updateRechargeProductSchema = createRechargeProductSchema.partial().refine(
  (input) => Object.keys(input).length > 0,
  { message: '请至少填写一个要修改的字段' },
)
