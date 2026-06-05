import type { Server as HttpServer } from 'node:http'
import { WebSocketServer, type WebSocket } from 'ws'
import { UserRepository } from './userRepository.js'
import { userEvents } from './userEvents.js'

type ClientMessage = {
  type?: string
  userId?: string
}

const userRepository = new UserRepository()

function toPublicUser(user: Awaited<ReturnType<UserRepository['findById']>>) {
  if (!user) return null
  const { passwordHash: _passwordHash, ...publicUser } = user
  return publicUser
}

function sendJson(socket: WebSocket, payload: unknown) {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(payload))
  }
}

export function attachUserSocket(server: HttpServer) {
  const wss = new WebSocketServer({ noServer: true })
  const subscriptions = new Map<WebSocket, string>()

  server.on('upgrade', (request, socket, head) => {
    const pathname = new URL(request.url ?? '/', 'http://localhost').pathname
    if (pathname !== '/ws/users') return

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request)
    })
  })

  wss.on('connection', (socket) => {
    socket.on('message', async (raw) => {
      let message: ClientMessage
      try {
        message = JSON.parse(raw.toString()) as ClientMessage
      } catch {
        sendJson(socket, { type: 'error', message: '消息格式错误' })
        return
      }

      if (message.type !== 'subscribe' || !message.userId) {
        sendJson(socket, { type: 'error', message: '订阅参数错误' })
        return
      }

      subscriptions.set(socket, message.userId)
      const user = toPublicUser(await userRepository.findById(message.userId))
      sendJson(socket, { type: 'user', data: user })
    })

    socket.on('close', () => {
      subscriptions.delete(socket)
    })
  })

  userEvents.onUpdated((user) => {
    for (const [socket, userId] of subscriptions.entries()) {
      if (userId === user.id) {
        sendJson(socket, { type: 'user', data: user })
      }
    }
  })

  return wss
}
