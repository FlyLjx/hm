import cors from 'cors'
import express from 'express'
import { env } from './config/env.js'
import { apiProviderRoutes } from './modules/apiProviders/apiProviderRoutes.js'
import { generationRoutes } from './modules/generation/generationRoutes.js'
import { modelRoutes } from './modules/models/modelRoutes.js'
import { settingRoutes } from './modules/settings/settingRoutes.js'
import { taskRoutes } from './modules/tasks/taskRoutes.js'
import { userRoutes } from './modules/users/userRoutes.js'
import { errorMiddleware } from './shared/errorMiddleware.js'

export const app = express()

app.use(cors({ origin: env.corsOrigin }))
app.use(express.json({ limit: env.requestBodyLimit }))

app.get('/api/health', (_req, res) => {
  res.json({ data: { status: 'ok' } })
})

app.use('/api/users', userRoutes)
app.use('/api/api-providers', apiProviderRoutes)
app.use('/api/models', modelRoutes)
app.use('/api/generate', generationRoutes)
app.use('/api/tasks', taskRoutes)
app.use('/api/settings', settingRoutes)

app.use(errorMiddleware)
