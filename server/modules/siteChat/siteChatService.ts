import { AppError } from '../../shared/AppError.js'
import { getRequestIp } from '../../shared/requestIp.js'
import { ApiLogRepository } from '../apiLogs/apiLogRepository.js'
import { ApiProviderRepository } from '../apiProviders/apiProviderRepository.js'
import type { ApiProvider } from '../apiProviders/apiProviderTypes.js'
import { UserRepository } from '../users/userRepository.js'
import type { Request, Response } from 'express'

type SiteChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string | Array<
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } }
  >
}

type SiteChatCompletionInput = {
  userId: string
  messages: SiteChatMessage[]
}

const freeChatDisplayModelName = 'gpt5.5'
const freeChatUpstreamModelName = 'gpt5.5'

function getOpenAiBaseUrl(baseUrl: string) {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '')
  return normalizedBaseUrl.endsWith('/v1') ? normalizedBaseUrl : `${normalizedBaseUrl}/v1`
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
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

function readUpstreamError(payload: unknown) {
  if (!payload || typeof payload !== 'object') return ''
  const value = payload as Record<string, unknown>
  const error = value.error
  if (error && typeof error === 'object') {
    const message = (error as { message?: unknown }).message
    return typeof message === 'string' ? message : ''
  }
  return typeof value.message === 'string' ? value.message : ''
}

function writeSse(res: Response, event: string, data: unknown) {
  res.write(`event: ${event}\n`)
  res.write(`data: ${JSON.stringify(data)}\n\n`)
}

function extractDeltaText(payload: unknown): string {
  if (typeof payload === 'string') return payload
  if (!payload || typeof payload !== 'object') return ''
  const value = payload as Record<string, unknown>
  const choices = value.choices
  if (Array.isArray(choices)) {
    return choices.map((choice) => {
      if (!choice || typeof choice !== 'object') return ''
      const item = choice as Record<string, unknown>
      const delta = item.delta
      if (delta && typeof delta === 'object') {
        const content = (delta as { content?: unknown }).content
        if (typeof content === 'string') return content
        if (Array.isArray(content)) return content.map(extractResponseText).join('')
      }
      const message = item.message
      if (message && typeof message === 'object') {
        const content = (message as { content?: unknown }).content
        if (typeof content === 'string') return content
      }
      return typeof item.text === 'string' ? item.text : ''
    }).join('')
  }
  const delta = value.delta
  if (typeof delta === 'string') return delta
  if (delta && typeof delta === 'object') return extractResponseText(delta)
  return extractResponseText(payload)
}

function summarizeMessages(messages: SiteChatMessage[]) {
  return messages.map((message) => ({
    role: message.role,
    textLength: typeof message.content === 'string'
      ? message.content.length
      : message.content
        .filter((item) => item.type === 'text')
        .reduce((sum, item) => sum + ('text' in item ? item.text.length : 0), 0),
    imageCount: Array.isArray(message.content)
      ? message.content.filter((item) => item.type === 'image_url').length
      : 0,
  }))
}

export class SiteChatService {
  constructor(
    private readonly userRepository = new UserRepository(),
    private readonly apiProviderRepository = new ApiProviderRepository(),
    private readonly apiLogRepository = new ApiLogRepository(),
  ) {}

  private async resolveFreeChatTarget(): Promise<{ provider: ApiProvider; modelName: string; modelSource: 'model' | 'provider' }> {
    const provider = await this.apiProviderRepository.findFirstActive()
    if (!provider) throw new AppError(404, '接口配置不存在或已禁用')
    return { provider, modelName: freeChatUpstreamModelName, modelSource: 'provider' }
  }

  async complete(req: Request, input: SiteChatCompletionInput) {
    const startedAt = Date.now()
    const user = await this.userRepository.findById(input.userId)
    if (!user || user.status !== 'active') throw new AppError(404, '用户不存在或已禁用')
    const { provider, modelName, modelSource } = await this.resolveFreeChatTarget()
    const costCredits = 0

    const endpoint = `${getOpenAiBaseUrl(provider.baseUrl)}/chat/completions`
    const requestBody = {
      model: modelName,
      messages: input.messages,
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

      const text = extractResponseText(responsePayload).trim()
      if (!text) throw new AppError(502, '上游聊天接口未返回内容')

      await this.apiLogRepository.create({
        direction: 'upstream',
        userId: user.id,
        providerId: provider.id,
        providerType: provider.type,
        endpoint,
        phase: 'site-chat-completions',
        method: 'POST',
        status: 'success',
        statusCode,
        durationMs: Date.now() - startedAt,
        requestSummary: {
          model: modelName,
          modelSource,
          messageCount: input.messages.length,
          messages: summarizeMessages(input.messages),
          userIp: getRequestIp(req),
        },
        responseSummary: {
          text: text.slice(0, 4000),
          costCredits,
          remainingCredits: user.credits,
        },
      })

      return {
        message: {
          role: 'assistant',
          content: text,
        },
        costCredits,
        remainingCredits: user.credits,
      }
    } catch (error) {
      await this.apiLogRepository.create({
        direction: 'upstream',
        userId: user.id,
        providerId: provider.id,
        providerType: provider.type,
        endpoint,
        phase: 'site-chat-completions',
        method: 'POST',
        status: 'failed',
        statusCode,
        durationMs: Date.now() - startedAt,
        requestSummary: {
          model: modelName,
          modelSource,
          messageCount: input.messages.length,
          messages: summarizeMessages(input.messages),
          userIp: getRequestIp(req),
        },
        responseSummary: responsePayload ?? responseText,
        errorMessage: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }

  async completeStream(req: Request, res: Response, input: SiteChatCompletionInput) {
    const startedAt = Date.now()
    const user = await this.userRepository.findById(input.userId)
    if (!user || user.status !== 'active') throw new AppError(404, '用户不存在或已禁用')
    const { provider, modelName, modelSource } = await this.resolveFreeChatTarget()
    const endpoint = `${getOpenAiBaseUrl(provider.baseUrl)}/chat/completions`
    const requestBody = {
      model: modelName,
      messages: input.messages,
      stream: true,
    }

    let statusCode = 200
    let responseText = ''
    let fullText = ''
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
      res.setHeader('X-Chat-Stream', '1')
      res.flushHeaders?.()
      writeSse(res, 'start', { model: modelName, modelSource })

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      const handleBlock = (block: string) => {
        const lines = block.split(/\r?\n/)
        const data = lines
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.replace(/^data:\s?/, ''))
          .join('\n')
          .trim()
        if (!data || data === '[DONE]') return
        const payload = tryParseJson(data)
        const delta = extractDeltaText(payload)
        if (!delta) return
        fullText += delta
        writeSse(res, 'delta', { text: delta })
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const blocks = buffer.split(/\r?\n\r?\n/)
        buffer = blocks.pop() || ''
        blocks.forEach(handleBlock)
      }
      if (buffer.trim()) handleBlock(buffer.trim())
      writeSse(res, 'done', {
        message: {
          role: 'assistant',
          content: fullText || '没有返回内容',
        },
        costCredits: 0,
        remainingCredits: user.credits,
      })
      if (!res.writableEnded) res.end()

      await this.apiLogRepository.create({
        direction: 'upstream',
        userId: user.id,
        providerId: provider.id,
        providerType: provider.type,
        endpoint,
        phase: 'site-chat-completions-stream',
        method: 'POST',
        status: 'success',
        statusCode,
        durationMs: Date.now() - startedAt,
        requestSummary: {
          model: modelName,
          modelSource,
          messageCount: input.messages.length,
          messages: summarizeMessages(input.messages),
          stream: true,
          userIp: getRequestIp(req),
        },
        responseSummary: {
          text: fullText.slice(0, 4000),
          stream: true,
          costCredits: 0,
          remainingCredits: user.credits,
        },
      })
    } catch (error) {
      await this.apiLogRepository.create({
        direction: 'upstream',
        userId: user.id,
        providerId: provider.id,
        providerType: provider.type,
        endpoint,
        phase: 'site-chat-completions-stream',
        method: 'POST',
        status: 'failed',
        statusCode,
        durationMs: Date.now() - startedAt,
        requestSummary: {
          model: modelName,
          modelSource,
          messageCount: input.messages.length,
          messages: summarizeMessages(input.messages),
          stream: true,
          userIp: getRequestIp(req),
        },
        responseSummary: responseText || { text: fullText.slice(0, 4000), stream: true },
        errorMessage: error instanceof Error ? error.message : String(error),
      })
      if (res.headersSent) {
        writeSse(res, 'error', { message: error instanceof Error ? error.message : '聊天失败' })
        if (!res.writableEnded) res.end()
        return
      }
      throw error
    }
  }
}
