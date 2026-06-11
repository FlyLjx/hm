import { randomUUID } from 'node:crypto'
import type { RowDataPacket } from 'mysql2'
import { db } from '../../config/db.js'
import type { ApiCallLog, CreateApiCallLogInput } from './apiLogTypes.js'

type ApiCallLogRow = RowDataPacket & {
  id: string
  direction?: 'upstream' | 'downstream'
  task_id: string | null
  user_id?: string | null
  user_email?: string | null
  api_key_id?: string | null
  api_key_name?: string | null
  provider_id: string | null
  provider_name?: string | null
  provider_type: string | null
  endpoint: string
  phase: string
  method: string
  status: 'success' | 'failed'
  status_code: number | null
  duration_ms: string | number
  request_summary?: unknown
  response_summary?: unknown
  error_message: string | null
  created_at: Date
}

type StatsRow = RowDataPacket & {
  total: string | number
  success: string | number
  failed: string | number
  avg_duration_ms: string | number | null
  max_duration_ms: string | number | null
}

type GroupStatsRow = RowDataPacket & {
  direction?: 'upstream' | 'downstream'
  provider_id: string | null
  provider_name?: string | null
  endpoint: string
  phase: string
  total: string | number
  success: string | number
  failed: string | number
  avg_duration_ms: string | number | null
}

type PublicStatusRow = RowDataPacket & {
  total: string | number
  success: string | number
  failed: string | number
  slow?: string | number
  avg_duration_ms: string | number | null
  max_duration_ms?: string | number | null
  last_checked_at: Date | null
}

type PublicProviderStatusRow = PublicStatusRow & {
  provider_id: string
  provider_name?: string | null
  provider_status: 'active' | 'disabled'
  provider_type: string | null
  model_names?: string | null
  last_status?: 'success' | 'failed' | null
  last_duration_ms?: string | number | null
}

type PublicProviderHistoryRow = RowDataPacket & {
  provider_id: string
  status: 'success' | 'failed'
  duration_ms: string | number
  created_at: Date
}

const publicSlowRequestMs = 30000
const publicMonitorPhase = 'service-monitor'
const logSummaryMaxDepth = 8
const logSummaryMaxArrayItems = 20
const logSummaryMaxObjectKeys = 80
const logSummaryMaxTextLength = 3000
const detailSummarySqlLimit = 200000

function omittedImage(length: number) {
  return `[image-base64-omitted length=${length}]`
}

function isLikelyBase64(value: string) {
  return value.length > 200 && /^[A-Za-z0-9+/=\s]+$/.test(value)
}

function sanitizeSerializedJson(value: string) {
  return value
    .replace(/"((?:b64_json|b64|base64|image_base64|imageBase64|partial_image_b64))"\s*:\s*"([^"]{200,})"/gi, (_match, key: string, content: string) => {
      return `"${key}":"${omittedImage(content.length)}"`
    })
    .replace(/"data:image\/[^;"]+;base64,([^"]{200,})"/gi, (_match, content: string) => {
      return `"${omittedImage(content.length)}"`
    })
}

function parseJsonValue(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'string') {
    try {
      return sanitizeLogSummary(JSON.parse(sanitizeSerializedJson(value)) as unknown)
    } catch {
      return sanitizeLogSummary(value)
    }
  }
  return sanitizeLogSummary(value)
}

function toLog(row: ApiCallLogRow): ApiCallLog {
  return {
    id: row.id,
    direction: row.direction ?? 'upstream',
    taskId: row.task_id,
    userId: row.user_id ?? null,
    userEmail: row.user_email ?? null,
    apiKeyId: row.api_key_id ?? null,
    apiKeyName: row.api_key_name ?? null,
    providerId: row.provider_id,
    providerName: row.provider_name ?? null,
    providerType: row.provider_type,
    endpoint: row.endpoint,
    phase: row.phase,
    method: row.method,
    status: row.status,
    statusCode: row.status_code,
    durationMs: Number(row.duration_ms),
    requestSummary: parseJsonValue(row.request_summary),
    responseSummary: parseJsonValue(row.response_summary),
    errorMessage: row.error_message,
    createdAt: row.created_at.toISOString(),
  }
}

function dateFilter(days = 7) {
  return Math.min(90, Math.max(1, Number(days) || 7))
}

function sanitizeLogSummary(value: unknown, depth = 0): unknown {
  if (depth > logSummaryMaxDepth) return '[depth-limit]'

  if (typeof value === 'string') {
    const dataImageMatch = value.match(/^data:image\/[^;]+;base64,(.*)$/s)
    if (dataImageMatch) return omittedImage(dataImageMatch[1].length)

    if (isLikelyBase64(value)) return omittedImage(value.length)

    return value.length > logSummaryMaxTextLength
      ? `${value.slice(0, logSummaryMaxTextLength)}... length=${value.length}`
      : value
  }

  if (Array.isArray(value)) {
    const items = value.slice(0, logSummaryMaxArrayItems).map((item) => sanitizeLogSummary(item, depth + 1))
    if (value.length > logSummaryMaxArrayItems) items.push(`[truncated ${value.length - logSummaryMaxArrayItems} items]`)
    return items
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
    const safeEntries = entries.slice(0, logSummaryMaxObjectKeys).map(([key, item]) => {
      const normalizedKey = key.toLowerCase()
      if (
        normalizedKey.includes('authorization')
        || normalizedKey.includes('api_key')
        || normalizedKey === 'apikey'
        || normalizedKey.includes('secret')
        || normalizedKey.includes('token')
      ) {
        return [key, '[redacted]'] as const
      }
      if (
        normalizedKey === 'b64_json'
        || normalizedKey === 'b64'
        || normalizedKey === 'base64'
        || normalizedKey === 'image_base64'
        || normalizedKey === 'imagebase64'
        || normalizedKey === 'partial_image_b64'
      ) {
        return [key, typeof item === 'string' ? omittedImage(item.length) : '[image-base64-omitted]'] as const
      }
      return [key, sanitizeLogSummary(item, depth + 1)] as const
    })

    if (entries.length > logSummaryMaxObjectKeys) {
      safeEntries.push(['__truncatedKeys', entries.length - logSummaryMaxObjectKeys])
    }
    return Object.fromEntries(safeEntries)
  }

  return value
}

function stringifyLogSummary(value: unknown) {
  if (value === undefined) return null
  return JSON.stringify(sanitizeLogSummary(value))
}

export class ApiLogRepository {
  async create(input: CreateApiCallLogInput) {
    const id = randomUUID()
    await db.query(
      `INSERT INTO api_call_logs
        (id, direction, task_id, user_id, api_key_id, api_key_name, provider_id, provider_type, endpoint, phase, method, status, status_code, duration_ms, request_summary, response_summary, error_message)
       VALUES
        (:id, :direction, :taskId, :userId, :apiKeyId, :apiKeyName, :providerId, :providerType, :endpoint, :phase, :method, :status, :statusCode, :durationMs, :requestSummary, :responseSummary, :errorMessage)`,
      {
        id,
        direction: input.direction ?? 'upstream',
        taskId: input.taskId ?? null,
        userId: input.userId ?? null,
        apiKeyId: input.apiKeyId ?? null,
        apiKeyName: input.apiKeyName?.slice(0, 120) ?? null,
        providerId: input.providerId ?? null,
        providerType: input.providerType ?? null,
        endpoint: input.endpoint,
        phase: input.phase,
        method: input.method,
        status: input.status,
        statusCode: input.statusCode ?? null,
        durationMs: Math.max(0, Math.round(input.durationMs)),
        requestSummary: stringifyLogSummary(input.requestSummary),
        responseSummary: stringifyLogSummary(input.responseSummary),
        errorMessage: input.errorMessage?.slice(0, 1000) ?? null,
      },
    )
    return id
  }

  async updateDetails(id: string, input: Partial<Pick<ApiCallLog, 'status' | 'statusCode' | 'durationMs' | 'requestSummary' | 'responseSummary' | 'errorMessage'>>) {
    const fields: string[] = []
    const values: unknown[] = []
    const mappings: Record<string, string> = {
      status: 'status',
      statusCode: 'status_code',
      durationMs: 'duration_ms',
      requestSummary: 'request_summary',
      responseSummary: 'response_summary',
      errorMessage: 'error_message',
    }

    Object.entries(mappings).forEach(([key, column]) => {
      if (!(key in input)) return
      const value = input[key as keyof typeof input]
      fields.push(`${column} = ?`)
      if (key === 'requestSummary' || key === 'responseSummary') {
        values.push(stringifyLogSummary(value))
      } else if (key === 'durationMs') {
        values.push(Math.max(0, Math.round(Number(value || 0))))
      } else if (key === 'errorMessage') {
        values.push(typeof value === 'string' ? value.slice(0, 1000) : null)
      } else {
        values.push(value ?? null)
      }
    })

    if (fields.length === 0) return
    await db.query(`UPDATE api_call_logs SET ${fields.join(', ')} WHERE id = ?`, [...values, id])
  }

  async findById(id: string) {
    const [rows] = await db.query<ApiCallLogRow[]>(
      `SELECT
         api_call_logs.id,
         api_call_logs.direction,
         api_call_logs.task_id,
         api_call_logs.user_id,
         api_call_logs.api_key_id,
         api_call_logs.api_key_name,
         api_call_logs.provider_id,
         api_call_logs.provider_type,
         api_call_logs.endpoint,
         api_call_logs.phase,
         api_call_logs.method,
         api_call_logs.status,
         api_call_logs.status_code,
         api_call_logs.duration_ms,
         CASE
           WHEN CHAR_LENGTH(api_call_logs.request_summary) > :summaryLimit
           THEN JSON_OBJECT('omitted', true, 'originalLength', CHAR_LENGTH(api_call_logs.request_summary), 'reason', '请求摘要过大，已省略')
           ELSE api_call_logs.request_summary
         END AS request_summary,
         CASE
           WHEN CHAR_LENGTH(api_call_logs.response_summary) > :summaryLimit
           THEN JSON_OBJECT('omitted', true, 'originalLength', CHAR_LENGTH(api_call_logs.response_summary), 'reason', '响应摘要过大，已省略')
           ELSE api_call_logs.response_summary
         END AS response_summary,
         api_call_logs.error_message,
         api_call_logs.created_at,
         api_providers.name AS provider_name,
         users.email AS user_email
       FROM api_call_logs
       LEFT JOIN api_providers ON api_providers.id = api_call_logs.provider_id
       LEFT JOIN users ON users.id = api_call_logs.user_id
       WHERE api_call_logs.id = :id
       LIMIT 1`,
      { id, summaryLimit: detailSummarySqlLimit },
    )
    return rows[0] ? toLog(rows[0]) : null
  }

  async findAll(input?: { page?: number; pageSize?: number; days?: number; status?: 'all' | 'success' | 'failed'; direction?: 'all' | 'upstream' | 'downstream'; keyword?: string; apiKeyId?: string }) {
    const page = Math.max(1, input?.page ?? 1)
    const pageSize = Math.min(100, Math.max(1, input?.pageSize ?? 30))
    const offset = (page - 1) * pageSize
    const where = [
      'api_call_logs.created_at >= DATE_SUB(NOW(), INTERVAL :days DAY)',
      'api_call_logs.phase <> :monitorPhase',
    ]
    const params: Record<string, string | number> = {
      pageSize,
      offset,
      days: dateFilter(input?.days),
      monitorPhase: publicMonitorPhase,
    }

    if (input?.status && input.status !== 'all') {
      where.push('api_call_logs.status = :status')
      params.status = input.status
    }
    if (input?.direction && input.direction !== 'all') {
      where.push('api_call_logs.direction = :direction')
      params.direction = input.direction
    }
    if (input?.apiKeyId?.trim()) {
      where.push('api_call_logs.api_key_id = :apiKeyId')
      params.apiKeyId = input.apiKeyId.trim()
    }
    if (input?.keyword?.trim()) {
      where.push('(api_call_logs.endpoint LIKE :keyword OR api_call_logs.phase LIKE :keyword OR api_providers.name LIKE :keyword OR users.email LIKE :keyword OR api_call_logs.api_key_name LIKE :keyword OR api_call_logs.error_message LIKE :keyword)')
      params.keyword = `%${input.keyword.trim()}%`
    }

    const whereSql = `WHERE ${where.join(' AND ')}`
    const [countRows] = await db.query<Array<RowDataPacket & { total: string | number }>>(
      `SELECT COUNT(*) AS total
       FROM api_call_logs
       LEFT JOIN api_providers ON api_providers.id = api_call_logs.provider_id
       LEFT JOIN users ON users.id = api_call_logs.user_id
       ${whereSql}`,
      params,
    )
    const [rows] = await db.query<ApiCallLogRow[]>(
      `SELECT
         api_call_logs.id,
         api_call_logs.direction,
         api_call_logs.task_id,
         api_call_logs.user_id,
         api_call_logs.api_key_id,
         api_call_logs.api_key_name,
         api_call_logs.provider_id,
         api_call_logs.provider_type,
         api_call_logs.endpoint,
         api_call_logs.phase,
         api_call_logs.method,
         api_call_logs.status,
         api_call_logs.status_code,
         api_call_logs.duration_ms,
         api_call_logs.error_message,
         api_call_logs.created_at,
         api_providers.name AS provider_name,
         users.email AS user_email
       FROM api_call_logs
       LEFT JOIN api_providers ON api_providers.id = api_call_logs.provider_id
       LEFT JOIN users ON users.id = api_call_logs.user_id
       ${whereSql}
       ORDER BY api_call_logs.created_at DESC, api_call_logs.id DESC
       LIMIT :pageSize OFFSET :offset`,
      params,
    )

    return {
      items: rows.map(toLog),
      total: Number(countRows[0]?.total ?? 0),
      page,
      pageSize,
    }
  }

  async getStats(input?: { days?: number; apiKeyId?: string }) {
    const where = [
      'created_at >= DATE_SUB(NOW(), INTERVAL :days DAY)',
      'phase <> :monitorPhase',
    ]
    const groupWhere = [
      'api_call_logs.created_at >= DATE_SUB(NOW(), INTERVAL :days DAY)',
      'api_call_logs.phase <> :monitorPhase',
    ]
    const params: Record<string, string | number> = {
      days: dateFilter(input?.days),
      monitorPhase: publicMonitorPhase,
    }
    if (input?.apiKeyId?.trim()) {
      where.push('api_key_id = :apiKeyId')
      groupWhere.push('api_call_logs.api_key_id = :apiKeyId')
      params.apiKeyId = input.apiKeyId.trim()
    }
    const [rows] = await db.query<StatsRow[]>(
      `SELECT
        COUNT(*) AS total,
        SUM(status = 'success') AS success,
        SUM(status = 'failed') AS failed,
        AVG(duration_ms) AS avg_duration_ms,
        MAX(duration_ms) AS max_duration_ms
       FROM api_call_logs
       WHERE ${where.join(' AND ')}`,
      params,
    )
    const [groups] = await db.query<GroupStatsRow[]>(
      `SELECT
        api_call_logs.direction,
        api_call_logs.provider_id,
        api_providers.name AS provider_name,
        api_call_logs.endpoint,
        api_call_logs.phase,
        COUNT(*) AS total,
        SUM(api_call_logs.status = 'success') AS success,
        SUM(api_call_logs.status = 'failed') AS failed,
        AVG(api_call_logs.duration_ms) AS avg_duration_ms
       FROM api_call_logs
       LEFT JOIN api_providers ON api_providers.id = api_call_logs.provider_id
       WHERE ${groupWhere.join(' AND ')}
       GROUP BY api_call_logs.direction, api_call_logs.provider_id, api_providers.name, api_call_logs.endpoint, api_call_logs.phase
       ORDER BY total DESC, avg_duration_ms DESC
       LIMIT 12`,
      params,
    )

    const row = rows[0]
    const total = Number(row?.total ?? 0)
    const success = Number(row?.success ?? 0)
    const failed = Number(row?.failed ?? 0)
    return {
      total,
      success,
      failed,
      successRate: total > 0 ? Number(((success / total) * 100).toFixed(2)) : 0,
      avgDurationMs: Number(row?.avg_duration_ms ?? 0),
      maxDurationMs: Number(row?.max_duration_ms ?? 0),
      groups: groups.map((item) => {
        const groupTotal = Number(item.total ?? 0)
        const groupSuccess = Number(item.success ?? 0)
        return {
          direction: item.direction ?? 'upstream',
          providerId: item.provider_id,
          providerName: item.provider_name,
          endpoint: item.endpoint,
          phase: item.phase,
          total: groupTotal,
          success: groupSuccess,
          failed: Number(item.failed ?? 0),
          successRate: groupTotal > 0 ? Number(((groupSuccess / groupTotal) * 100).toFixed(2)) : 0,
          avgDurationMs: Number(item.avg_duration_ms ?? 0),
        }
      }),
    }
  }

  async getPublicStatus() {
    const [dayRows] = await db.query<PublicStatusRow[]>(
      `SELECT
        COUNT(*) AS total,
        SUM(status = 'success') AS success,
        SUM(status = 'failed') AS failed,
        AVG(duration_ms) AS avg_duration_ms,
        MAX(created_at) AS last_checked_at
       FROM api_call_logs
       WHERE direction = 'upstream'
         AND phase = :monitorPhase
         AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)`,
      { monitorPhase: publicMonitorPhase },
    )
    const [weekRows] = await db.query<PublicStatusRow[]>(
      `SELECT
        COUNT(*) AS total,
        SUM(status = 'success') AS success,
        SUM(status = 'failed') AS failed,
        AVG(duration_ms) AS avg_duration_ms,
        MAX(created_at) AS last_checked_at
       FROM api_call_logs
       WHERE direction = 'upstream'
         AND phase = :monitorPhase
         AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)`,
      { monitorPhase: publicMonitorPhase },
    )
    const [providerRows] = await db.query<PublicProviderStatusRow[]>(
      `SELECT
        api_providers.id AS provider_id,
        api_providers.name AS provider_name,
        api_providers.status AS provider_status,
        api_providers.type AS provider_type,
        model_summary.model_names,
        COALESCE(log_summary.total, 0) AS total,
        COALESCE(log_summary.success, 0) AS success,
        COALESCE(log_summary.failed, 0) AS failed,
        COALESCE(log_summary.slow, 0) AS slow,
        log_summary.avg_duration_ms,
        log_summary.max_duration_ms,
        log_summary.last_checked_at
       FROM api_providers
       LEFT JOIN (
         SELECT provider_id, GROUP_CONCAT(DISTINCT display_name ORDER BY display_name SEPARATOR ', ') AS model_names
         FROM ai_models
         WHERE status = 'active'
           AND capability = 'chat_image'
         GROUP BY provider_id
       ) model_summary ON model_summary.provider_id = api_providers.id
       LEFT JOIN (
         SELECT
          provider_id,
          COUNT(*) AS total,
          SUM(status = 'success') AS success,
          SUM(status = 'failed') AS failed,
          SUM(duration_ms >= :slowMs) AS slow,
          AVG(duration_ms) AS avg_duration_ms,
          MAX(duration_ms) AS max_duration_ms,
          MAX(created_at) AS last_checked_at
         FROM api_call_logs
         WHERE direction = 'upstream'
           AND phase = :monitorPhase
           AND provider_id IS NOT NULL
           AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
         GROUP BY provider_id
       ) log_summary ON log_summary.provider_id = api_providers.id
       ORDER BY api_providers.status ASC, total DESC, api_providers.name ASC`,
      { slowMs: publicSlowRequestMs, monitorPhase: publicMonitorPhase },
    )
    const historyResults = await Promise.all(
      providerRows.map(async (provider) => {
        const [rows] = await db.query<PublicProviderHistoryRow[]>(
          `SELECT
            provider_id,
            status,
            duration_ms,
            created_at
           FROM api_call_logs
           WHERE direction = 'upstream'
             AND phase = :monitorPhase
             AND provider_id = :providerId
             AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
           ORDER BY created_at DESC, id DESC
           LIMIT 60`,
          { monitorPhase: publicMonitorPhase, providerId: provider.provider_id },
        )
        return rows.slice().reverse()
      }),
    )
    const historyRows = historyResults.flat()

    const normalize = (row?: PublicStatusRow) => {
      const total = Number(row?.total ?? 0)
      const success = Number(row?.success ?? 0)
      const slow = Number(row?.slow ?? 0)
      return {
        total,
        success,
        failed: Number(row?.failed ?? 0),
        successRate: total > 0 ? Number(((success / total) * 100).toFixed(2)) : 0,
        slow,
        slowRate: total > 0 ? Number(((slow / total) * 100).toFixed(2)) : 0,
        avgDurationMs: Number(row?.avg_duration_ms ?? 0),
        maxDurationMs: Number(row?.max_duration_ms ?? 0),
        lastCheckedAt: row?.last_checked_at ? row.last_checked_at.toISOString() : null,
      }
    }

    const historyByProvider = new Map<string, Array<{ status: 'success' | 'failed'; durationMs: number; createdAt: string }>>()
    historyRows.forEach((row) => {
      if (!row.provider_id) return
      const items = historyByProvider.get(row.provider_id) ?? []
      items.push({
        status: row.status,
        durationMs: Number(row.duration_ms ?? 0),
        createdAt: row.created_at.toISOString(),
      })
      historyByProvider.set(row.provider_id, items)
    })

    const today = normalize(dayRows[0])
    return {
      overall: today,
      weekly: normalize(weekRows[0]),
      providers: providerRows.map((row) => {
        const item = normalize(row)
        const history = historyByProvider.get(row.provider_id) ?? []
        const lastHistory = history.at(-1)
        return {
          providerId: row.provider_id,
          providerName: row.provider_name || '默认接口',
          providerType: row.provider_type,
          providerStatus: row.provider_status,
          modelNames: row.model_names ? row.model_names.split(', ').slice(0, 3) : [],
          lastStatus: lastHistory?.status ?? null,
          lastDurationMs: lastHistory?.durationMs ?? 0,
          history,
          ...item,
        }
      }),
    }
  }
}
