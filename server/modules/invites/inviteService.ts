import { randomUUID } from 'node:crypto'
import { AppError } from '../../shared/AppError.js'
import { toMysqlDateTime } from '../../shared/mysqlDate.js'
import { CreditLogRepository } from '../creditLogs/creditLogRepository.js'
import { SettingRepository } from '../settings/settingRepository.js'
import { userEvents } from '../users/userEvents.js'
import { UserRepository } from '../users/userRepository.js'
import { InviteRepository } from './inviteRepository.js'

function since24Hours() {
  return toMysqlDateTime(new Date(Date.now() - 24 * 60 * 60 * 1000)) || ''
}

export class InviteService {
  constructor(
    private readonly inviteRepository = new InviteRepository(),
    private readonly userRepository = new UserRepository(),
    private readonly settingRepository = new SettingRepository(),
    private readonly creditLogRepository = new CreditLogRepository(),
  ) {}

  async listInvites(input: { page?: number; pageSize?: number; keyword?: string }) {
    return this.inviteRepository.findAll(input)
  }

  async getSummary(userId: string) {
    const [settings, summary, recent] = await Promise.all([
      this.settingRepository.getSettings(),
      this.inviteRepository.getSummaryByInviter(userId),
      this.inviteRepository.findByInviter(userId, 10),
    ])
    return {
      enabled: settings.inviteEnabled,
      rewardCredits: settings.inviteRewardCredits,
      total: summary.total,
      totalRewardCredits: summary.totalRewardCredits,
      recent,
    }
  }

  async deleteInvite(id: string) {
    const invite = await this.inviteRepository.findById(id)
    if (!invite) {
      throw new AppError(404, '邀请记录不存在')
    }

    const deleted = await this.inviteRepository.delete(id)
    if (!deleted) {
      throw new AppError(404, '邀请记录不存在')
    }

    const updatedInviter = await this.userRepository.deductCredits(invite.inviterId, invite.rewardCredits)
    if (!updatedInviter) {
      throw new AppError(404, '邀请人不存在')
    }
    const { passwordHash: _passwordHash, ...publicUser } = updatedInviter

    const log = await this.creditLogRepository.create({
      id: randomUUID(),
      userId: invite.inviterId,
      type: 'deduct',
      amount: invite.rewardCredits,
      balanceAfter: updatedInviter.credits,
      remark: `删除邀请记录扣回奖励：${invite.inviteeEmail || invite.inviteeId}`,
      createdAt: new Date().toISOString(),
    })

    userEvents.emitUpdated(publicUser)
    return {
      deleted: true,
      invite,
      user: publicUser,
      log,
    }
  }

  async rewardInvite(input: { inviterId?: string | null; inviteeId: string; inviteeIp?: string | null }) {
    if (!input.inviterId || input.inviterId === input.inviteeId) {
      return null
    }

    const settings = await this.settingRepository.getSettings()
    if (!settings.inviteEnabled) {
      return null
    }

    const [inviter, invitee, existed] = await Promise.all([
      this.userRepository.findById(input.inviterId),
      this.userRepository.findById(input.inviteeId),
      this.inviteRepository.findByInvitee(input.inviteeId),
    ])
    if (!inviter || inviter.status !== 'active' || !invitee || existed) {
      return null
    }

    const since = since24Hours()
    const [ipCount, inviterCount] = await Promise.all([
      input.inviteeIp ? this.inviteRepository.countByIpSince(input.inviteeIp, since) : 0,
      this.inviteRepository.countByInviterSince(inviter.id, since),
    ])
    if (ipCount >= 3 || inviterCount >= 30) {
      return null
    }

    const rewardCredits = settings.inviteRewardCredits
    const now = new Date().toISOString()
    const created = await this.inviteRepository.create({
      id: randomUUID(),
      inviterId: inviter.id,
      inviterEmail: inviter.email,
      inviteeId: invitee.id,
      inviteeEmail: invitee.email,
      rewardCredits,
      inviteeIp: input.inviteeIp ?? null,
      createdAt: now,
    })
    if (!created) {
      return null
    }

    const updatedInviter = await this.userRepository.addCredits(inviter.id, rewardCredits)
    if (!updatedInviter) {
      throw new AppError(404, '邀请人不存在')
    }
    await this.creditLogRepository.create({
      id: randomUUID(),
      userId: inviter.id,
      type: 'recharge',
      amount: rewardCredits,
      balanceAfter: updatedInviter.credits,
      remark: `邀请奖励：${invitee.email}`,
      createdAt: now,
    })

    return this.inviteRepository.findByInvitee(invitee.id)
  }
}
