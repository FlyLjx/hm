import { TaskRepository } from './taskRepository.js'
import { taskEvents } from './taskEvents.js'
import type { AiModelCapability } from '../models/modelTypes.js'
import type { GenerationSizeTier } from './taskTypes.js'
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

export class TaskService {
  constructor(private readonly taskRepository = new TaskRepository()) {}

  async listTasks() {
    return this.taskRepository.findAll()
  }

  async getTask(id: string) {
    return this.taskRepository.findById(id)
  }

  async cancelTask(id: string) {
    const task = await this.taskRepository.cancel(id)
    taskEvents.emitUpdated(task)
    return task
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
