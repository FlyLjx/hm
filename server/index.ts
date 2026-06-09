import { createServer } from 'node:http'
import { app } from './app.js'
import { env } from './config/env.js'
import { initializeDatabase } from './config/migrate.js'
import { attachTaskSocket } from './modules/tasks/taskSocket.js'
import { startTaskTimeoutScheduler } from './modules/tasks/taskTimeoutScheduler.js'
import { attachUserSocket } from './modules/users/userSocket.js'
import { startApiProviderMonitor } from './modules/apiProviders/apiProviderMonitor.js'
import { installFileLogger } from './shared/fileLogger.js'

installFileLogger()

async function bootstrap() {
  await initializeDatabase()

  const server = createServer(app)
  attachTaskSocket(server)
  attachUserSocket(server)
  startTaskTimeoutScheduler()
  startApiProviderMonitor()

  server.listen(env.port, () => {
    console.log(`API server running at http://localhost:${env.port}`)
  })
}

bootstrap().catch((error) => {
  console.error('API server failed to start')
  console.error(error)
  process.exit(1)
})
