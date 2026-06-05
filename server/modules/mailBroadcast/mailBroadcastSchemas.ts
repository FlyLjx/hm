import { z } from 'zod'

export const mailBroadcastSchema = z.object({
  targetType: z.enum(['all', 'active', 'specific']).default('all'),
  userIds: z.array(z.uuid()).default([]),
  subject: z.string().trim().min(1, '请输入邮件标题').max(120),
  content: z.string().trim().min(1, '请输入邮件内容').max(5000),
}).refine((input) => input.targetType !== 'specific' || input.userIds.length > 0, {
  message: '请选择收件用户',
})
