import { randomUUID } from 'node:crypto'
import { AppError } from '../../shared/AppError.js'
import { ApiProviderRepository } from './apiProviderRepository.js'
import type { ApiProvider, ApiProviderStatus, ApiProviderType } from './apiProviderTypes.js'

type CreateApiProviderInput = {
  name: string
  type: ApiProviderType
  baseUrl: string
  apiKey: string
}

type UpdateApiProviderInput = Partial<CreateApiProviderInput> & {
  status?: ApiProviderStatus
}

type FetchApiProviderModelsInput = Pick<CreateApiProviderInput, 'type' | 'baseUrl' | 'apiKey'>

type ModelResponseItem = {
  id?: unknown
  name?: unknown
  model?: unknown
}

export class ApiProviderService {
  constructor(private readonly apiProviderRepository = new ApiProviderRepository()) {}

  async listProviders() {
    return this.apiProviderRepository.findAll()
  }

  async createProvider(input: CreateApiProviderInput) {
    const now = new Date().toISOString()
    const provider: ApiProvider = {
      id: randomUUID(),
      ...input,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    }

    return this.apiProviderRepository.create(provider)
  }

  async updateProvider(id: string, input: UpdateApiProviderInput) {
    const provider = await this.apiProviderRepository.update(id, input)
    if (!provider) {
      throw new AppError(404, '接口配置不存在')
    }
    return provider
  }

  async deleteProvider(id: string) {
    const deleted = await this.apiProviderRepository.delete(id)
    if (!deleted) {
      throw new AppError(404, '接口配置不存在')
    }
  }

  async fetchModels(input: FetchApiProviderModelsInput) {
    const response = await fetch(this.createModelsEndpoint(input.baseUrl), {
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      throw new AppError(response.status, '获取模型列表失败，请检查 Base URL 和 API Key')
    }

    const payload = (await response.json()) as {
      data?: ModelResponseItem[]
      models?: ModelResponseItem[]
    }
    const modelList = Array.isArray(payload.data) ? payload.data : payload.models

    if (!Array.isArray(modelList)) {
      throw new AppError(502, '模型接口返回格式不正确')
    }

    return modelList
      .map((item) => item.id ?? item.name ?? item.model)
      .filter((model): model is string => typeof model === 'string' && model.length > 0)
  }

  private createModelsEndpoint(baseUrl: string) {
    const normalizedBaseUrl = baseUrl.replace(/\/+$/, '')
    if (normalizedBaseUrl.endsWith('/v1')) {
      return `${normalizedBaseUrl}/models`
    }
    return `${normalizedBaseUrl}/v1/models`
  }
}
