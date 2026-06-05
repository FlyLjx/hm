import type { Request, Response } from 'express'
import { DashboardRepository } from './dashboardRepository.js'

const dashboardRepository = new DashboardRepository()

export class DashboardController {
  async overview(_req: Request, res: Response) {
    const overview = await dashboardRepository.getOverview()
    res.json({ data: overview })
  }
}
