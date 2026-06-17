export const API_BASE_URL = ''
const ADMIN_TOKEN_KEY = 'aipi_admin_token'

export function getAdminToken() {
  return localStorage.getItem(ADMIN_TOKEN_KEY) || ''
}

export function setAdminToken(token) {
  localStorage.setItem(ADMIN_TOKEN_KEY, token)
}

export function clearAdminToken() {
  localStorage.removeItem(ADMIN_TOKEN_KEY)
}

const adminGetCache = new Map()

function clearAdminCache(matchers = []) {
  if (!matchers.length) {
    adminGetCache.clear()
    return
  }
  for (const key of [...adminGetCache.keys()]) {
    if (matchers.some((matcher) => key === matcher || key.startsWith(`${matcher}?`))) {
      adminGetCache.delete(key)
    }
  }
}

async function readMessage(response, fallback) {
  const contentType = response.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    const payload = await response.json().catch(() => null)
    return payload?.message || fallback
  }
  const text = await response.text().catch(() => '')
  if (text.trimStart().startsWith('<!doctype') || text.trimStart().startsWith('<html')) {
    return '接口返回了 HTML，请确认后端正在处理 /api'
  }
  return text || fallback
}

export async function request(path, options = {}) {
  const headers = new Headers(options.headers || {})
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const token = getAdminToken()
  if (token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`)

  const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers })
  if (!response.ok) {
    if (response.status === 401) {
      clearAdminToken()
      window.dispatchEvent(new CustomEvent('admin:unauthorized'))
    }
    throw new Error(await readMessage(response, '请求失败'))
  }
  if (response.status === 204) return undefined
  return response.json()
}

async function cachedGet(path, ttlMs = 15000) {
  const now = Date.now()
  const cached = adminGetCache.get(path)
  if (cached?.value && cached.expiresAt > now) {
    return cached.value
  }
  if (cached?.promise) return cached.promise
  const promise = request(path)
    .then((result) => {
      adminGetCache.set(path, {
        value: result,
        expiresAt: Date.now() + ttlMs,
      })
      return result
    })
    .catch((error) => {
      adminGetCache.delete(path)
      throw error
    })
  adminGetCache.set(path, { promise, expiresAt: now + ttlMs })
  return promise
}

function query(params = {}) {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value))
  })
  const text = search.toString()
  return text ? `?${text}` : ''
}

function json(method, input) {
  return { method, body: input === undefined ? undefined : JSON.stringify(input) }
}

function pathId(id) {
  return encodeURIComponent(String(id))
}

export const adminApi = {
  login: (input) => request('/api/admin/login', json('POST', input)),
  getSession: () => request('/api/admin/session'),
  getDashboard: (params) => request(`/api/dashboard${query(params)}`),
  getCostStats: (params) => request(`/api/finance-stats/costs${query(params)}`),
  listUsers: () => cachedGet('/api/users', 15000),
  createUser: (input) => request('/api/users', json('POST', input)),
  updateUser: (id, input) => request(`/api/users/${pathId(id)}`, json('PATCH', input)).then((result) => {
    clearAdminCache(['/api/users'])
    return result
  }),
  deleteUser: (id) => request(`/api/users/${pathId(id)}`, { method: 'DELETE' }).then((result) => {
    clearAdminCache(['/api/users'])
    return result
  }),
  rechargeUser: (id, input) => request(`/api/users/${pathId(id)}/recharge`, json('POST', input)).then((result) => {
    clearAdminCache(['/api/users'])
    return result
  }),
  getUserDetails: (id) => request(`/api/users/${pathId(id)}/details`),

  listApiProviders: () => cachedGet('/api/api-providers', 15000),
  createApiProvider: (input) => request('/api/api-providers', json('POST', input)).then((result) => {
    clearAdminCache(['/api/api-providers', '/api/models'])
    return result
  }),
  updateApiProvider: (id, input) => request(`/api/api-providers/${pathId(id)}`, json('PATCH', input)).then((result) => {
    clearAdminCache(['/api/api-providers', '/api/models'])
    return result
  }),
  deleteApiProvider: (id) => request(`/api/api-providers/${pathId(id)}`, { method: 'DELETE' }).then((result) => {
    clearAdminCache(['/api/api-providers', '/api/models'])
    return result
  }),
  fetchApiProviderModelDetails: (input) => request('/api/api-providers/model-details', json('POST', input)),
  testApiProvider: (id) => request(`/api/api-providers/${pathId(id)}/test`, json('POST')),

  listModels: () => cachedGet('/api/models', 15000),
  createModel: (input) => request('/api/models', json('POST', input)).then((result) => {
    clearAdminCache(['/api/models'])
    return result
  }),
  updateModel: (id, input) => request(`/api/models/${pathId(id)}`, json('PATCH', input)).then((result) => {
    clearAdminCache(['/api/models'])
    return result
  }),
  updateModelSortOrders: (input) => request('/api/models/sort-orders', json('PATCH', input)).then((result) => {
    clearAdminCache(['/api/models'])
    return result
  }),
  deleteModel: (id) => request(`/api/models/${pathId(id)}`, { method: 'DELETE' }).then((result) => {
    clearAdminCache(['/api/models'])
    return result
  }),

  listTasks: (params) => request(`/api/tasks${query(params)}`),
  getTaskStats: () => request('/api/tasks/stats'),
  listTaskImages: (params) => request(`/api/tasks/images${query(params)}`),
  cancelTask: (id) => request(`/api/tasks/${pathId(id)}/cancel`, json('POST')),
  updateTaskDisplay: (id, input) => request(`/api/tasks/${pathId(id)}/display`, json('PATCH', input)),
  reviewTaskPublic: (id, input) => request(`/api/tasks/${pathId(id)}/public-review`, json('PATCH', input)),
  listApiKeys: (params) => request(`/api/api-keys${query(params)}`),
  updateApiKeyStatus: (id, input) => request(`/api/api-keys/${pathId(id)}`, json('PATCH', input)),
  deleteApiKey: (id) => request(`/api/api-keys/${pathId(id)}`, { method: 'DELETE' }),
  listApiKeyLogs: (id, params) => request(`/api/api-keys/${pathId(id)}/logs${query(params)}`),
  listApiLogs: (params) => request(`/api/api-logs${query(params)}`),
  getApiLogStats: (params) => request(`/api/api-logs/stats${query(params)}`),
  getApiLogDetail: (id) => request(`/api/api-logs/${pathId(id)}`),
  cleanupApiLogs: () => request('/api/api-logs/cleanup', json('POST')),
  listCreditLogs: (params) => request(`/api/credit-logs${query(params)}`),
  getCreditLogStats: (params) => request(`/api/credit-logs/stats${query(params)}`),
  deleteCreditLog: (id) => request(`/api/credit-logs/${pathId(id)}`, { method: 'DELETE' }),

  listRechargeOrders: (params) => request(`/api/recharge/orders${query(params)}`),
  listRechargeProducts: () => request('/api/shop/recharge-products'),
  createRechargeProduct: (input) => request('/api/shop/recharge-products', json('POST', input)),
  updateRechargeProduct: (id, input) => request(`/api/shop/recharge-products/${pathId(id)}`, json('PATCH', input)),
  deleteRechargeProduct: (id) => request(`/api/shop/recharge-products/${pathId(id)}`, { method: 'DELETE' }),
  listSubscriptionPlans: () => request('/api/subscriptions/plans'),
  createSubscriptionPlan: (input) => request('/api/subscriptions/plans', json('POST', input)),
  updateSubscriptionPlan: (id, input) => request(`/api/subscriptions/plans/${pathId(id)}`, json('PATCH', input)),
  deleteSubscriptionPlan: (id) => request(`/api/subscriptions/plans/${pathId(id)}`, { method: 'DELETE' }),

  listRedeemCodes: (params) => request(`/api/redeem-codes${query(params)}`),
  createRedeemCodes: (input) => request('/api/redeem-codes', json('POST', input)),
  updateRedeemCode: (id, input) => request(`/api/redeem-codes/${pathId(id)}`, json('PATCH', input)),
  deleteRedeemCode: (id) => request(`/api/redeem-codes/${pathId(id)}`, { method: 'DELETE' }),

  listCheckins: (params) => request(`/api/checkins${query(params)}`),
  deleteCheckin: (id) => request(`/api/checkins/${pathId(id)}`, { method: 'DELETE' }),
  listInvites: (params) => request(`/api/invites${query(params)}`),
  deleteInvite: (id) => request(`/api/invites/${pathId(id)}`, { method: 'DELETE' }),
  listUserActivityRanking: (params) => request(`/api/users/activity-ranking${query(params)}`),

  listAnnouncements: () => request('/api/announcements'),
  generateAnnouncement: (input) => request('/api/announcements/generate', json('POST', input)),
  createAnnouncement: (input) => request('/api/announcements', json('POST', input)),
  updateAnnouncement: (id, input) => request(`/api/announcements/${pathId(id)}`, json('PATCH', input)),
  deleteAnnouncement: (id) => request(`/api/announcements/${pathId(id)}`, { method: 'DELETE' }),

  listPromotions: () => request('/api/promotions'),
  createPromotion: (input) => request('/api/promotions', json('POST', input)),
  updatePromotion: (id, input) => request(`/api/promotions/${pathId(id)}`, json('PATCH', input)),
  deletePromotion: (id) => request(`/api/promotions/${pathId(id)}`, { method: 'DELETE' }),

  getSettings: () => cachedGet('/api/settings', 10000),
  updateSettings: (input) => request('/api/settings', json('PATCH', input)).then((result) => {
    clearAdminCache(['/api/settings'])
    return result
  }),
  sendTestBark: () => request('/api/settings/test-bark', json('POST')),
  getAccountPoolSettings: () => cachedGet('/api/settings/account-pool', 10000),
  updateAccountPoolSettings: (input) => request('/api/settings/account-pool', json('PATCH', input)).then((result) => {
    clearAdminCache(['/api/settings/account-pool'])
    return result
  }),
  sendTestEmail: (email) => request('/api/settings/test-email', json('POST', { email })),
  sendMailBroadcast: (input) => request('/api/mail-broadcast', json('POST', input)),
  listAccountPoolAccounts: () => request('/api/account-pool/accounts'),
  listSystemLogs: () => request('/api/system-logs'),
  getSystemLog: (params) => request(`/api/system-logs/detail${query(params)}`),
  deleteSystemLog: (name) => request(`/api/system-logs/${pathId(name)}`, { method: 'DELETE' }),
}
