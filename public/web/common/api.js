export const API_BASE_URL = ''

export function getWsBaseUrl() {
  if (typeof window === 'undefined') return ''
  return `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}`
}

async function readErrorMessage(response) {
  const contentType = response.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    const error = await response.json().catch(() => null)
    return translateErrorMessage(error?.message) || '请求失败'
  }
  const text = await response.text().catch(() => '')
  if (text.trimStart().startsWith('<!doctype') || text.trimStart().startsWith('<html')) {
    return '接口返回了网页 HTML，请检查 Node Express 服务是否正常'
  }
  return translateErrorMessage(text) || '请求失败'
}

function translateErrorMessage(message = '') {
  const text = String(message || '')
  if (/Too small: expected string to have >=6 characters/i.test(text)) return '密码至少需要 6 个字符'
  if (/Invalid email/i.test(text)) return '请输入正确的邮箱地址'
  return text
}

export async function request(path, options = {}) {
  const headers = new Headers(options.headers || {})
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  let response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers,
    })
  } catch {
    throw new Error('网络连接失败，请确认前台通过后端地址访问，并刷新后重试')
  }
  if (!response.ok) {
    throw new Error(await readErrorMessage(response))
  }
  if (response.status === 204) {
    return undefined
  }
  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) {
    throw new Error(await readErrorMessage(response))
  }
  return response.json()
}

function query(params = {}) {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, String(value))
    }
  })
  const text = search.toString()
  return text ? `?${text}` : ''
}

export const clientApi = {
  login: (input) => request('/api/users/login', { method: 'POST', body: JSON.stringify(input) }),
  register: (input) => request('/api/users/register', { method: 'POST', body: JSON.stringify(input) }),
  verifyEmail: (token) => request('/api/users/verify-email', { method: 'POST', body: JSON.stringify({ token }) }),
  forgotPassword: (email) => request('/api/users/password/forgot', { method: 'POST', body: JSON.stringify({ email }) }),
  resetPassword: (input) => request('/api/users/password/reset', { method: 'POST', body: JSON.stringify(input) }),
  getCurrentUser: (id) => request(`/api/users/${encodeURIComponent(id)}/profile`),
  getUserDetails: (id, input) => request(`/api/users/${encodeURIComponent(id)}/public-details${query({ userId: id, ...input })}`),
  changePassword: (id, input) => request(`/api/users/${encodeURIComponent(id)}/password`, { method: 'PATCH', body: JSON.stringify({ ...input, userId: id }) }),
  listApiKeys: (id) => request(`/api/users/${encodeURIComponent(id)}/api-keys`),
  createApiKey: (id, input) => request(`/api/users/${encodeURIComponent(id)}/api-keys`, { method: 'POST', body: JSON.stringify(input) }),
  updateApiKeyStatus: (id, keyId, input) => request(`/api/users/${encodeURIComponent(id)}/api-keys/${encodeURIComponent(keyId)}`, { method: 'PATCH', body: JSON.stringify(input) }),
  deleteApiKey: (id, keyId) => request(`/api/users/${encodeURIComponent(id)}/api-keys/${encodeURIComponent(keyId)}`, { method: 'DELETE' }),

  getSettings: () => request('/api/settings/public'),
  listAnnouncements: (userId) => request(`/api/announcements/public${query({ userId })}`),
  signAnnouncement: (id, userId) => request(`/api/announcements/${encodeURIComponent(id)}/sign`, { method: 'POST', body: JSON.stringify({ userId }) }),
  listPromotions: () => request('/api/promotions/public'),

  listModels: () => request('/api/models?dedupe=display'),
  getServiceStatus: () => request('/api/service-status'),
  reversePrompt: (input) => request('/api/prompt-reverse', { method: 'POST', body: JSON.stringify(input) }),
  completeChat: (input) => request('/api/chat/completions', { method: 'POST', body: JSON.stringify(input) }),
  completeChatStream: async (input) => {
    try {
      return await fetch('/api/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
    } catch {
      throw new Error('聊天通道连接失败，请确认前台通过后端地址访问，并刷新后重试')
    }
  },
  generateImage: (input) => request('/api/generate/image', { method: 'POST', body: JSON.stringify(input) }),
  generateImageStream: async (input) => {
    try {
      return await fetch('/api/generate/image/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
    } catch {
      throw new Error('生成通道连接失败，请确认前台通过后端地址访问，并刷新后重试')
    }
  },
  getTask: (id) => request(`/api/tasks/${encodeURIComponent(id)}`),
  listPublicDisplayTasks: () => request('/api/tasks/public-display'),
  listFavoriteTasks: (input) => request(`/api/tasks/favorites${query(input)}`),
  listHistoryTasks: (input) => request(`/api/tasks/history${query(input)}`),
  updateTaskDisplay: (id, input) => request(`/api/tasks/${encodeURIComponent(id)}/display`, { method: 'PATCH', body: JSON.stringify(input) }),
  updateTaskFavorite: (id, input) => request(`/api/tasks/${encodeURIComponent(id)}/favorite`, { method: 'PATCH', body: JSON.stringify(input) }),
  requestTaskPublic: (id, input) => request(`/api/tasks/${encodeURIComponent(id)}/public-request`, { method: 'POST', body: JSON.stringify(input) }),
  estimateTaskDuration: (input) => request(`/api/tasks/estimate${query(input)}`),

  listRechargeProducts: () => request('/api/shop/public/recharge-products'),
  listSubscriptionPlans: () => request('/api/subscriptions/public/plans'),
  getCurrentSubscription: (userId) => request(`/api/subscriptions/public/current${query({ userId })}`),
  createRechargeOrder: (input) => request('/api/recharge', { method: 'POST', body: JSON.stringify(input) }),
  getRechargeOrder: (id, userId) => request(`/api/recharge/${encodeURIComponent(id)}${query({ userId })}`),
  syncRechargeOrder: (id, userId) => request(`/api/recharge/${encodeURIComponent(id)}/sync`, { method: 'POST', body: JSON.stringify({ userId }) }),
  redeemCode: (input) => request('/api/redeem-codes/redeem', { method: 'POST', body: JSON.stringify(input) }),

  getCheckinStatus: (userId) => request(`/api/checkins/status${query({ userId })}`),
  checkin: (userId) => request('/api/checkins', { method: 'POST', body: JSON.stringify({ userId }) }),
  getInviteSummary: (userId) => request(`/api/invites/summary${query({ userId })}`),

  getOAuthClient: (input) => request(`/oauth/client${query(input)}`),
  authorizeOAuth: (input) => request('/oauth/authorize', { method: 'POST', body: JSON.stringify(input) }),
}
