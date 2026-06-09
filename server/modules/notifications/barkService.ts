import type { SystemSettings } from '../settings/settingTypes.js'
import { SettingRepository } from '../settings/settingRepository.js'

type BarkPushInput = {
  title: string
  body: string
  group?: string
  url?: string
  level?: 'active' | 'timeSensitive' | 'passive'
}

const dedupeWindowMs = 10 * 60 * 1000
const lastPushAtByKey = new Map<string, number>()

function normalizeServerUrl(value: string) {
  return value.trim().replace(/\/+$/, '')
}

function buildBarkEndpoint(settings: SystemSettings) {
  const serverUrl = normalizeServerUrl(settings.barkServerUrl || '')
  const deviceKey = settings.barkDeviceKey.trim()
  if (!serverUrl || !deviceKey) return null
  return `${serverUrl}/${encodeURIComponent(deviceKey)}`
}

function shouldSkipDedupe(key?: string) {
  if (!key) return false
  const now = Date.now()
  const lastPushAt = lastPushAtByKey.get(key) ?? 0
  if (now - lastPushAt < dedupeWindowMs) return true
  lastPushAtByKey.set(key, now)
  return false
}

export class BarkService {
  constructor(
    private readonly settingRepository = new SettingRepository(),
  ) {}

  async push(input: BarkPushInput) {
    const settings = await this.settingRepository.getSettings()
    if (!settings.barkEnabled) return { sent: false, reason: 'disabled' }

    const endpoint = buildBarkEndpoint(settings)
    if (!endpoint) return { sent: false, reason: 'missing-config' }

    const title = `${settings.barkTitlePrefix || settings.siteName || 'AIπ'} ${input.title}`.trim()
    const payload = {
      title,
      body: input.body,
      group: input.group || 'AIπ',
      url: input.url || settings.backendUrl || settings.frontendUrl,
      level: input.level || 'timeSensitive',
      sound: settings.barkSound || undefined,
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(`Bark 推送失败：${response.status}${text ? ` ${text}` : ''}`)
    }
    return { sent: true }
  }

  async pushGenerationFailure(input: {
    taskId: string
    userEmail?: string
    modelName?: string
    providerName?: string
    prompt?: string
    errorMessage?: string | null
    durationSeconds?: number
  }) {
    const settings = await this.settingRepository.getSettings()
    if (!settings.barkEnabled || !settings.barkNotifyGenerationFailure) return { sent: false, reason: 'disabled' }
    const body = [
      `任务：${input.taskId}`,
      `用户：${input.userEmail || '-'}`,
      `模型：${input.modelName || '-'}`,
      `接口：${input.providerName || '-'}`,
      `耗时：${input.durationSeconds ?? 0}s`,
      `错误：${input.errorMessage || '未知错误'}`,
      input.prompt ? `提示词：${input.prompt.slice(0, 160)}` : '',
    ].filter(Boolean).join('\n')
    return this.push({
      title: '生图任务失败',
      body,
      group: 'AIπ 生图异常',
      url: `${settings.backendUrl.replace(/\/+$/, '')}/admin/#/tasks`,
      level: 'timeSensitive',
    })
  }

  async pushTaskTimeout(input: {
    count: number
    timeoutMinutes: number
    taskIds: string[]
  }) {
    const settings = await this.settingRepository.getSettings()
    if (!settings.barkEnabled || !settings.barkNotifyTaskTimeout || input.count <= 0) return { sent: false, reason: 'disabled' }
    if (shouldSkipDedupe('task-timeout')) return { sent: false, reason: 'deduped' }
    return this.push({
      title: '任务超时关闭',
      body: [
        `数量：${input.count}`,
        `超时阈值：${input.timeoutMinutes} 分钟`,
        `任务：${input.taskIds.slice(0, 8).join(', ')}`,
      ].join('\n'),
      group: 'AIπ 系统异常',
      url: `${settings.backendUrl.replace(/\/+$/, '')}/admin/#/tasks`,
      level: 'timeSensitive',
    })
  }

  async pushProviderFailure(input: {
    providerName?: string
    providerType?: string
    endpoint: string
    statusCode?: number | null
    message: string
    durationMs: number
  }) {
    const settings = await this.settingRepository.getSettings()
    if (!settings.barkEnabled || !settings.barkNotifyProviderFailure) return { sent: false, reason: 'disabled' }
    const dedupeKey = `provider-failure:${input.providerName || input.endpoint}:${input.statusCode || 'network'}`
    if (shouldSkipDedupe(dedupeKey)) return { sent: false, reason: 'deduped' }
    return this.push({
      title: '接口监控异常',
      body: [
        `接口：${input.providerName || '-'}`,
        `类型：${input.providerType || '-'}`,
        `状态：${input.statusCode || 'network'}`,
        `耗时：${input.durationMs}ms`,
        `错误：${input.message}`,
        `地址：${input.endpoint}`,
      ].join('\n'),
      group: 'AIπ 接口异常',
      url: `${settings.backendUrl.replace(/\/+$/, '')}/admin/#/api-logs`,
      level: 'timeSensitive',
    })
  }

  async sendTest() {
    return this.push({
      title: 'Bark 测试推送',
      body: '如果你收到这条消息，说明 AIπ 的 Bark 通知配置已生效。',
      group: 'AIπ 系统通知',
      level: 'active',
    })
  }
}
