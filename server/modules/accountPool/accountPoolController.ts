import type { Request, Response } from 'express'
import { AccountPoolService } from './accountPoolService.js'

const accountPoolService = new AccountPoolService()

export class AccountPoolController {
  async list(_req: Request, res: Response) {
    const result = await accountPoolService.listAccounts()
    res.json({ data: result })
  }
}
