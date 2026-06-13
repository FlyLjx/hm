import { randomUUID } from 'node:crypto'
import { AppError } from '../../shared/AppError.js'
import { ApiLogRepository } from '../apiLogs/apiLogRepository.js'
import { ApiProviderRepository } from '../apiProviders/apiProviderRepository.js'
import type { ApiProvider } from '../apiProviders/apiProviderTypes.js'
import { CreditLogRepository } from '../creditLogs/creditLogRepository.js'
import { ModelRepository } from '../models/modelRepository.js'
import type { AiModel } from '../models/modelTypes.js'
import { SubscriptionService } from '../subscriptions/subscriptionService.js'
import { UserRepository } from '../users/userRepository.js'
import { PromptModerationService } from '../promptModeration/promptModerationService.js'
import { BarkService } from '../notifications/barkService.js'
import { taskEvents } from '../tasks/taskEvents.js'
import { userEvents } from '../users/userEvents.js'
import { TaskRepository } from '../tasks/taskRepository.js'
import type { GenerationSizeTier, GenerationTask } from '../tasks/taskTypes.js'
import {
  combineImageResults,
  extractFinalImagesFromResult,
  extractImagesFromResult,
  getImageExtension,
  hasFinalImageResult,
  hasPartialImagePayload,
  materializeImageResult,
  normalizeImageResult,
  normalizeOutputFormat,
  normalizeReferenceImageUrls,
  omitPartialImagePayload,
  readReferenceImage,
  summarizeImageResult,
  summarizeMaskImage,
  summarizeReferenceImage,
  summarizeReferenceImages,
  uniqueImages,
  type ExtractedImage,
  type GenerationOutputFormat,
} from './generationImages.js'

type GenerateImageInput = {
  userId: string
  modelId: string
  prompt: string
  referenceImageUrl?: string
  referenceImageUrls?: string[]
  maskImageUrl?: string
  sizeTier: GenerationSizeTier
  size?: string
  transparentBackground?: boolean
  outputFormat?: GenerationOutputFormat
  openaiParams?: Record<string, unknown>
  streamGenerationEnabled?: boolean
  quantity: number
  userIp: string
}

const allowedImageSizes: Record<GenerationSizeTier, string[]> = {
  '1k': ['1024x1024', '1536x864', '864x1536', '1536x1152', '1152x1536', '1536x1024', '1024x1536'],
  '2k': ['2048x2048', '2048x1152', '1152x2048', '2048x1536', '1536x2048', '2048x1360', '1360x2048'],
  '4k': ['3072x3072', '3072x1728', '1728x3072', '3072x2304', '2304x3072', '3072x2048', '2048x3072'],
}
const defaultEnabledSizeTiers: GenerationSizeTier[] = ['1k', '2k', '4k']
const defaultImageQuality = 'high'
const generationLogVerbose = process.env.GENERATION_LOG_VERBOSE === '1'
const generationLogPreviewChars = Math.max(80, Number(process.env.GENERATION_LOG_PREVIEW_CHARS || 220))

const apiLogRepository = new ApiLogRepository()

function getModelPrice(model: Awaited<ReturnType<ModelRepository['findById']>>, sizeTier: GenerationSizeTier) {
  if (!model) {
    return 0
  }

  if (sizeTier === '4k') return model.price4k
  if (sizeTier === '2k') return model.price2k
  return model.price1k
}

function getModelCost(model: Awaited<ReturnType<ModelRepository['findById']>>, sizeTier: GenerationSizeTier) {
  if (!model) {
    return 0
  }

  if (sizeTier === '4k') return model.cost4k
  if (sizeTier === '2k') return model.cost2k
  return model.cost1k
}

function getVariantPrice(
  model: Awaited<ReturnType<ModelRepository['findByProviderDisplayNameAndCapability']>>[number] | null | undefined,
  sizeTier: GenerationSizeTier,
) {
  if (!model) return 0
  if (sizeTier === '4k') return model.price4k
  if (sizeTier === '2k') return model.price2k
  return model.price1k
}

function getVariantCost(
  model: Awaited<ReturnType<ModelRepository['findByProviderDisplayNameAndCapability']>>[number] | null | undefined,
  sizeTier: GenerationSizeTier,
) {
  if (!model) return 0
  if (sizeTier === '4k') return model.cost4k
  if (sizeTier === '2k') return model.cost2k
  return model.cost1k
}

function applyDiscount(amount: number, discountPercent: number) {
  const discount = Math.min(100, Math.max(0, discountPercent))
  return Number((amount * (1 - discount / 100)).toFixed(4))
}

function getDefaultSize(sizeTier: GenerationSizeTier) {
  return allowedImageSizes[sizeTier][0]
}

function validateImageSize(sizeTier: GenerationSizeTier, size?: string) {
  const normalizedSize = size ?? getDefaultSize(sizeTier)
  const validSizes = allowedImageSizes[sizeTier]

  if (!validSizes.includes(normalizedSize)) {
    throw new AppError(400, '图片尺寸和清晰度不匹配，请重新选择参数')
  }

  return normalizedSize
}

function getEnabledModelSizeTiers(model: Pick<AiModel, 'enabledSizeTiers'>): GenerationSizeTier[] {
  const tiers = Array.isArray(model.enabledSizeTiers)
    ? model.enabledSizeTiers.filter((item): item is GenerationSizeTier => defaultEnabledSizeTiers.includes(item))
    : []
  return tiers.length ? tiers : defaultEnabledSizeTiers
}

function assertModelSizeTierEnabled(model: Pick<AiModel, 'enabledSizeTiers'>, sizeTier: GenerationSizeTier) {
  if (!getEnabledModelSizeTiers(model).includes(sizeTier)) {
    throw new AppError(400, `当前模型未开放 ${sizeTier.toUpperCase()} 清晰度，请重新选择`)
  }
}

function shouldUseTransparentBackground(input: Pick<GenerateImageInput, 'transparentBackground' | 'outputFormat'>) {
  return Boolean(input.transparentBackground || input.outputFormat === 'png')
}

function getEffectiveOutputFormat(input: Pick<GenerateImageInput, 'transparentBackground' | 'outputFormat'>) {
  return shouldUseTransparentBackground(input) ? 'png' : input.outputFormat
}

function buildImageOutputParams(input: Pick<GenerateImageInput, 'transparentBackground' | 'outputFormat' | 'openaiParams'>) {
  const outputFormat = getEffectiveOutputFormat(input)
  return {
    quality: defaultImageQuality,
    ...(input.openaiParams ?? {}),
    ...(shouldUseTransparentBackground(input) ? { background: 'transparent' } : {}),
    ...(outputFormat ? { output_format: outputFormat } : {}),
  }
}

function buildOpenAiImageRequestBody(input: GenerateImageInput, model: AiModel, quantity: number, provider: ApiProvider) {
  const prompt = buildUpstreamPrompt(input, model)
  return {
    ...buildImageOutputParams(input),
    model: model.modelName,
    prompt,
    size: input.size ?? getDefaultSize(input.sizeTier),
    n: quantity,
    response_format: 'url',
  }
}

function getOpenAiBaseUrl(provider: ApiProvider) {
  const normalizedBaseUrl = provider.baseUrl.replace(/\/+$/, '')
  return normalizedBaseUrl.endsWith('/v1') ? normalizedBaseUrl : `${normalizedBaseUrl}/v1`
}

function isOpenAiCompatibleProvider(provider: ApiProvider) {
  return provider.type === 'custom' || provider.type === 'newapi'
}

function getImageEndpoint(provider: ApiProvider) {
  if (isOpenAiCompatibleProvider(provider)) return `${getOpenAiBaseUrl(provider)}/images/generations`
  return `${provider.baseUrl.replace(/\/+$/, '')}/images/generations`
}

function getImageEditEndpoint(provider: ApiProvider) {
  if (isOpenAiCompatibleProvider(provider)) return `${getOpenAiBaseUrl(provider)}/images/edits`
  return `${provider.baseUrl.replace(/\/+$/, '')}/images/edits`
}

function rewriteUpstreamImageUrl(provider: ApiProvider, value: string) {
  const trimmed = value.trim()
  if (!trimmed || trimmed.startsWith('data:image/')) return value
  const providerUrl = new URL(provider.baseUrl)
  const providerOrigin = `${providerUrl.protocol}//${providerUrl.host}`

  if (trimmed.startsWith('/')) {
    return `${providerOrigin}${trimmed}`
  }

  try {
    const parsed = new URL(trimmed)
    if (!['127.0.0.1', 'localhost', '::1', '0.0.0.0'].includes(parsed.hostname)) return value
    parsed.protocol = providerUrl.protocol
    parsed.host = providerUrl.host
    return parsed.toString()
  } catch {
    return value
  }
}

function rewriteUpstreamResultUrls(value: unknown, provider: ApiProvider, depth = 0): unknown {
  if (!value || depth > 10) return value
  if (typeof value === 'string') return rewriteUpstreamImageUrl(provider, value)
  if (Array.isArray(value)) return value.map((item) => rewriteUpstreamResultUrls(item, provider, depth + 1))
  if (typeof value !== 'object') return value

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      rewriteUpstreamResultUrls(item, provider, depth + 1),
    ]),
  )
}

function getSizeRatio(size?: string | null) {
  const match = size?.match(/^(\d+)x(\d+)$/)
  if (!match) return null
  const width = Number(match[1])
  const height = Number(match[2])
  const divisor = gcd(width, height)
  return `${width / divisor}:${height / divisor}`
}

function buildUpstreamPrompt(input: Pick<GenerateImageInput, 'prompt' | 'size' | 'sizeTier' | 'transparentBackground' | 'outputFormat'>, model: Pick<AiModel, 'appendSizeToPrompt'>) {
  const transparentInstruction = shouldUseTransparentBackground(input)
    ? '背景要求：输出透明背景 PNG，保留主体 Alpha 通道，不要铺白底、灰底或纯色背景。'
    : ''
  if (!model.appendSizeToPrompt) return [input.prompt, transparentInstruction].filter(Boolean).join('\n\n')
  const size = input.size ?? getDefaultSize(input.sizeTier)
  const ratio = getSizeRatio(size)
  return [
    input.prompt,
    transparentInstruction,
    '',
    `画面尺寸要求：比例 ${ratio ?? '按所选尺寸'}，输出尺寸 ${size}，清晰度 ${input.sizeTier.toUpperCase()}。请严格按照该比例和尺寸构图，不要生成其他画幅。`,
  ].filter(Boolean).join('\n')
}

function getStreamEventType(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ''
  const payload = value as Record<string, unknown>
  return [
    payload.type,
    payload.event,
    payload.object,
    payload.status,
  ].filter((item): item is string => typeof item === 'string').join(' ').toLowerCase()
}

function isPartialStreamEvent(value: unknown) {
  const eventType = getStreamEventType(value)
  return /partial|preview|progress|delta|in_progress|generating|queued|submitted/.test(eventType) ||
    hasPartialImagePayload(value)
}

function isExplicitFinalStreamEvent(value: unknown) {
  const eventType = getStreamEventType(value)
  return Boolean(eventType) &&
    /completed|complete|final|done|succeeded|success/.test(eventType) &&
    !/partial|preview|progress|delta|in_progress|generating/.test(eventType)
}

function getSizeTierFromModelName(modelName: string): GenerationSizeTier | null {
  const match = modelName.match(/(?:^|[-_\s])([124])k(?=$|[-_\s])/i)
  if (!match) return null
  const value = `${match[1].toLowerCase()}k`
  return value === '1k' || value === '2k' || value === '4k' ? value : null
}

function getRatioFromModelName(modelName: string) {
  const matches = Array.from(modelName.matchAll(/(?:^|[-_\s])(\d{1,2})\s*[xX*×]\s*(\d{1,2})(?=$|[-_\s])/g))
  const lastMatch = matches.at(-1)
  if (!lastMatch) return null
  return `${Number(lastMatch[1])}:${Number(lastMatch[2])}`
}

function findBestModelVariant(
  models: AiModel[],
  ratio: string | null,
  sizeTier: GenerationSizeTier,
) {
  return models.find((model) => getRatioFromModelName(model.modelName) === ratio && getSizeTierFromModelName(model.modelName) === sizeTier)
    ?? models.find((model) => getRatioFromModelName(model.modelName) === ratio)
    ?? models.find((model) => getSizeTierFromModelName(model.modelName) === sizeTier)
    ?? models[0]
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b)
}

function removeUndefinedFields(value: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined))
}

function compactText(value: string | null | undefined, maxChars = generationLogPreviewChars) {
  if (!value) return null
  const text = String(value).replace(/\s+/g, ' ').trim()
  return {
    length: text.length,
    preview: text.length > maxChars ? `${text.slice(0, maxChars)}...` : text,
  }
}

function collectPromptText(value: unknown, depth = 0): string[] {
  if (!value || depth > 8) return []
  if (typeof value !== 'object') return []
  if (Array.isArray(value)) return value.flatMap((item) => collectPromptText(item, depth + 1))

  const result: string[] = []
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    const normalizedKey = key.toLowerCase()
    if (normalizedKey === 'prompt' && typeof item === 'string') {
      result.push(item)
      continue
    }
    if (normalizedKey === 'text' && typeof item === 'string') {
      result.push(item)
      continue
    }
    if (['url', 'image_url', 'b64_json', 'image', 'mask'].includes(normalizedKey)) {
      continue
    }
    result.push(...collectPromptText(item, depth + 1))
  }
  return result
}

function summarizeGenerationRequestBody(value: unknown) {
  const sanitized = sanitizeLogValue(value)
  if (!sanitized || typeof sanitized !== 'object' || Array.isArray(sanitized)) return sanitized

  const body = sanitized as Record<string, unknown>
  const knownKeys = new Set([
    'model',
    'size',
    'n',
    'quality',
    'output_format',
    'response_format',
    'background',
    'stream',
    'aspect_ratio',
    'partial_images',
    'streamGenerationEnabled',
    'referenceImages',
    'referenceImage',
    'maskImage',
    'messages',
    'input',
    'prompt',
  ])
  const prompt = collectPromptText(body).join('\n')
  const extraKeys = Object.keys(body).filter((key) => !knownKeys.has(key))
  return removeUndefinedFields({
    model: body.model,
    size: body.size,
    n: body.n,
    quality: body.quality,
    outputFormat: body.output_format,
    responseFormat: body.response_format,
    background: body.background,
    stream: body.stream,
    aspectRatio: body.aspect_ratio,
    partialImages: body.partial_images,
    streamGenerationEnabled: body.streamGenerationEnabled,
    prompt: compactText(prompt),
    referenceImages: body.referenceImages ?? body.referenceImage,
    maskImage: body.maskImage,
    messageCount: Array.isArray(body.messages) ? body.messages.length : undefined,
    inputCount: Array.isArray(body.input) ? body.input.length : undefined,
    extraKeys: extraKeys.length ? extraKeys : undefined,
  })
}

function summarizeResponseJsonForLog(value: unknown): unknown {
  const imageSummary = summarizeImageResult(value)
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const payload = value as Record<string, unknown>
    const error = payload.error
    if (error && typeof error === 'object' && !Array.isArray(error)) {
      const errorPayload = error as Record<string, unknown>
      return removeUndefinedFields({
        error: removeUndefinedFields({
          message: typeof errorPayload.message === 'string' ? compactText(errorPayload.message, 360) : errorPayload.message,
          type: errorPayload.type,
          code: errorPayload.code,
          param: errorPayload.param,
          account_email: errorPayload.account_email ? '[redacted]' : undefined,
        }),
      })
    }
    return removeUndefinedFields({
      id: payload.id,
      object: payload.object,
      status: payload.status,
      model: payload.model,
      imageCount: imageSummary.imageCount,
      images: imageSummary.images,
      outputCount: Array.isArray(payload.output) ? payload.output.length : undefined,
      dataCount: Array.isArray(payload.data) ? payload.data.length : undefined,
    })
  }
  return sanitizeLogValue(value)
}

function summarizeResponseTextForLog(value: string | null | undefined) {
  if (!value) return null
  try {
    return summarizeResponseJsonForLog(JSON.parse(value) as unknown)
  } catch {
    return compactText(value, 500)
  }
}

function compactGenerationLogPayload(payload: Record<string, unknown>) {
  const sanitized = sanitizeLogValue(payload)
  if (!sanitized || typeof sanitized !== 'object' || Array.isArray(sanitized)) return sanitized

  return removeUndefinedFields(
    Object.fromEntries(
      Object.entries(sanitized as Record<string, unknown>).map(([key, value]) => {
        if (key === 'body') return [key, summarizeGenerationRequestBody(value)]
        if (key === 'responseText') return [key, summarizeResponseTextForLog(typeof value === 'string' ? value : JSON.stringify(value))]
        if (key === 'responseJson') return [key, summarizeResponseJsonForLog(value)]
        if (key === 'requestSummary' && value && typeof value === 'object' && !Array.isArray(value)) {
          const summary = value as Record<string, unknown>
          return [key, {
            ...summary,
            body: summarizeGenerationRequestBody(summary.body),
          }]
        }
        if (['prompt', 'content', 'reason', 'errorMessage', 'message'].includes(key) && typeof value === 'string') {
          return [key, compactText(value, key === 'prompt' ? generationLogPreviewChars : 500)]
        }
        return [key, value]
      }),
    ),
  )
}

function summarizeValue(value: unknown, depth = 0): unknown {
  if (depth > 5) return '[depth-limit]'
  if (typeof value === 'string') {
    if (value.startsWith('data:image/')) return `data:image/*;length=${value.length}`
    if (value.length > 500) return `${value.slice(0, 500)}... length=${value.length}`
    return value
  }
  if (Array.isArray(value)) return value.slice(0, 8).map((item) => summarizeValue(item, depth + 1))
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, summarizeValue(item, depth + 1)]),
    )
  }
  return value
}

function sanitizeLogValue(value: unknown, depth = 0): unknown {
  if (depth > 8) return '[depth-limit]'
  if (typeof value === 'string') {
    if (value.startsWith('data:image/')) return `data:image/*;length=${value.length}`
    if (/^[A-Za-z0-9+/=\s]+$/.test(value) && value.length > 200) return `base64:length=${value.length}`
    return value.length > 1000 ? `${value.slice(0, 1000)}... length=${value.length}` : value
  }
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeLogValue(item, depth + 1))
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => {
        const normalizedKey = key.toLowerCase()
        if (normalizedKey.includes('authorization') || normalizedKey.includes('api_key') || normalizedKey === 'apikey') {
          return [key, '[redacted]']
        }
        if (normalizedKey === 'account_email') {
          return [key, '[redacted]']
        }
        return [key, sanitizeLogValue(item, depth + 1)]
      }),
    )
  }
  return value
}

function summarizeHeaders(headers?: HeadersInit) {
  const entries = (() => {
    if (!headers) return []
    if (headers instanceof Headers) return Array.from(headers.entries())
    if (Array.isArray(headers)) return headers
    return Object.entries(headers)
  })()

  return Object.fromEntries(entries.map(([key, value]) => {
    const normalizedKey = String(key).toLowerCase()
    if (normalizedKey === 'authorization' || normalizedKey === 'x-api-key') {
      return [key, '[redacted]']
    }
    return [key, String(value)]
  }))
}

function summarizeRequestBody(body: unknown) {
  if (typeof body === 'string') {
    try {
      return summarizeGenerationRequestBody(JSON.parse(body) as unknown)
    } catch {
      return sanitizeLogValue(body)
    }
  }
  if (body instanceof FormData) {
    const values: Record<string, unknown[]> = {}
    body.forEach((value, key) => {
      values[key] = values[key] ?? []
      if (value instanceof Blob) {
        values[key].push({ type: 'file', contentType: value.type, bytes: value.size })
      } else {
        values[key].push(key === 'prompt' ? compactText(String(value)) : sanitizeLogValue(value))
      }
    })
    return summarizeGenerationRequestBody(values)
  }
  return summarizeGenerationRequestBody(body)
}

function summarizeResponsePayload(resultJson: unknown, responseText: string, outputFormat?: string) {
  const imageSummary = summarizeImageResult(resultJson, outputFormat)
  return {
    imageCount: imageSummary.imageCount,
    images: imageSummary.images,
    json: summarizeResponseJsonForLog(resultJson),
    text: resultJson === null ? summarizeResponseTextForLog(responseText) : undefined,
  }
}

function extractTextResultMessage(resultJson: unknown) {
  if (!resultJson || typeof resultJson !== 'object' || Array.isArray(resultJson)) return ''
  const payload = resultJson as {
    content?: unknown
    message?: unknown
    text?: unknown
    output_text?: unknown
  }
  const text = payload.content ?? payload.message ?? payload.text ?? payload.output_text
  return typeof text === 'string' ? text.trim() : ''
}

function summarizeText(value: string | null) {
  if (!value) return null
  return value.length > 500 ? `${value.slice(0, 500)}... length=${value.length}` : value
}

function isHtmlResponseText(value: string) {
  const text = value.trimStart().slice(0, 80).toLowerCase()
  return text.startsWith('<!doctype') || text.startsWith('<html')
}

function upstreamHtmlErrorMessage(prefix: string) {
  return `${prefix}：上游返回了网页 HTML，不是图片接口 JSON。通常是接口 Base URL 填成了上游后台/首页地址，或上游没有正确暴露 /v1 接口，请检查接口配置。`
}

function extractUpstreamErrorMessage(resultJson: unknown, responseText: string) {
  if (resultJson && typeof resultJson === 'object') {
    const payload = resultJson as {
      error?: { message?: unknown; type?: unknown; code?: unknown }
      message?: unknown
    }
    const message = payload.error?.message ?? payload.message
    if (typeof message === 'string' || typeof message === 'number') return String(message)
  }

  if (isHtmlResponseText(responseText)) {
    return '上游返回了网页 HTML，不是图片接口 JSON。通常是接口 Base URL 填成了上游后台/首页地址，或上游没有正确暴露 /v1 接口，请检查接口配置。'
  }

  return summarizeText(responseText) ?? ''
}

function buildUpstreamErrorMessage(prefix: string, status: number, resultJson: unknown, responseText: string) {
  const detail = cleanUserFacingErrorMessage(extractUpstreamErrorMessage(resultJson, responseText))
  return detail ? `${prefix}：${status}，${detail}` : `${prefix}：${status}`
}

function cleanUserFacingErrorMessage(value: string) {
  return String(value || '')
    .replace(/\s*\/\s*invalid_request_error\s*\/\s*content_policy_violation\s*$/i, '')
    .replace(/\s*\/\s*content_policy_violation\s*$/i, '')
    .trim()
}

function isContentPolicyRejectionMessage(value: string) {
  return /内容政策|防护限制|安全政策|违规|违反|content[_\s-]?policy|policy[_\s-]?violation|safety|violate|violation/i.test(value)
}

async function readResponseJsonWithText(response: Response) {
  const text = await response.text().catch(() => '')
  if (!text) {
    return {
      json: null,
      text: '',
    }
  }

  try {
    return {
      json: JSON.parse(text) as unknown,
      text,
    }
  } catch {
    return {
      json: null,
      text,
    }
  }
}

function logGeneration(event: string, payload: Record<string, unknown>) {
  if (!generationLogVerbose && event !== 'finished') return
  const compactPayload = generationLogVerbose ? sanitizeLogValue(payload) : compactGenerationLogPayload(payload)
  console.info(`[generation:${event}]`, JSON.stringify(compactPayload))
}

function getHtmlUpstreamResponseError(prefix: string, response: Response, responseText: string) {
  const contentType = response.headers.get('content-type') ?? ''
  if (response.ok && (contentType.includes('text/html') || isHtmlResponseText(responseText))) {
    return upstreamHtmlErrorMessage(prefix)
  }
  return null
}

function assertNotHtmlUpstreamResponse(prefix: string, response: Response, responseText: string) {
  const message = getHtmlUpstreamResponseError(prefix, response, responseText)
  if (message) throw new AppError(502, message)
}

function summarizeError(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) return { message: String(error) }
  const cause = (error as Error & { cause?: unknown }).cause
  const causePayload = cause instanceof Error
    ? {
        name: cause.name,
        message: cause.message,
        code: (cause as Error & { code?: unknown }).code,
      }
    : cause
  return {
    name: error.name,
    message: error.message,
    cause: causePayload,
  }
}

function textFromContext(context: Record<string, unknown>, key: string) {
  const value = context[key]
  return typeof value === 'string' ? value : value === undefined || value === null ? null : String(value)
}

async function recordApiCallLog(input: {
  context: Record<string, unknown>
  url: string
  method: string
  status: 'success' | 'failed'
  statusCode?: number | null
  durationMs: number
  requestSummary?: unknown
  responseSummary?: unknown
  errorMessage?: string | null
}) {
  return apiLogRepository.create({
    direction: 'upstream',
    taskId: textFromContext(input.context, 'taskId'),
    userId: textFromContext(input.context, 'userId'),
    apiKeyId: textFromContext(input.context, 'apiKeyId'),
    apiKeyName: textFromContext(input.context, 'apiKeyName'),
    providerId: textFromContext(input.context, 'providerId'),
    providerType: textFromContext(input.context, 'providerType'),
    endpoint: textFromContext(input.context, 'endpoint') || input.url,
    phase: textFromContext(input.context, 'phase') || 'upstream',
    method: input.method,
    status: input.status,
    statusCode: input.statusCode ?? null,
    durationMs: input.durationMs,
    requestSummary: input.requestSummary,
    responseSummary: input.responseSummary,
    errorMessage: input.errorMessage ?? null,
  }).catch((error) => {
    console.warn('[api-log:create-failed]', error instanceof Error ? error.message : String(error))
    return null
  })
}

type LoggedResponse = Response & {
  apiLogId?: string | null
  apiLogStartedAt?: number
}

async function updateApiCallLogDetails(response: LoggedResponse, input: {
  status?: 'success' | 'failed'
  responseSummary?: unknown
  errorMessage?: string | null
}) {
  if (!response.apiLogId) return
  await apiLogRepository.updateDetails(response.apiLogId, {
    status: input.status ?? (response.ok ? 'success' : 'failed'),
    statusCode: response.status,
    durationMs: response.apiLogStartedAt ? Date.now() - response.apiLogStartedAt : 0,
    responseSummary: input.responseSummary,
    errorMessage: input.errorMessage ?? (response.ok ? null : response.statusText),
  }).catch((error) => {
    console.warn('[api-log:update-failed]', error instanceof Error ? error.message : String(error))
  })
}

async function fetchUpstream(url: string, init: RequestInit, context: Record<string, unknown>): Promise<LoggedResponse> {
  const startedAt = Date.now()
  const method = init.method || 'GET'
  const requestSummary = {
    context: sanitizeLogValue(context),
    headers: summarizeHeaders(init.headers),
    body: summarizeRequestBody(init.body),
  }
  try {
    const response = await fetch(url, init) as LoggedResponse
    response.apiLogStartedAt = startedAt
    response.apiLogId = await recordApiCallLog({
      context,
      url,
      method,
      status: response.ok ? 'success' : 'failed',
      statusCode: response.status,
      durationMs: Date.now() - startedAt,
      requestSummary,
      errorMessage: response.ok ? null : response.statusText,
    })
    return response
  } catch (error) {
    logGeneration('upstream-fetch-error', {
      ...context,
      error: summarizeError(error),
    })
    const message = error instanceof Error ? error.message : 'fetch failed'
    const cause = error instanceof Error ? (error as Error & { cause?: { code?: unknown; message?: unknown } }).cause : null
    const causeCode = typeof cause?.code === 'string' ? cause.code : ''
    const causeMessage = typeof cause?.message === 'string' ? cause.message : ''
    await recordApiCallLog({
      context,
      url,
      method,
      status: 'failed',
      statusCode: null,
      durationMs: Date.now() - startedAt,
      requestSummary,
      responseSummary: { error: summarizeError(error) },
      errorMessage: [message, causeCode, causeMessage].filter(Boolean).join(' / '),
    })
    throw new AppError(502, `上游接口连接失败：${[message, causeCode, causeMessage].filter(Boolean).join(' / ')}`)
  }
}

function isRetryableUpstreamStatus(status: number) {
  return [408, 409, 425, 429, 500, 502, 503, 504].includes(status)
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

export class GenerationService {
  constructor(
    private readonly userRepository = new UserRepository(),
    private readonly modelRepository = new ModelRepository(),
    private readonly apiProviderRepository = new ApiProviderRepository(),
    private readonly taskRepository = new TaskRepository(),
    private readonly creditLogRepository = new CreditLogRepository(),
    private readonly subscriptionService = new SubscriptionService(),
    private readonly promptModerationService = new PromptModerationService(),
    private readonly barkService = new BarkService(),
  ) {}

  async generateImage(input: GenerateImageInput) {
    const startedAt = Date.now()

    const user = await this.userRepository.findById(input.userId)
    if (!user) {
      throw new AppError(404, '用户不存在')
    }
    if (user.status !== 'active') {
      throw new AppError(403, '用户已被禁用')
    }
    await this.promptModerationService.assertAllowed(input.prompt)

    let model = await this.modelRepository.findById(input.modelId)
    if (!model) {
      throw new AppError(404, '模型不存在')
    }
    if (model.status !== 'active') {
      throw new AppError(400, '模型已禁用')
    }

    const provider = await this.apiProviderRepository.findById(model.providerId)
    if (!provider) {
      throw new AppError(404, '接口配置不存在')
    }
    if (provider.status !== 'active') {
      throw new AppError(400, '接口已禁用')
    }
    if (provider.capability !== 'chat_image') {
      throw new AppError(400, '请选择对话生图用途的接口模型')
    }
    const requestedModelId = model.id
    const subscriptionCandidateModelIds = new Set<string>([requestedModelId])

    const normalizedSize = provider.type === 'sub2api'
      ? validateImageSize(input.sizeTier, input.size)
      : input.size ?? getDefaultSize(input.sizeTier)
    const referenceImageUrls = normalizeReferenceImageUrls(input)
    const normalizedInput = {
      ...input,
      size: normalizedSize,
      outputFormat: getEffectiveOutputFormat(input),
      referenceImageUrl: referenceImageUrls[0],
      referenceImageUrls,
    }

    if (provider.type === 'custom' || provider.type === 'newapi') {
      const variants = await this.modelRepository.findByProviderDisplayNameAndCapability(
        model.providerId,
        model.displayName,
        model.capability,
      )
      variants.forEach((variant) => subscriptionCandidateModelIds.add(variant.id))
      model = findBestModelVariant(variants, getSizeRatio(normalizedSize), input.sizeTier) ?? model
    }
    assertModelSizeTierEnabled(model, input.sizeTier)
    subscriptionCandidateModelIds.add(model.id)
    await this.subscriptionService.assertModelAccess({
      userId: user.id,
      providerId: provider.id,
      modelId: model.id,
      alternateModelIds: [...subscriptionCandidateModelIds],
    })

    const quantity = input.quantity
    const baseCostCredits = model.providerType === 'custom'
      ? getVariantPrice(model as Awaited<ReturnType<ModelRepository['findByProviderDisplayNameAndCapability']>>[number], input.sizeTier) * quantity
      : getModelPrice(model, input.sizeTier) * quantity
    const modelCostCredits = model.providerType === 'custom'
      ? getVariantCost(model as Awaited<ReturnType<ModelRepository['findByProviderDisplayNameAndCapability']>>[number], input.sizeTier) * quantity
      : getModelCost(model, input.sizeTier) * quantity
    const subscriptionDiscountPercent = await this.subscriptionService.getUserDiscountPercent(user.id, {
      providerId: provider.id,
      modelId: model.id,
      alternateModelIds: [...subscriptionCandidateModelIds],
    })
    const costCredits = applyDiscount(baseCostCredits, subscriptionDiscountPercent)
    if (user.credits < costCredits) {
      throw new AppError(402, '用户积分不足')
    }

    const now = new Date().toISOString()
    const task: GenerationTask = {
      id: randomUUID(),
      userId: user.id,
      modelId: model.id,
      providerId: provider.id,
      capability: model.capability,
      prompt: input.prompt,
      referenceImageUrl: normalizedInput.referenceImageUrl ?? null,
      sizeTier: input.sizeTier,
      size: normalizedSize,
      transparentBackground: shouldUseTransparentBackground(normalizedInput),
      quantity,
      userIp: input.userIp,
      costCredits: 0,
      modelCostCredits: 0,
      remainingCredits: user.credits,
      durationSeconds: 0,
      status: 'queued',
      errorMessage: null,
      resultJson: null,
      favoriteEnabled: false,
      publicStatus: 'private',
      publicRequestedAt: null,
      publicReviewedAt: null,
      displayEnabled: false,
      displayNote: null,
      createdAt: now,
      updatedAt: now,
    }

    const savedTask = await this.taskRepository.create(task)
    taskEvents.emitUpdated(savedTask)
    taskEvents.emitProgress({
      taskId: task.id,
      stage: 'queued',
      message: '正在构思画面...',
      detail: '任务已进入队列，正在准备生成参数',
      tags: ['队列', '参数', '构思'],
    })
    logGeneration('queued', {
      taskId: task.id,
      userId: user.id,
      provider: {
        id: provider.id,
        name: provider.name,
        type: provider.type,
        baseUrl: provider.baseUrl,
      },
      model: {
        id: model.id,
        modelName: model.modelName,
        displayName: model.displayName,
        appendSizeToPrompt: model.appendSizeToPrompt,
      },
      params: {
        prompt: input.prompt,
        upstreamPrompt: buildUpstreamPrompt(normalizedInput, model),
        sizeTier: input.sizeTier,
        size: task.size,
        ratio: getSizeRatio(task.size),
        quantity,
        transparentBackground: normalizedInput.transparentBackground,
        outputFormat: normalizedInput.outputFormat,
        referenceImages: summarizeReferenceImages(normalizedInput.referenceImageUrls),
      },
      costCredits,
      modelCostCredits,
      baseCostCredits,
      subscriptionDiscountPercent,
      userIp: input.userIp,
    })
    void this.runImageTask({
      taskId: task.id,
      startedAt,
      user,
      model,
      provider,
      input: normalizedInput,
      costCredits,
      modelCostCredits,
      quantity,
    })

    return savedTask
  }

  private async runImageTask({
    taskId,
    startedAt,
    user,
    model,
    provider,
    input,
    costCredits,
    modelCostCredits,
    quantity,
  }: {
    taskId: string
    startedAt: number
    user: NonNullable<Awaited<ReturnType<UserRepository['findById']>>>
    model: NonNullable<Awaited<ReturnType<ModelRepository['findById']>>>
    provider: NonNullable<Awaited<ReturnType<ApiProviderRepository['findById']>>>
    input: GenerateImageInput
    costCredits: number
    modelCostCredits: number
    quantity: number
  }) {
    let resultJson: unknown = null
    let status: GenerationTask['status'] = 'success'
    let errorMessage: string | null = null
    let remainingCredits = user.credits

    try {
      taskEvents.emitUpdated(await this.taskRepository.update(taskId, { status: 'processing' }))
      taskEvents.emitProgress({
        taskId,
        stage: 'processing',
        message: '正在生成图片...',
        detail: '已开始调用生成模型，请稍等片刻',
        tags: ['模型', '生成', '处理中'],
      })
      logGeneration('processing', { taskId })
      try {
        if (input.referenceImageUrls?.length) {
          resultJson = await this.callOpenAiImageEdit({
            taskId,
            provider,
            model,
            input,
            quantity,
          })
        } else if (provider.type === 'newapi') {
          resultJson = await this.callOpenAiImageJsonWithRetry({
            taskId,
            provider,
            model,
            input,
            quantity,
          })
        } else if (provider.type === 'custom') {
          resultJson = await this.callOpenAiImageGeneration({
            taskId,
            provider,
            model,
            input,
            quantity,
          })
        } else {
          resultJson = await this.callOpenAiImageGeneration({
            taskId,
            provider,
            model,
            input,
            quantity,
          })
        }
        resultJson = rewriteUpstreamResultUrls(resultJson, provider)
        resultJson = normalizeImageResult(resultJson, input.outputFormat)
        resultJson = await materializeImageResult(resultJson, input.outputFormat)
      } catch (error) {
        throw error
      }

      if (hasFinalImageResult(resultJson, input.outputFormat)) {
        const updatedUser = await this.userRepository.deductCredits(user.id, costCredits)
        remainingCredits = updatedUser?.credits ?? user.credits - costCredits
        if (updatedUser) {
          const { passwordHash: _passwordHash, ...publicUser } = updatedUser
          userEvents.emitUpdated(publicUser)
        }
        await this.creditLogRepository.create({
          id: randomUUID(),
          userId: user.id,
          type: 'deduct',
          amount: costCredits,
          balanceAfter: remainingCredits,
          remark: `图片生成：${model.displayName || model.modelName}`,
          createdAt: new Date().toISOString(),
        })
      } else {
        status = 'failed'
        const textResultMessage = cleanUserFacingErrorMessage(extractTextResultMessage(resultJson))
        errorMessage = textResultMessage ? `上游接口未返回图片结果：${textResultMessage}` : '上游接口未返回图片结果'
      }
    } catch (error) {
      status = 'failed'
      errorMessage = error instanceof Error ? error.message : '生图调用失败'
    }

    const durationSeconds = Number(((Date.now() - startedAt) / 1000).toFixed(3))
    const latestTask = await this.taskRepository.findById(taskId)
    if (latestTask?.status === 'canceled') {
      logGeneration('finished', {
        taskId,
        status: 'canceled',
        errorMessage: latestTask.errorMessage || '任务已取消',
        durationSeconds,
        costCredits: 0,
        modelCostCredits: 0,
        remainingCredits,
        result: { imageCount: 0 },
      })
      return
    }
    const finalTask = await this.taskRepository.update(taskId, {
      costCredits: status === 'success' ? costCredits : 0,
      modelCostCredits: status === 'success' ? modelCostCredits : 0,
      remainingCredits,
      durationSeconds,
      status,
      errorMessage,
      resultJson,
    })
    taskEvents.emitUpdated(finalTask)
    if (status === 'failed') {
      void this.barkService.pushGenerationFailure({
        taskId,
        userEmail: user.email,
        modelName: model.displayName || model.modelName,
        providerName: provider.name,
        prompt: input.prompt,
        errorMessage,
        durationSeconds,
      }).catch((error) => {
        console.warn('[bark:generation-failure-push-failed]', error instanceof Error ? error.message : String(error))
      })
    }
    const resultSummary = summarizeImageResult(resultJson)
    logGeneration('finished', {
      taskId,
      status,
      errorMessage,
      durationSeconds,
      costCredits: status === 'success' ? costCredits : 0,
      modelCostCredits: status === 'success' ? modelCostCredits : 0,
      remainingCredits,
      result: {
        imageCount: resultSummary.imageCount,
      },
    })
  }

  private async callOpenAiImageJson({
    taskId,
    provider,
    model,
    input,
    quantity,
    attempt = 1,
  }: {
    taskId: string
    provider: ApiProvider
    model: AiModel
    input: GenerateImageInput
    quantity: number
    attempt?: number
  }) {
    const requestBody = buildOpenAiImageRequestBody(input, model, quantity, provider)
    const requestStartedAt = Date.now()
    logGeneration('upstream-json-request', {
      taskId,
      providerId: provider.id,
      providerType: provider.type,
      attempt,
      endpoint: getImageEndpoint(provider),
      body: {
        ...requestBody,
        streamGenerationEnabled: false,
        referenceImages: summarizeReferenceImages(input.referenceImageUrls),
      },
    })

    const response = await fetchUpstream(getImageEndpoint(provider), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${provider.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    }, {
      taskId,
      providerId: provider.id,
      providerType: provider.type,
      endpoint: getImageEndpoint(provider),
      phase: 'image-json',
    })

    const { json: resultJson, text: responseText } = await readResponseJsonWithText(response)
    const htmlErrorMessage = getHtmlUpstreamResponseError('上游接口调用失败', response, responseText)
    await updateApiCallLogDetails(response, {
      status: htmlErrorMessage ? 'failed' : undefined,
      responseSummary: summarizeResponsePayload(resultJson, responseText, input.outputFormat),
      errorMessage: htmlErrorMessage ?? (response.ok ? null : buildUpstreamErrorMessage('上游接口调用失败', response.status, resultJson, responseText)),
    })
    logGeneration('upstream-json-response', {
      taskId,
      providerId: provider.id,
      attempt,
      status: response.status,
      ok: response.ok,
      durationMs: Date.now() - requestStartedAt,
      responseText: response.ok && summarizeImageResult(resultJson).imageCount === 0
        ? summarizeText(responseText)
        : response.ok
          ? undefined
          : summarizeText(responseText),
      responseJson: response.ok && summarizeImageResult(resultJson).imageCount === 0
        ? summarizeValue(resultJson)
        : undefined,
      result: summarizeImageResult(resultJson),
    })
    if (htmlErrorMessage) {
      throw new AppError(502, htmlErrorMessage)
    }
    if (!response.ok) {
      const upstreamDetail = cleanUserFacingErrorMessage(extractUpstreamErrorMessage(resultJson, responseText))
      if (isContentPolicyRejectionMessage(upstreamDetail)) {
        throw new AppError(
          400,
          upstreamDetail ? `上游接口拒绝生成：${upstreamDetail}` : '上游接口拒绝生成：提示词可能违反内容政策',
        )
      }
      throw new AppError(
        response.status,
        buildUpstreamErrorMessage('上游接口调用失败', response.status, resultJson, responseText),
      )
    }

    return resultJson
  }

  private async callOpenAiImageJsonWithRetry({
    taskId,
    provider,
    model,
    input,
    quantity,
    maxAttempts = 1,
  }: {
    taskId: string
    provider: ApiProvider
    model: AiModel
    input: GenerateImageInput
    quantity: number
    maxAttempts?: number
  }) {
    let lastError: unknown = null

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await this.callOpenAiImageJson({
          taskId,
          provider,
          model,
          input,
          quantity,
          attempt,
        })
      } catch (error) {
        lastError = error
        if (
          !(error instanceof AppError) ||
          !isRetryableUpstreamStatus(error.statusCode) ||
          attempt >= maxAttempts
        ) {
          throw error
        }

        const delayMs = 900 * attempt
        logGeneration('upstream-json-retry', {
          taskId,
          providerId: provider.id,
          providerType: provider.type,
          statusCode: error.statusCode,
          attempt,
          nextAttempt: attempt + 1,
          delayMs,
          reason: error.message,
          quantity,
        })
        await sleep(delayMs)
      }
    }

    throw lastError instanceof Error ? lastError : new AppError(502, '上游接口调用失败')
  }

  private async callOpenAiImageGeneration({
    taskId,
    provider,
    model,
    input,
    quantity,
  }: {
    taskId: string
    provider: ApiProvider
    model: AiModel
    input: GenerateImageInput
    quantity: number
  }) {
    if (input.streamGenerationEnabled === false) {
      return this.callOpenAiImageJsonWithRetry({
        taskId,
        provider,
        model,
        input,
        quantity,
      })
    }

    if (quantity <= 1) {
      return this.callOpenAiImageStream({
        taskId,
        provider,
        model,
        input,
        quantity,
      })
    }

    logGeneration('upstream-parallel-start', {
      taskId,
      providerId: provider.id,
      providerType: provider.type,
      quantity,
      mode: 'single-image-requests',
    })

    const results = await Promise.all(
      Array.from({ length: quantity }, async (_, index) => {
        const childTaskId = `${taskId}#${index + 1}`
        const result = await this.callOpenAiImageStream({
          taskId: childTaskId,
          provider,
          model,
          input,
          quantity: 1,
        })
        logGeneration('upstream-parallel-item-complete', {
          taskId,
          childTaskId,
          index,
          result: summarizeImageResult(result),
        })
        return result
      }),
    )

    const combinedResult = combineImageResults(results, input.outputFormat)
    logGeneration('upstream-parallel-complete', {
      taskId,
      quantity,
      result: summarizeImageResult(combinedResult),
    })
    return combinedResult
  }

  private async callOpenAiImageEdit({
    taskId,
    provider,
    model,
    input,
    quantity,
  }: {
    taskId: string
    provider: ApiProvider
    model: AiModel
    input: GenerateImageInput
    quantity: number
  }) {
    const referenceImageUrls = normalizeReferenceImageUrls(input)
    if (!referenceImageUrls.length) {
      throw new AppError(400, '缺少参考图')
    }

    const requestStartedAt = Date.now()
    const referenceImages = await Promise.all(referenceImageUrls.map(async (referenceImageUrl) => ({
      url: referenceImageUrl,
      image: await readReferenceImage(referenceImageUrl, this.taskRepository),
    })))
    const maskImage = input.maskImageUrl
      ? {
          url: input.maskImageUrl,
          image: await readReferenceImage(input.maskImageUrl, this.taskRepository),
        }
      : null
    const prompt = buildUpstreamPrompt(input, model)
    const formData = new FormData()
    formData.append('model', model.modelName)
    formData.append('prompt', prompt)
    formData.append('size', input.size ?? getDefaultSize(input.sizeTier))
    formData.append('n', String(quantity))
    formData.append('response_format', 'url')
    for (const [key, value] of Object.entries(buildImageOutputParams(input))) {
      if (value !== undefined && value !== null && !['model', 'prompt', 'size', 'n', 'image', 'response_format'].includes(key)) {
        formData.append(key, String(value))
      }
    }
    referenceImages.forEach(({ image }, index) => {
      formData.append(
        'image',
        new Blob([image.buffer], { type: image.contentType }),
        `reference-${index + 1}.${getImageExtension(image.contentType)}`,
      )
    })
    if (maskImage) {
      formData.append(
        'mask',
        new Blob([maskImage.image.buffer], { type: maskImage.image.contentType }),
        `mask.${getImageExtension(maskImage.image.contentType)}`,
      )
    }

    logGeneration('upstream-edit-request', {
      taskId,
      providerId: provider.id,
      providerType: provider.type,
      endpoint: getImageEditEndpoint(provider),
      body: {
        model: model.modelName,
        prompt,
        size: input.size ?? getDefaultSize(input.sizeTier),
        n: quantity,
        background: input.transparentBackground ? 'transparent' : undefined,
        outputFormat: getEffectiveOutputFormat(input),
        referenceImages: referenceImages.map(({ url, image }) => ({
          ...summarizeReferenceImage(url),
          contentType: image.contentType,
          bytes: image.buffer.length,
        })),
        maskImage: maskImage
          ? {
              ...summarizeReferenceImage(maskImage.url),
              contentType: maskImage.image.contentType,
              bytes: maskImage.image.buffer.length,
            }
          : null,
      },
    })

    const response = await fetchUpstream(getImageEditEndpoint(provider), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${provider.apiKey}`,
      },
      body: formData,
    }, {
      taskId,
      providerId: provider.id,
      providerType: provider.type,
      endpoint: getImageEditEndpoint(provider),
      phase: 'image-edit',
      referenceImageCount: referenceImages.length,
      referenceImageBytes: referenceImages.reduce((total, item) => total + item.image.buffer.length, 0) + (maskImage?.image.buffer.length ?? 0),
    })

    const { json: resultJson, text: responseText } = await readResponseJsonWithText(response)
    const htmlErrorMessage = getHtmlUpstreamResponseError('上游图片编辑接口调用失败', response, responseText)
    await updateApiCallLogDetails(response, {
      status: htmlErrorMessage ? 'failed' : undefined,
      responseSummary: summarizeResponsePayload(resultJson, responseText, input.outputFormat),
      errorMessage: htmlErrorMessage ?? (response.ok ? null : buildUpstreamErrorMessage('上游图片编辑接口调用失败', response.status, resultJson, responseText)),
    })
    logGeneration('upstream-edit-response', {
      taskId,
      providerId: provider.id,
      status: response.status,
      ok: response.ok,
      durationMs: Date.now() - requestStartedAt,
      responseText: response.ok ? undefined : summarizeText(responseText),
      result: summarizeImageResult(resultJson),
    })

    if (htmlErrorMessage) {
      throw new AppError(502, htmlErrorMessage)
    }
    if (!response.ok) {
      throw new AppError(
        response.status,
        buildUpstreamErrorMessage('上游图片编辑接口调用失败', response.status, resultJson, responseText),
      )
    }

    return resultJson
  }

  private async callOpenAiImageStream({
    taskId,
    provider,
    model,
    input,
    quantity,
  }: {
    taskId: string
    provider: ApiProvider
    model: AiModel
    input: GenerateImageInput
    quantity: number
  }) {
    const requestBody = {
      ...buildOpenAiImageRequestBody(input, model, quantity, provider),
      stream: true,
    }
    const requestStartedAt = Date.now()
    logGeneration('upstream-stream-request', {
      taskId,
      providerId: provider.id,
      providerType: provider.type,
      endpoint: getImageEndpoint(provider),
      body: {
        ...requestBody,
        referenceImages: summarizeReferenceImages(input.referenceImageUrls),
      },
    })

    const response = await fetchUpstream(getImageEndpoint(provider), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${provider.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    }, {
      taskId,
      providerId: provider.id,
      providerType: provider.type,
      endpoint: getImageEndpoint(provider),
      phase: 'image-stream',
    })

    logGeneration('upstream-stream-response-start', {
      taskId,
      providerId: provider.id,
      status: response.status,
      ok: response.ok,
      durationMs: Date.now() - requestStartedAt,
      hasBody: Boolean(response.body),
    })
    if (response.ok && response.body) {
      taskEvents.emitProgress({
        taskId,
        stage: 'upstream',
        message: '正在读取流式结果...',
        detail: '上游模型已开始返回生成数据',
        tags: ['流式', '读取', '同步'],
      })
    }

    if (!response.ok || !response.body) {
      const responseText = await response.text().catch(() => '')
      logGeneration('upstream-stream-response-error', {
        taskId,
        providerId: provider.id,
        status: response.status,
        ok: response.ok,
        responseText: summarizeText(responseText),
      })
      const resultJson = (() => {
        try {
          return responseText ? JSON.parse(responseText) as unknown : null
        } catch {
          return null
        }
      })()
      await updateApiCallLogDetails(response, {
        status: 'failed',
        responseSummary: summarizeResponsePayload(resultJson, responseText, input.outputFormat),
        errorMessage: buildUpstreamErrorMessage('上游流式接口调用失败', response.status, resultJson, responseText),
      })
      throw new AppError(
        response.status,
        buildUpstreamErrorMessage('上游流式接口调用失败', response.status, resultJson, responseText),
      )
    }

    const contentType = response.headers.get('content-type') ?? ''
    if (contentType.includes('text/html')) {
      const responseText = await response.text().catch(() => '')
      const htmlErrorMessage = getHtmlUpstreamResponseError('上游流式接口调用失败', response, responseText)
        ?? upstreamHtmlErrorMessage('上游流式接口调用失败')
      await updateApiCallLogDetails(response, {
        status: 'failed',
        responseSummary: summarizeResponsePayload(null, responseText, input.outputFormat),
        errorMessage: htmlErrorMessage,
      })
      logGeneration('upstream-stream-html-response', {
        taskId,
        providerId: provider.id,
        status: response.status,
        ok: response.ok,
        responseText: summarizeText(responseText),
      })
      throw new AppError(502, htmlErrorMessage)
    }

    const decoder = new TextDecoder()
    let buffer = ''
    let partialImage: { b64_json?: string; url?: string } | null = null
    let finalImages: ExtractedImage[] = []
    let candidateImages: ExtractedImage[] = []
    let sawDoneEvent = false
    let lastPersistAt = 0

    const handleEventData = (eventData: string) => {
      if (!eventData) return
      if (eventData === '[DONE]') {
        sawDoneEvent = true
        return
      }

      let eventJson: unknown
      try {
        eventJson = JSON.parse(eventData) as unknown
      } catch {
        logGeneration('upstream-stream-event-parse-error', {
          taskId,
          eventData: summarizeText(eventData),
        })
        return
      }

      const isPartialEvent = isPartialStreamEvent(eventJson)
      const isExplicitFinalEvent = isExplicitFinalStreamEvent(eventJson)
      const eventType = getStreamEventType(eventJson)
      const finalEventImages = isExplicitFinalEvent
        ? uniqueImages(extractImagesFromResult(omitPartialImagePayload(eventJson), 0, input.outputFormat))
        : []
      const partialEventImages = isPartialEvent
        ? uniqueImages(extractImagesFromResult({ partial: (eventJson as Record<string, unknown>).partial ?? eventJson }, 0, input.outputFormat))
        : uniqueImages(extractImagesFromResult(eventJson, 0, input.outputFormat))
      const candidateEventImages = !isPartialEvent && !isExplicitFinalEvent ? partialEventImages : []

      if (finalEventImages.length === 0 && partialEventImages.length === 0) return

      if (isExplicitFinalEvent && !isPartialEvent) {
        finalImages = uniqueImages([...finalImages, ...finalEventImages])
        logGeneration('upstream-stream-final', {
          taskId,
          eventType,
          result: summarizeImageResult({ final: finalImages, data: finalImages }, input.outputFormat),
        })
        return
      }

      if (isExplicitFinalEvent) {
        finalImages = uniqueImages([...finalImages, ...finalEventImages])
        logGeneration('upstream-stream-final', {
          taskId,
          eventType,
          result: summarizeImageResult({ final: finalImages, data: finalImages }, input.outputFormat),
        })
      } else if (candidateEventImages.length) {
        candidateImages = uniqueImages(candidateEventImages)
        logGeneration('upstream-stream-candidate', {
          taskId,
          eventType,
          result: summarizeImageResult({ data: candidateImages }, input.outputFormat),
        })
      } else {
        partialImage = partialEventImages.at(-1) ?? partialImage
        const now = Date.now()
        if (partialImage && now - lastPersistAt > 1000) {
          lastPersistAt = now
          logGeneration('upstream-stream-partial', {
            taskId,
            eventType,
            result: summarizeImageResult({ partial: partialImage }, input.outputFormat),
          })
          taskEvents.emitProgress({
            taskId,
            stage: 'partial',
            message: '正在渲染高清图...',
            detail: '已收到预览结果，正在同步高清图像',
            tags: ['预览', '高清', '同步'],
          })
        }
      }
    }

    for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
      buffer += decoder.decode(chunk, { stream: true })
      const parts = buffer.split(/\r?\n\r?\n/)
      buffer = parts.pop() ?? ''

      for (const part of parts) {
        const eventData = part
          .split(/\r?\n/)
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.replace(/^data:\s?/, ''))
          .join('\n')
          .trim()

        handleEventData(eventData)
      }
    }

    const tail = buffer.trim()
    if (tail) {
      const eventData = tail.startsWith('data:')
        ? tail
            .split(/\r?\n/)
            .filter((line) => line.startsWith('data:'))
            .map((line) => line.replace(/^data:\s?/, ''))
            .join('\n')
            .trim()
        : tail
      handleEventData(eventData)
    }

    finalImages = uniqueImages(finalImages)
    if (finalImages.length === 0 && candidateImages.length > 0) {
      finalImages = uniqueImages(candidateImages)
      logGeneration('upstream-stream-final-from-candidate', {
        taskId,
        sawDoneEvent,
        result: summarizeImageResult({ final: finalImages, data: finalImages }, input.outputFormat),
      })
    }

    const streamResult = {
      data: finalImages,
      final: finalImages.at(-1) ?? null,
      partial: partialImage,
      stream: true,
    }
    await updateApiCallLogDetails(response, {
      responseSummary: {
        stream: true,
        partial: partialImage ? summarizeImageResult({ partial: partialImage }, input.outputFormat) : null,
        ...summarizeImageResult(streamResult, input.outputFormat),
      },
      errorMessage: null,
    })
    taskEvents.emitProgress({
      taskId,
      stage: 'finalizing',
      message: '正在整理最终结果...',
      detail: '图片已经生成，正在保存结果',
      tags: ['保存', '扣费', '完成'],
    })
    logGeneration('upstream-stream-complete', {
      taskId,
      durationMs: Date.now() - requestStartedAt,
      result: summarizeImageResult(streamResult, input.outputFormat),
    })
    return streamResult
  }
}
