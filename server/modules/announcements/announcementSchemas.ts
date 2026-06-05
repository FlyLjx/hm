import { z } from 'zod'

const userIdSchema = z.uuid()

const announcementBaseSchema = z.object({
  title: z.string().min(1).max(120),
  content: z.string().min(1).max(10000),
  displayMode: z.enum(['popup', 'home', 'topbar']).default('popup'),
  targetType: z.enum(['all', 'specific']).default('all'),
  userIds: z.array(userIdSchema).default([]),
  status: z.enum(['active', 'disabled']).default('active'),
  sortOrder: z.coerce.number().int().min(0).max(999999).default(0),
})

export const createAnnouncementSchema = announcementBaseSchema.refine((input) => input.targetType === 'all' || input.userIds.length > 0, {
  message: '请选择公告展示用户',
})

export const updateAnnouncementSchema = announcementBaseSchema.partial()
  .refine((input) => Object.keys(input).length > 0, {
    message: '请至少填写一个要修改的字段',
  })
  .refine((input) => input.targetType !== 'specific' || input.userIds === undefined || input.userIds.length > 0, {
    message: '请选择公告展示用户',
  })

export const publicAnnouncementQuerySchema = z.object({
  userId: userIdSchema.optional(),
})

export const signAnnouncementSchema = z.object({
  userId: userIdSchema,
})
