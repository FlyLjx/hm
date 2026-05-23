import type { Request, Response } from 'express'
import { testEmailSchema, updateSettingsSchema } from './settingSchemas.js'
import { SettingService } from './settingService.js'

const settingService = new SettingService()

export class SettingController {
  async get(_req: Request, res: Response) {
    const settings = await settingService.getSettings()
    res.json({ data: settings })
  }

  async update(req: Request, res: Response) {
    const input = updateSettingsSchema.parse(req.body)
    const settings = await settingService.updateSettings(input)
    res.json({ data: settings })
  }

  async testEmail(req: Request, res: Response) {
    const input = testEmailSchema.parse(req.body)
    await settingService.sendTestEmail(input.email)
    res.json({ data: { sent: true } })
  }
}
