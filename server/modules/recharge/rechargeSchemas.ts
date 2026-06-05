import { z } from 'zod'

const idSchema = z.uuid()

export const rechargeOrderListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['all', 'pending', 'paid', 'closed', 'failed']).default('all'),
  keyword: z.string().max(80).optional(),
})

export const createRechargeOrderSchema = z.object({
  userId: idSchema,
  productId: idSchema.optional(),
  subscriptionPlanId: idSchema.optional(),
  amount: z.coerce.number().positive().max(999999).optional(),
}).refine((input) => [input.productId, input.subscriptionPlanId, input.amount].filter(Boolean).length === 1, {
  message: '请选择充值商品、订阅套餐或输入自定义金额',
})

export const queryRechargeOrderSchema = z.object({
  userId: idSchema,
})
