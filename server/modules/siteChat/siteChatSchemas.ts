import { z } from 'zod'

const siteChatTextContentSchema = z.object({
  type: z.literal('text'),
  text: z.string().min(1).max(12000),
})

const siteChatImageContentSchema = z.object({
  type: z.literal('image_url'),
  image_url: z.object({
    url: z.string().min(1).max(7_000_000),
  }),
})

export const siteChatMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.union([
    z.string().min(1).max(12000),
    z.array(z.union([siteChatTextContentSchema, siteChatImageContentSchema])).min(1).max(6),
  ]),
})

export const siteChatCompletionSchema = z.object({
  userId: z.string().min(1).max(36),
  messages: z.array(siteChatMessageSchema).min(1).max(40),
})
