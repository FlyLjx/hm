import type { Request, Response } from 'express'
import { deleteLogFile, listLogFiles, readLogFile, readLogFileSince } from '../../shared/fileLogger.js'
import { AppError } from '../../shared/AppError.js'

function writeSse(res: Response, event: string, data: unknown) {
  res.write(`event: ${event}\n`)
  res.write(`data: ${JSON.stringify(data)}\n\n`)
}

export class SystemLogController {
  list(_req: Request, res: Response) {
    res.json({ data: listLogFiles() })
  }

  detail(req: Request, res: Response) {
    const name = typeof req.query.name === 'string' ? req.query.name : undefined
    const maxBytes = Number(req.query.maxBytes || 300000)
    res.json({ data: readLogFile(name, Number.isFinite(maxBytes) ? maxBytes : 300000) })
  }

  remove(req: Request, res: Response) {
    const name = typeof req.params.name === 'string' ? req.params.name : ''
    const result = deleteLogFile(name)
    if (!result.deleted) {
      if (result.reason === 'not_found') throw new AppError(404, '日志文件不存在')
      if (result.reason === 'invalid_name' || result.reason === 'invalid_path') throw new AppError(400, '日志文件名不合法')
      throw new AppError(500, result.message || '删除日志文件失败')
    }
    res.json({ data: result })
  }

  stream(req: Request, res: Response) {
    const name = typeof req.query.name === 'string' ? req.query.name : undefined
    let offset = Number(req.query.offset || 0)
    if (!Number.isFinite(offset)) offset = 0

    res.status(200)
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')
    res.flushHeaders?.()

    const initial = readLogFileSince(name, offset)
    offset = initial.offset
    writeSse(res, 'ready', {
      name: initial.name,
      size: initial.size,
      offset,
    })
    if (initial.content) writeSse(res, 'append', initial)

    const timer = setInterval(() => {
      const next = readLogFileSince(name, offset)
      if (next.offset !== offset || next.content) {
        offset = next.offset
        writeSse(res, 'append', next)
      } else {
        writeSse(res, 'ping', { offset, at: new Date().toISOString() })
      }
    }, 1000)

    req.on('close', () => {
      clearInterval(timer)
      if (!res.writableEnded) res.end()
    })
  }
}
