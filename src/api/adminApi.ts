export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001'

export type AdminUser = {
  id: string
  email: string
  credits: number
  role: 'admin' | 'user'
  status: 'active' | 'disabled'
  emailVerifiedAt: string | null
  createdAt: string
  updatedAt: string
}

export type ApiProvider = {
  id: string
  name: string
  type: 'sub2api' | 'custom'
  baseUrl: string
  apiKey: string
  status: 'active' | 'disabled'
  createdAt: string
  updatedAt: string
}

export type AiModelCapability = 'image' | 'video' | 'chat_image' | 'workflow'

export type AiModel = {
  id: string
  providerId: string
  providerName?: string
  modelName: string
  displayName: string
  capability: AiModelCapability
  price1k: number
  price2k: number
  price4k: number
  status: 'active' | 'disabled'
  createdAt: string
  updatedAt: string
}

export type GenerationTask = {
  id: string
  userId: string
  userEmail?: string
  modelId: string
  modelName?: string
  providerId: string
  providerName?: string
  capability: AiModelCapability
  prompt: string
  sizeTier: '1k' | '2k' | '4k'
  size?: string | null
  quantity: number
  userIp: string
  costCredits: number
  remainingCredits: number
  durationSeconds: number
  status: 'queued' | 'processing' | 'pending' | 'success' | 'failed' | 'canceled'
  errorMessage?: string | null
  resultUrl?: string | null
  resultUrls?: string[]
  thumbnailUrl?: string | null
  thumbnailUrls?: string[]
  createdAt: string
  updatedAt: string
}

export type CreditLog = {
  id: string
  userId: string
  userEmail?: string
  type: 'recharge' | 'deduct'
  amount: number
  balanceAfter: number
  remark?: string | null
  createdAt: string
}

export type UserDetails = {
  user: AdminUser
  creditLogs: CreditLog[]
  tasks: GenerationTask[]
}

export type SystemSettings = {
  siteName: string
  creditName: string
  frontendUrl: string
  backendUrl: string
  registerMode: 'open' | 'closed'
  emailEnabled: boolean
  emailHost: string
  emailPort: number
  emailSecure: boolean
  emailUser: string
  emailPassword: string
  emailFromName: string
  emailFromAddress: string
  registerEmailVerification: boolean
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: '请求失败' }))
    throw new Error(error.message ?? '请求失败')
  }

  if (response.status === 204) {
    return undefined as T
  }

  return response.json() as Promise<T>
}

export const adminApi = {
  async listUsers() {
    return request<{ data: AdminUser[] }>('/api/users')
  },

  async createUser(input: {
    email: string
    password: string
    role: 'admin' | 'user'
  }) {
    return request<{ data: AdminUser }>('/api/users', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },

  async updateUserStatus(id: string, status: 'active' | 'disabled') {
    return request<{ data: AdminUser }>(`/api/users/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    })
  },

  async updateUser(
    id: string,
    input: Partial<{
      email: string
      password: string
      role: 'admin' | 'user'
      status: 'active' | 'disabled'
    }>,
  ) {
    return request<{ data: AdminUser }>(`/api/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    })
  },

  async deleteUser(id: string) {
    return request<void>(`/api/users/${id}`, {
      method: 'DELETE',
    })
  },

  async rechargeUser(id: string, input: { amount: number; remark?: string }) {
    return request<{ data: { user: AdminUser; log: CreditLog } }>(`/api/users/${id}/recharge`, {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },

  async getUserDetails(id: string) {
    return request<{ data: UserDetails }>(`/api/users/${id}/details`)
  },

  async listApiProviders() {
    return request<{ data: ApiProvider[] }>('/api/api-providers')
  },

  async createApiProvider(input: {
    name: string
    type: 'sub2api' | 'custom'
    baseUrl: string
    apiKey: string
  }) {
    return request<{ data: ApiProvider }>('/api/api-providers', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },

  async fetchApiProviderModels(input: {
    type: 'sub2api' | 'custom'
    baseUrl: string
    apiKey: string
  }) {
    return request<{ data: string[] }>('/api/api-providers/models', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },

  async updateApiProvider(id: string, input: Partial<ApiProvider>) {
    return request<{ data: ApiProvider }>(`/api/api-providers/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    })
  },

  async deleteApiProvider(id: string) {
    return request<void>(`/api/api-providers/${id}`, {
      method: 'DELETE',
    })
  },

  async listModels() {
    return request<{ data: AiModel[] }>('/api/models')
  },

  async createModel(input: {
    providerId: string
    modelName: string
    displayName: string
    capability: AiModelCapability
    price1k: number
    price2k: number
    price4k: number
  }) {
    return request<{ data: AiModel }>('/api/models', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },

  async syncModels(input: {
    providerId: string
    capability: AiModelCapability
    keyword?: string
  }) {
    return request<{ data: AiModel[] }>('/api/models/sync', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },

  async updateModel(id: string, input: Partial<AiModel>) {
    return request<{ data: AiModel }>(`/api/models/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    })
  },

  async deleteModel(id: string) {
    return request<void>(`/api/models/${id}`, {
      method: 'DELETE',
    })
  },

  async deleteModels(ids: string[]) {
    return request<{ data: { deletedCount: number } }>('/api/models/delete-many', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    })
  },

  async listTasks() {
    return request<{ data: GenerationTask[] }>('/api/tasks')
  },

  async cancelTask(id: string) {
    return request<{ data: GenerationTask }>(`/api/tasks/${id}/cancel`, {
      method: 'POST',
    })
  },

  async getSettings() {
    return request<{ data: SystemSettings }>('/api/settings')
  },

  async updateSettings(input: SystemSettings) {
    return request<{ data: SystemSettings }>('/api/settings', {
      method: 'PATCH',
      body: JSON.stringify(input),
    })
  },

  async sendTestEmail(email: string) {
    return request<{ data: { sent: boolean } }>('/api/settings/test-email', {
      method: 'POST',
      body: JSON.stringify({ email }),
    })
  },
}
