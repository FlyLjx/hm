import { randomUUID } from 'node:crypto'
import { AppError } from '../../shared/AppError.js'
import { UserRepository } from '../users/userRepository.js'
import { AnnouncementRepository } from './announcementRepository.js'
import type { Announcement } from './announcementTypes.js'

type AnnouncementInput = Pick<
  Announcement,
  'title' | 'content' | 'displayMode' | 'targetType' | 'status' | 'sortOrder' | 'userIds'
>

function normalizeUserIds(userIds: string[]) {
  return Array.from(new Set(userIds))
}

export class AnnouncementService {
  constructor(
    private readonly announcementRepository = new AnnouncementRepository(),
    private readonly userRepository = new UserRepository(),
  ) {}

  async listAnnouncements() {
    return this.announcementRepository.findAll()
  }

  async listVisibleAnnouncements(userId?: string) {
    return this.announcementRepository.findVisible(userId)
  }

  async createAnnouncement(input: AnnouncementInput) {
    const userIds = await this.normalizeTargets(input.targetType, input.userIds)
    const now = new Date().toISOString()
    const announcement = await this.announcementRepository.create({
      id: randomUUID(),
      title: input.title,
      content: input.content,
      displayMode: input.displayMode,
      targetType: input.targetType,
      status: input.status,
      sortOrder: input.sortOrder,
      userIds,
      createdAt: now,
      updatedAt: now,
    })
    if (!announcement) {
      throw new AppError(500, '创建公告失败')
    }
    return announcement
  }

  async updateAnnouncement(id: string, input: Partial<AnnouncementInput>) {
    const current = await this.announcementRepository.findById(id)
    if (!current) {
      throw new AppError(404, '公告不存在')
    }

    const targetType = input.targetType ?? current.targetType
    const userIds = input.userIds !== undefined || input.targetType !== undefined
      ? await this.normalizeTargets(targetType, input.userIds ?? current.userIds)
      : undefined
    const announcement = await this.announcementRepository.update(id, {
      ...input,
      targetType,
      userIds,
    })
    if (!announcement) {
      throw new AppError(404, '公告不存在')
    }
    await this.announcementRepository.clearReceipts(id)
    return this.announcementRepository.findById(id)
  }

  async deleteAnnouncement(id: string) {
    const deleted = await this.announcementRepository.delete(id)
    if (!deleted) {
      throw new AppError(404, '公告不存在')
    }
  }

  async signAnnouncement(input: { announcementId: string; userId: string }) {
    const [announcement, user] = await Promise.all([
      this.announcementRepository.findById(input.announcementId),
      this.userRepository.findById(input.userId),
    ])
    if (!announcement || announcement.status !== 'active') {
      throw new AppError(404, '公告不存在')
    }
    if (!user) {
      throw new AppError(404, '用户不存在')
    }
    if (announcement.targetType === 'specific' && !announcement.userIds.includes(input.userId)) {
      throw new AppError(403, '无权签收该公告')
    }

    await this.announcementRepository.signReceipt(input)
    return { signed: true }
  }

  private async normalizeTargets(targetType: AnnouncementInput['targetType'], userIds: string[]) {
    if (targetType === 'all') {
      return []
    }
    const uniqueUserIds = normalizeUserIds(userIds)
    if (uniqueUserIds.length === 0) {
      throw new AppError(400, '请选择公告展示用户')
    }
    await Promise.all(
      uniqueUserIds.map(async (userId) => {
        const user = await this.userRepository.findById(userId)
        if (!user) {
          throw new AppError(404, '选择的用户不存在')
        }
      }),
    )
    return uniqueUserIds
  }
}
