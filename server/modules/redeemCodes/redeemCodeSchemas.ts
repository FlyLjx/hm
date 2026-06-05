import { z } from 'zod'

export const redeemCodeListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['all', 'active', 'used', 'disabled']).default('all'),
  keyword: z.string().max(80).optional(),
})

export const createRedeemCodeSchema = z.object({
  code: z.string().trim().min(4).max(80).optional(),
  count: z.coerce.number().int().min(1).max(200).default(1),
  credits: z.coerce.number().positive().max(999999),
  remark: z.string().max(200).optional().nullable(),
  expiresAt: z.string().datetime().optional().nullable(),
})

export const updateRedeemCodeSchema = z.object({
  credits: z.coerce.number().positive().max(999999).optional(),
  status: z.enum(['active', 'disabled']).optional(),
  remark: z.string().max(200).optional().nullable(),
  expiresAt: z.string().datetime().optional().nullable(),
}).refine((input) => Object.keys(input).length > 0, {
  message: '请至少填写一个要修改的字段',
})

export const redeemSchema = z.object({
  userId: z.string().min(1, '缺少用户信息').max(36, '用户信息错误'),
  code: z.string().trim().min(4, '卡密至少 4 位').max(80, '卡密不能超过 80 位'),
})
