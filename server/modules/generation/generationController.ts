import type { Request, Response } from 'express'
import { getRequestIp } from '../../shared/requestIp.js'
import { generateImageSchema } from './generationSchemas.js'
import { GenerationService } from './generationService.js'
import { taskEvents } from '../tasks/taskEvents.js'
import { TaskRepository } from '../tasks/taskRepository.js'

const generationService = new GenerationService()
const taskRepository = new TaskRepository()

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

function logGenerationRequest(event: string, payload: Record<string, unknown>) {
  console.info(`[generation:${event}]`, JSON.stringify(payload, null, 2))
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

export class GenerationController {
  async generateImage(req: Request, res: Response) {
    const input = generateImageSchema.parse(req.body)
    const userIp = getRequestIp(req)
    logGenerationRequest('request-received', {
      userId: input.userId,
      modelId: input.modelId,
      prompt: input.prompt,
      sizeTier: input.sizeTier,
      size: input.size,
      quantity: input.quantity,
      openaiParams: input.openaiParams,
      referenceImages: summarizeReferenceImages(input.referenceImageUrls ?? (input.referenceImageUrl ? [input.referenceImageUrl] : [])),
      userIp,
    })

    const task = await generationService.generateImage({
      ...input,
      userIp,
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
    res.status(201).json({ data: task })
  }

  async generateImageStream(req: Request, res: Response) {
    const input = generateImageSchema.parse(req.body)
    const userIp = getRequestIp(req)
    logGenerationRequest('stream-request-received', {
      userId: input.userId,
      modelId: input.modelId,
      prompt: input.prompt,
      sizeTier: input.sizeTier,
      size: input.size,
      quantity: input.quantity,
      openaiParams: input.openaiParams,
      referenceImages: summarizeReferenceImages(input.referenceImageUrls ?? (input.referenceImageUrl ? [input.referenceImageUrl] : [])),
      userIp,
    })

    const task = await generationService.generateImage({
      ...input,
      userIp,
    })

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
