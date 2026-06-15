import { getWsBaseUrl } from './api.js'

const TASK_SOCKET_PATH = '/ws/tasks'
const RECONNECT_DELAY_MS = 1000

let socket = null
let reconnectTimer = null
let shouldReconnect = true
const subscribersByTaskId = new Map()
const signaturesByTaskId = new Map()

function socketIsOpen() {
  return socket?.readyState === WebSocket.OPEN
}

function socketUrl() {
  return `${getWsBaseUrl().replace(/\/$/, '')}${TASK_SOCKET_PATH}`
}

function isTerminalTask(task) {
  return ['success', 'failed', 'canceled'].includes(task.status)
}

function signature(task) {
  return [
    task.updatedAt,
    task.status,
    task.resultUrl || '',
    (task.resultUrls || []).join('|'),
    task.errorMessage || '',
  ].join('::')
}

function safeSend(payload) {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload))
  }
}

function emit(task) {
  const nextSignature = signature(task)
  if (signaturesByTaskId.get(task.id) === nextSignature) return
  signaturesByTaskId.set(task.id, nextSignature)
  const listeners = subscribersByTaskId.get(task.id)
  if (listeners) {
    for (const listener of listeners) listener(task)
  }
  if (isTerminalTask(task)) {
    subscribersByTaskId.delete(task.id)
    signaturesByTaskId.delete(task.id)
  }
}

function emitProgress(progress) {
  if (!progress?.taskId) return
  const listeners = subscribersByTaskId.get(progress.taskId)
  if (listeners) {
    for (const listener of listeners) listener({ __progress: true, ...progress })
  }
}

function connectSocket() {
  if (socket && [WebSocket.OPEN, WebSocket.CONNECTING].includes(socket.readyState)) return socket
  shouldReconnect = true
  socket = new WebSocket(socketUrl())
  socket.addEventListener('open', () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    for (const taskId of subscribersByTaskId.keys()) {
      safeSend({ type: 'subscribe', taskId })
    }
  })
  socket.addEventListener('message', (event) => {
    if (typeof event.data !== 'string') return
    try {
      const message = JSON.parse(event.data)
      if (message.type === 'task' && message.data) emit(message.data)
      if (message.type === 'progress' && message.data) emitProgress(message.data)
    } catch {}
  })
  socket.addEventListener('close', () => {
    socket = null
    if (shouldReconnect && subscribersByTaskId.size > 0) {
      reconnectTimer = setTimeout(connectSocket, RECONNECT_DELAY_MS)
    }
  })
  socket.addEventListener('error', () => socket?.close())
  return socket
}

export function subscribeGenerationTask(taskId, onUpdate) {
  if (!taskId) return () => {}
  const listeners = subscribersByTaskId.get(taskId) || new Set()
  const isNew = listeners.size === 0
  listeners.add(onUpdate)
  subscribersByTaskId.set(taskId, listeners)
  connectSocket()
  if (isNew) safeSend({ type: 'subscribe', taskId })
  return () => {
    const current = subscribersByTaskId.get(taskId)
    if (!current) return
    current.delete(onUpdate)
    if (current.size === 0) {
      subscribersByTaskId.delete(taskId)
      signaturesByTaskId.delete(taskId)
    }
  }
}

export function disconnectGenerationTaskSocket() {
  shouldReconnect = false
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  socket?.close()
  socket = null
}
