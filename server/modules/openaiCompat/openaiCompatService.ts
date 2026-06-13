import { randomUUID } from 'node:crypto'
import { AppError } from '../../shared/AppError.js'
import { getRequestIp } from '../../shared/requestIp.js'
import { ApiKeyService, type AuthenticatedApiKey } from '../apiKeys/apiKeyService.js'
import { ApiLogRepository } from '../apiLogs/apiLogRepository.js'
import { ApiProviderRepository } from '../apiProviders/apiProviderRepository.js'
import { CreditLogRepository } from '../creditLogs/creditLogRepository.js'
import { GenerationService } from '../generation/generationService.js'
import { ModelRepository } from '../models/modelRepository.js'
import { SettingService } from '../settings/settingService.js'
import { TaskRepository } from '../tasks/taskRepository.js'
import type { GenerationSizeTier, GenerationTask } from '../tasks/taskTypes.js'
import { UserRepository } from '../users/userRepository.js'
import type { Request } from 'express'
import type { Response } from 'express'
import { ZodError } from 'zod'

type CompatImageGenerationInput = {
  model: string
  prompt: string
  n: number
  size?: string
  aspect_ratio?: string
  ratio?: string
  size_tier?: string
  resolution?: string
  response_format: 'url'
  quality?: string
  background?: string
  output_format?: 'png' | 'jpeg' | 'jpg' | 'webp'
  stream?: boolean
}

type CompatImageEditInput = CompatImageGenerationInput & {
  image?: unknown
  image_url?: string | string[]
  mask?: unknown
}

type CompatChatCompletionInput = {
  model: string
  messages: Array<Record<string, unknown>>
  stream?: boolean
  [key: string]: unknown
}

type CompatResponsesInput = {
  model: string
  input: unknown
  stream?: boolean
  [key: string]: unknown
}

const imageWaitTimeoutMs = 8 * 60 * 1000
const imageWaitIntervalMs = 1200
const compatSizeMap: Record<string, Record<GenerationSizeTier, string>> = {
  '1:1': { '1k': '1024x1024', '2k': '2048x2048', '4k': '3072x3072' },
  '16:9': { '1k': '1536x864', '2k': '2048x1152', '4k': '3072x1728' },
  '9:16': { '1k': '864x1536', '2k': '1152x2048', '4k': '1728x3072' },
  '4:3': { '1k': '1536x1152', '2k': '2048x1536', '4k': '3072x2304' },
  '3:4': { '1k': '1152x1536', '2k': '1536x2048', '4k': '2304x3072' },
  '3:2': { '1k': '1536x1024', '2k': '2048x1360', '4k': '3072x2048' },
  '2:3': { '1k': '1024x1536', '2k': '1360x2048', '4k': '2048x3072' },
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function getBearerToken(req: Request) {
  const authorization = req.get('authorization') || ''
  const match = authorization.match(/^Bearer\s+(.+)$/i)
  if (match?.[1]) return match[1].trim()
  const xApiKey = req.get('x-api-key')
  return xApiKey?.trim() || ''
}

function getOpenAiBaseUrl(baseUrl: string) {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '')
  return normalizedBaseUrl.endsWith('/v1') ? normalizedBaseUrl : `${normalizedBaseUrl}/v1`
}

function sizeToTier(size: string): GenerationSizeTier {
  const match = size.match(/^(\d+)x(\d+)$/)
  const maxSide = match ? Math.max(Number(match[1]), Number(match[2])) : 1024
  if (maxSide >= 3000) return '4k'
  if (maxSide >= 2000) return '2k'
  return '1k'
}

function normalizeSizeTier(value?: string | null): GenerationSizeTier | null {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === '1k' || normalized === '2k' || normalized === '4k') return normalized
  return null
}

function normalizeAspectRatio(value?: string | null) {
  const normalized = String(value || '')
    .normalize('NFKC')
    .trim()
    .replace(/[xX*×]/g, ':')
    .replace(/\s+/g, '')
  const match = normalized.match(/^(\d{1,2}):(\d{1,2})$/)
  if (!match) return null
  return `${Number(match[1])}:${Number(match[2])}`
}

function getSizeForRatio(ratio: string | null, sizeTier: GenerationSizeTier) {
  return compatSizeMap[ratio || '']?.[sizeTier] || compatSizeMap['1:1'][sizeTier]
}

function getSizeTierFromModelName(modelName: string): GenerationSizeTier | null {
  const match = modelName.match(/(?:^|[-_\s])([124])k(?=$|[-_\s])/i)
  return normalizeSizeTier(match?.[1] ? `${match[1]}k` : null)
}

function getRatioFromModelName(modelName: string) {
  const matches = Array.from(modelName.matchAll(/(?:^|[-_\s])(\d{1,2})\s*[xX*×]\s*(\d{1,2})(?=$|[-_\s])/g))
  const lastMatch = matches.at(-1)
  if (!lastMatch) return null
  return `${Number(lastMatch[1])}:${Number(lastMatch[2])}`
}

function getRatioFromSize(size?: string | null) {
  const match = String(size || '').match(/^(\d+)x(\d+)$/)
  if (!match) return null
  const width = Number(match[1])
  const height = Number(match[2])
  if (!width || !height) return null
  const divisor = gcd(width, height)
  return `${width / divisor}:${height / divisor}`
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b)
}

function resolveCompatImageSize(input: CompatImageGenerationInput, modelName: string) {
  const explicitTier =
    normalizeSizeTier(input.size_tier) ||
    normalizeSizeTier(input.resolution) ||
    normalizeSizeTier(input.quality)
  if (input.size) {
    return {
      size: input.size,
      sizeTier: explicitTier || sizeToTier(input.size),
      aspectRatio: getRatioFromSize(input.size),
    }
  }
  const aspectRatio =
    normalizeAspectRatio(input.aspect_ratio) ||
    normalizeAspectRatio(input.ratio) ||
    getRatioFromModelName(modelName) ||
    '1:1'
  const sizeTier = explicitTier || getSizeTierFromModelName(modelName) || '1k'
  return {
    size: getSizeForRatio(aspectRatio, sizeTier),
    sizeTier,
    aspectRatio,
  }
}

function normalizeOutputFormat(value?: string | null) {
  const normalized = String(value || 'png').toLowerCase()
  if (normalized === 'jpg') return 'jpeg'
  if (normalized === 'jpeg' || normalized === 'webp') return normalized
  return 'png'
}

function extractTextFromContent(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (typeof item === 'string') return item
      if (!item || typeof item !== 'object') return ''
      const payload = item as Record<string, unknown>
      if (typeof payload.text === 'string') return payload.text
      if (typeof payload.content === 'string') return payload.content
      return ''
    }).filter(Boolean).join('\n')
  }
  return ''
}

function summarizeMessages(messages: Array<Record<string, unknown>>) {
  return messages.map((message) => ({
    role: message.role,
    text: extractTextFromContent(message.content).slice(0, 1000),
  }))
}

function extractResponseText(payload: unknown): string {
  if (typeof payload === 'string') return payload
  if (!payload || typeof payload !== 'object') return ''
  const value = payload as Record<string, unknown>
  const direct = value.content ?? value.text ?? value.message ?? value.output_text
  if (typeof direct === 'string') return direct
  const choices = value.choices
  if (Array.isArray(choices)) {
    return choices.map((choice) => {
      if (!choice || typeof choice !== 'object') return ''
      const item = choice as Record<string, unknown>
      const message = item.message
      if (message && typeof message === 'object' && typeof (message as { content?: unknown }).content === 'string') {
        return String((message as { content: unknown }).content)
      }
      const delta = item.delta
      if (delta && typeof delta === 'object' && typeof (delta as { content?: unknown }).content === 'string') {
        return String((delta as { content: unknown }).content)
      }
      return typeof item.text === 'string' ? item.text : ''
    }).filter(Boolean).join('\n')
  }
  const output = value.output
  if (Array.isArray(output)) {
    return output.map((item) => extractResponseText(item)).filter(Boolean).join('\n')
  }
  const content = value.content
  if (Array.isArray(content)) {
    return content.map((item) => extractResponseText(item)).filter(Boolean).join('\n')
  }
  return ''
}

function normalizeChatCompletionPayload(payload: unknown, model: string) {
  if (payload && typeof payload === 'object' && Array.isArray((payload as { choices?: unknown }).choices)) return payload
  const content = extractResponseText(payload)
  return {
    id: `chatcmpl-${randomUUID()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{
      index: 0,
      message: {
        role: 'assistant',
        content,
      },
      finish_reason: 'stop',
    }],
    usage: null,
  }
}

function extractImageValue(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (!value || typeof value !== 'object') return null
  const payload = value as Record<string, unknown>
  if (typeof payload.url === 'string') return payload.url
  if (payload.image_url && typeof payload.image_url === 'object' && typeof (payload.image_url as { url?: unknown }).url === 'string') {
    return String((payload.image_url as { url: unknown }).url)
  }
  return null
}

function normalizeImageInputs(input: CompatImageEditInput) {
  const rawImages = input.image_url
    ? Array.isArray(input.image_url) ? input.image_url : [input.image_url]
    : Array.isArray(input.image) ? input.image.map(extractImageValue) : [extractImageValue(input.image)]
  return rawImages.filter((item): item is string => Boolean(item))
}

function absoluteUrl(req: Request, path: string) {
  const protocol = req.protocol
  return `${protocol}://${req.get('host')}${path}`
}

async function taskToOpenAiImageResponse(req: Request, task: GenerationTask) {
  const urls = task.resultUrls || []
  return {
    created: Math.floor(Date.now() / 1000),
    data: urls.map((url) => {
      const resolvedUrl = url.startsWith('http') || url.startsWith('data:image/')
        ? url
        : absoluteUrl(req, url)
      return { url: resolvedUrl }
    }),
  }
}

function createOpenAiError(error: unknown) {
  if (error instanceof ZodError) {
    return {
      statusCode: 400,
      body: {
        error: {
          message: error.issues[0]?.message || '请求参数错误',
          type: 'invalid_request_error',
          code: null,
        },
      },
    }
  }
  const statusCode = error instanceof AppError ? error.statusCode : 500
  const message = error instanceof Error ? error.message : '请求失败'
  return {
    statusCode,
    body: {
      error: {
        message,
        type: statusCode === 401 ? 'invalid_api_key' : 'api_error',
        code: null,
      },
    },
  }
}

function publicModelId(model: Awaited<ReturnType<ModelRepository['findAll']>>[number]) {
  return String(model.displayName || model.modelName || '').trim()
}

function normalizePublicModelId(value: string) {
  return value
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function uniqueOpenAiModels(models: Awaited<ReturnType<ModelRepository['findAll']>>) {
  const modelMap = new Map<string, {
    model: Awaited<ReturnType<ModelRepository['findAll']>>[number]
    variants: Awaited<ReturnType<ModelRepository['findAll']>>
  }>()
  for (const model of models) {
    if (model.status !== 'active') continue
    if (model.providerStatus !== 'active') continue
    const id = publicModelId(model)
    const key = normalizePublicModelId(id)
    if (!key) continue
    const existing = modelMap.get(key)
    if (!existing) {
      modelMap.set(key, { model, variants: [model] })
      continue
    }
    existing.variants.push(model)
  }
  return [...modelMap.values()].sort((a, b) => publicModelId(a.model).localeCompare(publicModelId(b.model), 'zh-CN'))
}

export class OpenAiCompatService {
  constructor(
    private readonly apiKeyService = new ApiKeyService(),
    private readonly modelRepository = new ModelRepository(),
    private readonly apiProviderRepository = new ApiProviderRepository(),
    private readonly generationService = new GenerationService(),
    private readonly taskRepository = new TaskRepository(),
    private readonly apiLogRepository = new ApiLogRepository(),
    private readonly userRepository = new UserRepository(),
    private readonly creditLogRepository = new CreditLogRepository(),
    private readonly settingService = new SettingService(),
  ) {}

  async authenticate(req: Request) {
    return this.apiKeyService.authenticate(getBearerToken(req))
  }

  async listModels() {
    const models = await this.modelRepository.findAll()
    const uniqueModels = uniqueOpenAiModels(models)
    return {
      object: 'list',
      data: uniqueModels
        .map((entry) => ({
          id: publicModelId(entry.model),
          object: 'model',
          created: Math.floor(new Date(entry.model.createdAt).getTime() / 1000),
          owned_by: 'aipi',
          variants: entry.variants
            .map((variant) => {
              const ratio = getRatioFromModelName(variant.modelName)
              const sizeTier = getSizeTierFromModelName(variant.modelName)
              return {
                id: variant.modelName,
                object: 'model.variant',
                ratio,
                aspect_ratio: ratio,
                size_tier: sizeTier,
                size: sizeTier ? getSizeForRatio(ratio, sizeTier) : null,
              }
            })
            .sort((a, b) => `${a.ratio || ''}:${a.size_tier || ''}:${a.id}`.localeCompare(`${b.ratio || ''}:${b.size_tier || ''}:${b.id}`, 'zh-CN')),
        })),
      meta: {
        total_count: models.length,
        unique_count: uniqueModels.length,
      },
    }
  }

  getBalance(auth: AuthenticatedApiKey) {
    return {
      object: 'balance',
      balance: auth.user.credits,
      credits: auth.user.credits,
      currency: 'credits',
      user: {
        id: auth.user.id,
        email: auth.user.email,
      },
      api_key: {
        id: auth.apiKey.id,
        name: auth.apiKey.name,
        prefix: auth.apiKey.keyPrefix,
        status: auth.apiKey.status,
        last_used_at: auth.apiKey.lastUsedAt ?? null,
      },
    }
  }

  async generateImage(req: Request, auth: AuthenticatedApiKey, input: CompatImageGenerationInput | CompatImageEditInput) {
    const startedAt = Date.now()
    const endpoint = req.path
    const model = await this.modelRepository.findActiveByNameOrDisplayName(input.model, 'chat_image')
    if (!model) throw new AppError(404, '模型不存在或已禁用')
    const resolvedSize = resolveCompatImageSize(input, model.modelName)
    const settings = await this.settingService.getSettings()
    const isEdit = endpoint.includes('/edits')
    const editInput = input as CompatImageEditInput
    const referenceImageUrls = isEdit ? normalizeImageInputs(editInput) : []
    const maskImageUrl = isEdit ? extractImageValue(editInput.mask) || undefined : undefined
    const task = await this.generationService.generateImage({
      userId: auth.user.id,
      modelId: model.id,
      prompt: input.prompt,
      sizeTier: resolvedSize.sizeTier,
      size: resolvedSize.size,
      transparentBackground: input.background === 'transparent',
      outputFormat: normalizeOutputFormat(input.output_format),
      quantity: input.n,
      referenceImageUrl: referenceImageUrls[0],
      referenceImageUrls,
      maskImageUrl,
      openaiParams: {
        response_format: input.response_format,
        quality: input.quality,
      },
      streamGenerationEnabled: settings.streamGenerationEnabled,
      userIp: getRequestIp(req),
    })
    if (!task) throw new AppError(500, '创建生成任务失败')

    const finalTask = await this.waitForImageTask(task.id)
    await this.apiLogRepository.create({
      direction: 'downstream',
      taskId: finalTask.id,
      userId: auth.user.id,
      apiKeyId: auth.apiKey.id,
      apiKeyName: auth.apiKey.name,
      endpoint,
      phase: isEdit ? 'openai-images-edits' : 'openai-images-generations',
      method: req.method,
      status: finalTask.status === 'success' ? 'success' : 'failed',
      statusCode: finalTask.status === 'success' ? 200 : 500,
      durationMs: Date.now() - startedAt,
      requestSummary: {
        model: input.model,
        prompt: input.prompt,
        n: input.n,
        size: resolvedSize.size,
        aspectRatio: resolvedSize.aspectRatio,
        sizeTier: resolvedSize.sizeTier,
        responseFormat: input.response_format,
        referenceImageCount: referenceImageUrls.length,
        mask: Boolean(maskImageUrl),
      },
      responseSummary: {
        taskId: finalTask.id,
        status: finalTask.status,
        imageCount: finalTask.resultUrls?.length ?? 0,
        costCredits: finalTask.costCredits,
        remainingCredits: finalTask.remainingCredits,
      },
      errorMessage: finalTask.status === 'success' ? null : finalTask.errorMessage ?? '图片生成失败',
    })

    if (finalTask.status !== 'success') {
      throw new AppError(500, finalTask.errorMessage || '图片生成失败')
    }
    return taskToOpenAiImageResponse(req, finalTask)
  }

  async chatCompletion(req: Request, auth: AuthenticatedApiKey, input: CompatChatCompletionInput) {
    if (input.stream) {
      throw new AppError(400, '流式聊天请使用 chatCompletionStream')
    }
    return this.forwardTextCompletion(req, auth, input, 'chat/completions', {
      ...input,
      messages: input.messages,
    }, 'openai-chat-completions', summarizeMessages(input.messages))
  }

  async responses(req: Request, auth: AuthenticatedApiKey, input: CompatResponsesInput) {
    return this.forwardTextCompletion(req, auth, input, 'responses', input, 'openai-responses', input.input)
  }

  async chatCompletionStream(req: Request, res: Response, auth: AuthenticatedApiKey, input: CompatChatCompletionInput) {
    return this.forwardTextCompletionStream(req, res, auth, input, 'chat/completions', {
      ...input,
      messages: input.messages,
    }, 'openai-chat-completions-stream', summarizeMessages(input.messages))
  }

  private async forwardTextCompletion(
    req: Request,
    auth: AuthenticatedApiKey,
    input: { model: string; stream?: boolean; [key: string]: unknown },
    upstreamPath: 'chat/completions' | 'responses',
    requestBodyInput: Record<string, unknown>,
    phase: string,
    requestSummaryPayload: unknown,
  ) {
    const startedAt = Date.now()
    const model = await this.modelRepository.findActiveByNameOrDisplayName(input.model, 'chat_image')
    if (!model) throw new AppError(404, '模型不存在或已禁用')
    const provider = await this.apiProviderRepository.findById(model.providerId)
    if (!provider || provider.status !== 'active') throw new AppError(404, '接口配置不存在或已禁用')
    const costCredits = Math.max(0, Number(model.price1k || 0))
    if (auth.user.credits < costCredits) throw new AppError(402, '用户积分不足')

    const endpoint = `${getOpenAiBaseUrl(provider.baseUrl)}/${upstreamPath}`
    const requestBody = {
      ...requestBodyInput,
      model: model.modelName,
      stream: false,
    }

    let statusCode = 200
    let responsePayload: unknown = null
    let responseText = ''
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${provider.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      })
      statusCode = response.status
      responseText = await response.text()
      responsePayload = responseText ? tryParseJson(responseText) : null
      if (!response.ok) {
        throw new AppError(response.status, readUpstreamError(responsePayload) || `上游聊天接口调用失败：HTTP ${response.status}`)
      }
      responsePayload = upstreamPath === 'chat/completions'
        ? normalizeChatCompletionPayload(responsePayload, input.model)
        : responsePayload

      const updatedUser = costCredits > 0
        ? await this.userRepository.deductCredits(auth.user.id, costCredits)
        : auth.user
      await this.creditLogRepository.create({
        id: randomUUID(),
        userId: auth.user.id,
        type: 'deduct',
        amount: costCredits,
        balanceAfter: updatedUser?.credits ?? auth.user.credits - costCredits,
        remark: `API 聊天调用：${model.displayName || model.modelName}`,
        createdAt: new Date().toISOString(),
      })
      await this.apiLogRepository.create({
        direction: 'downstream',
        userId: auth.user.id,
        apiKeyId: auth.apiKey.id,
        apiKeyName: auth.apiKey.name,
        providerId: provider.id,
        providerType: provider.type,
        endpoint: req.path,
        phase,
        method: req.method,
        status: 'success',
        statusCode,
        durationMs: Date.now() - startedAt,
        requestSummary: {
          model: input.model,
          input: requestSummaryPayload,
        },
        responseSummary: responsePayload,
      })
      return responsePayload
    } catch (error) {
      await this.apiLogRepository.create({
        direction: 'downstream',
        userId: auth.user.id,
        apiKeyId: auth.apiKey.id,
        apiKeyName: auth.apiKey.name,
        providerId: provider.id,
        providerType: provider.type,
        endpoint: req.path,
        phase,
        method: req.method,
        status: 'failed',
        statusCode,
        durationMs: Date.now() - startedAt,
        requestSummary: {
          model: input.model,
          input: requestSummaryPayload,
        },
        responseSummary: responsePayload ?? responseText,
        errorMessage: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }

  private async forwardTextCompletionStream(
    req: Request,
    res: Response,
    auth: AuthenticatedApiKey,
    input: { model: string; stream?: boolean; [key: string]: unknown },
    upstreamPath: 'chat/completions',
    requestBodyInput: Record<string, unknown>,
    phase: string,
    requestSummaryPayload: unknown,
  ) {
    const startedAt = Date.now()
    const model = await this.modelRepository.findActiveByNameOrDisplayName(input.model, 'chat_image')
    if (!model) throw new AppError(404, '模型不存在或已禁用')
    const provider = await this.apiProviderRepository.findById(model.providerId)
    if (!provider || provider.status !== 'active') throw new AppError(404, '接口配置不存在或已禁用')
    const costCredits = Math.max(0, Number(model.price1k || 0))
    if (auth.user.credits < costCredits) throw new AppError(402, '用户积分不足')

    const endpoint = `${getOpenAiBaseUrl(provider.baseUrl)}/${upstreamPath}`
    const requestBody = {
      ...requestBodyInput,
      model: model.modelName,
      stream: true,
    }
    let statusCode = 200
    let responseText = ''
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${provider.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      })
      statusCode = response.status
      if (!response.ok || !response.body) {
        responseText = await response.text()
        const payload = responseText ? tryParseJson(responseText) : null
        throw new AppError(response.status, readUpstreamError(payload) || `上游聊天接口调用失败：HTTP ${response.status}`)
      }

      res.status(200)
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
      res.setHeader('Cache-Control', 'no-cache, no-transform')
      res.setHeader('Connection', 'keep-alive')
      res.setHeader('X-Accel-Buffering', 'no')
      res.flushHeaders?.()

      const reader = response.body.getReader()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        res.write(Buffer.from(value))
      }
      if (!res.writableEnded) res.end()

      const updatedUser = costCredits > 0
        ? await this.userRepository.deductCredits(auth.user.id, costCredits)
        : auth.user
      await this.creditLogRepository.create({
        id: randomUUID(),
        userId: auth.user.id,
        type: 'deduct',
        amount: costCredits,
        balanceAfter: updatedUser?.credits ?? auth.user.credits - costCredits,
        remark: `API 流式聊天调用：${model.displayName || model.modelName}`,
        createdAt: new Date().toISOString(),
      })
      await this.apiLogRepository.create({
        direction: 'downstream',
        userId: auth.user.id,
        apiKeyId: auth.apiKey.id,
        apiKeyName: auth.apiKey.name,
        providerId: provider.id,
        providerType: provider.type,
        endpoint: req.path,
        phase,
        method: req.method,
        status: 'success',
        statusCode,
        durationMs: Date.now() - startedAt,
        requestSummary: {
          model: input.model,
          input: requestSummaryPayload,
          stream: true,
        },
        responseSummary: { stream: true },
      })
    } catch (error) {
      await this.apiLogRepository.create({
        direction: 'downstream',
        userId: auth.user.id,
        apiKeyId: auth.apiKey.id,
        apiKeyName: auth.apiKey.name,
        providerId: provider.id,
        providerType: provider.type,
        endpoint: req.path,
        phase,
        method: req.method,
        status: 'failed',
        statusCode,
        durationMs: Date.now() - startedAt,
        requestSummary: {
          model: input.model,
          input: requestSummaryPayload,
          stream: true,
        },
        responseSummary: responseText,
        errorMessage: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }

  createErrorResponse(error: unknown) {
    return createOpenAiError(error)
  }

  private async waitForImageTask(taskId: string) {
    const deadline = Date.now() + imageWaitTimeoutMs
    while (Date.now() < deadline) {
      const task = await this.taskRepository.findById(taskId)
      if (task && ['success', 'failed', 'canceled'].includes(task.status)) return task
      await sleep(imageWaitIntervalMs)
    }
    throw new AppError(504, '图片生成超时')
  }
}

function readUpstreamError(payload: unknown) {
  if (!payload || typeof payload !== 'object') return ''
  const error = (payload as { error?: unknown }).error
  if (error && typeof error === 'object' && typeof (error as { message?: unknown }).message === 'string') {
    return String((error as { message: unknown }).message)
  }
  if (typeof (payload as { message?: unknown }).message === 'string') return String((payload as { message: unknown }).message)
  return ''
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}
