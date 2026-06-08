import { z } from 'zod'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const optionalUuid = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value
  }
  const trimmed = value.trim()
  return uuidPattern.test(trimmed) ? trimmed : null
}, z.string().uuid().optional().nullable())

export const createUserSchema = z.object({
  email: z.string().email('请输入正确的邮箱地址').max(120, '邮箱不能超过 120 个字符'),
  password: z.string().min(6, '密码至少需要 6 个字符').max(100, '密码不能超过 100 个字符'),
  role: z.enum(['admin', 'user']).default('user'),
  inviterId: optionalUuid,
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
  email: z.string().email('请输入正确的邮箱地址').max(120, '邮箱不能超过 120 个字符'),
  password: z.string().min(1, '请输入密码'),
})

export const updateUserStatusSchema = z.object({
  status: z.enum(['active', 'disabled']),
})

export const rechargeUserSchema = z.object({
  amount: z.number().min(-999999).max(999999).refine((value) => value !== 0, '调整额度不能为 0'),
  remark: z.string().max(200).optional(),
})

export const verifyEmailSchema = z.object({
  token: z.string().min(20).max(200),
})

export const forgotPasswordSchema = z.object({
  email: z.string().email('请输入正确的邮箱地址').max(120, '邮箱不能超过 120 个字符'),
})

export const resetPasswordSchema = z.object({
  token: z.string().min(20).max(200),
  password: z.string().min(6, '密码至少需要 6 个字符').max(100, '密码不能超过 100 个字符'),
})

export const changePasswordSchema = z.object({
  userId: z.string().min(1, '缺少用户信息').max(80, '用户信息不正确'),
  oldPassword: z.string().min(1, '请输入当前密码').max(100, '当前密码不能超过 100 个字符'),
  password: z.string().min(6, '密码至少需要 6 个字符').max(100, '密码不能超过 100 个字符'),
})
