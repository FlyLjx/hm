import { getWsBaseUrl } from './api.js'

const USER_SOCKET_PATH = '/ws/users'
const RECONNECT_DELAY_MS = 1000

let socket = null
let reconnectTimer = null
let shouldReconnect = true
let currentUserId = ''
let currentListener = null

function socketUrl() {
  return `${getWsBaseUrl().replace(/\/$/, '')}${USER_SOCKET_PATH}`
}

function safeSend(payload) {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload))
  }
}

function connectSocket() {
  if (!currentUserId) return null
  if (socket && [WebSocket.OPEN, WebSocket.CONNECTING].includes(socket.readyState)) return socket
  shouldReconnect = true
  socket = new WebSocket(socketUrl())
  socket.addEventListener('open', () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    safeSend({ type: 'subscribe', userId: currentUserId })
  })
  socket.addEventListener('message', (event) => {
    if (typeof event.data !== 'string') return
    try {
      const message = JSON.parse(event.data)
      if (message.type === 'user' && message.data && currentListener) {
        currentListener(message.data)
      }
    } catch {}
  })
  socket.addEventListener('close', () => {
    socket = null
    if (shouldReconnect && currentUserId) {
      reconnectTimer = setTimeout(connectSocket, RECONNECT_DELAY_MS)
    }
  })
  socket.addEventListener('error', () => socket?.close())
  return socket
}

export function subscribeCurrentUser(userId, onUpdate) {
  disconnectCurrentUserSocket()
  if (!userId) return
  currentUserId = userId
  currentListener = onUpdate
  connectSocket()
}

export function disconnectCurrentUserSocket() {
  shouldReconnect = false
  currentUserId = ''
  currentListener = null
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  socket?.close()
  socket = null
}
