import type { RowDataPacket } from 'mysql2'
import { db } from '../../config/db.js'
import type { GenerationTask, GenerationTaskStatus, GenerationSizeTier } from './taskTypes.js'
import type { AiModelCapability } from '../models/modelTypes.js'

type GenerationTaskRow = RowDataPacket & {
  id: string
  user_id: string
  user_email?: string
  model_id: string
  model_name?: string
  provider_id: string
  provider_name?: string
  capability: AiModelCapability
  prompt: string
  reference_image_url?: string | null
  size_tier: GenerationSizeTier
  size?: string | null
  quantity: number
  user_ip: string
  cost_credits: string | number
  remaining_credits: string | number
  duration_seconds: string | number
  status: GenerationTaskStatus
  error_message?: string | null
  result_json?: unknown
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

function toImageUrl(image: { url?: string; b64_json?: string } | null | undefined) {
  if (image?.url) {
    return image.url
  }
  if (image?.b64_json) {
    return `data:image/png;base64,${image.b64_json}`
  }
  return null
}

function getResultUrls(resultJson: unknown): string[] {
  if (!resultJson || typeof resultJson !== 'object') {
    return []
  }

  const directImage = resultJson as { b64_json?: string; url?: string }
  const directUrl = toImageUrl(directImage)
  if (directUrl) {
    return [directUrl]
  }

  const streamingResult = resultJson as {
    final?: { b64_json?: string; url?: string }
    partial?: { b64_json?: string; url?: string }
  }
  const eventImage = streamingResult.final ?? streamingResult.partial
  const eventUrl = toImageUrl(eventImage)
  if (eventUrl) {
    return [eventUrl]
  }

  const data = (resultJson as { data?: Array<{ url?: string; b64_json?: string }> }).data
  if (Array.isArray(data)) {
    return data.map(toImageUrl).filter((url): url is string => Boolean(url))
  }

  return []
}

function getTaskImageUrl(taskId: string, index: number) {
  return `/api/tasks/${taskId}/images/${index}`
}

function getTaskThumbnailUrl(taskId: string, index: number) {
  return `/api/tasks/${taskId}/thumbnails/${index}`
}

function toTask(row: GenerationTaskRow): GenerationTask {
  const resultJson = parseJson(row.result_json)
  const resultUrls = getResultUrls(resultJson)
  const imageUrls = resultUrls.map((_, index) => getTaskImageUrl(row.id, index))
  const thumbnailUrls = resultUrls.map((_, index) => getTaskThumbnailUrl(row.id, index))

  return {
    id: row.id,
    userId: row.user_id,
    userEmail: row.user_email,
    modelId: row.model_id,
    modelName: row.model_name,
    providerId: row.provider_id,
    providerName: row.provider_name,
    capability: row.capability,
    prompt: row.prompt,
    referenceImageUrl: row.reference_image_url,
    sizeTier: row.size_tier,
    size: row.size,
    quantity: row.quantity,
    userIp: row.user_ip,
    costCredits: Number(row.cost_credits),
    remainingCredits: Number(row.remaining_credits),
    durationSeconds: Number(row.duration_seconds),
    status: row.status,
    errorMessage: row.error_message,
    resultJson,
    resultUrl: imageUrls[0] ?? null,
    resultUrls: imageUrls,
    thumbnailUrl: thumbnailUrls[0] ?? null,
    thumbnailUrls,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }
}

export class TaskRepository {
  async findAll() {
    const [rows] = await db.query<GenerationTaskRow[]>(
      `SELECT generation_tasks.*,
        users.email AS user_email,
        ai_models.model_name,
        api_providers.name AS provider_name
       FROM generation_tasks
       LEFT JOIN users ON users.id = generation_tasks.user_id
       LEFT JOIN ai_models ON ai_models.id = generation_tasks.model_id
       LEFT JOIN api_providers ON api_providers.id = generation_tasks.provider_id
       ORDER BY generation_tasks.created_at DESC, generation_tasks.id DESC`,
    )
    return rows.map(toTask)
  }

  async findByUserId(userId: string) {
    const [rows] = await db.query<GenerationTaskRow[]>(
      `SELECT generation_tasks.*,
        users.email AS user_email,
        ai_models.model_name,
        api_providers.name AS provider_name
       FROM generation_tasks
       LEFT JOIN users ON users.id = generation_tasks.user_id
       LEFT JOIN ai_models ON ai_models.id = generation_tasks.model_id
       LEFT JOIN api_providers ON api_providers.id = generation_tasks.provider_id
       WHERE generation_tasks.user_id = :userId
       ORDER BY generation_tasks.created_at DESC, generation_tasks.id DESC`,
      { userId },
    )
    return rows.map(toTask)
  }

  async create(task: GenerationTask) {
    await db.query(
      `INSERT INTO generation_tasks
        (id, user_id, model_id, provider_id, capability, prompt, reference_image_url, size_tier, size, quantity, user_ip,
         cost_credits, remaining_credits, duration_seconds, status, error_message, result_json)
       VALUES
        (:id, :userId, :modelId, :providerId, :capability, :prompt, :referenceImageUrl, :sizeTier, :size, :quantity, :userIp,
         :costCredits, :remainingCredits, :durationSeconds, :status, :errorMessage, :resultJson)`,
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
        | 'remainingCredits'
        | 'durationSeconds'
        | 'status'
        | 'errorMessage'
        | 'resultJson'
      >
    >,
  ) {
    const fields: string[] = []
    const values: unknown[] = []
    const fieldMap = {
      costCredits: 'cost_credits',
      remainingCredits: 'remaining_credits',
      durationSeconds: 'duration_seconds',
      status: 'status',
      errorMessage: 'error_message',
      resultJson: 'result_json',
    } as const

    Object.entries(fieldMap).forEach(([key, column]) => {
      const value = input[key as keyof typeof input]
      if (value !== undefined) {
        fields.push(`${column} = ?`)
        values.push(key === 'resultJson' && value ? JSON.stringify(value) : value)
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

  async findById(id: string) {
    const [rows] = await db.query<GenerationTaskRow[]>(
      `SELECT generation_tasks.*,
        users.email AS user_email,
        ai_models.model_name,
        api_providers.name AS provider_name
       FROM generation_tasks
       LEFT JOIN users ON users.id = generation_tasks.user_id
       LEFT JOIN ai_models ON ai_models.id = generation_tasks.model_id
       LEFT JOIN api_providers ON api_providers.id = generation_tasks.provider_id
       WHERE generation_tasks.id = :id
       LIMIT 1`,
      { id },
    )
    return rows[0] ? toTask(rows[0]) : null
  }

  async findImageUrlByIndex(id: string, index: number) {
    const [rows] = await db.query<GenerationTaskRow[]>(
      `SELECT *
       FROM generation_tasks
       WHERE id = :id
       LIMIT 1`,
      { id },
    )
    const resultJson = parseJson(rows[0]?.result_json)
    return getResultUrls(resultJson)[index] ?? null
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
