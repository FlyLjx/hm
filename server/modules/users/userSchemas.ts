import { z } from 'zod'

export const createUserSchema = z.object({
  email: z.string().email().max(120),
  password: z.string().min(6).max(100),
  role: z.enum(['admin', 'user']).default('user'),
})

export const updateUserSchema = createUserSchema
  .partial()
  .extend({
    status: z.enum(['active', 'disabled']).optional(),
  })
  .refine((input) => Object.keys(input).length > 0, {
    message: '请至少填写一个要修改的字段',
  })

export const loginSchema = z.object({
  email: z.string().email().max(120),
  password: z.string().min(1),
})

export const updateUserStatusSchema = z.object({
  status: z.enum(['active', 'disabled']),
})

export const rechargeUserSchema = z.object({
  amount: z.number().positive().max(999999),
  remark: z.string().max(200).optional(),
})

export const verifyEmailSchema = z.object({
  token: z.string().min(20).max(200),
})

export const forgotPasswordSchema = z.object({
  email: z.string().email().max(120),
})

export const resetPasswordSchema = z.object({
  token: z.string().min(20).max(200),
  password: z.string().min(6).max(100),
})
