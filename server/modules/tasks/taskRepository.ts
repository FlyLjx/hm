import type { RowDataPacket } from 'mysql2'
import { db } from '../../config/db.js'
import type { GenerationTask, GenerationTaskStatus, GenerationSizeTier, GenerationPublicStatus } from './taskTypes.js'
import type { AiModelCapability } from '../models/modelTypes.js'

type GenerationTaskRow = RowDataPacket & {
  id: string
  user_id: string
  user_email?: string
  user_subscription_plan_name?: string | null
  user_subscription_expires_at?: Date | null
  model_id: string
  model_name?: string
  model_display_name?: string
  provider_id: string
  provider_name?: string
  provider_base_url?: string | null
  capability: AiModelCapability
  prompt: string
  reference_image_url?: string | null
  size_tier: GenerationSizeTier
  size?: string | null
  transparent_background?: number | string | null
  quantity: number
  user_ip: string
  cost_credits: string | number
  model_cost_credits?: string | number | null
  remaining_credits: string | number
  duration_seconds: string | number
  status: GenerationTaskStatus
  error_message?: string | null
  result_json?: unknown
  has_result?: number | string | boolean | null
  favorite_enabled?: number | string | null
  public_status?: GenerationPublicStatus | null
  public_requested_at?: Date | null
  public_reviewed_at?: Date | null
  display_enabled?: number | string | null
  display_note?: string | null
  created_at: Date
  updated_at: Date
}

function parseJson(value: unknown) {
  if (!value || typeof value !== 'string') {
    return value
  }
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

function getResultUrls(resultJson: unknown): string[] {
  if (!resultJson) {
    return []
  }

  if (typeof resultJson === 'string') {
    return extractUrlsFromString(resultJson)
  }

  if (Array.isArray(resultJson)) {
    return resultJson.flatMap(getResultUrls)
  }

  if (typeof resultJson !== 'object') {
    return []
  }

  const payload = resultJson as Record<string, unknown>
  const urls = [
    payload.url,
    payload.image_url,
    payload.imageUrl,
    payload.output_url,
    payload.outputUrl,
    payload.file_url,
    payload.fileUrl,
  ].filter((item): item is string => typeof item === 'string')
  const base64Values = [
    payload.b64_json,
    payload.b64,
    payload.base64,
    payload.image,
    payload.image_base64,
    payload.imageBase64,
    payload.partial_image_b64,
  ].filter((item): item is string => typeof item === 'string')
  const directUrls = [
    ...urls.flatMap(extractUrlsFromString),
    ...base64Values.map((value) => {
      const trimmed = value.trim()
      return trimmed.startsWith('data:image/')
        ? trimmed
        : `data:image/png;base64,${trimmed.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '').replace(/\s/g, '')}`
    }),
  ]
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
  const nestedUrls = nestedKeys.flatMap((key) => getResultUrls(payload[key]))
  return uniqueUrls([...directUrls, ...nestedUrls].filter((url) => url.startsWith('data:image/') || /^https?:\/\//i.test(url)))
}

function getDisplayResultUrls(resultJson: unknown): string[] {
  const displayUrls = (urls: string[]) => filterUnreachableLocalUrls(uniqueUrls(urls))

  if (!resultJson || typeof resultJson !== 'object' || Array.isArray(resultJson)) {
    return displayUrls(getResultUrls(resultJson))
  }

  const payload = resultJson as Record<string, unknown>
  if (payload.stream === true && !payload.final && !payload.data) {
    return []
  }

  const finalUrls = getResultUrls(payload.final)
  if (finalUrls.length) return displayUrls(finalUrls)

  const dataUrls = getResultUrls(payload.data)
  if (dataUrls.length) return displayUrls(dataUrls)

  const resultUrls = getResultUrls(payload.result ?? payload.results ?? payload.output ?? payload.outputs ?? payload.images)
  if (resultUrls.length) return displayUrls(resultUrls)

  const withoutPartial = { ...payload }
  delete withoutPartial.partial
  delete withoutPartial.partial_image_b64
  const nonPartialUrls = getResultUrls(withoutPartial)
  if (nonPartialUrls.length) return displayUrls(nonPartialUrls)

  return []
}

function filterUnreachableLocalUrls(urls: string[]) {
  const hasEmbeddedImage = urls.some((url) => url.startsWith('data:image/'))
  if (!hasEmbeddedImage) return urls
  return urls.filter((url) => {
    if (url.startsWith('data:image/')) return true
    try {
      const parsed = new URL(url)
      return !['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname)
    } catch {
      return true
    }
  })
}

function rewriteLocalUrlWithProvider(url: string, providerBaseUrl?: string | null) {
  if (!providerBaseUrl || url.startsWith('data:image/')) return url
  try {
    const parsed = new URL(url)
    if (!['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname)) return url
    const providerUrl = new URL(providerBaseUrl)
    parsed.protocol = providerUrl.protocol
    parsed.host = providerUrl.host
    return parsed.toString()
  } catch {
    return url
  }
}

function extractUrlsFromString(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return []
  if (trimmed.startsWith('data:image/') || /^https?:\/\//i.test(trimmed)) return [cleanUrl(trimmed)]
  if (/^[A-Za-z0-9+/=\s]+$/.test(trimmed) && trimmed.length > 200) {
    return [`data:image/png;base64,${trimmed.replace(/\s/g, '')}`]
  }

  return [
    ...Array.from(trimmed.matchAll(/!\[[^\]]*]\(([^)\s]+)\)/g)).map((match) => match[1]),
    ...Array.from(trimmed.matchAll(/<(?:img|video|source)[^>]+\bsrc=["']([^"']+)["']/gi)).map((match) => match[1]),
    ...Array.from(trimmed.matchAll(/(data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=\s]+)/g)).map((match) => match[1]),
    ...Array.from(trimmed.matchAll(/(https?:\/\/[^\s<>"'`\]]+)/gi)).map((match) => match[1]),
  ].map(cleanUrl)
}

function cleanUrl(value: string) {
  return value.trim().replace(/[),.;]+$/g, '')
}

function uniqueUrls(urls: string[]) {
  const seen = new Set<string>()
  return urls.filter((url) => {
    if (seen.has(url)) return false
    seen.add(url)
    return true
  })
}

function isTruthyDbValue(value: unknown) {
  return value === true || value === 1 || value === '1'
}

function getTaskImageUrl(taskId: string, index: number) {
  return `/api/tasks/${taskId}/images/${index}`
}

function getTaskThumbnailUrl(taskId: string, index: number) {
  return `/api/tasks/${taskId}/thumbnails/${index}`
}

function createMaterializedResultJson(urls: string[], previousResultJson: unknown) {
  return {
    ...(previousResultJson && typeof previousResultJson === 'object' && !Array.isArray(previousResultJson)
      ? previousResultJson as Record<string, unknown>
      : {}),
    data: urls.map((url) => ({ url })),
    materialized: true,
    materializedAt: new Date().toISOString(),
  }
}

function hasTaskResultImages(task: GenerationTask) {
  return Boolean(task.resultUrls?.length || task.resultUrl)
}

const taskListSelect = `
  generation_tasks.id,
  generation_tasks.user_id,
  generation_tasks.model_id,
  generation_tasks.provider_id,
  generation_tasks.capability,
  generation_tasks.prompt,
  NULL AS reference_image_url,
  generation_tasks.size_tier,
  generation_tasks.size,
  generation_tasks.transparent_background,
  generation_tasks.quantity,
  generation_tasks.user_ip,
  generation_tasks.cost_credits,
  generation_tasks.model_cost_credits,
  generation_tasks.remaining_credits,
  generation_tasks.duration_seconds,
  generation_tasks.status,
  generation_tasks.error_message,
  generation_tasks.result_json,
  generation_tasks.favorite_enabled,
  generation_tasks.public_status,
  generation_tasks.public_requested_at,
  generation_tasks.public_reviewed_at,
  generation_tasks.display_enabled,
  generation_tasks.display_note,
  generation_tasks.created_at,
  generation_tasks.updated_at,
  generation_tasks.status = 'success' AS has_result,
  users.email AS user_email,
  ai_models.model_name,
  ai_models.display_name AS model_display_name,
  api_providers.name AS provider_name,
  api_providers.base_url AS provider_base_url,
  subscription_plans.name AS user_subscription_plan_name,
  user_subscriptions.expires_at AS user_subscription_expires_at
`

const taskListJoins = `
  LEFT JOIN users ON users.id = generation_tasks.user_id
  LEFT JOIN ai_models ON ai_models.id = generation_tasks.model_id
  LEFT JOIN api_providers ON api_providers.id = generation_tasks.provider_id
  LEFT JOIN user_subscriptions ON user_subscriptions.user_id = generation_tasks.user_id
    AND user_subscriptions.status = 'active'
    AND user_subscriptions.expires_at > generation_tasks.created_at
    AND user_subscriptions.created_at <= generation_tasks.created_at
  LEFT JOIN subscription_plans ON subscription_plans.id = user_subscriptions.plan_id
`

const taskHasImageResultSql = "(generation_tasks.status = 'success' OR generation_tasks.result_json IS NOT NULL)"

function toTask(row: GenerationTaskRow): GenerationTask {
  const resultJson = parseJson(row.result_json)
  const resultUrls = uniqueUrls(getDisplayResultUrls(resultJson).map((url) => rewriteLocalUrlWithProvider(url, row.provider_base_url)))
  const imageCount = resultUrls.length
  const hasResultImages = imageCount > 0
  const imageUrls = Array.from({ length: imageCount }, (_, index) => getTaskImageUrl(row.id, index))
  const thumbnailUrls = Array.from({ length: imageCount }, (_, index) => getTaskThumbnailUrl(row.id, index))

  return {
    id: row.id,
    userId: row.user_id,
    userEmail: row.user_email,
    userSubscriptionPlanName: row.user_subscription_plan_name ?? null,
    userSubscriptionExpiresAt: row.user_subscription_expires_at?.toISOString() ?? null,
    modelId: row.model_id,
    modelName: row.model_name,
    modelDisplayName: row.model_display_name,
    providerId: row.provider_id,
    providerName: row.provider_name,
    capability: row.capability,
    prompt: row.prompt,
    referenceImageUrl: row.reference_image_url,
    sizeTier: row.size_tier,
    size: row.size,
    transparentBackground: Boolean(row.transparent_background),
    quantity: row.quantity,
    userIp: row.user_ip,
    costCredits: Number(row.cost_credits),
    modelCostCredits: Number(row.model_cost_credits ?? 0),
    remainingCredits: Number(row.remaining_credits),
    durationSeconds: Number(row.duration_seconds),
    status: hasResultImages ? 'success' : row.status,
    errorMessage: hasResultImages ? null : row.error_message,
    resultJson: undefined,
    resultUrl: imageUrls[0] ?? null,
    resultUrls: imageUrls,
    thumbnailUrl: thumbnailUrls[0] ?? null,
    thumbnailUrls,
    favoriteEnabled: Boolean(row.favorite_enabled),
    publicStatus: row.public_status ?? (isTruthyDbValue(row.display_enabled) ? 'approved' : 'private'),
    publicRequestedAt: row.public_requested_at?.toISOString() ?? null,
    publicReviewedAt: row.public_reviewed_at?.toISOString() ?? null,
    displayEnabled: Boolean(row.display_enabled),
    displayNote: row.display_note ?? null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }
}

export class TaskRepository {
  async findAll(input?: { page?: number; pageSize?: number }) {
    const page = Math.max(1, input?.page ?? 1)
    const pageSize = Math.min(100, Math.max(1, input?.pageSize ?? 20))
    const offset = (page - 1) * pageSize

    const [countRows] = await db.query<Array<RowDataPacket & { total: string | number }>>(
      `SELECT COUNT(*) AS total
       FROM generation_tasks`,
    )
    const [rows] = await db.query<GenerationTaskRow[]>(
      `SELECT ${taskListSelect}
       FROM generation_tasks
       ${taskListJoins}
       ORDER BY generation_tasks.created_at DESC, generation_tasks.id DESC
       LIMIT :pageSize OFFSET :offset`,
      { pageSize, offset },
    )
    return {
      items: rows.map(toTask),
      total: Number(countRows[0]?.total ?? 0),
      page,
      pageSize,
    }
  }

  async findAllForExport() {
    const [rows] = await db.query<GenerationTaskRow[]>(
      `SELECT ${taskListSelect}
       FROM generation_tasks
       ${taskListJoins}
       ORDER BY generation_tasks.created_at DESC, generation_tasks.id DESC`,
    )
    return rows.map(toTask)
  }

  async getStats() {
    const [rows] = await db.query<Array<RowDataPacket & {
      status: GenerationTaskStatus
      total: string | number
      total_images: string | number | null
      total_credits: string | number | null
    }>>(
      `SELECT
        status,
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'success' THEN quantity ELSE 0 END) AS total_images,
        SUM(CASE WHEN status = 'success' THEN cost_credits ELSE 0 END) AS total_credits
       FROM generation_tasks
       GROUP BY status`,
    )

    const stats = {
      total: 0,
      queued: 0,
      pending: 0,
      processing: 0,
      success: 0,
      failed: 0,
      canceled: 0,
      totalImages: 0,
      totalCredits: 0,
    }

    for (const row of rows) {
      const count = Number(row.total ?? 0)
      stats.total += count
      stats[row.status] = count
      stats.totalImages += Number(row.total_images ?? 0)
      stats.totalCredits += Number(row.total_credits ?? 0)
    }

    return stats
  }

  async findImages(input?: { page?: number; pageSize?: number; keyword?: string; display?: 'all' | 'public' | 'private' | 'pending' | 'rejected' }) {
    const page = Math.max(1, input?.page ?? 1)
    const pageSize = Math.min(100, Math.max(1, input?.pageSize ?? 24))
    const offset = (page - 1) * pageSize
    const where = [
      taskHasImageResultSql,
    ]
    const params: Record<string, string | number> = { pageSize, offset }

    if (input?.display === 'public') {
      where.push("generation_tasks.public_status = 'approved'")
    }
    if (input?.display === 'private') {
      where.push("generation_tasks.public_status = 'private'")
    }
    if (input?.display === 'pending') {
      where.push("generation_tasks.public_status = 'pending'")
    }
    if (input?.display === 'rejected') {
      where.push("generation_tasks.public_status = 'rejected'")
    }
    if (input?.keyword?.trim()) {
      where.push('(generation_tasks.prompt LIKE :keyword OR generation_tasks.display_note LIKE :keyword OR users.email LIKE :keyword OR ai_models.model_name LIKE :keyword OR ai_models.display_name LIKE :keyword)')
      params.keyword = `%${input.keyword.trim()}%`
    }

    const whereSql = `WHERE ${where.join(' AND ')}`
    const [countRows] = await db.query<Array<RowDataPacket & { total: string | number }>>(
      `SELECT COUNT(*) AS total
       FROM generation_tasks
       LEFT JOIN users ON users.id = generation_tasks.user_id
       LEFT JOIN ai_models ON ai_models.id = generation_tasks.model_id
       ${whereSql}`,
      params,
    )
    const [rows] = await db.query<GenerationTaskRow[]>(
      `SELECT ${taskListSelect}
       FROM generation_tasks
       ${taskListJoins}
       ${whereSql}
       ORDER BY generation_tasks.created_at DESC, generation_tasks.id DESC
       LIMIT :pageSize OFFSET :offset`,
      params,
    )

    return {
      items: rows.map(toTask),
      total: Number(countRows[0]?.total ?? 0),
      page,
      pageSize,
    }
  }

  async findPublicDisplay() {
    const [rows] = await db.query<GenerationTaskRow[]>(
      `SELECT ${taskListSelect}
       FROM generation_tasks
       ${taskListJoins}
       WHERE generation_tasks.public_status = 'approved'
         AND generation_tasks.display_enabled = 1
         AND generation_tasks.status = 'success'
       ORDER BY generation_tasks.updated_at DESC, generation_tasks.created_at DESC
       LIMIT 60`,
    )
    return rows.map(toTask)
  }

  async findByUserId(userId: string, limit = 20) {
    const pageSize = Math.min(100, Math.max(1, limit))
    const [rows] = await db.query<GenerationTaskRow[]>(
      `SELECT ${taskListSelect}
       FROM generation_tasks
       ${taskListJoins}
       WHERE generation_tasks.user_id = :userId
       ORDER BY generation_tasks.created_at DESC, generation_tasks.id DESC
       LIMIT :pageSize`,
      { userId, pageSize },
    )
    return rows.map(toTask)
  }

  async findPageByUserId(userId: string, input?: { page?: number; pageSize?: number }) {
    const page = Math.max(1, input?.page ?? 1)
    const pageSize = Math.min(100, Math.max(1, input?.pageSize ?? 10))
    const offset = (page - 1) * pageSize
    const [countRows] = await db.query<Array<RowDataPacket & { total: string | number }>>(
      `SELECT COUNT(*) AS total
       FROM generation_tasks
       WHERE user_id = :userId`,
      { userId },
    )
    const [rows] = await db.query<GenerationTaskRow[]>(
      `SELECT ${taskListSelect}
       FROM generation_tasks
       ${taskListJoins}
       WHERE generation_tasks.user_id = :userId
       ORDER BY generation_tasks.created_at DESC, generation_tasks.id DESC
       LIMIT :pageSize OFFSET :offset`,
      { userId, pageSize, offset },
    )
    const items = rows.map(toTask).filter(hasTaskResultImages)
    return {
      items,
      total: Number(countRows[0]?.total ?? 0),
      page,
      pageSize,
    }
  }

  async findFavoritesByUserId(userId: string, input?: { page?: number; pageSize?: number; keyword?: string }) {
    const page = Math.max(1, input?.page ?? 1)
    const pageSize = Math.min(100, Math.max(1, input?.pageSize ?? 24))
    const offset = (page - 1) * pageSize
    const where = [
      'generation_tasks.user_id = :userId',
      'generation_tasks.favorite_enabled = 1',
      taskHasImageResultSql,
    ]
    const params: Record<string, string | number> = { userId, pageSize, offset }
    if (input?.keyword?.trim()) {
      where.push('(generation_tasks.prompt LIKE :keyword OR generation_tasks.display_note LIKE :keyword OR ai_models.model_name LIKE :keyword OR ai_models.display_name LIKE :keyword)')
      params.keyword = `%${input.keyword.trim()}%`
    }
    const whereSql = `WHERE ${where.join(' AND ')}`
    const [countRows] = await db.query<Array<RowDataPacket & { total: string | number }>>(
      `SELECT COUNT(*) AS total
       FROM generation_tasks
       LEFT JOIN ai_models ON ai_models.id = generation_tasks.model_id
       ${whereSql}`,
      params,
    )
    const [rows] = await db.query<GenerationTaskRow[]>(
      `SELECT ${taskListSelect}
       FROM generation_tasks
       ${taskListJoins}
       ${whereSql}
       ORDER BY generation_tasks.updated_at DESC, generation_tasks.created_at DESC
       LIMIT :pageSize OFFSET :offset`,
      params,
    )
    return {
      items: rows.map(toTask),
      total: Number(countRows[0]?.total ?? 0),
      page,
      pageSize,
    }
  }

  async findHistoryByUserId(userId: string, input?: { page?: number; pageSize?: number; keyword?: string }) {
    const page = Math.max(1, input?.page ?? 1)
    const pageSize = Math.min(100, Math.max(1, input?.pageSize ?? 24))
    const offset = (page - 1) * pageSize
    const where = [
      'generation_tasks.user_id = :userId',
      taskHasImageResultSql,
    ]
    const params: Record<string, string | number> = { userId, pageSize, offset }
    if (input?.keyword?.trim()) {
      where.push('(generation_tasks.prompt LIKE :keyword OR generation_tasks.display_note LIKE :keyword OR ai_models.model_name LIKE :keyword OR ai_models.display_name LIKE :keyword)')
      params.keyword = `%${input.keyword.trim()}%`
    }
    const whereSql = `WHERE ${where.join(' AND ')}`
    const [countRows] = await db.query<Array<RowDataPacket & { total: string | number }>>(
      `SELECT COUNT(*) AS total
       FROM generation_tasks
       LEFT JOIN ai_models ON ai_models.id = generation_tasks.model_id
       ${whereSql}`,
      params,
    )
    const [rows] = await db.query<GenerationTaskRow[]>(
      `SELECT ${taskListSelect}
       FROM generation_tasks
       ${taskListJoins}
       ${whereSql}
       ORDER BY generation_tasks.created_at DESC, generation_tasks.id DESC
       LIMIT :pageSize OFFSET :offset`,
      params,
    )
    return {
      items: rows.map(toTask),
      total: Number(countRows[0]?.total ?? 0),
      page,
      pageSize,
    }
  }

  async create(task: GenerationTask) {
    await db.query(
      `INSERT INTO generation_tasks
        (id, user_id, model_id, provider_id, capability, prompt, reference_image_url, size_tier, size, transparent_background, quantity, user_ip,
         cost_credits, model_cost_credits, remaining_credits, duration_seconds, status, error_message, result_json)
       VALUES
        (:id, :userId, :modelId, :providerId, :capability, :prompt, :referenceImageUrl, :sizeTier, :size, :transparentBackground, :quantity, :userIp,
         :costCredits, :modelCostCredits, :remainingCredits, :durationSeconds, :status, :errorMessage, :resultJson)`,
      {
        ...task,
        resultJson: task.resultJson ? JSON.stringify(task.resultJson) : null,
      },
    )
    return this.findById(task.id)
  }

  async update(
    id: string,
    input: Partial<
      Pick<
        GenerationTask,
        | 'costCredits'
        | 'modelCostCredits'
        | 'remainingCredits'
        | 'durationSeconds'
        | 'status'
        | 'errorMessage'
        | 'resultJson'
        | 'favoriteEnabled'
        | 'publicStatus'
        | 'publicRequestedAt'
        | 'publicReviewedAt'
        | 'displayEnabled'
        | 'displayNote'
      >
    >,
  ) {
    const fields: string[] = []
    const values: unknown[] = []
    const fieldMap = {
      costCredits: 'cost_credits',
      modelCostCredits: 'model_cost_credits',
      remainingCredits: 'remaining_credits',
      durationSeconds: 'duration_seconds',
      status: 'status',
      errorMessage: 'error_message',
      resultJson: 'result_json',
      favoriteEnabled: 'favorite_enabled',
      publicStatus: 'public_status',
      publicRequestedAt: 'public_requested_at',
      publicReviewedAt: 'public_reviewed_at',
      displayEnabled: 'display_enabled',
      displayNote: 'display_note',
    } as const

    Object.entries(fieldMap).forEach(([key, column]) => {
      const value = input[key as keyof typeof input]
      if (value !== undefined) {
        fields.push(`${column} = ?`)
        values.push(
          key === 'resultJson' && value
            ? JSON.stringify(value)
            : key === 'displayEnabled' || key === 'favoriteEnabled'
              ? Boolean(value)
              : value,
        )
      }
    })

    if (fields.length > 0) {
      await db.query(`UPDATE generation_tasks SET ${fields.join(', ')} WHERE id = ?`, [
        ...values,
        id,
      ])
    }

    return this.findById(id)
  }

  async cancel(id: string) {
    await db.query(
      `UPDATE generation_tasks
       SET status = 'canceled',
           error_message = '任务已取消'
       WHERE id = :id
         AND status IN ('queued', 'processing', 'pending')`,
      { id },
    )
    return this.findById(id)
  }

  async cancelTimedOutRunningTasks(timeoutMinutes: number) {
    const normalizedTimeout = Math.max(1, Math.floor(timeoutMinutes))
    const [rows] = await db.query<Array<RowDataPacket & { id: string }>>(
      `SELECT id
       FROM generation_tasks
       WHERE status IN ('queued', 'pending', 'processing')
         AND created_at <= DATE_SUB(NOW(), INTERVAL :timeoutMinutes MINUTE)`,
      { timeoutMinutes: normalizedTimeout },
    )

    if (rows.length === 0) {
      return []
    }

    const ids = rows.map((row) => row.id)
    await db.query(
      `UPDATE generation_tasks
       SET status = 'canceled',
           error_message = :errorMessage
       WHERE id IN (:ids)
         AND status IN ('queued', 'pending', 'processing')`,
      {
        ids,
        errorMessage: `任务超过 ${normalizedTimeout} 分钟未完成，已自动关闭`,
      },
    )

    const tasks = await Promise.all(ids.map((id) => this.findById(id)))
    return tasks.filter((task): task is GenerationTask => Boolean(task))
  }

  async findById(id: string) {
    const [rows] = await db.query<GenerationTaskRow[]>(
      `SELECT generation_tasks.*,
        users.email AS user_email,
        ai_models.model_name,
        ai_models.display_name AS model_display_name,
        api_providers.name AS provider_name,
        subscription_plans.name AS user_subscription_plan_name,
        user_subscriptions.expires_at AS user_subscription_expires_at
       FROM generation_tasks
       ${taskListJoins}
       WHERE generation_tasks.id = :id
       LIMIT 1`,
      { id },
    )
    return rows[0] ? toTask(rows[0]) : null
  }

  async findImageUrlByIndex(id: string, index: number) {
    const [rows] = await db.query<GenerationTaskRow[]>(
      `SELECT generation_tasks.*, api_providers.base_url AS provider_base_url
       FROM generation_tasks
       LEFT JOIN api_providers ON api_providers.id = generation_tasks.provider_id
       WHERE generation_tasks.id = :id
       LIMIT 1`,
      { id },
    )
    const resultJson = parseJson(rows[0]?.result_json)
    const urls = getDisplayResultUrls(resultJson).map((url) => rewriteLocalUrlWithProvider(url, rows[0]?.provider_base_url))
    return urls[index] ?? null
  }

  async materializeImageUrlByIndex(id: string, index: number, dataUrl: string) {
    const [rows] = await db.query<GenerationTaskRow[]>(
      `SELECT generation_tasks.*, api_providers.base_url AS provider_base_url
       FROM generation_tasks
       LEFT JOIN api_providers ON api_providers.id = generation_tasks.provider_id
       WHERE generation_tasks.id = :id
       LIMIT 1`,
      { id },
    )
    if (!rows[0]) return false
    const resultJson = parseJson(rows[0].result_json)
    const urls = getDisplayResultUrls(resultJson).map((url) => rewriteLocalUrlWithProvider(url, rows[0]?.provider_base_url))
    if (!urls[index]) return false
    urls[index] = dataUrl
    const nextResultJson = createMaterializedResultJson(urls, resultJson)
    await db.query(
      `UPDATE generation_tasks
       SET result_json = :resultJson,
           status = 'success',
           error_message = NULL
       WHERE id = :id`,
      { id, resultJson: JSON.stringify(nextResultJson) },
    )
    return true
  }

  async findTasksWithRemoteResultImages(limit = 100) {
    const pageSize = Math.min(1000, Math.max(1, limit))
    const [rows] = await db.query<GenerationTaskRow[]>(
      `SELECT generation_tasks.*, api_providers.base_url AS provider_base_url
       FROM generation_tasks
       LEFT JOIN api_providers ON api_providers.id = generation_tasks.provider_id
       WHERE generation_tasks.result_json LIKE '%http%'
       ORDER BY generation_tasks.created_at DESC, generation_tasks.id DESC
       LIMIT :pageSize`,
      { pageSize },
    )

    return rows.map((row) => {
      const resultJson = parseJson(row.result_json)
      const urls = getDisplayResultUrls(resultJson).map((url) => rewriteLocalUrlWithProvider(url, row.provider_base_url))
      return {
        id: row.id,
        urls,
      }
    }).filter((item) => item.urls.some((url) => /^https?:\/\//i.test(url)))
  }

  async estimateDuration(input: {
    modelId: string
    capability: AiModelCapability
    sizeTier: GenerationSizeTier
    size: string
    quantity: number
  }) {
    const [rows] = await db.query<Array<RowDataPacket & { average_duration: string | number }>>(
      `SELECT AVG(duration_seconds) AS average_duration
       FROM generation_tasks
       WHERE status = 'success'
         AND duration_seconds > 0
         AND created_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)
         AND capability = :capability
         AND model_id = :modelId
         AND size_tier = :sizeTier
         AND size = :size
         AND quantity = :quantity`,
      input,
    )
    const exactAverage = rows[0]?.average_duration
    if (exactAverage !== null && exactAverage !== undefined) {
      return Number(exactAverage)
    }

    const [fallbackRows] = await db.query<Array<RowDataPacket & { average_duration: string | number }>>(
      `SELECT AVG(duration_seconds) AS average_duration
       FROM generation_tasks
       WHERE status = 'success'
         AND duration_seconds > 0
         AND created_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)
         AND capability = :capability
         AND model_id = :modelId
         AND size_tier = :sizeTier
         AND quantity = :quantity`,
      input,
    )
    const fallbackAverage = fallbackRows[0]?.average_duration
    if (fallbackAverage !== null && fallbackAverage !== undefined) {
      return Number(fallbackAverage)
    }

    return null
  }
}
