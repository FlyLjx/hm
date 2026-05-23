import { randomUUID } from 'node:crypto'
import { AppError } from '../../shared/AppError.js'
import { ApiProviderRepository } from '../apiProviders/apiProviderRepository.js'
import type { ApiProvider } from '../apiProviders/apiProviderTypes.js'
import { CreditLogRepository } from '../creditLogs/creditLogRepository.js'
import { ModelRepository } from '../models/modelRepository.js'
import type { AiModel } from '../models/modelTypes.js'
import { UserRepository } from '../users/userRepository.js'
import { taskEvents } from '../tasks/taskEvents.js'
import { TaskRepository } from '../tasks/taskRepository.js'
import type { GenerationSizeTier, GenerationTask } from '../tasks/taskTypes.js'

type GenerateImageInput = {
  userId: string
  modelId: string
  prompt: string
  referenceImageUrl?: string
  sizeTier: GenerationSizeTier
  size?: string
  quantity: number
  userIp: string
}

const allowedImageSizes: Record<GenerationSizeTier, string[]> = {
  '1k': ['1024x1024', '1536x864', '864x1536', '1152x864', '864x1152', '1152x768', '768x1152'],
  '2k': ['2048x2048', '2048x1152', '1152x2048', '2048x1536', '1536x2048', '2048x1360', '1360x2048'],
  '4k': ['2864x2864', '3840x2160', '2160x3840', '3328x2496', '2496x3328', '3504x2336', '2336x3504'],
}

function getModelPrice(model: Awaited<ReturnType<ModelRepository['findById']>>, sizeTier: GenerationSizeTier) {
  if (!model) {
    return 0
  }

  if (sizeTier === '4k') return model.price4k
  if (sizeTier === '2k') return model.price2k
  return model.price1k
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

function buildOpenAiImageRequestBody(input: GenerateImageInput, model: AiModel, quantity: number) {
  return {
    model: model.modelName,
    prompt: input.prompt,
    size: input.size ?? getDefaultSize(input.sizeTier),
    n: quantity,
  }
}

function getImageEndpoint(provider: ApiProvider) {
  return `${provider.baseUrl.replace(/\/+$/, '')}/images/generations`
}

function getImageEditEndpoint(provider: ApiProvider) {
  return `${provider.baseUrl.replace(/\/+$/, '')}/images/edits`
}

function getSizeRatio(size?: string | null) {
  const match = size?.match(/^(\d+)x(\d+)$/)
  if (!match) return null
  const width = Number(match[1])
  const height = Number(match[2])
  const divisor = gcd(width, height)
  return `${width / divisor}:${height / divisor}`
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

async function readReferenceImage(value: string) {
  const dataImage = parseDataImage(value)
  if (dataImage) {
    return dataImage
  }

  const response = await fetch(value)
  if (!response.ok) {
    throw new AppError(response.status, `参考图读取失败：${response.status}`)
  }

  return {
    contentType: response.headers.get('content-type') ?? 'image/png',
    buffer: Buffer.from(await response.arrayBuffer()),
  }
}

function summarizeImageResult(resultJson: unknown) {
  if (!resultJson || typeof resultJson !== 'object') {
    return { imageCount: 0 }
  }

  const result = resultJson as {
    data?: Array<{ url?: string; b64_json?: string }>
    final?: { url?: string; b64_json?: string }
    partial?: { url?: string; b64_json?: string }
  }

  const images = [
    ...(Array.isArray(result.data) ? result.data : []),
    result.final,
    result.partial,
  ].filter(Boolean) as Array<{ url?: string; b64_json?: string }>

  return {
    imageCount: images.length,
    images: images.map((image) => ({
      type: image.url ? 'url' : image.b64_json ? 'base64' : 'unknown',
      url: image.url,
      base64Length: image.b64_json?.length,
    })),
  }
}

function summarizeText(value: string | null) {
  if (!value) return null
  return value.length > 1000 ? `${value.slice(0, 1000)}... length=${value.length}` : value
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

function isStreamFallbackStatus(status: number) {
  return [400, 404, 405, 406, 415, 422].includes(status)
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

export class GenerationService {
  constructor(
    private readonly userRepository = new UserRepository(),
    private readonly modelRepository = new ModelRepository(),
    private readonly apiProviderRepository = new ApiProviderRepository(),
    private readonly taskRepository = new TaskRepository(),
    private readonly creditLogRepository = new CreditLogRepository(),
  ) {}

  async generateImage(input: GenerateImageInput) {
    const startedAt = Date.now()
    const normalizedSize = validateImageSize(input.sizeTier, input.size)
    const normalizedInput = {
      ...input,
      size: normalizedSize,
    }

    const user = await this.userRepository.findById(input.userId)
    if (!user) {
      throw new AppError(404, '用户不存在')
    }
    if (user.status !== 'active') {
      throw new AppError(403, '用户已被禁用')
    }

    const model = await this.modelRepository.findById(input.modelId)
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

    const quantity = input.quantity
    const costCredits = getModelPrice(model, input.sizeTier) * quantity
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
      referenceImageUrl: input.referenceImageUrl ?? null,
      sizeTier: input.sizeTier,
      size: normalizedSize,
      quantity,
      userIp: input.userIp,
      costCredits: 0,
      remainingCredits: user.credits,
      durationSeconds: 0,
      status: 'queued',
      errorMessage: null,
      resultJson: null,
      createdAt: now,
      updatedAt: now,
    }

    const savedTask = await this.taskRepository.create(task)
    taskEvents.emitUpdated(savedTask)
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
      },
      params: {
        prompt: input.prompt,
        sizeTier: input.sizeTier,
        size: task.size,
        ratio: getSizeRatio(task.size),
        quantity,
        referenceImage: summarizeReferenceImage(input.referenceImageUrl),
      },
      costCredits,
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
      logGeneration('processing', { taskId })
      try {
        if (input.referenceImageUrl) {
          resultJson = await this.callOpenAiImageEdit({
            provider,
            model,
            input,
            quantity,
          })
        } else {
          resultJson =
            provider.type === 'sub2api'
              ? await this.callOpenAiImageStream({
                taskId,
                provider,
                model,
                input,
                quantity,
              })
              : await this.callOpenAiImageJson({ provider, model, input, quantity })
        }
      } catch (error) {
        if (
          provider.type === 'sub2api' &&
          error instanceof AppError &&
          error.statusCode &&
          isStreamFallbackStatus(error.statusCode)
        ) {
          resultJson = input.referenceImageUrl
            ? await this.callOpenAiImageEdit({ provider, model, input, quantity })
            : await this.callOpenAiImageJson({ provider, model, input, quantity })
        } else {
          throw error
        }
      }

      if (resultJson) {
        const updatedUser = await this.userRepository.deductCredits(user.id, costCredits)
        remainingCredits = updatedUser?.credits ?? user.credits - costCredits
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
  }: {
    provider: ApiProvider
    model: AiModel
    input: GenerateImageInput
    quantity: number
  }) {
    const requestBody = buildOpenAiImageRequestBody(input, model, quantity)
    const requestStartedAt = Date.now()
    logGeneration('upstream-json-request', {
      providerId: provider.id,
      providerType: provider.type,
      endpoint: getImageEndpoint(provider),
      body: {
        ...requestBody,
        prompt: input.prompt,
        referenceImage: summarizeReferenceImage(input.referenceImageUrl),
      },
    })

    const response = await fetch(getImageEndpoint(provider), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${provider.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    })

    const { json: resultJson, text: responseText } = await readResponseJsonWithText(response)
    logGeneration('upstream-json-response', {
      providerId: provider.id,
      status: response.status,
      ok: response.ok,
      durationMs: Date.now() - requestStartedAt,
      responseText: response.ok ? undefined : summarizeText(responseText),
      result: summarizeImageResult(resultJson),
    })
    if (!response.ok) {
      throw new AppError(response.status, `上游接口调用失败：${response.status}`)
    }

    return resultJson
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
    if (!input.referenceImageUrl) {
      throw new AppError(400, '缺少参考图')
    }

    const requestStartedAt = Date.now()
    const referenceImage = await readReferenceImage(input.referenceImageUrl)
    const formData = new FormData()
    formData.append('model', model.modelName)
    formData.append('prompt', input.prompt)
    formData.append('size', input.size ?? getDefaultSize(input.sizeTier))
    formData.append('n', String(quantity))
    formData.append(
      'image',
      new Blob([referenceImage.buffer], { type: referenceImage.contentType }),
      `reference.${getImageExtension(referenceImage.contentType)}`,
    )

    logGeneration('upstream-edit-request', {
      providerId: provider.id,
      providerType: provider.type,
      endpoint: getImageEditEndpoint(provider),
      body: {
        model: model.modelName,
        prompt: input.prompt,
        size: input.size ?? getDefaultSize(input.sizeTier),
        n: quantity,
        referenceImage: {
          ...summarizeReferenceImage(input.referenceImageUrl),
          contentType: referenceImage.contentType,
          bytes: referenceImage.buffer.length,
        },
      },
    })

    const response = await fetch(getImageEditEndpoint(provider), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${provider.apiKey}`,
      },
      body: formData,
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
      throw new AppError(response.status, `上游图片编辑接口调用失败：${response.status}`)
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
      ...buildOpenAiImageRequestBody(input, model, quantity),
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
        prompt: input.prompt,
        referenceImage: summarizeReferenceImage(input.referenceImageUrl),
      },
    })

    const response = await fetch(getImageEndpoint(provider), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${provider.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    })

    logGeneration('upstream-stream-response-start', {
      taskId,
      providerId: provider.id,
      status: response.status,
      ok: response.ok,
      durationMs: Date.now() - requestStartedAt,
      hasBody: Boolean(response.body),
    })

    if (!response.ok || !response.body) {
      const responseText = await response.text().catch(() => '')
      logGeneration('upstream-stream-response-error', {
        taskId,
        providerId: provider.id,
        status: response.status,
        ok: response.ok,
        responseText: summarizeText(responseText),
      })
      throw new AppError(response.status, `上游流式接口调用失败：${response.status}`)
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
            taskEvents.emitUpdated(await this.taskRepository.update(taskId, {
              resultJson: {
                partial: partialImage,
                stream: true,
              },
            }))
          }
        }
      }
    }

    const streamResult = {
      data: [finalImage ?? partialImage].filter(Boolean),
      final: finalImage,
      partial: partialImage,
      stream: true,
    }
    logGeneration('upstream-stream-complete', {
      taskId,
      durationMs: Date.now() - requestStartedAt,
      result: summarizeImageResult(streamResult),
    })
    return streamResult
  }
}
