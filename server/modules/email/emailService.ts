import nodemailer from 'nodemailer'
import { AppError } from '../../shared/AppError.js'
import { SettingRepository } from '../settings/settingRepository.js'

export class EmailService {
  constructor(private readonly settingRepository = new SettingRepository()) {}

  async sendMail(input: { to: string; subject: string; text: string; html?: string }) {
    const settings = await this.settingRepository.getSettings()
    if (!settings.emailEnabled) {
      throw new AppError(400, '邮件服务未启用')
    }
    if (!settings.emailHost || !settings.emailUser || !settings.emailPassword) {
      throw new AppError(400, '邮件服务未配置完整')
    }

    const fromAddress = settings.emailFromAddress || settings.emailUser
    const fromName = settings.emailFromName || settings.siteName
    const transporter = nodemailer.createTransport({
      host: settings.emailHost,
      port: settings.emailPort,
      secure: settings.emailSecure,
      auth: {
        user: settings.emailUser,
        pass: settings.emailPassword,
      },
    })

    console.info('[email:send]', {
      to: input.to,
      subject: input.subject,
      host: settings.emailHost,
      port: settings.emailPort,
      secure: settings.emailSecure,
      from: fromAddress,
    })

    await transporter.sendMail({
      from: `"${fromName}" <${fromAddress}>`,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
    })
  }
}
