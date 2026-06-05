import type { Request, Response } from 'express'
import { getStringParam } from '../../shared/requestParams.js'
import { TaskService } from './taskService.js'
import { taskDisplaySchema, taskEstimateSchema, taskImageListSchema, taskListSchema } from './taskSchemas.js'

const taskService = new TaskService()

function sanitizeDownloadFilename(value: unknown) {
  const filename = String(value || '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/^[.]+|[.]+$/g, '')
    .slice(0, 80)
  return /\.(png|jpe?g|webp|gif|avif)$/i.test(filename) ? filename : ''
}

function withImageExtension(filename: string, extension: string) {
  const safeExtension = extension.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'png'
  const baseName = filename.replace(/\.(png|jpe?g|webp|gif|avif)$/i, '')
  return `${baseName || 'image'}.${safeExtension}`
}

function encodeContentDispositionFilename(filename: string) {
  const fallback = filename.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '')
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`
}

export class TaskController {
  async list(req: Request, res: Response) {
    const input = taskListSchema.parse(req.query)
    const tasks = await taskService.listTasks(input)
    res.json({ data: tasks.items, pagination: {
      page: tasks.page,
      pageSize: tasks.pageSize,
      total: tasks.total,
    } })
  }

  async stats(_req: Request, res: Response) {
    const stats = await taskService.getStats()
    res.json({ data: stats })
  }

  async listPublicDisplay(_req: Request, res: Response) {
    const tasks = await taskService.listPublicDisplayTasks()
    res.json({ data: tasks })
  }

  async listImages(req: Request, res: Response) {
    const input = taskImageListSchema.parse(req.query)
    const tasks = await taskService.listImages(input)
    res.json({ data: tasks.items, pagination: {
      page: tasks.page,
      pageSize: tasks.pageSize,
      total: tasks.total,
    } })
  }

  async export(req: Request, res: Response) {
    const file = await taskService.exportTasks()
    res.setHeader('Content-Type', file.contentType)
    res.setHeader('Content-Length', String(file.buffer.length))
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`)
    res.send(file.buffer)
  }

  async detail(req: Request, res: Response) {
    const task = await taskService.getTask(getStringParam(req.params.id, 'id'))
    res.json({ data: task })
  }

  async image(req: Request, res: Response) {
    const image = await taskService.getTaskImage(
      getStringParam(req.params.id, 'id'),
      Number(getStringParam(req.params.index, 'index')),
    )
    res.setHeader('Content-Type', image.contentType)
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    res.send(image.buffer)
  }

  async downloadImage(req: Request, res: Response) {
    const image = await taskService.getTaskDownloadImage(
      getStringParam(req.params.id, 'id'),
      Number(getStringParam(req.params.index, 'index')),
    )
    const filename = withImageExtension(
      sanitizeDownloadFilename(req.query.filename) || image.filename,
      image.extension,
    )
    res.setHeader('Content-Type', image.contentType)
    res.setHeader('Content-Length', String(image.buffer.length))
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Content-Disposition', encodeContentDispositionFilename(filename))
    res.send(image.buffer)
  }

  async thumbnail(req: Request, res: Response) {
    const image = await taskService.getTaskThumbnail(
      getStringParam(req.params.id, 'id'),
      Number(getStringParam(req.params.index, 'index')),
    )
    res.setHeader('Content-Type', image.contentType)
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    res.send(image.buffer)
  }

  async cancel(req: Request, res: Response) {
    const task = await taskService.cancelTask(getStringParam(req.params.id, 'id'))
    res.json({ data: task })
  }

  async updateDisplay(req: Request, res: Response) {
    const input = taskDisplaySchema.parse(req.body)
    const task = await taskService.updateTaskDisplay(getStringParam(req.params.id, 'id'), input)
    res.json({ data: task })
  }

  async estimate(req: Request, res: Response) {
    const input = taskEstimateSchema.parse(req.query)
    const estimate = await taskService.estimateDuration(input)
    res.json({ data: estimate })
  }
}
