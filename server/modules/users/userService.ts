import { randomUUID } from 'node:crypto'
import { AppError } from '../../shared/AppError.js'
import { CreditLogRepository } from '../creditLogs/creditLogRepository.js'
import { EmailService } from '../email/emailService.js'
import { EmailTokenService } from '../emailTokens/emailTokenService.js'
import { SettingRepository } from '../settings/settingRepository.js'
import { TaskRepository } from '../tasks/taskRepository.js'
import { hashPassword, verifyPassword } from './password.js'
import { UserRepository } from './userRepository.js'
import type { PublicUser, User, UserRole } from './userTypes.js'

function toPublicUser(user: User | null): PublicUser {
  if (!user) {
    throw new AppError(404, '用户不存在')
  }

  return {
    id: user.id,
    email: user.email,
    credits: user.credits,
    role: user.role,
    status: user.status,
    emailVerifiedAt: user.emailVerifiedAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  }
}

export class UserService {
  constructor(
    private readonly userRepository = new UserRepository(),
    private readonly creditLogRepository = new CreditLogRepository(),
    private readonly taskRepository = new TaskRepository(),
    private readonly settingRepository = new SettingRepository(),
    private readonly emailTokenService = new EmailTokenService(),
    private readonly emailService = new EmailService(),
  ) {}

  async listUsers() {
    const users = await this.userRepository.findAll()
    return users.map(toPublicUser)
  }

  async createUser(
    input: { email: string; password: string; role: UserRole },
    options: { source: 'admin' | 'public' } = { source: 'admin' },
  ) {
    const settings = await this.settingRepository.getSettings()
    if (options.source === 'public' && settings.registerMode === 'closed') {
      throw new AppError(403, '注册暂未开放')
    }

    const emailExisted = await this.userRepository.findByEmail(input.email)
    if (emailExisted) {
      throw new AppError(409, '邮箱已存在')
    }

    const now = new Date().toISOString()
    const shouldVerifyEmail =
      options.source === 'public' &&
      input.role === 'user' &&
      settings.registerEmailVerification
    if (shouldVerifyEmail) {
      this.assertEmailCanSend(settings)
    }

    const user = await this.userRepository.create({
      id: randomUUID(),
      email: input.email,
      passwordHash: hashPassword(input.password),
      credits: 0,
      role: input.role,
      status: 'active',
      emailVerifiedAt: shouldVerifyEmail ? null : now,
      createdAt: now,
      updatedAt: now,
    })

    if (shouldVerifyEmail && user) {
      await this.sendRegisterVerifyEmail(user.id, user.email)
    }

    return toPublicUser(user)
  }

  async login(input: { email: string; password: string }) {
    const user = await this.userRepository.findByEmail(input.email)
    if (!user || !verifyPassword(input.password, user.passwordHash)) {
      throw new AppError(401, '邮箱或密码错误')
    }

    if (user.status !== 'active') {
      throw new AppError(403, '用户已被禁用')
    }

    const settings = await this.settingRepository.getSettings()
    if (settings.registerEmailVerification && user.role === 'user' && !user.emailVerifiedAt) {
      this.assertEmailCanSend(settings)
      await this.sendRegisterVerifyEmail(user.id, user.email)
      throw new AppError(403, '邮箱未验证，已重新发送验证邮件，请前往邮箱完成验证')
    }

    return toPublicUser(user)
  }

  async getPublicUser(id: string) {
    const user = await this.userRepository.findById(id)
    if (!user) {
      throw new AppError(404, '用户不存在')
    }
    if (user.status !== 'active') {
      throw new AppError(403, '用户已被禁用')
    }

    return toPublicUser(user)
  }

  async updateStatus(id: string, status: 'active' | 'disabled') {
    const user = await this.userRepository.updateStatus(id, status)
    return toPublicUser(user)
  }

  async updateUser(
    id: string,
    input: Partial<{
      email: string
      password: string
      credits: number
      role: UserRole
      status: 'active' | 'disabled'
    }>,
  ) {
    const user = await this.userRepository.update(id, {
      email: input.email,
      passwordHash: input.password ? hashPassword(input.password) : undefined,
      credits: input.credits,
      role: input.role,
      status: input.status,
      emailVerifiedAt: input.email ? null : undefined,
    })
    return toPublicUser(user)
  }

  async rechargeUser(id: string, input: { amount: number; remark?: string }) {
    const user = await this.userRepository.findById(id)
    if (!user) {
      throw new AppError(404, '用户不存在')
    }

    const updatedUser = await this.userRepository.addCredits(id, input.amount)
    const publicUser = toPublicUser(updatedUser)
    const now = new Date().toISOString()
    const log = await this.creditLogRepository.create({
      id: randomUUID(),
      userId: id,
      type: 'recharge',
      amount: input.amount,
      balanceAfter: publicUser.credits,
      remark: input.remark || '后台充值',
      createdAt: now,
    })

    return {
      user: publicUser,
      log,
    }
  }

  async getUserDetails(id: string) {
    const user = await this.userRepository.findById(id)
    if (!user) {
      throw new AppError(404, '用户不存在')
    }

    const [creditLogs, tasks] = await Promise.all([
      this.creditLogRepository.findByUserId(id),
      this.taskRepository.findByUserId(id),
    ])

    return {
      user: toPublicUser(user),
      creditLogs,
      tasks,
    }
  }

  async deleteUser(id: string) {
    const deleted = await this.userRepository.delete(id)
    if (!deleted) {
      throw new AppError(404, '用户不存在')
    }
  }

  async verifyEmail(token: string) {
    const emailToken = await this.emailTokenService.consumeToken(token, 'register_verify')
    if (!emailToken?.userId) {
      throw new AppError(400, '验证链接无效或已过期')
    }

    const user = await this.userRepository.markEmailVerified(emailToken.userId)
    return toPublicUser(user)
  }

  async sendPasswordResetEmail(email: string) {
    const user = await this.userRepository.findByEmail(email)
    if (!user || user.status !== 'active') {
      return
    }

    const settings = await this.settingRepository.getSettings()
    this.assertEmailCanSend(settings)
    const token = await this.emailTokenService.createToken({
      email: user.email,
      userId: user.id,
      type: 'password_reset',
      expiresInMinutes: 30,
    })
    const resetUrl = `${settings.frontendUrl}/?resetPasswordToken=${encodeURIComponent(token)}`
    await this.emailService.sendMail({
      to: user.email,
      subject: `${settings.siteName} 找回密码`,
      text: `请在 30 分钟内打开链接重置密码：${resetUrl}`,
      html: `<p>请在 30 分钟内打开下面的链接重置密码：</p><p><a href="${resetUrl}">${resetUrl}</a></p>`,
    })
  }

  async resetPassword(input: { token: string; password: string }) {
    const emailToken = await this.emailTokenService.consumeToken(input.token, 'password_reset')
    if (!emailToken?.userId) {
      throw new AppError(400, '重置链接无效或已过期')
    }

    const user = await this.userRepository.findById(emailToken.userId)
    if (!user || user.status !== 'active') {
      throw new AppError(404, '用户不存在或已被禁用')
    }

    await this.userRepository.update(user.id, {
      passwordHash: hashPassword(input.password),
    })
  }

  private assertEmailCanSend(settings: Awaited<ReturnType<SettingRepository['getSettings']>>) {
    if (!settings.emailEnabled || !settings.emailHost || !settings.emailUser || !settings.emailPassword) {
      throw new AppError(400, '邮件服务未启用或未配置完整，暂时无法发送验证邮件')
    }
  }

  private async sendRegisterVerifyEmail(userId: string, email: string) {
    const settings = await this.settingRepository.getSettings()
    const token = await this.emailTokenService.createToken({
      email,
      userId,
      type: 'register_verify',
      expiresInMinutes: 60,
    })
    const verifyUrl = `${settings.frontendUrl}/?verifyEmailToken=${encodeURIComponent(token)}`
    await this.emailService.sendMail({
      to: email,
      subject: `${settings.siteName} 邮箱验证`,
      text: `请在 60 分钟内打开链接完成邮箱验证：${verifyUrl}`,
      html: `<p>请在 60 分钟内打开下面的链接完成邮箱验证：</p><p><a href="${verifyUrl}">${verifyUrl}</a></p>`,
    })
  }
}
