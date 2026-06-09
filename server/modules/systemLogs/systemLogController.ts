import type { Request, Response } from 'express'
import { listLogFiles, readLogFile } from '../../shared/fileLogger.js'

export class SystemLogController {
  list(_req: Request, res: Response) {
    res.json({ data: listLogFiles() })
  }

  detail(req: Request, res: Response) {
    const name = typeof req.query.name === 'string' ? req.query.name : undefined
    const maxBytes = Number(req.query.maxBytes || 300000)
    res.json({ data: readLogFile(name, Number.isFinite(maxBytes) ? maxBytes : 300000) })
  }
}
