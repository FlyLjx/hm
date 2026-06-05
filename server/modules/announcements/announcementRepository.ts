import type { RowDataPacket } from 'mysql2'
import { db } from '../../config/db.js'
import type { Announcement, AnnouncementDisplayMode, AnnouncementStatus, AnnouncementTargetType } from './announcementTypes.js'

type AnnouncementRow = RowDataPacket & {
  id: string
  title: string
  content: string
  display_mode?: AnnouncementDisplayMode | null
  target_type: AnnouncementTargetType
  status: AnnouncementStatus
  sort_order: string | number
  user_ids?: string | null
  target_count?: string | number | null
  read_count?: string | number | null
  created_at: Date
  updated_at: Date
}

function parseUserIds(value?: string | null) {
  if (!value) return []
  return value.split(',').filter(Boolean)
}

function toAnnouncement(row: AnnouncementRow): Announcement {
  const targetCount = row.target_count === undefined ? undefined : Number(row.target_count || 0)
  const readCount = row.read_count === undefined ? undefined : Number(row.read_count || 0)
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    displayMode: row.display_mode || 'popup',
    targetType: row.target_type,
    status: row.status,
    sortOrder: Number(row.sort_order),
    userIds: parseUserIds(row.user_ids),
    targetCount,
    readCount,
    unreadCount: targetCount === undefined || readCount === undefined ? undefined : Math.max(targetCount - readCount, 0),
    readRate: targetCount === undefined || readCount === undefined || targetCount <= 0
      ? undefined
      : Math.min(Math.round((readCount / targetCount) * 10000) / 100, 100),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }
}

export class AnnouncementRepository {
  async findAll() {
    const [rows] = await db.query<AnnouncementRow[]>(
      `SELECT announcements.*,
        GROUP_CONCAT(DISTINCT announcement_users.user_id) AS user_ids,
        CASE
          WHEN announcements.target_type = 'all' THEN all_users.total_count
          ELSE COUNT(DISTINCT announcement_users.user_id)
        END AS target_count,
        COUNT(DISTINCT announcement_receipts.user_id) AS read_count
       FROM announcements
       LEFT JOIN announcement_users ON announcement_users.announcement_id = announcements.id
       LEFT JOIN announcement_receipts ON announcement_receipts.announcement_id = announcements.id
       CROSS JOIN (
        SELECT COUNT(*) AS total_count
        FROM users
        WHERE role = 'user'
          AND email <> ''
       ) all_users
       GROUP BY announcements.id, all_users.total_count
       ORDER BY announcements.sort_order ASC, announcements.created_at DESC`,
    )
    return rows.map(toAnnouncement)
  }

  async findVisible(userId?: string) {
    const [rows] = await db.query<AnnouncementRow[]>(
      `SELECT announcements.*,
        GROUP_CONCAT(announcement_users.user_id) AS user_ids
       FROM announcements
       LEFT JOIN announcement_users ON announcement_users.announcement_id = announcements.id
       WHERE announcements.status = 'active'
         AND (
          announcements.target_type = 'all'
          OR (
            :userId <> ''
            AND EXISTS (
              SELECT 1
              FROM announcement_users target_users
              WHERE target_users.announcement_id = announcements.id
                AND target_users.user_id = :userId
            )
          )
         )
         AND (
          :userId = ''
          OR NOT EXISTS (
            SELECT 1
            FROM announcement_receipts
            WHERE announcement_receipts.announcement_id = announcements.id
              AND announcement_receipts.user_id = :userId
          )
         )
       GROUP BY announcements.id
       ORDER BY announcements.sort_order ASC, announcements.created_at DESC`,
      { userId: userId ?? '' },
    )
    return rows.map(toAnnouncement)
  }

  async findById(id: string) {
    const [rows] = await db.query<AnnouncementRow[]>(
      `SELECT announcements.*,
        GROUP_CONCAT(announcement_users.user_id) AS user_ids
       FROM announcements
       LEFT JOIN announcement_users ON announcement_users.announcement_id = announcements.id
       WHERE announcements.id = :id
       GROUP BY announcements.id
       LIMIT 1`,
      { id },
    )
    return rows[0] ? toAnnouncement(rows[0]) : null
  }

  async create(announcement: Announcement) {
    await db.query(
      `INSERT INTO announcements
        (id, title, content, display_mode, target_type, status, sort_order)
       VALUES
        (:id, :title, :content, :displayMode, :targetType, :status, :sortOrder)`,
      announcement,
    )
    await this.replaceUsers(announcement.id, announcement.userIds)
    return this.findById(announcement.id)
  }

  async update(id: string, input: Partial<Announcement>) {
    const fields: string[] = []
    const values: unknown[] = []
    const fieldMap = {
      title: 'title',
      content: 'content',
      displayMode: 'display_mode',
      targetType: 'target_type',
      status: 'status',
      sortOrder: 'sort_order',
    } as const

    Object.entries(fieldMap).forEach(([key, column]) => {
      const value = input[key as keyof Announcement]
      if (value !== undefined) {
        fields.push(`${column} = ?`)
        values.push(value)
      }
    })

    fields.push('updated_at = CURRENT_TIMESTAMP')

    if (fields.length > 0) {
      await db.query(`UPDATE announcements SET ${fields.join(', ')} WHERE id = ?`, [...values, id])
    }
    if (input.userIds !== undefined) {
      await this.replaceUsers(id, input.userIds)
    }
    return this.findById(id)
  }

  async clearReceipts(id: string) {
    await db.query('DELETE FROM announcement_receipts WHERE announcement_id = :id', { id })
  }

  async delete(id: string) {
    await db.query('DELETE FROM announcement_receipts WHERE announcement_id = :id', { id })
    await db.query('DELETE FROM announcement_users WHERE announcement_id = :id', { id })
    const [result] = await db.query('DELETE FROM announcements WHERE id = :id', { id })
    return 'affectedRows' in result && result.affectedRows > 0
  }

  async signReceipt(input: { announcementId: string; userId: string }) {
    await db.query(
      `INSERT INTO announcement_receipts (announcement_id, user_id)
       VALUES (:announcementId, :userId)
       ON DUPLICATE KEY UPDATE signed_at = CURRENT_TIMESTAMP`,
      input,
    )
  }

  private async replaceUsers(announcementId: string, userIds: string[]) {
    await db.query('DELETE FROM announcement_users WHERE announcement_id = :announcementId', {
      announcementId,
    })
    if (userIds.length === 0) return

    const values = userIds.map((userId) => [announcementId, userId])
    await db.query('INSERT INTO announcement_users (announcement_id, user_id) VALUES ?', [values])
  }
}
