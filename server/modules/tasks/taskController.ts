import type { Request, Response } from 'express'
import { getStringParam } from '../../shared/requestParams.js'
import { TaskService } from './taskService.js'
import { taskEstimateSchema } from './taskSchemas.js'

const taskService = new TaskService()

export class TaskController {
  async list(_req: Request, res: Response) {
    const tasks = await taskService.listTasks()
    res.json({ data: tasks })
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

  async estimate(req: Request, res: Response) {
    const input = taskEstimateSchema.parse(req.query)
    const estimate = await taskService.estimateDuration(input)
    res.json({ data: estimate })
  }
}
