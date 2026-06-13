import type { Request, Response } from 'express'
import { getRequestIp } from '../../shared/requestIp.js'
import { generateImageSchema } from './generationSchemas.js'
import { GenerationService } from './generationService.js'
import { taskEvents } from '../tasks/taskEvents.js'
import { TaskRepository } from '../tasks/taskRepository.js'
import { ApiLogRepository } from '../apiLogs/apiLogRepository.js'
import { SettingService } from '../settings/settingService.js'

const generationService = new GenerationService()
const taskRepository = new TaskRepository()
const apiLogRepository = new ApiLogRepository()
const settingService = new SettingService()
const generationLogVerbose = process.env.GENERATION_LOG_VERBOSE === '1'

function summarizeReferenceImage(value?: string) {
  if (!value) return null
  return {
    type: value.startsWith('data:') ? 'base64' : 'url',
    length: value.length,
  }
}

function summarizeReferenceImages(values?: string[]) {
  return (values ?? []).map(summarizeReferenceImage)
}

function summarizeMaskImage(value?: string) {
  return summarizeReferenceImage(value) ?? null
}

function logGenerationRequest(event: string, payload: Record<string, unknown>) {
  if (!generationLogVerbose && event !== 'request-accepted') return
  console.info(`[generation:${event}]`, JSON.stringify(payload))
}

function requestSummary(req: Request, input: ReturnType<typeof generateImageSchema.parse>, userIp: string) {
  return {
    route: req.originalUrl,
    ip: userIp,
    headers: {
      userAgent: req.get('user-agent') ?? '',
      contentType: req.get('content-type') ?? '',
    },
    body: {
      userId: input.userId,
      modelId: input.modelId,
      prompt: input.prompt,
      sizeTier: input.sizeTier,
      size: input.size,
      quantity: input.quantity,
      transparentBackground: input.transparentBackground,
      outputFormat: input.outputFormat,
      openaiParams: input.openaiParams,
      referenceImages: summarizeReferenceImages(input.referenceImageUrls ?? (input.referenceImageUrl ? [input.referenceImageUrl] : [])),
      maskImage: summarizeMaskImage(input.maskImageUrl),
    },
  }
}

async function recordDownstreamLog(input: {
  taskId?: string | null
  userId?: string | null
  endpoint: string
  phase: string
  method: string
  status: 'success' | 'failed'
  statusCode?: number | null
  durationMs: number
  requestSummary: unknown
  responseSummary?: unknown
  errorMessage?: string | null
}) {
  await apiLogRepository.create({
    direction: 'downstream',
    taskId: input.taskId ?? null,
    userId: input.userId ?? null,
    providerId: null,
    providerType: null,
    endpoint: input.endpoint,
    phase: input.phase,
    method: input.method,
    status: input.status,
    statusCode: input.statusCode ?? null,
    durationMs: input.durationMs,
    requestSummary: input.requestSummary,
    responseSummary: input.responseSummary,
    errorMessage: input.errorMessage ?? null,
  }).catch((error) => {
    console.warn('[api-log:downstream-create-failed]', error instanceof Error ? error.message : String(error))
  })
}

function isTerminalStatus(status?: string) {
  return status === 'success' || status === 'failed' || status === 'canceled'
}

function writeSse(res: Response, event: string, data: unknown) {
  res.write(`event: ${event}\n`)
  res.write(`data: ${JSON.stringify(data)}\n\n`)
}

function unsubscribeAll(unsubscribers: Array<() => void>) {
  unsubscribers.forEach((unsubscribe) => unsubscribe())
}

function progressFromTask(taskId: string, status?: string) {
  if (status === 'queued' || status === 'pending') {
    return {
      taskId,
      stage: 'queued',
      message: '正在构思画面...',
      detail: '任务已进入队列，正在准备生成参数',
      tags: ['队列', '参数', '构思'],
      createdAt: new Date().toISOString(),
    }
  }
  if (status === 'processing') {
    return {
      taskId,
      stage: 'processing',
      message: '正在生成图片...',
      detail: '已开始调用生成模型，请稍等片刻',
      tags: ['模型', '生成', '处理中'],
      createdAt: new Date().toISOString(),
    }
  }
  return null
}

async function isStreamGenerationEnabled() {
  const settings = await settingService.getSettings()
  return settings.streamGenerationEnabled === true
}

export class GenerationController {
  async generateImage(req: Request, res: Response) {
    const startedAt = Date.now()
    const input = generateImageSchema.parse(req.body)
    const userIp = getRequestIp(req)
    const downstreamRequest = requestSummary(req, input, userIp)
    logGenerationRequest('request-received', {
      userId: input.userId,
      modelId: input.modelId,
      prompt: input.prompt,
      sizeTier: input.sizeTier,
      size: input.size,
      quantity: input.quantity,
      openaiParams: input.openaiParams,
      referenceImages: summarizeReferenceImages(input.referenceImageUrls ?? (input.referenceImageUrl ? [input.referenceImageUrl] : [])),
      maskImage: summarizeMaskImage(input.maskImageUrl),
      userIp,
    })

    try {
      const streamGenerationEnabled = await isStreamGenerationEnabled()
      const task = await generationService.generateImage({
        ...input,
        userIp,
        streamGenerationEnabled,
      })
      logGenerationRequest('request-accepted', {
        taskId: task?.id,
        status: task?.status,
        userId: task?.userId,
        modelId: task?.modelId,
        sizeTier: task?.sizeTier,
        size: task?.size,
        quantity: task?.quantity,
      })
      await recordDownstreamLog({
        taskId: task?.id,
        userId: task?.userId ?? input.userId,
        endpoint: req.originalUrl,
        phase: 'generate-image',
        method: req.method,
        status: 'success',
        statusCode: 201,
        durationMs: Date.now() - startedAt,
        requestSummary: downstreamRequest,
        responseSummary: {
          taskId: task?.id,
          status: task?.status,
          modelId: task?.modelId,
          providerId: task?.providerId,
          size: task?.size,
          quantity: task?.quantity,
          streamGenerationEnabled,
          costCredits: task?.costCredits,
        },
      })
      res.status(201).json({ data: task })
    } catch (error) {
      const statusCode = typeof (error as { statusCode?: unknown }).statusCode === 'number' ? (error as { statusCode: number }).statusCode : 500
      await recordDownstreamLog({
        userId: input.userId,
        endpoint: req.originalUrl,
        phase: 'generate-image',
        method: req.method,
        status: 'failed',
        statusCode,
        durationMs: Date.now() - startedAt,
        requestSummary: downstreamRequest,
        responseSummary: { error: error instanceof Error ? error.message : String(error) },
        errorMessage: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }

  async generateImageStream(req: Request, res: Response) {
    const startedAt = Date.now()
    const input = generateImageSchema.parse(req.body)
    const userIp = getRequestIp(req)
    const downstreamRequest = requestSummary(req, input, userIp)
    logGenerationRequest('stream-request-received', {
      userId: input.userId,
      modelId: input.modelId,
      prompt: input.prompt,
      sizeTier: input.sizeTier,
      size: input.size,
      quantity: input.quantity,
      openaiParams: input.openaiParams,
      referenceImages: summarizeReferenceImages(input.referenceImageUrls ?? (input.referenceImageUrl ? [input.referenceImageUrl] : [])),
      maskImage: summarizeMaskImage(input.maskImageUrl),
      userIp,
    })

    let task: Awaited<ReturnType<GenerationService['generateImage']>>
    try {
      const streamGenerationEnabled = await isStreamGenerationEnabled()
      task = await generationService.generateImage({
        ...input,
        userIp,
        streamGenerationEnabled,
      })
      logGenerationRequest('request-accepted', {
        taskId: task?.id,
        status: task?.status,
        userId: task?.userId,
        modelId: task?.modelId,
        sizeTier: task?.sizeTier,
        size: task?.size,
        quantity: task?.quantity,
      })
      await recordDownstreamLog({
        taskId: task?.id,
        userId: task?.userId ?? input.userId,
        endpoint: req.originalUrl,
        phase: 'generate-image-stream',
        method: req.method,
        status: task ? 'success' : 'failed',
        statusCode: task ? 200 : 500,
        durationMs: Date.now() - startedAt,
        requestSummary: downstreamRequest,
        responseSummary: {
          taskId: task?.id,
          status: task?.status,
          modelId: task?.modelId,
          providerId: task?.providerId,
          size: task?.size,
          quantity: task?.quantity,
          stream: streamGenerationEnabled,
        },
        errorMessage: task ? null : '创建生成任务失败',
      })
    } catch (error) {
      const statusCode = typeof (error as { statusCode?: unknown }).statusCode === 'number' ? (error as { statusCode: number }).statusCode : 500
      await recordDownstreamLog({
        userId: input.userId,
        endpoint: req.originalUrl,
        phase: 'generate-image-stream',
        method: req.method,
        status: 'failed',
        statusCode,
        durationMs: Date.now() - startedAt,
        requestSummary: downstreamRequest,
        responseSummary: { error: error instanceof Error ? error.message : String(error) },
        errorMessage: error instanceof Error ? error.message : String(error),
      })
      throw error
    }

    if (!task) {
      res.status(500).json({ message: '创建生成任务失败' })
      return
    }

    res.status(200)
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')
    res.flushHeaders?.()

    let closed = false
    const heartbeat = setInterval(() => {
      if (!closed) res.write(': ping\n\n')
    }, 15000)
    const close = () => {
      if (closed) return
      closed = true
      clearInterval(heartbeat)
      unsubscribeAll(unsubscribers)
      res.end()
    }
    const unsubscribers = [
      taskEvents.onUpdated((updatedTask) => {
        if (updatedTask.id !== task.id || closed) return
        writeSse(res, 'task', updatedTask)
        if (isTerminalStatus(updatedTask.status)) {
          writeSse(res, 'done', { taskId: updatedTask.id, status: updatedTask.status })
          close()
        }
      }),
      taskEvents.onProgress((progress) => {
        if (progress.taskId !== task.id || closed) return
        writeSse(res, 'progress', progress)
      }),
    ]
    req.on('close', () => {
      if (!res.writableEnded) {
        closed = true
        clearInterval(heartbeat)
        unsubscribeAll(unsubscribers)
      }
    })

    const latestTask = await taskRepository.findById(task.id)
    const currentProgress = progressFromTask(task.id, (latestTask ?? task).status)
    if (currentProgress) writeSse(res, 'progress', currentProgress)
    writeSse(res, 'task', latestTask ?? task)
    if (isTerminalStatus((latestTask ?? task).status)) {
      writeSse(res, 'done', { taskId: task.id, status: (latestTask ?? task).status })
      close()
    }
  }
}
