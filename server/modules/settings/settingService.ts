import { SettingRepository } from './settingRepository.js'
import type { SystemSettings } from './settingTypes.js'
import { EmailService } from '../email/emailService.js'

export class SettingService {
  constructor(
    private readonly settingRepository = new SettingRepository(),
    private readonly emailService = new EmailService(),
  ) {}

  async getSettings() {
    return this.settingRepository.getSettings()
  }

  async updateSettings(input: SystemSettings) {
    return this.settingRepository.updateSettings(input)
  }

  async sendTestEmail(email: string) {
    const settings = await this.settingRepository.getSettings()
    await this.emailService.sendMail({
      to: email,
      subject: `${settings.siteName} 测试邮件`,
      text: '这是一封测试邮件。如果你收到了，说明邮件服务配置可以正常发送。',
      html: '<p>这是一封测试邮件。</p><p>如果你收到了，说明邮件服务配置可以正常发送。</p>',
    })
  }
}
