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

    try {
      await transporter.verify()
      const info = await transporter.sendMail({
        from: `"${fromName}" <${fromAddress}>`,
        to: input.to,
        subject: input.subject,
        text: input.text,
        html: input.html,
      })

      console.info('[email:sent]', {
        messageId: info.messageId,
        accepted: info.accepted,
        rejected: info.rejected,
        response: info.response,
      })

      if (info.rejected.length > 0 || info.accepted.length === 0) {
        throw new AppError(502, `邮件发送未被收件服务器接受：${info.response || info.rejected.join(', ')}`)
      }
    } catch (error) {
      console.error('[email:error]', {
        to: input.to,
        subject: input.subject,
        code: error && typeof error === 'object' && 'code' in error ? error.code : undefined,
        command: error && typeof error === 'object' && 'command' in error ? error.command : undefined,
        response: error && typeof error === 'object' && 'response' in error ? error.response : undefined,
        message: error instanceof Error ? error.message : String(error),
      })

      if (error instanceof AppError) {
        throw error
      }
      throw new AppError(502, error instanceof Error ? error.message : '邮件发送失败')
    }
  }
}
