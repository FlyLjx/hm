import { randomUUID } from 'node:crypto'
import { AppError } from '../../shared/AppError.js'
import { CreditLogRepository } from '../creditLogs/creditLogRepository.js'
import { SettingRepository } from '../settings/settingRepository.js'
import { userEvents } from '../users/userEvents.js'
import { UserRepository } from '../users/userRepository.js'
import { CheckinRepository } from './checkinRepository.js'

function todayInShanghai() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function parseRewards(value: string) {
  const rewards = value
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item) && item > 0)
  return rewards.length ? rewards : [0.1]
}

export class CheckinService {
  constructor(
    private readonly checkinRepository = new CheckinRepository(),
    private readonly userRepository = new UserRepository(),
    private readonly settingRepository = new SettingRepository(),
    private readonly creditLogRepository = new CreditLogRepository(),
  ) {}

  async listCheckins(input: { page?: number; pageSize?: number; keyword?: string }) {
    return this.checkinRepository.findAll(input)
  }

  async getStatus(userId: string) {
    const settings = await this.settingRepository.getSettings()
    const checkinDate = todayInShanghai()
    const today = await this.checkinRepository.findTodayByUser(userId, checkinDate)
    return {
      enabled: settings.checkinEnabled,
      rewards: parseRewards(settings.checkinRewards),
      checkedIn: Boolean(today),
      today,
    }
  }

  async checkin(input: { userId: string; userIp?: string | null }) {
    const [settings, user] = await Promise.all([
      this.settingRepository.getSettings(),
      this.userRepository.findById(input.userId),
    ])
    if (!settings.checkinEnabled) {
      throw new AppError(403, '签到暂未开放')
    }
    if (!user || user.status !== 'active') {
      throw new AppError(404, '用户不存在或已被禁用')
    }

    const checkinDate = todayInShanghai()
    const existed = await this.checkinRepository.findTodayByUser(user.id, checkinDate)
    if (existed) {
      throw new AppError(409, '今天已经签到过了')
    }

    const rewards = parseRewards(settings.checkinRewards)
    const rewardCredits = rewards[Math.floor(Math.random() * rewards.length)]
    const now = new Date().toISOString()
    const created = await this.checkinRepository.create({
      id: randomUUID(),
      userId: user.id,
      userEmail: user.email,
      rewardCredits,
      checkinDate,
      userIp: input.userIp ?? null,
      createdAt: now,
    })
    if (!created) {
      throw new AppError(409, '今天已经签到过了')
    }

    const updatedUser = await this.userRepository.addCredits(user.id, rewardCredits)
    if (!updatedUser) {
      throw new AppError(404, '用户不存在')
    }
    const { passwordHash: _passwordHash, ...publicUser } = updatedUser

    const checkin = await this.checkinRepository.findTodayByUser(user.id, checkinDate)
    const log = await this.creditLogRepository.create({
      id: randomUUID(),
      userId: user.id,
      type: 'recharge',
      amount: rewardCredits,
      balanceAfter: updatedUser.credits,
      remark: '每日签到奖励',
      createdAt: now,
    })

    userEvents.emitUpdated(publicUser)
    return {
      checkin,
      rewards,
      rewardCredits,
      user: publicUser,
      log,
    }
  }

  async deleteCheckin(id: string) {
    const checkin = await this.checkinRepository.findById(id)
    if (!checkin) {
      throw new AppError(404, '签到记录不存在')
    }

    const deleted = await this.checkinRepository.delete(id)
    if (!deleted) {
      throw new AppError(404, '签到记录不存在')
    }

    const updatedUser = await this.userRepository.deductCredits(checkin.userId, checkin.rewardCredits)
    if (!updatedUser) {
      throw new AppError(404, '用户不存在')
    }
    const { passwordHash: _passwordHash, ...publicUser } = updatedUser

    const log = await this.creditLogRepository.create({
      id: randomUUID(),
      userId: checkin.userId,
      type: 'deduct',
      amount: checkin.rewardCredits,
      balanceAfter: updatedUser.credits,
      remark: '删除签到记录扣回奖励',
      createdAt: new Date().toISOString(),
    })

    userEvents.emitUpdated(publicUser)
    return {
      deleted: true,
      checkin,
      user: publicUser,
      log,
    }
  }
}
