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

  async getPublicSettings() {
    const settings = await this.settingRepository.getSettings()
    return {
      siteName: settings.siteName,
      logoText: settings.logoText,
      creditName: settings.creditName,
      frontendUrl: settings.frontendUrl,
      backendUrl: settings.backendUrl,
      announcementEnabled: true,
      supportEnabled: settings.supportEnabled,
      supportTitle: settings.supportTitle,
      supportDescription: settings.supportDescription,
      supportWechat: settings.supportWechat,
      supportQq: settings.supportQq,
      supportEmail: settings.supportEmail,
      supportUrl: settings.supportUrl,
      supportQrCodeUrl: settings.supportQrCodeUrl,
      rechargeEnabled: settings.rechargeEnabled,
      rechargeRate: settings.rechargeRate,
      rechargeMinAmount: settings.rechargeMinAmount,
      rechargePresets: settings.rechargePresets,
      checkinEnabled: settings.checkinEnabled,
      checkinRewards: settings.checkinRewards,
      inviteEnabled: settings.inviteEnabled,
      inviteRewardCredits: settings.inviteRewardCredits,
      streamGenerationEnabled: settings.streamGenerationEnabled,
      registerMode: settings.registerMode,
      registerRewardCredits: settings.registerRewardCredits,
      registerEmailVerification: settings.registerEmailVerification,
    }
  }

  async updateSettings(input: SystemSettings) {
    return this.settingRepository.updateSettings(input)
  }

  async getAccountPoolSettings() {
    const settings = await this.settingRepository.getSettings()
    return {
      accountPoolEndpoint: settings.accountPoolEndpoint,
      accountPoolApiKey: settings.accountPoolApiKey,
      accountPoolAuthHeader: settings.accountPoolAuthHeader,
    }
  }

  async updateAccountPoolSettings(input: Pick<SystemSettings, 'accountPoolEndpoint' | 'accountPoolApiKey' | 'accountPoolAuthHeader'>) {
    const settings = await this.settingRepository.getSettings()
    return this.settingRepository.updateSettings({
      ...settings,
      ...input,
    })
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
