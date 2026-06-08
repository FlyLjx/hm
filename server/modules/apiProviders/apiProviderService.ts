import { randomUUID } from 'node:crypto'
import { AppError } from '../../shared/AppError.js'
import { ApiProviderRepository } from './apiProviderRepository.js'
import type {
  ApiProvider,
  ApiProviderCapability,
  ApiProviderStatus,
  ApiProviderType,
} from './apiProviderTypes.js'

type CreateApiProviderInput = {
  name: string
  type: ApiProviderType
  capability: ApiProviderCapability
  baseUrl: string
  apiKey: string
}

type UpdateApiProviderInput = Partial<CreateApiProviderInput> & {
  status?: ApiProviderStatus
}

type FetchApiProviderModelsInput = Pick<CreateApiProviderInput, 'type' | 'capability' | 'baseUrl' | 'apiKey'>

type ModelResponseItem = {
  id?: unknown
  name?: unknown
  model?: unknown
  price?: unknown
  pricing?: unknown
  cost?: unknown
  input_price?: unknown
  output_price?: unknown
  price_1k?: unknown
  price_2k?: unknown
  price_4k?: unknown
  cost_1k?: unknown
  cost_2k?: unknown
  cost_4k?: unknown
  metadata?: unknown
}

type NewApiPricingItem = {
  model_name?: unknown
  model?: unknown
  name?: unknown
  model_price?: unknown
  price?: unknown
  input_price?: unknown
  output_price?: unknown
  quota_type?: unknown
}

type NewApiPricingPayload = {
  success?: unknown
  data?: unknown
}

type NewApiRatioConfigPayload = {
  success?: unknown
  data?: {
    model_price?: Record<string, unknown>
    model_ratio?: Record<string, unknown>
    completion_ratio?: Record<string, unknown>
  }
}

export type RemoteModelPrice = {
  cost1k: number
  cost2k: number
  cost4k: number
}

export type RemoteModel = RemoteModelPrice & {
  name: string
}

export type ApiProviderTestResult = {
  ok: boolean
  status: 'success' | 'failed'
  statusCode: number | null
  durationMs: number
  endpoint: string
  modelCount: number
  message: string
}

function readNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

function readObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function readRemoteModelPrice(item: ModelResponseItem): RemoteModelPrice {
  const pricing = readObject(item.pricing)
  const price = readObject(item.price)
  const cost = readObject(item.cost)
  const metadata = readObject(item.metadata)
  const source: Record<string, unknown> = {
    ...metadata,
    ...price,
    ...cost,
    ...pricing,
    ...readObject(item),
  }

  const cost1k =
    readNumber(source['cost_1k']) ??
    readNumber(source['price_1k']) ??
    readNumber(source['1k']) ??
    readNumber(source['low']) ??
    readNumber(source['base']) ??
    readNumber(source['price']) ??
    readNumber(source['cost']) ??
    0
  const cost2k =
    readNumber(source['cost_2k']) ??
    readNumber(source['price_2k']) ??
    readNumber(source['2k']) ??
    readNumber(source['medium']) ??
    cost1k
  const cost4k =
    readNumber(source['cost_4k']) ??
    readNumber(source['price_4k']) ??
    readNumber(source['4k']) ??
    readNumber(source['high']) ??
    cost2k

  return { cost1k, cost2k, cost4k }
}

function priceToTieredCost(price: number): RemoteModelPrice {
  return {
    cost1k: price,
    cost2k: price,
    cost4k: price,
  }
}

function hasPrice(price: RemoteModelPrice) {
  return price.cost1k > 0 || price.cost2k > 0 || price.cost4k > 0
}

function normalizeModelNameForPrice(modelName: string) {
  return modelName
    .replace(/(?:^|[-_\s])(?:\d{3,5}\s*[xX*×]\s*\d{3,5})(?=$|[-_\s])/g, '')
    .replace(/(?:^|[-_\s])(?:[1248]k|[1248]K)(?=$|[-_\s])/g, '')
    .replace(/(?:^|[-_\s])(?:\d{1,2}\s*[xX*×]\s*\d{1,2})(?=$|[-_\s])/g, '')
    .replace(/(?:^|[-_\s])(?:\d+\s*[xX*×]\s*\d+)(?=$|[-_\s])/g, '')
    .replace(/[-_\s]+$/g, '')
    .trim()
}

function readPricingItemModelName(item: NewApiPricingItem) {
  const name = item.model_name ?? item.model ?? item.name
  return typeof name === 'string' && name.length > 0 ? name : ''
}

function readPricingItemPrice(item: NewApiPricingItem): RemoteModelPrice {
  const modelPrice = readNumber(item.model_price)
  const price = readNumber(item.price)
  const inputPrice = readNumber(item.input_price)
  const outputPrice = readNumber(item.output_price)
  const value = modelPrice ?? price ?? inputPrice ?? outputPrice ?? 0
  return priceToTieredCost(value)
}

function setPriceAliases(priceMap: Map<string, RemoteModelPrice>, modelName: string, price: RemoteModelPrice) {
  if (!modelName || !hasPrice(price)) return
  priceMap.set(modelName, price)
  const normalizedName = normalizeModelNameForPrice(modelName)
  if (normalizedName && normalizedName !== modelName) {
    priceMap.set(normalizedName, price)
  }
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

  async testProvider(id: string): Promise<ApiProviderTestResult> {
    const provider = await this.apiProviderRepository.findById(id)
    if (!provider) {
      throw new AppError(404, '接口配置不存在')
    }

    const endpoint = this.createModelsEndpoint(provider.baseUrl)
    const startedAt = Date.now()
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)

    try {
      const response = await fetch(endpoint, {
        headers: {
          Authorization: `Bearer ${provider.apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      })
      const durationMs = Date.now() - startedAt
      const payload = await response.json().catch(() => null) as { data?: unknown; models?: unknown; error?: { message?: unknown }; message?: unknown } | null
      const modelList = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload?.models) ? payload.models : []
      const upstreamMessage = typeof payload?.error?.message === 'string'
        ? payload.error.message
        : typeof payload?.message === 'string'
          ? payload.message
          : ''

      return {
        ok: response.ok,
        status: response.ok ? 'success' : 'failed',
        statusCode: response.status,
        durationMs,
        endpoint,
        modelCount: modelList.length,
        message: response.ok
          ? `连接成功，模型 ${modelList.length} 个`
          : upstreamMessage || `连接失败：HTTP ${response.status}`,
      }
    } catch (error) {
      const durationMs = Date.now() - startedAt
      const isAbort = error instanceof Error && error.name === 'AbortError'
      return {
        ok: false,
        status: 'failed',
        statusCode: null,
        durationMs,
        endpoint,
        modelCount: 0,
        message: isAbort ? '连接超时：超过 15000ms' : error instanceof Error ? error.message : '连接失败',
      }
    } finally {
      clearTimeout(timeout)
    }
  }

  async fetchModels(input: FetchApiProviderModelsInput) {
    const models = await this.fetchModelDetails(input)
    return models.map((model) => model.name)
  }

  async fetchModelDetails(input: FetchApiProviderModelsInput): Promise<RemoteModel[]> {
    const [models, priceMap] = await Promise.all([
      this.fetchOpenAiModelDetails(input),
      this.fetchNewApiPriceMap(input),
    ])

    return models.map((model) => {
      if (hasPrice(model)) return model
      const price =
        priceMap.get(model.name) ??
        priceMap.get(normalizeModelNameForPrice(model.name))
      return price ? { ...model, ...price } : model
    })
  }

  private async fetchOpenAiModelDetails(input: FetchApiProviderModelsInput): Promise<RemoteModel[]> {
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
      data?: Array<ModelResponseItem | string>
      models?: Array<ModelResponseItem | string>
    }
    const modelList = Array.isArray(payload.data) ? payload.data : payload.models

    if (!Array.isArray(modelList)) {
      throw new AppError(502, '模型接口返回格式不正确')
    }

    return modelList
      .map((item) => {
        if (typeof item === 'string') {
          return {
            name: item,
            cost1k: 0,
            cost2k: 0,
            cost4k: 0,
          }
        }

        const name = item.id ?? item.name ?? item.model
        if (typeof name !== 'string' || name.length === 0) {
          return null
        }

        return {
          name,
          ...readRemoteModelPrice(item),
        }
      })
      .filter((model): model is RemoteModel => Boolean(model))
  }

  private createModelsEndpoint(baseUrl: string) {
    const normalizedBaseUrl = baseUrl.replace(/\/+$/, '')
    if (normalizedBaseUrl.endsWith('/v1')) {
      return `${normalizedBaseUrl}/models`
    }
    return `${normalizedBaseUrl}/v1/models`
  }

  private async fetchNewApiPriceMap(input: FetchApiProviderModelsInput) {
    const [pricingMap, ratioConfigMap] = await Promise.all([
      this.fetchNewApiPricing(input).catch(() => new Map<string, RemoteModelPrice>()),
      this.fetchNewApiRatioConfig(input).catch(() => new Map<string, RemoteModelPrice>()),
    ])
    return new Map([...ratioConfigMap, ...pricingMap])
  }

  private async fetchNewApiPricing(input: FetchApiProviderModelsInput) {
    const response = await fetch(this.createApiEndpoint(input.baseUrl, '/api/pricing'), {
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      throw new AppError(response.status, '获取模型价格失败')
    }

    const payload = (await response.json()) as NewApiPricingPayload
    const items = Array.isArray(payload.data) ? payload.data : []
    const priceMap = new Map<string, RemoteModelPrice>()

    items.forEach((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return
      const pricingItem = item as NewApiPricingItem
      setPriceAliases(priceMap, readPricingItemModelName(pricingItem), readPricingItemPrice(pricingItem))
    })

    return priceMap
  }

  private async fetchNewApiRatioConfig(input: FetchApiProviderModelsInput) {
    const response = await fetch(this.createApiEndpoint(input.baseUrl, '/api/ratio_config'), {
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      throw new AppError(response.status, '获取模型倍率失败')
    }

    const payload = (await response.json()) as NewApiRatioConfigPayload
    const priceMap = new Map<string, RemoteModelPrice>()
    const modelPrice = payload.data?.model_price ?? {}
    const modelRatio = payload.data?.model_ratio ?? {}

    Object.entries({ ...modelRatio, ...modelPrice }).forEach(([modelName, value]) => {
      const price = readNumber(value)
      if (price !== undefined) {
        setPriceAliases(priceMap, modelName, priceToTieredCost(price))
      }
    })

    return priceMap
  }

  private createApiEndpoint(baseUrl: string, path: string) {
    const normalizedBaseUrl = baseUrl.replace(/\/+$/, '').replace(/\/v1$/, '')
    return `${normalizedBaseUrl}${path}`
  }
}
