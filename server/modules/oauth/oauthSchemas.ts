import { z } from 'zod'

export const authorizeQuerySchema = z.object({
  client_id: z.string().min(1).max(120),
  redirect_uri: z.string().url().max(1000),
  response_type: z.literal('code'),
  state: z.string().max(1000).optional(),
})

export const authorizeSchema = authorizeQuerySchema.extend({
  userToken: z.string().min(20).max(1000),
})

export const tokenSchema = z.object({
  grant_type: z.literal('authorization_code'),
  code: z.string().min(20).max(200),
  client_id: z.string().min(1).max(120),
  client_secret: z.string().min(1).max(200),
  redirect_uri: z.string().url().max(1000),
})
