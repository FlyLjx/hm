import { randomUUID } from 'node:crypto'
import { AppError } from '../../shared/AppError.js'
import { CreditLogRepository } from '../creditLogs/creditLogRepository.js'
import { userEvents } from '../users/userEvents.js'
import { UserRepository } from '../users/userRepository.js'
import { RedeemCodeRepository } from './redeemCodeRepository.js'

function generateCode() {
  const part = () => Math.random().toString(36).slice(2, 8).toUpperCase()
  return `AI-${part()}-${part()}`
}

export class RedeemCodeService {
  constructor(
    private readonly redeemCodeRepository = new RedeemCodeRepository(),
    private readonly userRepository = new UserRepository(),
    private readonly creditLogRepository = new CreditLogRepository(),
  ) {}

  async listCodes(input: { page?: number; pageSize?: number; status?: 'all' | 'active' | 'used' | 'disabled'; keyword?: string }) {
    return this.redeemCodeRepository.findAll(input)
  }

  async createCodes(input: {
    code?: string
    count: number
    credits: number
    remark?: string | null
    expiresAt?: string | null
  }) {
    const created = []
    for (let index = 0; index < input.count; index += 1) {
      const code = input.code?.trim() || generateCode()
      if (input.code && input.count > 1) {
        throw new AppError(400, '指定卡密时只能创建 1 张')
      }
      const existed = await this.redeemCodeRepository.findByCode(code)
      if (existed) {
        throw new AppError(409, `卡密已存在：${code}`)
      }
      const item = await this.redeemCodeRepository.create({
        id: randomUUID(),
        code,
        credits: Number(input.credits.toFixed(4)),
        status: 'active',
        remark: input.remark?.trim() || null,
        userId: null,
        userEmail: null,
        usedAt: null,
        expiresAt: input.expiresAt ?? null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      if (item) created.push(item)
    }
    return created
  }

  async updateCode(id: string, input: {
    credits?: number
    status?: 'active' | 'disabled'
    remark?: string | null
    expiresAt?: string | null
  }) {
    const code = await this.redeemCodeRepository.findById(id)
    if (!code) {
      throw new AppError(404, '卡密不存在')
    }
    if (code.status === 'used') {
      throw new AppError(400, '已兑换的卡密不能修改')
    }
    const updated = await this.redeemCodeRepository.update(id, {
      credits: input.credits,
      status: input.status,
      remark: input.remark?.trim() || null,
      expiresAt: input.expiresAt,
    })
    return updated
  }

  async deleteCode(id: string) {
    const deleted = await this.redeemCodeRepository.delete(id)
    if (!deleted) {
      throw new AppError(404, '卡密不存在')
    }
  }

  async redeem(input: { userId: string; code: string }) {
    const user = await this.userRepository.findById(input.userId)
    if (!user || user.status !== 'active') {
      throw new AppError(404, '用户不存在或已被禁用')
    }

    const codeText = input.code.trim()
    const code = await this.redeemCodeRepository.findByCode(codeText)
    if (!code) {
      throw new AppError(404, '卡密不存在')
    }
    if (code.status !== 'active') {
      throw new AppError(400, code.status === 'used' ? '卡密已被兑换' : '卡密已禁用')
    }
    if (code.expiresAt && new Date(code.expiresAt).getTime() <= Date.now()) {
      throw new AppError(400, '卡密已过期')
    }

    const now = new Date().toISOString()
    const used = await this.redeemCodeRepository.markUsed(codeText, user.id)
    if (!used.changed || !used.code) {
      throw new AppError(409, '卡密已被兑换或不可用')
    }

    const updatedUser = await this.userRepository.addCredits(user.id, used.code.credits)
    if (!updatedUser) {
      throw new AppError(404, '用户不存在')
    }
    const { passwordHash: _passwordHash, ...publicUser } = updatedUser

    const log = await this.creditLogRepository.create({
      id: randomUUID(),
      userId: user.id,
      type: 'recharge',
      amount: used.code.credits,
      balanceAfter: updatedUser.credits,
      remark: `卡密兑换：${used.code.code}`,
      createdAt: now,
    })

    userEvents.emitUpdated(publicUser)
    return {
      code: used.code,
      user: publicUser,
      log,
    }
  }
}
