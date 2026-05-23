export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001'

export function getWsBaseUrl() {
  const configured = import.meta.env.VITE_WS_BASE_URL as string | undefined
  if (configured) return configured
  return API_BASE_URL.replace(/^http/i, 'ws')
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

export type CurrentUser = {
  id: string
  email: string
  credits: number
  role: 'admin' | 'user'
  status: 'active' | 'disabled'
  emailVerifiedAt: string | null
  createdAt: string
  updatedAt: string
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

export type GenerationTask = {
  id: string
  userId: string
  modelId: string
  providerId: string
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
  resultJson?: unknown
  resultUrl?: string | null
  resultUrls?: string[]
  thumbnailUrl?: string | null
  thumbnailUrls?: string[]
  referenceImageUrl?: string | null
  createdAt: string
  updatedAt: string
}

function summarizeValue(value: unknown): unknown {
  if (typeof value === 'string') {
    if (value.startsWith('data:image/')) {
      return `data:image/*;base64,length=${value.length}`
    }
    if (value.length > 500) {
      return `${value.slice(0, 500)}... length=${value.length}`
    }
    return value
  }

  if (Array.isArray(value)) {
    return value.map(summarizeValue)
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, summarizeValue(item)]),
    )
  }

  return value
}

function summarizeTask(task: GenerationTask) {
  return {
    id: task.id,
    status: task.status,
    modelId: task.modelId,
    sizeTier: task.sizeTier,
    size: task.size,
    quantity: task.quantity,
    costCredits: task.costCredits,
    remainingCredits: task.remainingCredits,
    durationSeconds: task.durationSeconds,
    errorMessage: task.errorMessage,
    resultUrl: task.resultUrl ? summarizeValue(task.resultUrl) : null,
    resultUrls: task.resultUrls?.map((url) => summarizeValue(url)),
    thumbnailUrl: task.thumbnailUrl,
    thumbnailUrls: task.thumbnailUrls,
    resultJson: summarizeValue(task.resultJson),
  }
}

async function readErrorMessage(response: Response) {
  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    const error = await response.json().catch(() => null)
    if (error && typeof error === 'object' && 'message' in error) {
      return String((error as { message?: unknown }).message || '请求失败')
    }
  }

  const text = await response.text().catch(() => '')
  return text || '请求失败'
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const method = options?.method ?? 'GET'
  const isGenerationLog = path.startsWith('/api/generate') || path.startsWith('/api/tasks')

  if (isGenerationLog) {
    console.info('[api:request]', {
      method,
      path,
      body: options?.body ? summarizeValue(JSON.parse(String(options.body))) : undefined,
    })
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  })

  if (!response.ok) {
    const message = await readErrorMessage(response)
    if (isGenerationLog) {
      console.error('[api:error]', {
        method,
        path,
        status: response.status,
        error: message,
      })
    }
    throw new Error(message)
  }

  const json = await response.json() as T
  if (isGenerationLog) {
    const maybeData = (json as { data?: unknown }).data
    console.info('[api:response]', {
      method,
      path,
      status: response.status,
      data: maybeData && typeof maybeData === 'object' && 'status' in maybeData
        ? summarizeTask(maybeData as GenerationTask)
        : summarizeValue(maybeData),
    })
  }

  return json
}

export const clientApi = {
  async login(input: { email: string; password: string }) {
    return request<{ data: CurrentUser }>('/api/users/login', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },

  async register(input: { email: string; password: string }) {
    return request<{ data: CurrentUser }>('/api/users/register', {
      method: 'POST',
      body: JSON.stringify({
        email: input.email,
        password: input.password,
      }),
    })
  },

  async verifyEmail(token: string) {
    return request<{ data: CurrentUser }>('/api/users/verify-email', {
      method: 'POST',
      body: JSON.stringify({ token }),
    })
  },

  async forgotPassword(email: string) {
    return request<{ data: { sent: boolean } }>('/api/users/password/forgot', {
      method: 'POST',
      body: JSON.stringify({ email }),
    })
  },

  async resetPassword(input: { token: string; password: string }) {
    return request<{ data: { reset: boolean } }>('/api/users/password/reset', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },

  async getCurrentUser(id: string) {
    return request<{ data: CurrentUser }>(`/api/users/${id}/profile`)
  },

  async listModels() {
    return request<{ data: AiModel[] }>('/api/models')
  },

  async getSettings() {
    return request<{ data: SystemSettings }>('/api/settings')
  },

  async generateImage(input: {
    userId: string
    modelId: string
    prompt: string
    sizeTier: '1k' | '2k' | '4k'
    size: string
    quantity: number
    referenceImageUrl?: string
  }) {
    return request<{ data: GenerationTask }>('/api/generate/image', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },

  async getTask(id: string) {
    return request<{ data: GenerationTask }>(`/api/tasks/${id}`)
  },

  async listTasks() {
    return request<{ data: GenerationTask[] }>('/api/tasks')
  },

  async estimateTaskDuration(input: {
    modelId: string
    capability: AiModelCapability
    sizeTier: '1k' | '2k' | '4k'
    size: string
    quantity: number
  }) {
    const params = new URLSearchParams({
      modelId: input.modelId,
      capability: input.capability,
      sizeTier: input.sizeTier,
      size: input.size,
      quantity: String(input.quantity),
    })
    return request<{ data: { estimatedSeconds: number; source: 'history' | 'default' } }>(
      `/api/tasks/estimate?${params.toString()}`,
    )
  },
}
