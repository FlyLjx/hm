import { createServer } from 'node:http'
import { app } from './app.js'
import { env } from './config/env.js'
import { initializeDatabase } from './config/migrate.js'
import { attachTaskSocket } from './modules/tasks/taskSocket.js'

async function bootstrap() {
  await initializeDatabase()

  const server = createServer(app)
  attachTaskSocket(server)

  server.listen(env.port, () => {
    console.log(`API server running at http://localhost:${env.port}`)
  })
}

bootstrap().catch((error) => {
  console.error('API server failed to start')
  console.error(error)
  process.exit(1)
})
