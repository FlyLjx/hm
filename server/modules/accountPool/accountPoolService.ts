import { AppError } from '../../shared/AppError.js'
import { env } from '../../config/env.js'
import { SettingRepository } from '../settings/settingRepository.js'
import type { AccountPoolAccount, AccountPoolLimitProgress } from './accountPoolTypes.js'

type RawAccountPoolPayload = {
  items?: unknown[]
  detail?: unknown
  message?: unknown
  error?: unknown
  [key: string]: unknown
}

function text(value: unknown) {
  return typeof value === 'string' ? value : value == null ? '' : String(value)
}

function nullableText(value: unknown) {
  const next = text(value).trim()
  return next || null
}

function numberOrNull(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function booleanValue(value: unknown) {
  return value === true || value === 'true' || value === 1 || value === '1'
}

function payloadMessage(value: unknown): string {
  if (!value) return ''
  if (typeof value === 'string') return value
  if (typeof value !== 'object') return String(value)
  const row = value as Record<string, unknown>
  return text(row.message) || text(row.error) || text(row.detail) || JSON.stringify(value)
}

function parsePayload(value: string): RawAccountPoolPayload | null {
  if (!value) return null
  try {
    return JSON.parse(value) as RawAccountPoolPayload
  } catch {
    return null
  }
}

function normalizeLimitProgress(value: unknown): AccountPoolLimitProgress[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => {
    const row = item && typeof item === 'object' ? item as Record<string, unknown> : {}
    return {
      featureName: text(row.feature_name),
      remaining: numberOrNull(row.remaining),
      resetAfter: nullableText(row.reset_after),
    }
  })
}

function normalizeAccount(value: unknown): AccountPoolAccount {
  const row = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  return {
    createdAt: nullableText(row.created_at),
    email: text(row.email),
    password: text(row.password),
    accessToken: text(row.access_token),
    refreshToken: text(row.refresh_token),
    idToken: text(row.id_token),
    sourceType: text(row.source_type),
    type: text(row.type),
    status: text(row.status),
    quota: numberOrNull(row.quota),
    imageQuotaUnknown: booleanValue(row.image_quota_unknown),
    userId: text(row.user_id),
    proxy: text(row.proxy),
    limitsProgress: normalizeLimitProgress(row.limits_progress),
    defaultModelSlug: text(row.default_model_slug),
    restoreAt: nullableText(row.restore_at),
    success: numberOrNull(row.success) ?? 0,
    fail: numberOrNull(row.fail) ?? 0,
    invalidCount: numberOrNull(row.invalid_count) ?? 0,
    lastUsedAt: nullableText(row.last_used_at),
    lastInvalidAt: nullableText(row.last_invalid_at),
    lastRefreshError: nullableText(row.last_refresh_error),
    lastRefreshErrorAt: nullableText(row.last_refresh_error_at),
    lastTokenRefreshAt: nullableText(row.last_token_refresh_at),
    lastTokenRefreshError: nullableText(row.last_token_refresh_error),
    lastTokenRefreshErrorAt: nullableText(row.last_token_refresh_error_at),
  }
}

export class AccountPoolService {
  constructor(private readonly settingRepository = new SettingRepository()) {}

  async listAccounts() {
    const settings = await this.settingRepository.getSettings()
    const endpoint = settings.accountPoolEndpoint || env.accountPool.endpoint
    const apiKey = settings.accountPoolApiKey || env.accountPool.apiKey
    const authHeader = settings.accountPoolAuthHeader || env.accountPool.authHeader
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (apiKey) {
      headers[authHeader] = authHeader.toLowerCase() === 'authorization'
        ? `Bearer ${apiKey}`
        : apiKey
    }

    let response: Response
    try {
      response = await fetch(endpoint, {
        headers,
      })
    } catch {
      throw new AppError(502, '号池接口连接失败')
    }

    const responseText = await response.text().catch(() => '')
    const payload = parsePayload(responseText)
    if (!response.ok) {
      const message = payloadMessage(payload?.detail) || payloadMessage(payload?.message) || payloadMessage(payload?.error) || responseText || '号池接口请求失败'
      throw new AppError(502, `号池接口请求失败（上游 ${response.status}）：${message}`)
    }

    return {
      items: (payload?.items || []).map(normalizeAccount),
      source: endpoint,
      fetchedAt: new Date().toISOString(),
    }
  }
}
