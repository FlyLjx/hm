import { AppError } from '../../shared/AppError.js'
import { EmailService } from '../email/emailService.js'
import { UserRepository } from '../users/userRepository.js'

type MailBroadcastInput = {
  targetType: 'all' | 'active' | 'specific'
  userIds: string[]
  subject: string
  content: string
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function toHtml(content: string) {
  return `<div style="font-family:Arial,'Microsoft YaHei',sans-serif;line-height:1.8;color:#172033;white-space:pre-wrap;">${escapeHtml(content)}</div>`
}

export class MailBroadcastService {
  constructor(
    private readonly userRepository = new UserRepository(),
    private readonly emailService = new EmailService(),
  ) {}

  async send(input: MailBroadcastInput) {
    const users = await this.userRepository.findAll()
    const selected = users.filter((user) => {
      if (!user.email) return false
      if (input.targetType === 'active') return user.status === 'active'
      if (input.targetType === 'specific') return input.userIds.includes(user.id)
      return true
    })

    const uniqueUsers = Array.from(new Map(selected.map((user) => [user.email.toLowerCase(), user])).values())
    if (uniqueUsers.length === 0) {
      throw new AppError(400, '没有可发送的收件用户')
    }

    const result = {
      total: uniqueUsers.length,
      success: 0,
      failed: 0,
      failures: [] as Array<{ email: string; message: string }>,
    }

    for (const user of uniqueUsers) {
      try {
        await this.emailService.sendMail({
          to: user.email,
          subject: input.subject,
          text: input.content,
          html: toHtml(input.content),
        })
        result.success += 1
      } catch (error) {
        result.failed += 1
        if (result.failures.length < 50) {
          result.failures.push({
            email: user.email,
            message: error instanceof Error ? error.message : '发送失败',
          })
        }
      }
    }

    return result
  }
}
