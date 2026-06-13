import type { ApiProvider } from './apiProviderTypes.js'
import { ApiLogRepository } from '../apiLogs/apiLogRepository.js'
import { ApiProviderRepository } from './apiProviderRepository.js'
import { BarkService } from '../notifications/barkService.js'

const monitorIntervalMs = 60 * 1000
const monitorTimeoutMs = 15 * 1000
const monitorPhase = 'service-monitor'
const schedulerLogVerbose = process.env.SCHEDULER_LOG_VERBOSE === '1'

function formatLogTime(date = new Date()) {
  return date.toLocaleString('zh-CN', {
    hour12: false,
    timeZone: 'Asia/Shanghai',
  })
}

function createModelsEndpoint(baseUrl: string) {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '')
  if (normalizedBaseUrl.endsWith('/v1')) {
    return `${normalizedBaseUrl}/models`
  }
  return `${normalizedBaseUrl}/v1/models`
}

function readModelCount(payload: unknown) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return 0
  const body = payload as { data?: unknown; models?: unknown }
  if (Array.isArray(body.data)) return body.data.length
  if (Array.isArray(body.models)) return body.models.length
  return 0
}

async function sampleProvider(provider: ApiProvider, apiLogRepository: ApiLogRepository, barkService: BarkService) {
  const endpoint = createModelsEndpoint(provider.baseUrl)
  const startedAt = Date.now()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), monitorTimeoutMs)

  try {
    const response = await fetch(endpoint, {
      headers: {
        Authorization: `Bearer ${provider.apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
    })
    const durationMs = Date.now() - startedAt
    const payload = await response.json().catch(() => null)
    const modelCount = readModelCount(payload)

    await apiLogRepository.create({
      direction: 'upstream',
      providerId: provider.id,
      providerType: provider.type,
      endpoint,
      phase: monitorPhase,
      method: 'GET',
      status: response.ok ? 'success' : 'failed',
      statusCode: response.status,
      durationMs,
      requestSummary: { source: monitorPhase },
      responseSummary: {
        ok: response.ok,
        modelCount,
        message: response.ok ? `监控成功，模型 ${modelCount} 个` : `监控失败：HTTP ${response.status}`,
      },
      errorMessage: response.ok ? null : `监控失败：HTTP ${response.status}`,
    })
    if (!response.ok) {
      void barkService.pushProviderFailure({
        providerName: provider.name,
        providerType: provider.type,
        endpoint,
        statusCode: response.status,
        message: `监控失败：HTTP ${response.status}`,
        durationMs,
      }).catch((error) => {
        console.warn('[bark:provider-failure-push-failed]', error instanceof Error ? error.message : String(error))
      })
    }
  } catch (error) {
    const durationMs = Date.now() - startedAt
    const isAbort = error instanceof Error && error.name === 'AbortError'
    const message = isAbort ? `监控超时：超过 ${monitorTimeoutMs}ms` : error instanceof Error ? error.message : '监控失败'

    await apiLogRepository.create({
      direction: 'upstream',
      providerId: provider.id,
      providerType: provider.type,
      endpoint,
      phase: monitorPhase,
      method: 'GET',
      status: 'failed',
      statusCode: null,
      durationMs,
      requestSummary: { source: monitorPhase },
      responseSummary: { ok: false, message },
      errorMessage: message,
    })
    void barkService.pushProviderFailure({
      providerName: provider.name,
      providerType: provider.type,
      endpoint,
      statusCode: null,
      message,
      durationMs,
    }).catch((pushError) => {
      console.warn('[bark:provider-failure-push-failed]', pushError instanceof Error ? pushError.message : String(pushError))
    })
  } finally {
    clearTimeout(timeout)
  }
}

export function startApiProviderMonitor() {
  const apiProviderRepository = new ApiProviderRepository()
  const apiLogRepository = new ApiLogRepository()
  const barkService = new BarkService()
  let running = false

  console.info(`[service-monitor] scheduler started at ${formatLogTime()}, interval=${Math.round(monitorIntervalMs / 1000)}s`)

  const run = async () => {
    if (running) {
      if (schedulerLogVerbose) {
        console.info(`[service-monitor] skip sample at ${formatLogTime()}, previous sample still running`)
      }
      return
    }

    running = true
    const startedAt = Date.now()
    try {
      const providers = (await apiProviderRepository.findAll()).filter((provider) => provider.status === 'active')
      await Promise.allSettled(providers.map((provider) => sampleProvider(provider, apiLogRepository, barkService)))
      if (schedulerLogVerbose) {
        console.info(`[service-monitor] sampled at ${formatLogTime()}, providers=${providers.length}, duration=${Date.now() - startedAt}ms`)
      }
    } catch (error) {
      console.error(`[service-monitor] failed at ${formatLogTime()}, duration=${Date.now() - startedAt}ms`)
      console.error(error)
    } finally {
      running = false
    }
  }

  void run()
  const timer = setInterval(run, monitorIntervalMs)

  return () => {
    clearInterval(timer)
    console.info(`[service-monitor] scheduler stopped at ${formatLogTime()}`)
  }
}
