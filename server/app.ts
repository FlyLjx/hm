import cors from 'cors'
import express from 'express'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { env } from './config/env.js'
import { adminRoutes } from './modules/admin/adminRoutes.js'
import { accountPoolRoutes } from './modules/accountPool/accountPoolRoutes.js'
import { requireAdmin } from './modules/admin/adminAuth.js'
import { announcementRoutes } from './modules/announcements/announcementRoutes.js'
import { adminApiKeyRoutes } from './modules/apiKeys/adminApiKeyRoutes.js'
import { apiLogRoutes } from './modules/apiLogs/apiLogRoutes.js'
import { ApiLogController } from './modules/apiLogs/apiLogController.js'
import { apiProviderRoutes } from './modules/apiProviders/apiProviderRoutes.js'
import { checkinRoutes } from './modules/checkins/checkinRoutes.js'
import { dashboardRoutes } from './modules/dashboard/dashboardRoutes.js'
import { generationRoutes } from './modules/generation/generationRoutes.js'
import { inviteRoutes } from './modules/invites/inviteRoutes.js'
import { mailBroadcastRoutes } from './modules/mailBroadcast/mailBroadcastRoutes.js'
import { modelRoutes } from './modules/models/modelRoutes.js'
import { openAiCompatRoutes } from './modules/openaiCompat/openaiCompatRoutes.js'
import { promptReverseRoutes } from './modules/promptReverse/promptReverseRoutes.js'
import { promotionRoutes } from './modules/promotions/promotionRoutes.js'
import { rechargeRoutes } from './modules/recharge/rechargeRoutes.js'
import { redeemCodeRoutes } from './modules/redeemCodes/redeemCodeRoutes.js'
import { settingRoutes } from './modules/settings/settingRoutes.js'
import { shopRoutes } from './modules/shop/shopRoutes.js'
import { subscriptionRoutes } from './modules/subscriptions/subscriptionRoutes.js'
import { taskRoutes } from './modules/tasks/taskRoutes.js'
import { userRoutes } from './modules/users/userRoutes.js'
import { errorMiddleware } from './shared/errorMiddleware.js'
import { asyncHandler } from './shared/asyncHandler.js'

export const app = express()
const publicPath = join(process.cwd(), 'public')
const staticWebPath = join(publicPath, 'web', 'index.html')
const staticAdminPath = join(publicPath, 'admin', 'index.html')
const apiLogController = new ApiLogController()
const localDevOriginPattern = /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i

function isAllowedCorsOrigin(origin?: string) {
  if (!origin) return true
  if (env.corsOrigins.includes('*')) return true
  if (env.corsOrigins.includes(origin)) return true
  return localDevOriginPattern.test(origin)
}

app.set('trust proxy', true)
app.use(cors({
  origin(origin, callback) {
    callback(null, isAllowedCorsOrigin(origin))
  },
  credentials: true,
}))
app.use(express.json({ limit: env.requestBodyLimit }))
app.use(express.urlencoded({ extended: true }))
if (env.serveStatic) {
  app.use(express.static(publicPath))
}

app.get('/api/health', (_req, res) => {
  res.json({ data: { status: 'ok' } })
})

app.get('/api/service-status', asyncHandler(apiLogController.publicStatus.bind(apiLogController)))

app.use('/v1', openAiCompatRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/account-pool', accountPoolRoutes)
app.use('/api/users', userRoutes)
app.use('/api/dashboard', requireAdmin, dashboardRoutes)
app.use('/api/announcements', announcementRoutes)
app.use('/api/api-providers', apiProviderRoutes)
app.use('/api/api-keys', requireAdmin, adminApiKeyRoutes)
app.use('/api/api-logs', requireAdmin, apiLogRoutes)
app.use('/api/models', modelRoutes)
app.use('/api/promotions', promotionRoutes)
app.use('/api/prompt-reverse', promptReverseRoutes)
app.use('/api/generate', generationRoutes)
app.use('/api/tasks', taskRoutes)
app.use('/api/settings', settingRoutes)
app.use('/api/recharge', rechargeRoutes)
app.use('/api/redeem-codes', redeemCodeRoutes)
app.use('/api/checkins', checkinRoutes)
app.use('/api/invites', inviteRoutes)
app.use('/api/mail-broadcast', mailBroadcastRoutes)
app.use('/api/shop', shopRoutes)
app.use('/api/subscriptions', subscriptionRoutes)

if (env.serveStatic && existsSync(staticAdminPath)) {
  app.get(['/admin', '/admin/', '/admin.html'], (_req, res) => {
    res.sendFile(staticAdminPath)
  })

  app.get(/^\/admin\/(?!assets\/|favicon\.svg).*/, (_req, res) => {
    res.sendFile(staticAdminPath)
  })
}

if (env.serveStatic && existsSync(staticWebPath)) {
  app.get(/^\/(?!api\/|ws\/).*/, (_req, res) => {
    res.sendFile(staticWebPath)
  })
}

app.use(errorMiddleware)
