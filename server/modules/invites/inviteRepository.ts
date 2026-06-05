import type { ResultSetHeader, RowDataPacket } from 'mysql2'
import { db } from '../../config/db.js'
import type { UserInvite } from './inviteTypes.js'

type InviteRow = RowDataPacket & {
  id: string
  inviter_id: string
  inviter_email?: string | null
  invitee_id: string
  invitee_email?: string | null
  reward_credits: string | number
  invitee_ip?: string | null
  created_at: Date
}

function toInvite(row: InviteRow): UserInvite {
  return {
    id: row.id,
    inviterId: row.inviter_id,
    inviterEmail: row.inviter_email,
    inviteeId: row.invitee_id,
    inviteeEmail: row.invitee_email,
    rewardCredits: Number(row.reward_credits),
    inviteeIp: row.invitee_ip,
    createdAt: row.created_at.toISOString(),
  }
}

export class InviteRepository {
  async findById(id: string) {
    const [rows] = await db.query<InviteRow[]>(
      `SELECT user_invites.*,
        inviter.email AS inviter_email,
        invitee.email AS invitee_email
       FROM user_invites
       LEFT JOIN users inviter ON inviter.id = user_invites.inviter_id
       LEFT JOIN users invitee ON invitee.id = user_invites.invitee_id
       WHERE user_invites.id = :id
       LIMIT 1`,
      { id },
    )
    return rows[0] ? toInvite(rows[0]) : null
  }

  async findAll(input?: { page?: number; pageSize?: number; keyword?: string }) {
    const page = Math.max(1, input?.page ?? 1)
    const pageSize = Math.min(100, Math.max(1, input?.pageSize ?? 20))
    const offset = (page - 1) * pageSize
    const where: string[] = []
    const params: Record<string, string | number> = { pageSize, offset }

    if (input?.keyword?.trim()) {
      where.push('(inviter.email LIKE :keyword OR invitee.email LIKE :keyword OR user_invites.invitee_ip LIKE :keyword)')
      params.keyword = `%${input.keyword.trim()}%`
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

    const [countRows] = await db.query<Array<RowDataPacket & { total: string | number }>>(
      `SELECT COUNT(*) AS total
       FROM user_invites
       LEFT JOIN users inviter ON inviter.id = user_invites.inviter_id
       LEFT JOIN users invitee ON invitee.id = user_invites.invitee_id
       ${whereSql}`,
      params,
    )
    const [rows] = await db.query<InviteRow[]>(
      `SELECT user_invites.*,
        inviter.email AS inviter_email,
        invitee.email AS invitee_email
       FROM user_invites
       LEFT JOIN users inviter ON inviter.id = user_invites.inviter_id
       LEFT JOIN users invitee ON invitee.id = user_invites.invitee_id
       ${whereSql}
       ORDER BY user_invites.created_at DESC, user_invites.id DESC
       LIMIT :pageSize OFFSET :offset`,
      params,
    )

    return {
      items: rows.map(toInvite),
      total: Number(countRows[0]?.total ?? 0),
      page,
      pageSize,
    }
  }

  async findByInviter(inviterId: string, limit = 10) {
    const [rows] = await db.query<InviteRow[]>(
      `SELECT user_invites.*,
        inviter.email AS inviter_email,
        invitee.email AS invitee_email
       FROM user_invites
       LEFT JOIN users inviter ON inviter.id = user_invites.inviter_id
       LEFT JOIN users invitee ON invitee.id = user_invites.invitee_id
       WHERE user_invites.inviter_id = :inviterId
       ORDER BY user_invites.created_at DESC, user_invites.id DESC
       LIMIT :limit`,
      { inviterId, limit },
    )
    return rows.map(toInvite)
  }

  async getSummaryByInviter(inviterId: string) {
    const [rows] = await db.query<Array<RowDataPacket & { total: string | number; total_reward_credits: string | number | null }>>(
      `SELECT COUNT(*) AS total, COALESCE(SUM(reward_credits), 0) AS total_reward_credits
       FROM user_invites
       WHERE inviter_id = :inviterId`,
      { inviterId },
    )
    return {
      total: Number(rows[0]?.total ?? 0),
      totalRewardCredits: Number(rows[0]?.total_reward_credits ?? 0),
    }
  }

  async findByInvitee(inviteeId: string) {
    const [rows] = await db.query<InviteRow[]>(
      `SELECT user_invites.*,
        inviter.email AS inviter_email,
        invitee.email AS invitee_email
       FROM user_invites
       LEFT JOIN users inviter ON inviter.id = user_invites.inviter_id
       LEFT JOIN users invitee ON invitee.id = user_invites.invitee_id
       WHERE user_invites.invitee_id = :inviteeId
       LIMIT 1`,
      { inviteeId },
    )
    return rows[0] ? toInvite(rows[0]) : null
  }

  async countByIpSince(inviteeIp: string, since: string) {
    const [rows] = await db.query<Array<RowDataPacket & { total: string | number }>>(
      `SELECT COUNT(*) AS total
       FROM user_invites
       WHERE invitee_ip = :inviteeIp
         AND created_at >= :since`,
      { inviteeIp, since },
    )
    return Number(rows[0]?.total ?? 0)
  }

  async countByInviterSince(inviterId: string, since: string) {
    const [rows] = await db.query<Array<RowDataPacket & { total: string | number }>>(
      `SELECT COUNT(*) AS total
       FROM user_invites
       WHERE inviter_id = :inviterId
         AND created_at >= :since`,
      { inviterId, since },
    )
    return Number(rows[0]?.total ?? 0)
  }

  async create(invite: UserInvite) {
    const [result] = await db.query<ResultSetHeader>(
      `INSERT IGNORE INTO user_invites (id, inviter_id, invitee_id, reward_credits, invitee_ip)
       VALUES (:id, :inviterId, :inviteeId, :rewardCredits, :inviteeIp)`,
      invite,
    )
    return result.affectedRows > 0
  }

  async delete(id: string) {
    const [result] = await db.query<ResultSetHeader>(
      'DELETE FROM user_invites WHERE id = :id',
      { id },
    )
    return result.affectedRows > 0
  }
}
