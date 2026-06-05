import type { ResultSetHeader, RowDataPacket } from 'mysql2'
import { db } from '../../config/db.js'
import type { UserCheckin } from './checkinTypes.js'

type CheckinRow = RowDataPacket & {
  id: string
  user_id: string
  user_email?: string | null
  reward_credits: string | number
  checkin_date: Date | string
  user_ip?: string | null
  created_at: Date
}

function formatDateOnly(value: Date | string) {
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return String(value).slice(0, 10)
}

function toCheckin(row: CheckinRow): UserCheckin {
  return {
    id: row.id,
    userId: row.user_id,
    userEmail: row.user_email,
    rewardCredits: Number(row.reward_credits),
    checkinDate: formatDateOnly(row.checkin_date),
    userIp: row.user_ip,
    createdAt: row.created_at.toISOString(),
  }
}

export class CheckinRepository {
  async findById(id: string) {
    const [rows] = await db.query<CheckinRow[]>(
      `SELECT user_checkins.*, users.email AS user_email
       FROM user_checkins
       LEFT JOIN users ON users.id = user_checkins.user_id
       WHERE user_checkins.id = :id
       LIMIT 1`,
      { id },
    )
    return rows[0] ? toCheckin(rows[0]) : null
  }

  async findAll(input?: { page?: number; pageSize?: number; keyword?: string }) {
    const page = Math.max(1, input?.page ?? 1)
    const pageSize = Math.min(100, Math.max(1, input?.pageSize ?? 20))
    const offset = (page - 1) * pageSize
    const where: string[] = []
    const params: Record<string, string | number> = { pageSize, offset }

    if (input?.keyword?.trim()) {
      where.push('(users.email LIKE :keyword OR user_checkins.user_ip LIKE :keyword)')
      params.keyword = `%${input.keyword.trim()}%`
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

    const [countRows] = await db.query<Array<RowDataPacket & { total: string | number }>>(
      `SELECT COUNT(*) AS total
       FROM user_checkins
       LEFT JOIN users ON users.id = user_checkins.user_id
       ${whereSql}`,
      params,
    )
    const [rows] = await db.query<CheckinRow[]>(
      `SELECT user_checkins.*, users.email AS user_email
       FROM user_checkins
       LEFT JOIN users ON users.id = user_checkins.user_id
       ${whereSql}
       ORDER BY user_checkins.created_at DESC, user_checkins.id DESC
       LIMIT :pageSize OFFSET :offset`,
      params,
    )

    return {
      items: rows.map(toCheckin),
      total: Number(countRows[0]?.total ?? 0),
      page,
      pageSize,
    }
  }

  async findTodayByUser(userId: string, checkinDate: string) {
    const [rows] = await db.query<CheckinRow[]>(
      `SELECT user_checkins.*, users.email AS user_email
       FROM user_checkins
       LEFT JOIN users ON users.id = user_checkins.user_id
       WHERE user_checkins.user_id = :userId
         AND user_checkins.checkin_date = :checkinDate
       LIMIT 1`,
      { userId, checkinDate },
    )
    return rows[0] ? toCheckin(rows[0]) : null
  }

  async create(checkin: UserCheckin) {
    const [result] = await db.query<ResultSetHeader>(
      `INSERT INTO user_checkins (id, user_id, reward_credits, checkin_date, user_ip)
       VALUES (:id, :userId, :rewardCredits, :checkinDate, :userIp)`,
      checkin,
    )
    return result.affectedRows > 0
  }

  async delete(id: string) {
    const [result] = await db.query<ResultSetHeader>(
      'DELETE FROM user_checkins WHERE id = :id',
      { id },
    )
    return result.affectedRows > 0
  }
}
