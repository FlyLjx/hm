import { z } from 'zod'

export const updateSettingsSchema = z.object({
  siteName: z.string().min(1).max(80),
  creditName: z.string().min(1).max(20),
  frontendUrl: z.string().url().max(255),
  backendUrl: z.string().url().max(255),
  registerMode: z.enum(['open', 'closed']),
  emailEnabled: z.boolean(),
  emailHost: z.string().max(255),
  emailPort: z.coerce.number().int().min(1).max(65535),
  emailSecure: z.boolean(),
  emailUser: z.string().max(255),
  emailPassword: z.string().max(255),
  emailFromName: z.string().max(80),
  emailFromAddress: z.string().email().or(z.literal('')),
  registerEmailVerification: z.boolean(),
})

export const testEmailSchema = z.object({
  email: z.string().email().max(120),
})
