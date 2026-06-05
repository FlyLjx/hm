import type { Server as HttpServer } from 'node:http'
import { WebSocketServer, type WebSocket } from 'ws'
import { TaskRepository } from './taskRepository.js'
import { taskEvents } from './taskEvents.js'

type ClientMessage = {
  type?: string
  taskId?: string
}

const taskRepository = new TaskRepository()

function sendJson(socket: WebSocket, payload: unknown) {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(payload))
  }
}

export function attachTaskSocket(server: HttpServer) {
  const wss = new WebSocketServer({ noServer: true })
  const subscriptions = new Map<WebSocket, Set<string>>()

  server.on('upgrade', (request, socket, head) => {
    const pathname = new URL(request.url ?? '/', 'http://localhost').pathname
    if (pathname !== '/ws/tasks') return

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request)
    })
  })

  wss.on('connection', (socket) => {
    subscriptions.set(socket, new Set())

    socket.on('message', async (raw) => {
      let message: ClientMessage
      try {
        message = JSON.parse(raw.toString()) as ClientMessage
      } catch {
        sendJson(socket, { type: 'error', message: '消息格式错误' })
        return
      }

      if (message.type !== 'subscribe' || !message.taskId) {
        sendJson(socket, { type: 'error', message: '订阅参数错误' })
        return
      }

      subscriptions.get(socket)?.add(message.taskId)
      const task = await taskRepository.findById(message.taskId)
      sendJson(socket, { type: 'task', data: task })
    })

    socket.on('close', () => {
      subscriptions.delete(socket)
    })
  })

  taskEvents.onUpdated((task) => {
    for (const [socket, taskIds] of subscriptions.entries()) {
      if (taskIds.has(task.id)) {
        sendJson(socket, { type: 'task', data: task })
      }
    }
  })

  taskEvents.onProgress((progress) => {
    for (const [socket, taskIds] of subscriptions.entries()) {
      if (taskIds.has(progress.taskId)) {
        sendJson(socket, { type: 'progress', data: progress })
      }
    }
  })

  return wss
}
