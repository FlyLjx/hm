import { TaskRepository } from './taskRepository.js'
import { taskEvents } from './taskEvents.js'
import type { AiModelCapability } from '../models/modelTypes.js'
import type { GenerationSizeTier, GenerationTask } from './taskTypes.js'
import { AppError } from '../../shared/AppError.js'
import sharp from 'sharp'

function parseDataImage(value: string) {
  const match = value.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/)
  if (!match) return null
  return {
    contentType: match[1],
    buffer: Buffer.from(match[2], 'base64'),
  }
}

function detectImageContentType(buffer: Buffer, fallback = 'image/png') {
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png'
  }
  if (buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) {
    return 'image/jpeg'
  }
  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
    return 'image/webp'
  }
  if (buffer.subarray(0, 6).toString('ascii').startsWith('GIF')) {
    return 'image/gif'
  }
  return fallback.startsWith('image/') ? fallback : 'image/png'
}

function imageExtension(contentType: string) {
  const normalized = contentType.toLowerCase().split(';')[0]
  if (normalized === 'image/jpeg' || normalized === 'image/jpg') return 'jpg'
  if (normalized === 'image/webp') return 'webp'
  if (normalized === 'image/gif') return 'gif'
  if (normalized === 'image/avif') return 'avif'
  return 'png'
}

function escapeExcelCell(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function getStatusLabel(status: GenerationTask['status']) {
  const labels: Record<GenerationTask['status'], string> = {
    queued: '等待中',
    pending: '等待中',
    processing: '创作中',
    success: '成功',
    failed: '失败',
    canceled: '已取消',
  }
  return labels[status] ?? status
}

function getCapabilityLabel(capability: AiModelCapability) {
  return capability === 'chat_image' ? '对话生图' : capability
}

function buildExcelTable(tasks: GenerationTask[]) {
  const headers = [
    '任务ID',
    '用户',
    '用户IP',
    '用途',
    '模型',
    '服务商',
    '规格',
    '分辨率',
    '数量',
    '扣除积分',
    '剩余积分',
    '用时(s)',
    '状态',
    '失败原因',
    '提示词',
    '创建时间',
    '更新时间',
  ]
  const rows = tasks.map((task) => [
    task.id,
    task.userEmail ?? task.userId,
    task.userIp,
    getCapabilityLabel(task.capability),
    task.modelName ?? task.modelId,
    task.providerName ?? task.providerId,
    task.sizeTier,
    task.size ?? '',
    task.quantity,
    task.costCredits,
    task.remainingCredits,
    task.durationSeconds,
    getStatusLabel(task.status),
    task.errorMessage ?? '',
    task.prompt,
    task.createdAt,
    task.updatedAt,
  ])

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
</head>
<body>
  <table border="1">
    <thead><tr>${headers.map((item) => `<th>${escapeExcelCell(item)}</th>`).join('')}</tr></thead>
    <tbody>
      ${rows.map((row) => `<tr>${row.map((item) => `<td>${escapeExcelCell(item)}</td>`).join('')}</tr>`).join('')}
    </tbody>
  </table>
</body>
</html>`
}

export class TaskService {
  constructor(private readonly taskRepository = new TaskRepository()) {}

  async listTasks(input?: { page?: number; pageSize?: number }) {
    return this.taskRepository.findAll(input)
  }

  async getStats() {
    return this.taskRepository.getStats()
  }

  async listImages(input?: { page?: number; pageSize?: number; keyword?: string; display?: 'all' | 'public' | 'private' }) {
    return this.taskRepository.findImages(input)
  }

  async listPublicDisplayTasks() {
    return this.taskRepository.findPublicDisplay()
  }

  async exportTasks() {
    const tasks = await this.taskRepository.findAllForExport()
    return {
      contentType: 'application/vnd.ms-excel; charset=utf-8',
      filename: `tasks-${new Date().toISOString().slice(0, 10)}.xls`,
      buffer: Buffer.from(`\ufeff${buildExcelTable(tasks)}`, 'utf8'),
    }
  }

  async getTask(id: string) {
    return this.taskRepository.findById(id)
  }

  async cancelTask(id: string) {
    const task = await this.taskRepository.cancel(id)
    taskEvents.emitUpdated(task)
    return task
  }

  async cancelTimedOutRunningTasks(timeoutMinutes: number) {
    const tasks = await this.taskRepository.cancelTimedOutRunningTasks(timeoutMinutes)
    tasks.forEach((task) => taskEvents.emitUpdated(task))
    return tasks
  }

  async updateTaskDisplay(
    id: string,
    input: { displayEnabled: boolean; displayNote?: string | null; userId?: string },
  ) {
    const task = await this.taskRepository.findById(id)
    if (!task) {
      throw new AppError(404, '任务不存在')
    }
    if (task.status !== 'success' || !task.resultUrl) {
      throw new AppError(400, '只有成功生成的图片可以展示')
    }
    if (input.userId && task.userId !== input.userId) {
      throw new AppError(403, '不能修改其他用户的任务')
    }

    const displayNote = input.displayEnabled
      ? input.displayNote?.trim() || task.prompt
      : input.displayNote?.trim() || null
    const updatedTask = await this.taskRepository.update(id, {
      displayEnabled: input.displayEnabled,
      displayNote,
    })
    taskEvents.emitUpdated(updatedTask)
    return updatedTask
  }

  async getTaskImage(id: string, index: number) {
    const imageUrl = await this.taskRepository.findImageUrlByIndex(id, index)
    if (!imageUrl) {
      throw new AppError(404, '图片不存在')
    }

    const dataImage = parseDataImage(imageUrl)
    if (dataImage) {
      return {
        contentType: detectImageContentType(dataImage.buffer, dataImage.contentType),
        buffer: dataImage.buffer,
      }
    }

    const response = await fetch(imageUrl)
    if (!response.ok) {
      throw new AppError(response.status, `图片读取失败：${response.status}`)
    }

    const buffer = Buffer.from(await response.arrayBuffer())
    return {
      contentType: detectImageContentType(buffer, response.headers.get('content-type') ?? 'image/png'),
      buffer,
    }
  }

  async getTaskDownloadImage(id: string, index: number) {
    const image = await this.getTaskImage(id, index)
    return {
      ...image,
      extension: imageExtension(image.contentType),
      filename: `task-${id.slice(0, 8)}-${index + 1}.${imageExtension(image.contentType)}`,
    }
  }

  async getTaskThumbnail(id: string, index: number) {
    const image = await this.getTaskImage(id, index)
    const buffer = await sharp(image.buffer)
      .resize({
        width: 360,
        height: 360,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 72 })
      .toBuffer()

    return {
      contentType: 'image/webp',
      buffer,
    }
  }

  async estimateDuration(input: {
    modelId: string
    capability: AiModelCapability
    sizeTier: GenerationSizeTier
    size: string
    quantity: number
  }) {
    const averageDuration = await this.taskRepository.estimateDuration(input)
    return {
      estimatedSeconds: Math.max(10, Math.round(averageDuration ?? 30)),
      source: averageDuration ? 'history' : 'default',
    }
  }
}
