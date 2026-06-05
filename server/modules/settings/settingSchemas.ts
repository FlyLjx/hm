import { z } from 'zod'

export const updateSettingsSchema = z.object({
  siteName: z.string().min(1).max(80),
  logoText: z.string().min(1).max(20),
  creditName: z.string().min(1).max(20),
  frontendUrl: z.string().url().max(255).default('http://localhost:3001'),
  backendUrl: z.string().url().max(255).default('http://localhost:3001'),
  announcementEnabled: z.boolean(),
  announcementTitle: z.string().max(80),
  announcementContent: z.string().max(500),
  supportEnabled: z.boolean(),
  supportTitle: z.string().max(80),
  supportDescription: z.string().max(300),
  supportWechat: z.string().max(80),
  supportQq: z.string().max(80),
  supportEmail: z.string().email().or(z.literal('')),
  supportUrl: z.string().url().or(z.literal('')),
  supportQrCodeUrl: z.string().max(500),
  rechargeEnabled: z.boolean(),
  rechargeRate: z.coerce.number().positive().max(100000),
  rechargeMinAmount: z.coerce.number().positive().max(999999),
  rechargePresets: z.string().max(120),
  checkinEnabled: z.boolean(),
  checkinRewards: z.string().max(120),
  inviteEnabled: z.boolean(),
  inviteRewardCredits: z.coerce.number().positive().max(999999),
  taskTimeoutMinutes: z.coerce.number().positive().max(1440),
  alipayAppId: z.string().max(80),
  alipayPrivateKey: z.string().max(10000),
  alipayPublicKey: z.string().max(10000),
  alipayGateway: z.string().url().max(255),
  registerMode: z.enum(['open', 'closed']),
  registerRewardCredits: z.coerce.number().min(0).max(999999),
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

export const accountPoolSettingsSchema = z.object({
  accountPoolEndpoint: z.string().url().max(500).default('https://free-api.yccc.me/api/accounts'),
  accountPoolApiKey: z.string().max(2000).default(''),
  accountPoolAuthHeader: z.string().min(1).max(80).default('Authorization'),
})
