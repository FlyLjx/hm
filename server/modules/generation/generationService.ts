import { randomUUID } from 'node:crypto'
import { AppError } from '../../shared/AppError.js'
import { ApiProviderRepository } from '../apiProviders/apiProviderRepository.js'
import type { ApiProvider } from '../apiProviders/apiProviderTypes.js'
import { CreditLogRepository } from '../creditLogs/creditLogRepository.js'
import { ModelRepository } from '../models/modelRepository.js'
import type { AiModel } from '../models/modelTypes.js'
import { SubscriptionService } from '../subscriptions/subscriptionService.js'
import { UserRepository } from '../users/userRepository.js'
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
  sizeTier: GenerationSizeTier
  size?: string
  transparentBackground?: boolean
  openaiParams?: Record<string, unknown>
  quantity: number
  userIp: string
}

const allowedImageSizes: Record<GenerationSizeTier, string[]> = {
  '1k': ['1024x1024', '1536x864', '864x1536', '1152x864', '864x1152', '1152x768', '768x1152'],
  '2k': ['2048x2048', '2048x1152', '1152x2048', '2048x1536', '1536x2048', '2048x1360', '1360x2048'],
  '4k': ['3072x3072', '3072x1728', '1728x3072', '3072x2304', '2304x3072', '3072x2048', '2048x3072'],
}

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

function buildOpenAiImageRequestBody(input: GenerateImageInput, model: AiModel, quantity: number, provider: ApiProvider) {
  const prompt = buildUpstreamPrompt(input, model)
  return {
    ...(input.openaiParams ?? {}),
    model: model.modelName,
    prompt,
    ...(provider.type === 'sub2api'
      ? { size: input.size ?? getDefaultSize(input.sizeTier) }
      : {}),
    n: quantity,
  }
}

function getImageEndpoint(provider: ApiProvider) {
  return `${provider.baseUrl.replace(/\/+$/, '')}/images/generations`
}

function getImageEditEndpoint(provider: ApiProvider) {
  return `${provider.baseUrl.replace(/\/+$/, '')}/images/edits`
}

function getChatCompletionsEndpoint(provider: ApiProvider) {
  return `${provider.baseUrl.replace(/\/+$/, '')}/v1/chat/completions`
}

function getSizeRatio(size?: string | null) {
  const match = size?.match(/^(\d+)x(\d+)$/)
  if (!match) return null
  const width = Number(match[1])
  const height = Number(match[2])
  const divisor = gcd(width, height)
  return `${width / divisor}:${height / divisor}`
}

function buildUpstreamPrompt(input: Pick<GenerateImageInput, 'prompt' | 'size' | 'sizeTier'>, model: Pick<AiModel, 'appendSizeToPrompt'>) {
  if (!model.appendSizeToPrompt) return input.prompt
  const size = input.size ?? getDefaultSize(input.sizeTier)
  const ratio = getSizeRatio(size)
  return [
    input.prompt,
    '',
    `画面尺寸要求：比例 ${ratio ?? '按所选尺寸'}，输出尺寸 ${size}，清晰度 ${input.sizeTier.toUpperCase()}。请严格按照该比例和尺寸构图，不要生成其他画幅。`,
  ].join('\n')
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

function extractImagesFromResult(value: unknown, depth = 0): ExtractedImage[] {
  if (!value || depth > 8) return []

  if (typeof value === 'string') {
    return extractImageUrlsFromText(value).map((url) => ({ url }))
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => extractImagesFromResult(item, depth + 1))
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
  if (directBase64) {
    const normalizedBase64 = normalizeImageUrl(directBase64)
    directImages.push(
      normalizedBase64?.startsWith('data:image/')
        ? { url: normalizedBase64 }
        : { b64_json: directBase64.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '').replace(/\s/g, '') },
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
    'final',
    'partial',
    'choices',
    'message',
    'content',
  ]
  return [
    ...directImages,
    ...nestedKeys.flatMap((key) => extractImagesFromResult(payload[key], depth + 1)),
  ]
}

function extractFinalImagesFromResult(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return extractImagesFromResult(value)
  const payload = value as Record<string, unknown>
  const finalImages = extractImagesFromResult(payload.final)
  if (finalImages.length) return finalImages
  const dataImages = extractImagesFromResult(payload.data)
  if (dataImages.length) return dataImages
  if (payload.stream === true) return []
  const resultImages = extractImagesFromResult(payload.result ?? payload.results ?? payload.output ?? payload.outputs ?? payload.images)
  if (resultImages.length) return resultImages
  return extractImagesFromResult(value)
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

function normalizeImageResult(resultJson: unknown) {
  const images = uniqueImages(extractFinalImagesFromResult(resultJson))
  if (images.length === 0) return resultJson
  return {
    ...(resultJson && typeof resultJson === 'object' && !Array.isArray(resultJson) ? resultJson as Record<string, unknown> : {}),
    data: images,
  }
}

function summarizeImageResult(resultJson: unknown) {
  if (!resultJson || typeof resultJson !== 'object') {
    return { imageCount: 0 }
  }
  const images = uniqueImages(extractFinalImagesFromResult(resultJson))

  return {
    imageCount: images.length,
    images: images.map((image) => ({
      type: image.url ? 'url' : image.b64_json ? 'base64' : 'unknown',
      url: image.url,
      base64Length: image.b64_json?.length,
    })),
  }
}

async function materializeImageResult(resultJson: unknown) {
  const images = uniqueImages(extractFinalImagesFromResult(resultJson))
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

function combineImageResults(results: unknown[]) {
  return {
    data: uniqueImages(results.flatMap((result) => extractImagesFromResult(result))),
    stream: results.some((result) => Boolean(result && typeof result === 'object' && (result as { stream?: unknown }).stream)),
  }
}

function hasFinalImageResult(resultJson: unknown) {
  if (!resultJson || typeof resultJson !== 'object' || Array.isArray(resultJson)) {
    return summarizeImageResult(resultJson).imageCount > 0
  }

  const payload = resultJson as Record<string, unknown>
  if (payload.stream === true) {
    return summarizeImageResult(payload.final ?? payload.data).imageCount > 0
  }

  return summarizeImageResult(resultJson).imageCount > 0
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

async function fetchUpstream(url: string, init: RequestInit, context: Record<string, unknown>) {
  try {
    return await fetch(url, init)
  } catch (error) {
    logGeneration('upstream-fetch-error', {
      ...context,
      error: summarizeError(error),
    })
    const message = error instanceof Error ? error.message : 'fetch failed'
    const cause = error instanceof Error ? (error as Error & { cause?: { code?: unknown; message?: unknown } }).cause : null
    const causeCode = typeof cause?.code === 'string' ? cause.code : ''
    const causeMessage = typeof cause?.message === 'string' ? cause.message : ''
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

function extractEventImage(value: unknown): { b64_json?: string; url?: string } | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const image = value as { b64_json?: string; url?: string; partial_image_b64?: string }
  if (image.url || image.b64_json) {
    return { url: image.url, b64_json: image.b64_json }
  }
  if (image.partial_image_b64) {
    return { b64_json: image.partial_image_b64 }
  }

  const output = (value as { output?: unknown[] }).output
  if (Array.isArray(output)) {
    for (const item of output) {
      const nestedImage = extractEventImage(item)
      if (nestedImage) return nestedImage
    }
  }

  return null
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

export class GenerationService {
  constructor(
    private readonly userRepository = new UserRepository(),
    private readonly modelRepository = new ModelRepository(),
    private readonly apiProviderRepository = new ApiProviderRepository(),
    private readonly taskRepository = new TaskRepository(),
    private readonly creditLogRepository = new CreditLogRepository(),
    private readonly subscriptionService = new SubscriptionService(),
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
        if (provider.type === 'custom') {
          resultJson = await this.callCustomChatImageCompletion({
            taskId,
            provider,
            model,
            input,
            quantity,
          })
        } else if (input.referenceImageUrls?.length) {
          resultJson = await this.callOpenAiImageEdit({
            provider,
            model,
            input,
            quantity,
          })
        } else {
          resultJson = await this.callSub2ApiImageGeneration({
            taskId,
            provider,
            model,
            input,
            quantity,
          })
        }
        resultJson = normalizeImageResult(resultJson)
        resultJson = await materializeImageResult(resultJson)
      } catch (error) {
        if (
          provider.type === 'sub2api' &&
          error instanceof AppError &&
          error.statusCode &&
          isStreamFallbackStatus(error.statusCode)
        ) {
          logGeneration('upstream-stream-fallback', {
            taskId,
            providerId: provider.id,
            providerType: provider.type,
            statusCode: error.statusCode,
            fallback: input.referenceImageUrls?.length ? 'image_edit' : 'image_json',
            reason: error.message,
          })
          resultJson = input.referenceImageUrls?.length
            ? await this.callOpenAiImageEdit({ provider, model, input, quantity })
            : await this.callOpenAiImageJsonWithRetry({ taskId, provider, model, input, quantity })
          resultJson = normalizeImageResult(resultJson)
          resultJson = await materializeImageResult(resultJson)
        } else {
          throw error
        }
      }

      if (hasFinalImageResult(resultJson)) {
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

  private async callSub2ApiImageGeneration({
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

    const combinedResult = combineImageResults(results)
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
      ...(input.openaiParams ?? {}),
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
      data: images.at(-1) ? [images.at(-1)] : [],
      final: images.at(-1) ?? null,
      content: collectedContent,
      stream: true,
    }
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
    const prompt = buildUpstreamPrompt(input, model)
    const formData = new FormData()
    formData.append('model', model.modelName)
    formData.append('prompt', prompt)
    formData.append('size', input.size ?? getDefaultSize(input.sizeTier))
    formData.append('n', String(quantity))
    for (const [key, value] of Object.entries(input.openaiParams ?? {})) {
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

    logGeneration('upstream-edit-request', {
      providerId: provider.id,
      providerType: provider.type,
      endpoint: getImageEditEndpoint(provider),
      body: {
        model: model.modelName,
        prompt,
        size: input.size ?? getDefaultSize(input.sizeTier),
        n: quantity,
        referenceImages: referenceImages.map(({ url, image }) => ({
          ...summarizeReferenceImage(url),
          contentType: image.contentType,
          bytes: image.buffer.length,
        })),
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
      referenceImageBytes: referenceImages.reduce((total, item) => total + item.image.buffer.length, 0),
    })

    const { json: resultJson, text: responseText } = await readResponseJsonWithText(response)
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
      throw new AppError(
        response.status,
        buildUpstreamErrorMessage('上游流式接口调用失败', response.status, resultJson, responseText),
      )
    }

    const decoder = new TextDecoder()
    let buffer = ''
    let partialImage: { b64_json?: string; url?: string } | null = null
    let finalImage: { b64_json?: string; url?: string } | null = null
    let lastPersistAt = 0

    for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
      buffer += decoder.decode(chunk, { stream: true })
      const parts = buffer.split('\n\n')
      buffer = parts.pop() ?? ''

      for (const part of parts) {
        const eventData = part
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.replace(/^data:\s?/, ''))
          .join('\n')
          .trim()

        if (!eventData || eventData === '[DONE]') continue

        const eventJson = JSON.parse(eventData) as unknown
        const eventImage = extractEventImage(eventJson)
        if (!eventImage) continue

        const eventType = (eventJson as { type?: string }).type ?? ''
        if (eventType.includes('completed')) {
          finalImage = eventImage
          logGeneration('upstream-stream-final', {
            taskId,
            eventType,
            result: summarizeImageResult({ final: finalImage }),
          })
        } else {
          partialImage = eventImage
          const now = Date.now()
          if (now - lastPersistAt > 1000) {
            lastPersistAt = now
            logGeneration('upstream-stream-partial', {
              taskId,
              eventType,
              result: summarizeImageResult({ partial: partialImage }),
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
    }

    const streamResult = {
      data: finalImage ? [finalImage] : [],
      final: finalImage,
      partial: partialImage,
      stream: true,
    }
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
      result: summarizeImageResult(streamResult),
    })
    return streamResult
  }
}
