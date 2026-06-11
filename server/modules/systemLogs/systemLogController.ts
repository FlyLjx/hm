import type { Request, Response } from 'express'
import { listLogFiles, readLogFile, readLogFileSince } from '../../shared/fileLogger.js'

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
