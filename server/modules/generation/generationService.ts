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
import { taskEvents } from '../tasks/taskEvents.js'
import { userEvents } from '../users/userEvents.js'
import { TaskRepository } from '../tasks/taskRepository.js'
import type { GenerationSizeTier, GenerationTask } from '../tasks/taskTypes.js'

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
  outputFormat?: 'png' | 'jpeg' | 'webp'
  openaiParams?: Record<string, unknown>
  streamGenerationEnabled?: boolean
  quantity: number
  userIp: string
}

const allowedImageSizes: Record<GenerationSizeTier, string[]> = {
  '1k': ['1024x1024', '1536x864', '864x1536', '1152x864', '864x1152', '1152x768', '768x1152'],
  '2k': ['2048x2048', '2048x1152', '1152x2048', '2048x1536', '1536x2048', '2048x1360', '1360x2048'],
  '4k': ['3072x3072', '3072x1728', '1728x3072', '3072x2304', '2304x3072', '3072x2048', '2048x3072'],
}

const apiLogRepository = new ApiLogRepository()

function getModelPrice(model: Awaited<ReturnType<ModelRepository['findById']>>, sizeTier: GenerationSizeTier) {
  if (!model) {
    return 0
  }

  if (sizeTier === '4k') return model.price4k
  if (sizeTier === '2k') return model.price2k
  return model.price1k
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

function getEffectiveOutputFormat(input: Pick<GenerateImageInput, 'transparentBackground' | 'outputFormat'>) {
  return input.transparentBackground ? 'png' : input.outputFormat
}

function buildImageOutputParams(input: Pick<GenerateImageInput, 'transparentBackground' | 'outputFormat' | 'openaiParams'>) {
  const outputFormat = getEffectiveOutputFormat(input)
  return {
    ...(input.openaiParams ?? {}),
    ...(input.transparentBackground ? { background: 'transparent' } : {}),
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
  }
}

function getOpenAiBaseUrl(provider: ApiProvider) {
  const normalizedBaseUrl = provider.baseUrl.replace(/\/+$/, '')
  return normalizedBaseUrl.endsWith('/v1') ? normalizedBaseUrl : `${normalizedBaseUrl}/v1`
}

function getImageEndpoint(provider: ApiProvider) {
  if (provider.type === 'custom') return `${getOpenAiBaseUrl(provider)}/images/generations`
  return `${provider.baseUrl.replace(/\/+$/, '')}/images/generations`
}

function getImageEditEndpoint(provider: ApiProvider) {
  if (provider.type === 'custom') return `${getOpenAiBaseUrl(provider)}/images/edits`
  return `${provider.baseUrl.replace(/\/+$/, '')}/images/edits`
}

function getChatCompletionsEndpoint(provider: ApiProvider) {
  if (provider.type === 'custom') return `${getOpenAiBaseUrl(provider)}/chat/completions`
  return `${provider.baseUrl.replace(/\/+$/, '')}/v1/chat/completions`
}

function getResponsesEndpoint(provider: ApiProvider) {
  return `${getOpenAiBaseUrl(provider)}/responses`
}

function customImageFallbackLabel(error: unknown) {
  return error instanceof AppError ? `${error.statusCode} ${error.message}` : error instanceof Error ? error.message : String(error)
}

function getSizeRatio(size?: string | null) {
  const match = size?.match(/^(\d+)x(\d+)$/)
  if (!match) return null
  const width = Number(match[1])
  const height = Number(match[2])
  const divisor = gcd(width, height)
  return `${width / divisor}:${height / divisor}`
}

function buildUpstreamPrompt(input: Pick<GenerateImageInput, 'prompt' | 'size' | 'sizeTier' | 'transparentBackground'>, model: Pick<AiModel, 'appendSizeToPrompt'>) {
  const transparentInstruction = input.transparentBackground
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

function summarizeReferenceImage(value?: string) {
  if (!value) return null
  return {
    type: value.startsWith('data:') ? 'base64' : 'url',
    length: value.length,
  }
}

function parseDataImage(value: string) {
  const match = value.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/)
  if (!match) return null
  return {
    contentType: match[1],
    buffer: Buffer.from(match[2], 'base64'),
  }
}

function getImageExtension(contentType: string) {
  if (contentType.includes('jpeg') || contentType.includes('jpg')) return 'jpg'
  if (contentType.includes('webp')) return 'webp'
  if (contentType.includes('gif')) return 'gif'
  return 'png'
}

function normalizeReferenceImageUrls(input: Pick<GenerateImageInput, 'referenceImageUrl' | 'referenceImageUrls'>) {
  const urls = [...(input.referenceImageUrls ?? []), ...(input.referenceImageUrl ? [input.referenceImageUrl] : [])]
    .filter((value): value is string => Boolean(value))
  return [...new Set(urls)].slice(0, 5)
}

function summarizeReferenceImages(values?: string[]) {
  const urls = values ?? []
  return urls.map(summarizeReferenceImage)
}

function summarizeMaskImage(value?: string) {
  return value ? summarizeReferenceImage(value) : null
}

function detectImageContentType(buffer: Buffer, fallback = 'image/png') {
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png'
  }
  if (buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) {
    return 'image/jpeg'
  }
  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
    return 'image/webp'
  }
  if (buffer.subarray(0, 6).toString('ascii').startsWith('GIF')) {
    return 'image/gif'
  }
  return fallback.startsWith('image/') ? fallback : 'image/png'
}

function parseInternalTaskImageUrl(value: string) {
  const match = value.match(/\/api\/tasks\/([^/]+)\/images\/(\d+)(?:$|[?#])/)
  if (!match) return null
  return {
    taskId: decodeURIComponent(match[1]),
    index: Number(match[2]),
  }
}

async function readReferenceImage(value: string, taskRepository: TaskRepository) {
  const dataImage = parseDataImage(value)
  if (dataImage) {
    return dataImage
  }

  const internalTaskImage = parseInternalTaskImageUrl(value)
  if (internalTaskImage) {
    const imageUrl = await taskRepository.findImageUrlByIndex(internalTaskImage.taskId, internalTaskImage.index)
    if (!imageUrl) {
      throw new AppError(404, '参考图不存在')
    }
    return readReferenceImage(imageUrl, taskRepository)
  }

  const response = await fetch(value)
  if (!response.ok) {
    throw new AppError(response.status, `参考图读取失败：${response.status}`)
  }

  const buffer = Buffer.from(await response.arrayBuffer())
  return {
    contentType: detectImageContentType(buffer, response.headers.get('content-type') ?? 'image/png'),
    buffer,
  }
}

type ExtractedImage = { b64_json?: string; url?: string }

function normalizeImageUrl(value: string) {
  const trimmed = value.trim().replace(/[),.;]+$/g, '')
  if (!trimmed) return null
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith('data:image/')) {
    return trimmed
  }
  if (/^[A-Za-z0-9+/=\s]+$/.test(trimmed) && trimmed.length > 200) {
    return `data:image/png;base64,${trimmed.replace(/\s/g, '')}`
  }
  return null
}

function imageContentTypeFromFormat(format?: string | null) {
  const normalized = String(format || '').toLowerCase()
  if (normalized === 'jpg' || normalized === 'jpeg') return 'image/jpeg'
  if (normalized === 'webp') return 'image/webp'
  return 'image/png'
}

function resolveProviderUrl(provider: ApiProvider, value: string) {
  const trimmed = value.trim()
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith('data:image/')) return trimmed
  if (trimmed.startsWith('/')) {
    return `${provider.baseUrl.replace(/\/+$/, '')}${trimmed}`
  }
  return trimmed
}

function extractImageUrlsFromText(value: string, provider?: ApiProvider) {
  const candidates = [
    ...Array.from(value.matchAll(/!\[[^\]]*]\(([^)\s]+)\)/g)).map((match) => match[1]),
    ...Array.from(value.matchAll(/<(?:img|video|source)[^>]+\bsrc=["']([^"']+)["']/gi)).map((match) => match[1]),
    ...Array.from(value.matchAll(/(data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=\s]+)/g)).map((match) => match[1]),
    ...Array.from(value.matchAll(/(https?:\/\/[^\s<>"'`\]]+)/gi)).map((match) => match[1]),
    ...Array.from(value.matchAll(/(^|[\s"'(])((?:\/v1\/files|\/files|\/api\/files)\/[^\s<>"')]+)/gi)).map((match) => match[2]),
  ]

  const seen = new Set<string>()
  return candidates
    .map((candidate) => provider ? resolveProviderUrl(provider, candidate) : candidate)
    .map((candidate) => normalizeImageUrl(candidate))
    .filter((candidate): candidate is string => Boolean(candidate))
    .filter((candidate) => {
      if (seen.has(candidate)) return false
      seen.add(candidate)
      return true
    })
}

function extractImagesFromResult(value: unknown, depth = 0, outputFormat?: string): ExtractedImage[] {
  if (!value || depth > 8) return []

  if (typeof value === 'string') {
    return extractImageUrlsFromText(value).map((url) => ({ url }))
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => extractImagesFromResult(item, depth + 1, outputFormat))
  }

  if (typeof value !== 'object') return []

  const payload = value as Record<string, unknown>
  const directUrl = [
    payload.url,
    payload.image_url,
    payload.imageUrl,
    payload.output_url,
    payload.outputUrl,
    payload.file_url,
    payload.fileUrl,
  ].find((item): item is string => typeof item === 'string')
  const normalizedUrl = directUrl ? normalizeImageUrl(directUrl) : null
  const directUrls = [
    payload.urls,
    payload.image_urls,
    payload.imageUrls,
    payload.output_urls,
    payload.outputUrls,
    payload.file_urls,
    payload.fileUrls,
  ]
    .filter(Array.isArray)
    .flatMap((items) => items.filter((item): item is string => typeof item === 'string'))
    .map((item) => normalizeImageUrl(item))
    .filter((item): item is string => Boolean(item))
  const directBase64 = [
    payload.b64_json,
    payload.b64,
    payload.base64,
    payload.image,
    payload.image_base64,
    payload.imageBase64,
    payload.partial_image_b64,
  ].find((item): item is string => typeof item === 'string')

  const directImages: ExtractedImage[] = []
  if (normalizedUrl) directImages.push({ url: normalizedUrl })
  directImages.push(...directUrls.map((url) => ({ url })))
  if (directBase64) {
    const normalizedBase64 = normalizeImageUrl(directBase64)
    directImages.push(
      normalizedBase64?.startsWith('data:image/')
        ? { url: normalizedBase64 }
        : { url: `data:${imageContentTypeFromFormat(outputFormat)};base64,${directBase64.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '').replace(/\s/g, '')}` },
    )
  }

  const nestedKeys = [
    'data',
    'result',
    'results',
    'output',
    'outputs',
    'images',
    'image',
    'urls',
    'image_urls',
    'imageUrls',
    'output_urls',
    'outputUrls',
    'file_urls',
    'fileUrls',
    'final',
    'partial',
    'choices',
    'message',
    'content',
  ]
  return [
    ...directImages,
    ...nestedKeys.flatMap((key) => extractImagesFromResult(payload[key], depth + 1, outputFormat)),
  ]
}

function extractFinalImagesFromResult(value: unknown, outputFormat?: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return extractImagesFromResult(value, 0, outputFormat)
  const payload = value as Record<string, unknown>
  const finalImages = extractImagesFromResult(payload.final, 0, outputFormat)
  if (finalImages.length) return finalImages
  const dataImages = extractImagesFromResult(payload.data, 0, outputFormat)
  if (dataImages.length) return dataImages
  if (payload.stream === true) return []
  const resultImages = extractImagesFromResult(payload.result ?? payload.results ?? payload.output ?? payload.outputs ?? payload.images, 0, outputFormat)
  if (resultImages.length) return resultImages
  return extractImagesFromResult(value, 0, outputFormat)
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
    return value.length > 3000 ? `${value.slice(0, 3000)}... length=${value.length}` : value
  }
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeLogValue(item, depth + 1))
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => {
        const normalizedKey = key.toLowerCase()
        if (normalizedKey.includes('authorization') || normalizedKey.includes('api_key') || normalizedKey === 'apikey') {
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
      return sanitizeLogValue(JSON.parse(body) as unknown)
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
        values[key].push(sanitizeLogValue(value))
      }
    })
    return values
  }
  return sanitizeLogValue(body)
}

function summarizeResponsePayload(resultJson: unknown, responseText: string, outputFormat?: string) {
  const imageSummary = summarizeImageResult(resultJson, outputFormat)
  return {
    imageCount: imageSummary.imageCount,
    images: imageSummary.images,
    json: sanitizeLogValue(resultJson),
    text: resultJson === null ? summarizeText(responseText) : undefined,
  }
}

function normalizeImageResult(resultJson: unknown, outputFormat?: string) {
  const images = uniqueImages(extractFinalImagesFromResult(resultJson, outputFormat))
  if (images.length === 0) return resultJson
  return {
    ...(resultJson && typeof resultJson === 'object' && !Array.isArray(resultJson) ? resultJson as Record<string, unknown> : {}),
    data: images,
  }
}

function summarizeImageResult(resultJson: unknown, outputFormat?: string) {
  if (!resultJson || typeof resultJson !== 'object') {
    return { imageCount: 0 }
  }
  const images = uniqueImages(extractFinalImagesFromResult(resultJson, outputFormat))

  return {
    imageCount: images.length,
    images: images.map((image) => ({
      type: image.url ? 'url' : image.b64_json ? 'base64' : 'unknown',
      url: image.url,
      base64Length: image.b64_json?.length,
    })),
  }
}

async function materializeImageResult(resultJson: unknown, outputFormat?: string) {
  const images = uniqueImages(extractFinalImagesFromResult(resultJson, outputFormat))
  if (images.length === 0) return resultJson

  const materializedImages = await Promise.all(images.map(async (image) => {
    if (image.b64_json || !image.url || image.url.startsWith('data:image/')) {
      return image
    }

    try {
      const response = await fetch(image.url)
      if (!response.ok) {
        return image
      }
      const buffer = Buffer.from(await response.arrayBuffer())
      const contentType = detectImageContentType(buffer, response.headers.get('content-type') ?? 'image/png')
      return {
        url: `data:${contentType};base64,${buffer.toString('base64')}`,
      }
    } catch {
      return image
    }
  }))

  return {
    data: uniqueImages(materializedImages),
    stream: Boolean(resultJson && typeof resultJson === 'object' && (resultJson as { stream?: unknown }).stream),
  }
}

function combineImageResults(results: unknown[], outputFormat?: string) {
  return {
    data: uniqueImages(results.flatMap((result) => extractFinalImagesFromResult(result, outputFormat))),
    stream: results.some((result) => Boolean(result && typeof result === 'object' && (result as { stream?: unknown }).stream)),
  }
}

function hasFinalImageResult(resultJson: unknown, outputFormat?: string) {
  if (!resultJson || typeof resultJson !== 'object' || Array.isArray(resultJson)) {
    return summarizeImageResult(resultJson, outputFormat).imageCount > 0
  }

  const payload = resultJson as Record<string, unknown>
  if (payload.stream === true) {
    return summarizeImageResult(payload.final ?? payload.data, outputFormat).imageCount > 0
  }

  return summarizeImageResult(resultJson, outputFormat).imageCount > 0
}

function summarizeText(value: string | null) {
  if (!value) return null
  return value.length > 1000 ? `${value.slice(0, 1000)}... length=${value.length}` : value
}

function extractUpstreamErrorMessage(resultJson: unknown, responseText: string) {
  if (resultJson && typeof resultJson === 'object') {
    const payload = resultJson as {
      error?: { message?: unknown; type?: unknown; code?: unknown }
      message?: unknown
    }
    const message = payload.error?.message ?? payload.message
    const type = payload.error?.type
    const code = payload.error?.code
    const parts = [message, type, code]
      .filter((item): item is string | number => typeof item === 'string' || typeof item === 'number')
      .map(String)

    if (parts.length > 0) return parts.join(' / ')
  }

  return summarizeText(responseText) ?? ''
}

function buildUpstreamErrorMessage(prefix: string, status: number, resultJson: unknown, responseText: string) {
  const detail = extractUpstreamErrorMessage(resultJson, responseText)
  return detail ? `${prefix}：${status}，${detail}` : `${prefix}：${status}`
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
  console.info(`[generation:${event}]`, JSON.stringify(payload, null, 2))
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

function isStreamFallbackStatus(status: number) {
  return [400, 404, 405, 406, 415, 422, 500, 502, 503, 504].includes(status)
}

function isRetryableUpstreamStatus(status: number) {
  return [408, 409, 425, 429, 500, 502, 503, 504].includes(status)
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function extractChatDeltaContent(value: unknown) {
  if (!value || typeof value !== 'object') return ''

  const choices = (value as { choices?: unknown }).choices
  if (!Array.isArray(choices)) return ''

  return choices
    .map((choice) => {
      if (!choice || typeof choice !== 'object') return ''
      const payload = choice as {
        delta?: { content?: unknown }
        message?: { content?: unknown }
      }
      const content = payload.delta?.content ?? payload.message?.content
      return typeof content === 'string' ? content : ''
    })
    .join('')
}

function uniqueImages(images: ExtractedImage[]) {
  const seen = new Set<string>()
  return images.filter((image) => {
    const key = image.url ?? image.b64_json
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function hasPartialImagePayload(value: unknown, depth = 0): boolean {
  if (!value || depth > 8) return false
  if (Array.isArray(value)) return value.some((item) => hasPartialImagePayload(item, depth + 1))
  if (typeof value !== 'object') return false

  const payload = value as Record<string, unknown>
  if (typeof payload.partial_image_b64 === 'string') return true

  return Object.values(payload).some((item) => hasPartialImagePayload(item, depth + 1))
}

function hasFinalImagePayload(value: unknown, depth = 0): boolean {
  if (!value || depth > 8) return false
  if (Array.isArray(value)) return value.some((item) => hasFinalImagePayload(item, depth + 1))
  if (typeof value !== 'object') return false

  const payload = value as Record<string, unknown>
  const finalStringKeys = [
    'url',
    'b64_json',
    'image_url',
    'imageUrl',
    'output_url',
    'outputUrl',
    'file_url',
    'fileUrl',
  ]
  if (finalStringKeys.some((key) => typeof payload[key] === 'string')) return true

  const finalArrayKeys = [
    'urls',
    'image_urls',
    'imageUrls',
    'output_urls',
    'outputUrls',
    'file_urls',
    'fileUrls',
  ]
  if (finalArrayKeys.some((key) => Array.isArray(payload[key]) && (payload[key] as unknown[]).some((item) => typeof item === 'string'))) {
    return true
  }

  return Object.entries(payload)
    .filter(([key]) => key !== 'partial_image_b64')
    .some(([, item]) => hasFinalImagePayload(item, depth + 1))
}

function omitPartialImagePayload(value: unknown, depth = 0): unknown {
  if (!value || depth > 8) return value
  if (Array.isArray(value)) return value.map((item) => omitPartialImagePayload(item, depth + 1))
  if (typeof value !== 'object') return value

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== 'partial' && key !== 'partial_image_b64')
      .map(([key, item]) => [key, omitPartialImagePayload(item, depth + 1)]),
  )
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

    if (provider.type === 'custom') {
      const variants = await this.modelRepository.findByProviderDisplayNameAndCapability(
        model.providerId,
        model.displayName,
        model.capability,
      )
      variants.forEach((variant) => subscriptionCandidateModelIds.add(variant.id))
      model = findBestModelVariant(variants, getSizeRatio(normalizedSize), input.sizeTier) ?? model
    }
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
      transparentBackground: Boolean(input.transparentBackground),
      quantity,
      userIp: input.userIp,
      costCredits: 0,
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
    quantity,
  }: {
    taskId: string
    startedAt: number
    user: NonNullable<Awaited<ReturnType<UserRepository['findById']>>>
    model: NonNullable<Awaited<ReturnType<ModelRepository['findById']>>>
    provider: NonNullable<Awaited<ReturnType<ApiProviderRepository['findById']>>>
    input: GenerateImageInput
    costCredits: number
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
        resultJson = normalizeImageResult(resultJson, input.outputFormat)
        resultJson = await materializeImageResult(resultJson, input.outputFormat)
      } catch (error) {
        if (
          (provider.type === 'sub2api' || provider.type === 'custom') &&
          error instanceof AppError &&
          error.statusCode &&
          isStreamFallbackStatus(error.statusCode)
        ) {
          logGeneration('upstream-stream-fallback', {
            taskId,
            providerId: provider.id,
            providerType: provider.type,
            statusCode: error.statusCode,
            fallback: provider.type === 'custom' ? 'chat_completion' : input.referenceImageUrls?.length ? 'image_edit' : 'image_json',
            reason: error.message,
          })
          if (provider.type === 'custom') {
            try {
              resultJson = await this.callCustomChatImageCompletion({ taskId, provider, model, input, quantity })
            } catch (chatError) {
              logGeneration('upstream-custom-chat-fallback-to-responses', {
                taskId,
                providerId: provider.id,
                providerType: provider.type,
                reason: customImageFallbackLabel(chatError),
              })
              resultJson = await this.callCustomResponsesImageCompletion({ taskId, provider, model, input, quantity })
            }
          } else {
            resultJson = input.referenceImageUrls?.length
              ? await this.callOpenAiImageEdit({ provider, model, input, quantity })
              : await this.callOpenAiImageJsonWithRetry({ taskId, provider, model, input, quantity })
          }
          resultJson = normalizeImageResult(resultJson, input.outputFormat)
          resultJson = await materializeImageResult(resultJson, input.outputFormat)
        } else {
          throw error
        }
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
        errorMessage = '上游接口未返回图片结果'
      }
    } catch (error) {
      status = 'failed'
      errorMessage = error instanceof Error ? error.message : '生图调用失败'
    }

    const durationSeconds = Number(((Date.now() - startedAt) / 1000).toFixed(3))
    const latestTask = await this.taskRepository.findById(taskId)
    if (latestTask?.status === 'canceled') {
      logGeneration('canceled-before-final-update', { taskId })
      return
    }
    taskEvents.emitUpdated(await this.taskRepository.update(taskId, {
      costCredits: status === 'success' ? costCredits : 0,
      remainingCredits,
      durationSeconds,
      status,
      errorMessage,
      resultJson,
    }))
    logGeneration('finished', {
      taskId,
      status,
      errorMessage,
      durationSeconds,
      costCredits: status === 'success' ? costCredits : 0,
      remainingCredits,
      result: summarizeImageResult(resultJson),
    })
  }

  private async callOpenAiImageJson({
    provider,
    model,
    input,
    quantity,
    attempt = 1,
  }: {
    provider: ApiProvider
    model: AiModel
    input: GenerateImageInput
    quantity: number
    attempt?: number
  }) {
    const requestBody = buildOpenAiImageRequestBody(input, model, quantity, provider)
    const requestStartedAt = Date.now()
    logGeneration('upstream-json-request', {
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
      providerId: provider.id,
      providerType: provider.type,
      endpoint: getImageEndpoint(provider),
      phase: 'image-json',
    })

    const { json: resultJson, text: responseText } = await readResponseJsonWithText(response)
    await updateApiCallLogDetails(response, {
      responseSummary: summarizeResponsePayload(resultJson, responseText, input.outputFormat),
      errorMessage: response.ok ? null : buildUpstreamErrorMessage('上游接口调用失败', response.status, resultJson, responseText),
    })
    logGeneration('upstream-json-response', {
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
    if (!response.ok) {
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
    maxAttempts = 3,
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
        let result: unknown
        try {
          result = await this.callOpenAiImageStream({
            taskId: childTaskId,
            provider,
            model,
            input,
            quantity: 1,
          })
        } catch (error) {
          if (
            error instanceof AppError &&
            error.statusCode &&
            isStreamFallbackStatus(error.statusCode)
          ) {
            logGeneration('upstream-parallel-item-fallback', {
              taskId,
              childTaskId,
              index,
              statusCode: error.statusCode,
              reason: error.message,
            })
            result = await this.callOpenAiImageJsonWithRetry({
              taskId: childTaskId,
              provider,
              model,
              input,
              quantity: 1,
            })
          } else {
            throw error
          }
        }
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

  private async callCustomChatImageCompletion({
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
    const requestStartedAt = Date.now()
    const content: Array<Record<string, unknown>> = []
    let referenceImageSummary: Record<string, unknown> | null = null

    const referenceImageSummaries: Array<Record<string, unknown> | null> = []

    for (const referenceImageUrl of normalizeReferenceImageUrls(input)) {
      const referenceImage = await readReferenceImage(referenceImageUrl, this.taskRepository)
      const imageUrl = `data:${referenceImage.contentType};base64,${referenceImage.buffer.toString('base64')}`
      content.push({
        type: 'image_url',
        image_url: { url: imageUrl },
      })
      referenceImageSummaries.push({
        ...summarizeReferenceImage(referenceImageUrl),
        contentType: referenceImage.contentType,
        bytes: referenceImage.buffer.length,
      })
    }
    referenceImageSummary = referenceImageSummaries.length === 1 ? referenceImageSummaries[0] : { count: referenceImageSummaries.length, items: referenceImageSummaries }

    const prompt = buildUpstreamPrompt(input, model)
    content.push({ type: 'text', text: prompt })

    const requestBody = {
      ...buildImageOutputParams(input),
      model: model.modelName,
      messages: [{ role: 'user', content }],
      stream: true,
      aspect_ratio: getSizeRatio(input.size),
      n: quantity,
    }

    logGeneration('upstream-chat-request', {
      taskId,
      providerId: provider.id,
      providerType: provider.type,
      endpoint: getChatCompletionsEndpoint(provider),
      body: {
        ...requestBody,
        messages: [{
          role: 'user',
          content: content.map((item) => item.type === 'image_url'
            ? { type: 'image_url', image_url: summarizeReferenceImage(String((item.image_url as { url?: string })?.url ?? '')) }
            : item),
        }],
        referenceImage: referenceImageSummary,
        prompt,
      },
    })

    const response = await fetchUpstream(getChatCompletionsEndpoint(provider), {
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
      endpoint: getChatCompletionsEndpoint(provider),
      phase: 'chat-completion',
    })

    logGeneration('upstream-chat-response-start', {
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
        errorMessage: buildUpstreamErrorMessage('上游对话生图接口调用失败', response.status, resultJson, responseText),
      })
      logGeneration('upstream-chat-response-error', {
        taskId,
        providerId: provider.id,
        status: response.status,
        ok: response.ok,
        responseText: summarizeText(responseText),
      })
      throw new AppError(
        response.status,
        buildUpstreamErrorMessage('上游对话生图接口调用失败', response.status, resultJson, responseText),
      )
    }

    const contentType = response.headers.get('content-type') ?? ''
    if (contentType.includes('application/json')) {
      const { json: resultJson, text: responseText } = await readResponseJsonWithText(response)
      const normalizedResult = normalizeImageResult(resultJson)
      await updateApiCallLogDetails(response, {
        responseSummary: summarizeResponsePayload(normalizedResult, responseText, input.outputFormat),
        errorMessage: response.ok ? null : buildUpstreamErrorMessage('上游对话生图接口调用失败', response.status, resultJson, responseText),
      })
      logGeneration('upstream-chat-json-response', {
        taskId,
        providerId: provider.id,
        status: response.status,
        ok: response.ok,
        durationMs: Date.now() - requestStartedAt,
        responseText: summarizeImageResult(normalizedResult).imageCount === 0 ? summarizeText(responseText) : undefined,
        responseJson: summarizeImageResult(normalizedResult).imageCount === 0 ? summarizeValue(resultJson) : undefined,
        result: summarizeImageResult(normalizedResult),
      })
      return normalizedResult
    }

    const decoder = new TextDecoder()
    let buffer = ''
    let collectedContent = ''
    let lastImage: ExtractedImage | null = null
    let lastPersistAt = 0

    const handleEventData = async (eventData: string) => {
      if (!eventData || eventData === '[DONE]') return

      let eventJson: unknown = null
      try {
        eventJson = JSON.parse(eventData) as unknown
      } catch {
        collectedContent += eventData
      }

      if (eventJson) {
        const contentDelta = extractChatDeltaContent(eventJson)
        if (contentDelta) collectedContent += contentDelta

        const directImage = extractImagesFromResult(eventJson)
        if (directImage[0]) lastImage = directImage[0]
      }

      const textImages = extractImageUrlsFromText(collectedContent, provider).map((url) => ({ url }))
      if (textImages.at(-1)) lastImage = textImages.at(-1) ?? lastImage

      if (lastImage) {
        const now = Date.now()
        if (now - lastPersistAt > 1000) {
          lastPersistAt = now
          logGeneration('upstream-chat-partial', {
            taskId,
            result: summarizeImageResult({ partial: lastImage, stream: true }),
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
        await handleEventData(eventData)
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
      await handleEventData(eventData)
    }

    const images = uniqueImages([
      ...extractImageUrlsFromText(collectedContent, provider).map((url) => ({ url })),
      ...(lastImage ? [lastImage] : []),
    ])
    const streamResult = {
      data: images,
      final: images.at(-1) ?? null,
      content: collectedContent,
      stream: true,
    }
    await updateApiCallLogDetails(response, {
      responseSummary: {
        stream: true,
        content: summarizeText(collectedContent),
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
    logGeneration('upstream-chat-complete', {
      taskId,
      durationMs: Date.now() - requestStartedAt,
      content: summarizeText(collectedContent),
      result: summarizeImageResult(streamResult),
    })
    return streamResult
  }

  private async callCustomResponsesImageCompletion({
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
    const requestStartedAt = Date.now()
    const content: Array<Record<string, unknown>> = []
    const referenceImageSummaries: Array<Record<string, unknown> | null> = []

    for (const referenceImageUrl of normalizeReferenceImageUrls(input)) {
      const referenceImage = await readReferenceImage(referenceImageUrl, this.taskRepository)
      const imageUrl = `data:${referenceImage.contentType};base64,${referenceImage.buffer.toString('base64')}`
      content.push({
        type: 'input_image',
        image_url: imageUrl,
      })
      referenceImageSummaries.push({
        ...summarizeReferenceImage(referenceImageUrl),
        contentType: referenceImage.contentType,
        bytes: referenceImage.buffer.length,
      })
    }

    const prompt = buildUpstreamPrompt(input, model)
    content.push({ type: 'input_text', text: prompt })
    const requestBody = {
      ...buildImageOutputParams(input),
      model: model.modelName,
      input: [{
        role: 'user',
        content,
      }],
      stream: false,
      aspect_ratio: getSizeRatio(input.size),
      n: quantity,
    }

    logGeneration('upstream-responses-request', {
      taskId,
      providerId: provider.id,
      providerType: provider.type,
      endpoint: getResponsesEndpoint(provider),
      body: {
        ...requestBody,
        input: [{
          role: 'user',
          content: content.map((item) => item.type === 'input_image'
            ? { type: 'input_image', image_url: summarizeReferenceImage(String(item.image_url ?? '')) }
            : item),
        }],
        referenceImages: referenceImageSummaries,
        prompt,
      },
    })

    const response = await fetchUpstream(getResponsesEndpoint(provider), {
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
      endpoint: getResponsesEndpoint(provider),
      phase: 'responses-image',
    })

    const { json: resultJson, text: responseText } = await readResponseJsonWithText(response)
    const normalizedResult = normalizeImageResult(resultJson)
    await updateApiCallLogDetails(response, {
      responseSummary: summarizeResponsePayload(normalizedResult, responseText, input.outputFormat),
      errorMessage: response.ok ? null : buildUpstreamErrorMessage('上游 Responses 生图接口调用失败', response.status, resultJson, responseText),
    })
    logGeneration('upstream-responses-response', {
      taskId,
      providerId: provider.id,
      status: response.status,
      ok: response.ok,
      durationMs: Date.now() - requestStartedAt,
      responseText: response.ok && summarizeImageResult(normalizedResult).imageCount === 0
        ? summarizeText(responseText)
        : response.ok
          ? undefined
          : summarizeText(responseText),
      result: summarizeImageResult(normalizedResult),
    })

    if (!response.ok) {
      throw new AppError(
        response.status,
        buildUpstreamErrorMessage('上游 Responses 生图接口调用失败', response.status, resultJson, responseText),
      )
    }

    return normalizedResult
  }

  private async callOpenAiImageEdit({
    provider,
    model,
    input,
    quantity,
  }: {
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
    for (const [key, value] of Object.entries(buildImageOutputParams(input))) {
      if (value !== undefined && value !== null && !['model', 'prompt', 'size', 'n', 'image'].includes(key)) {
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
      providerId: provider.id,
      providerType: provider.type,
      endpoint: getImageEditEndpoint(provider),
      phase: 'image-edit',
      referenceImageCount: referenceImages.length,
      referenceImageBytes: referenceImages.reduce((total, item) => total + item.image.buffer.length, 0) + (maskImage?.image.buffer.length ?? 0),
    })

    const { json: resultJson, text: responseText } = await readResponseJsonWithText(response)
    await updateApiCallLogDetails(response, {
      responseSummary: summarizeResponsePayload(resultJson, responseText, input.outputFormat),
      errorMessage: response.ok ? null : buildUpstreamErrorMessage('上游图片编辑接口调用失败', response.status, resultJson, responseText),
    })
    logGeneration('upstream-edit-response', {
      providerId: provider.id,
      status: response.status,
      ok: response.ok,
      durationMs: Date.now() - requestStartedAt,
      responseText: response.ok ? undefined : summarizeText(responseText),
      result: summarizeImageResult(resultJson),
    })

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
      partial_images: 2,
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

    const decoder = new TextDecoder()
    let buffer = ''
    let partialImage: { b64_json?: string; url?: string } | null = null
    let finalImages: ExtractedImage[] = []
    let lastPersistAt = 0

    const handleEventData = (eventData: string) => {
      if (!eventData || eventData === '[DONE]') return

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

      const eventType = (eventJson as { type?: string }).type ?? ''
      const isFinalEvent = /completed|final|done/i.test(eventType) || hasFinalImagePayload(eventJson)
      const isPartialEvent = hasPartialImagePayload(eventJson)
      const finalEventImages = isFinalEvent
        ? uniqueImages(extractImagesFromResult(omitPartialImagePayload(eventJson), 0, input.outputFormat))
        : []
      const partialEventImages = isPartialEvent
        ? uniqueImages(extractImagesFromResult({ partial: (eventJson as Record<string, unknown>).partial ?? eventJson }, 0, input.outputFormat))
        : uniqueImages(extractImagesFromResult(eventJson, 0, input.outputFormat))

      if (finalEventImages.length === 0 && partialEventImages.length === 0) return

      if (isFinalEvent && !isPartialEvent) {
        finalImages = uniqueImages([...finalImages, ...finalEventImages])
        logGeneration('upstream-stream-final', {
          taskId,
          eventType,
          result: summarizeImageResult({ final: finalImages, data: finalImages }, input.outputFormat),
        })
        return
      }

      if (isFinalEvent) {
        finalImages = uniqueImages([...finalImages, ...finalEventImages])
        logGeneration('upstream-stream-final', {
          taskId,
          eventType,
          result: summarizeImageResult({ final: finalImages, data: finalImages }, input.outputFormat),
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
