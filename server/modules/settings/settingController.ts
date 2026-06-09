import type { Request, Response } from 'express'
import { accountPoolSettingsSchema, testEmailSchema, updateSettingsSchema } from './settingSchemas.js'
import { SettingService } from './settingService.js'

const settingService = new SettingService()

export class SettingController {
  async get(_req: Request, res: Response) {
    const settings = await settingService.getSettings()
    res.json({ data: settings })
  }

  async getPublic(_req: Request, res: Response) {
    const settings = await settingService.getPublicSettings()
    res.json({ data: settings })
  }

  async update(req: Request, res: Response) {
    const input = updateSettingsSchema.parse(req.body)
    const accountPoolSettings = await settingService.getAccountPoolSettings()
    const settings = await settingService.updateSettings({
      ...input,
      ...accountPoolSettings,
    })
    res.json({ data: settings })
  }

  async getAccountPool(_req: Request, res: Response) {
    const settings = await settingService.getAccountPoolSettings()
    res.json({ data: settings })
  }

  async updateAccountPool(req: Request, res: Response) {
    const input = accountPoolSettingsSchema.parse(req.body)
    const settings = await settingService.updateAccountPoolSettings(input)
    res.json({
      data: {
        accountPoolEndpoint: settings.accountPoolEndpoint,
        accountPoolApiKey: settings.accountPoolApiKey,
        accountPoolAuthHeader: settings.accountPoolAuthHeader,
      },
    })
  }

  async testEmail(req: Request, res: Response) {
    const input = testEmailSchema.parse(req.body)
    await settingService.sendTestEmail(input.email)
    res.json({ data: { sent: true } })
  }

  async testBark(_req: Request, res: Response) {
    await settingService.sendTestBark()
    res.json({ data: { sent: true } })
  }
}
