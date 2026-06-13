import { AppError } from '../../shared/AppError.js'

const OPENNANA_API_BASE = 'https://api.opennana.com/api/prompts'
const cacheTtlMs = 5 * 60 * 1000
const cache = new Map<string, { expiresAt: number; data: unknown }>()

function clampNumber(value: unknown, fallback: number, min: number, max: number) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(max, Math.max(min, Math.floor(number)))
}

function getString(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

async function fetchOpenNanaJson(url: string) {
  const cached = cache.get(url)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 12000)
  try {
    const response = await fetch(url, {
      headers: {
        accept: 'application/json',
        'user-agent': 'AI-PAI Prompt Library/1.0',
      },
      signal: controller.signal,
    })
    const text = await response.text()
    let json: unknown
    try {
      json = JSON.parse(text)
    } catch {
      throw new AppError(502, 'OpenNana 返回格式不是 JSON')
    }
    if (!response.ok) {
      throw new AppError(502, `OpenNana 请求失败：${response.status}`)
    }
    cache.set(url, { data: json, expiresAt: Date.now() + cacheTtlMs })
    return json
  } catch (error) {
    if (error instanceof AppError) throw error
    throw new AppError(502, error instanceof Error ? `OpenNana 连接失败：${error.message}` : 'OpenNana 连接失败')
  } finally {
    clearTimeout(timer)
  }
}

export class PromptLibraryService {
  async listOpenNanaPrompts(query: Record<string, unknown>) {
    const params = new URLSearchParams({
      page: String(clampNumber(query.page, 1, 1, 1000)),
      limit: String(clampNumber(query.limit, 24, 1, 48)),
      sort: getString(query.sort, 'reviewed_at'),
      order: getString(query.order, 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC',
      model: getString(query.model, 'ChatGPT'),
    })
    return fetchOpenNanaJson(`${OPENNANA_API_BASE}?${params.toString()}`)
  }

  async getOpenNanaPrompt(slug: string) {
    if (!/^[a-z0-9-]{1,180}$/i.test(slug)) {
      throw new AppError(400, 'OpenNana 提示词标识不正确')
    }
    return fetchOpenNanaJson(`${OPENNANA_API_BASE}/${encodeURIComponent(slug)}`)
  }
}
