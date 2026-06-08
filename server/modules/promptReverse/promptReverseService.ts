import { AppError } from '../../shared/AppError.js'
import { env } from '../../config/env.js'
import { ApiProviderRepository } from '../apiProviders/apiProviderRepository.js'
import type { ApiProvider } from '../apiProviders/apiProviderTypes.js'
import { ModelRepository } from '../models/modelRepository.js'
import { UserRepository } from '../users/userRepository.js'

type ReversePromptInput = {
  userId: string
  modelId: string
  imageUrl: string
  language: 'zh' | 'en'
}

const promptReverseProviderName = 'AI-PAI'

function getChatCompletionsEndpoint(provider: ApiProvider) {
  return `${provider.baseUrl.replace(/\/+$/, '')}/v1/chat/completions`
}

function getMessagesEndpoint(provider: ApiProvider) {
  return `${provider.baseUrl.replace(/\/+$/, '')}/v1/messages`
}

function parseDataImage(value: string) {
  const match = value.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/)
  if (!match) return null
  return {
    contentType: match[1],
    buffer: Buffer.from(match[2], 'base64'),
  }
}

function parseDataUrl(value: string) {
  const match = value.match(/^data:([^;]+);base64,(.+)$/)
  if (!match) return null
  return {
    mediaType: match[1],
    data: match[2],
  }
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
  return fallback.startsWith('image/') ? fallback : 'image/png'
}

async function readImageAsDataUrl(value: string) {
  const dataImage = parseDataImage(value)
  if (dataImage) {
    return `data:${dataImage.contentType};base64,${dataImage.buffer.toString('base64')}`
  }

  const response = await fetch(value)
  if (!response.ok) {
    throw new AppError(response.status, `图片读取失败：${response.status}`)
  }
  const buffer = Buffer.from(await response.arrayBuffer())
  const contentType = detectImageContentType(buffer, response.headers.get('content-type') ?? 'image/png')
  return `data:${contentType};base64,${buffer.toString('base64')}`
}

function extractChatCompletionContent(value: unknown) {
  if (!value || typeof value !== 'object') return ''
  const choices = (value as { choices?: unknown }).choices
  if (!Array.isArray(choices)) return ''
  return choices.map((choice) => {
    if (!choice || typeof choice !== 'object') return ''
    const content = (choice as { message?: { content?: unknown } }).message?.content
    if (typeof content === 'string') return content
    if (Array.isArray(content)) {
      return content.map((item) => {
        if (!item || typeof item !== 'object') return ''
        const text = (item as { text?: unknown }).text
        return typeof text === 'string' ? text : ''
      }).join('')
    }
    return ''
  }).join('\n').trim()
}

function extractMessagesContent(value: unknown) {
  if (!value || typeof value !== 'object') return ''
  const content = (value as { content?: unknown }).content
  if (typeof content === 'string') return content.trim()
  if (!Array.isArray(content)) return ''
  return content.map((item) => {
    if (!item || typeof item !== 'object') return ''
    const text = (item as { text?: unknown }).text
    return typeof text === 'string' ? text : ''
  }).join('\n').trim()
}

function buildSystemPrompt(language: 'zh' | 'en') {
  if (language === 'en') {
    return [
      'You are an image prompt reverse-engineering assistant.',
      'Analyze the image and write one polished image-generation prompt.',
      'Describe subject, composition, lighting, camera, materials, color palette, style, background, and important details.',
      'Return only the prompt text. Do not add explanations or markdown.',
    ].join(' ')
  }

  return [
    '你是专业的图片提示词反推助手。',
    '请分析用户上传的图片，并输出一段适合 AI 生图模型使用的中文提示词。',
    '提示词需要包含主体、场景、构图、光线、镜头、材质、色彩、风格、背景和关键细节。',
    '只输出提示词正文，不要解释，不要使用 Markdown。',
  ].join('')
}

function buildUserText(language: 'zh' | 'en') {
  return language === 'en'
    ? 'Reverse this image into a detailed prompt for image generation.'
    : '请把这张图片反推出一段高质量生图提示词。'
}

function isNanoModel(model: { modelName?: string; displayName?: string; providerName?: string }) {
  return [
    model.modelName,
    model.displayName,
    model.providerName,
  ].join(' ').toLowerCase().includes('nano')
}

async function readResponseJsonWithText(response: Response) {
  const text = await response.text().catch(() => '')
  if (!text) return { json: null, text: '' }
  try {
    return { json: JSON.parse(text) as unknown, text }
  } catch {
    return { json: null, text }
  }
}

function upstreamErrorMessage(resultJson: unknown, responseText: string) {
  if (resultJson && typeof resultJson === 'object') {
    const payload = resultJson as { error?: { message?: unknown }; message?: unknown }
    const message = payload.error?.message ?? payload.message
    if (typeof message === 'string' && message.trim()) return message
  }
  return responseText.slice(0, 500)
}

function isRetryableStatus(status: number) {
  return [408, 409, 425, 429, 500, 502, 503, 504].includes(status)
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

async function fetchWithRetry(url: string, init: RequestInit, context: Record<string, unknown>) {
  const maxAttempts = Math.max(1, Math.min(5, env.promptReverse.maxAttempts || 1))
  let lastError: unknown = null

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let response: Response
    try {
      response = await fetch(url, init)
    } catch (error) {
      lastError = error
      if (attempt >= maxAttempts) {
        const message = error instanceof Error ? error.message : 'fetch failed'
        throw new AppError(502, `上游接口连接失败：${message}`)
      }
      await sleep(800 * attempt)
      continue
    }

    if (!isRetryableStatus(response.status) || attempt >= maxAttempts) {
      return response
    }

    const responseText = await response.text().catch(() => '')
    lastError = new AppError(response.status, upstreamErrorMessage(null, responseText) || response.statusText)
    console.warn('[prompt-reverse:retry]', JSON.stringify({
      ...context,
      attempt,
      nextAttempt: attempt + 1,
      status: response.status,
      message: upstreamErrorMessage(null, responseText) || response.statusText,
    }))
    await sleep(900 * attempt)
  }

  throw lastError instanceof Error ? lastError : new AppError(502, '上游接口连接失败')
}

export class PromptReverseService {
  constructor(
    private readonly userRepository = new UserRepository(),
    private readonly modelRepository = new ModelRepository(),
    private readonly apiProviderRepository = new ApiProviderRepository(),
  ) {}

  async reverse(input: ReversePromptInput) {
    const user = await this.userRepository.findById(input.userId)
    if (!user) throw new AppError(404, '用户不存在')
    if (user.status !== 'active') throw new AppError(403, '用户已被禁用')

    const model = await this.modelRepository.findById(input.modelId)
    if (!model) throw new AppError(404, '模型不存在')
    if (model.status !== 'active') throw new AppError(400, '模型已禁用')
    if (isNanoModel(model)) throw new AppError(400, 'Nano 接口不支持提示词反推')

    const provider = await this.apiProviderRepository.findById(model.providerId)
    if (!provider) throw new AppError(404, '接口配置不存在')
    if (provider.status !== 'active') throw new AppError(400, '接口已禁用')
    if (provider.capability !== 'chat_image') throw new AppError(400, '请选择支持视觉理解的模型')
    if (provider.name !== promptReverseProviderName) {
      throw new AppError(400, `提示词反推仅支持 ${promptReverseProviderName} 接口`)
    }

    const imageUrl = await readImageAsDataUrl(input.imageUrl)
    const prompt = await this.callVisionModel(provider, imageUrl, input.language)
    return {
      prompt,
      modelId: model.id,
      modelName: env.promptReverse.model,
      providerModelName: model.displayName || model.modelName,
    }
  }

  private async callVisionModel(provider: ApiProvider, imageUrl: string, language: 'zh' | 'en') {
    if (env.promptReverse.endpoint === 'messages') {
      return this.callMessagesModel(provider, imageUrl, language)
    }
    return this.callChatCompletionsModel(provider, imageUrl, language)
  }

  private async callChatCompletionsModel(provider: ApiProvider, imageUrl: string, language: 'zh' | 'en') {
    const requestBody = {
      model: env.promptReverse.model,
      messages: [
        { role: 'system', content: buildSystemPrompt(language) },
        {
          role: 'user',
          content: [
            { type: 'text', text: buildUserText(language) },
            { type: 'image_url', image_url: { url: imageUrl } },
          ],
        },
      ],
      temperature: 0.35,
    }

    const response = await fetchWithRetry(getChatCompletionsEndpoint(provider), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${provider.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      }, {
        providerId: provider.id,
        endpoint: 'chat_completions',
        model: env.promptReverse.model,
      })

    const { json, text } = await readResponseJsonWithText(response)
    if (!response.ok) {
      throw new AppError(response.status, `上游提示词反推失败：${upstreamErrorMessage(json, text)}`)
    }

    const prompt = extractChatCompletionContent(json)
    if (!prompt) {
      throw new AppError(502, '上游未返回有效提示词')
    }
    return prompt
  }

  private async callMessagesModel(provider: ApiProvider, imageUrl: string, language: 'zh' | 'en') {
    const image = parseDataUrl(imageUrl)
    if (!image) {
      throw new AppError(400, '图片格式错误')
    }

    const requestBody = {
      model: env.promptReverse.model,
      system: buildSystemPrompt(language),
      max_tokens: 1200,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: image.mediaType,
                data: image.data,
              },
            },
            { type: 'text', text: buildUserText(language) },
          ],
        },
      ],
    }

    const response = await fetchWithRetry(getMessagesEndpoint(provider), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${provider.apiKey}`,
          'x-api-key': provider.apiKey,
          'anthropic-version': env.promptReverse.messagesVersion,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      }, {
        providerId: provider.id,
        endpoint: 'messages',
        model: env.promptReverse.model,
      })

    const { json, text } = await readResponseJsonWithText(response)
    if (!response.ok) {
      throw new AppError(response.status, `上游提示词反推失败：${upstreamErrorMessage(json, text)}`)
    }

    const prompt = extractMessagesContent(json)
    if (!prompt) {
      throw new AppError(502, '上游未返回有效提示词')
    }
    return prompt
  }
}
