import type { RowDataPacket } from 'mysql2'
import { db } from '../../config/db.js'
import type { CreditLog, CreditLogType } from './creditLogTypes.js'

type CreditLogRow = RowDataPacket & {
  id: string
  user_id: string
  user_email?: string
  type: CreditLogType
  amount: string | number
  balance_after: string | number
  remark?: string | null
  created_at: Date
}

function toCreditLog(row: CreditLogRow): CreditLog {
  return {
    id: row.id,
    userId: row.user_id,
    userEmail: row.user_email,
    type: row.type,
    amount: Number(row.amount),
    balanceAfter: Number(row.balance_after),
    remark: row.remark,
    createdAt: row.created_at.toISOString(),
  }
}

export class CreditLogRepository {
  async create(log: CreditLog) {
    await db.query(
      `INSERT INTO credit_logs (id, user_id, type, amount, balance_after, remark)
       VALUES (:id, :userId, :type, :amount, :balanceAfter, :remark)`,
      log,
    )
    return this.findById(log.id)
  }

  async findById(id: string) {
    const [rows] = await db.query<CreditLogRow[]>(
      `SELECT credit_logs.*, users.email AS user_email
       FROM credit_logs
       LEFT JOIN users ON users.id = credit_logs.user_id
       WHERE credit_logs.id = :id
       LIMIT 1`,
      { id },
    )
    return rows[0] ? toCreditLog(rows[0]) : null
  }

  async findByUserId(userId: string, limit = 20) {
    const pageSize = Math.min(100, Math.max(1, limit))
    const [rows] = await db.query<CreditLogRow[]>(
      `SELECT credit_logs.*, users.email AS user_email
       FROM credit_logs
       LEFT JOIN users ON users.id = credit_logs.user_id
       WHERE credit_logs.user_id = :userId
       ORDER BY credit_logs.created_at DESC, credit_logs.id DESC
       LIMIT :pageSize`,
      { userId, pageSize },
    )
    return rows.map(toCreditLog)
  }

  async findPageByUserId(userId: string, input?: { page?: number; pageSize?: number }) {
    const page = Math.max(1, input?.page ?? 1)
    const pageSize = Math.min(100, Math.max(1, input?.pageSize ?? 10))
    const offset = (page - 1) * pageSize
    const [countRows] = await db.query<Array<RowDataPacket & { total: string | number }>>(
      `SELECT COUNT(*) AS total
       FROM credit_logs
       WHERE user_id = :userId`,
      { userId },
    )
    const [rows] = await db.query<CreditLogRow[]>(
      `SELECT credit_logs.*, users.email AS user_email
       FROM credit_logs
       LEFT JOIN users ON users.id = credit_logs.user_id
       WHERE credit_logs.user_id = :userId
       ORDER BY credit_logs.created_at DESC, credit_logs.id DESC
       LIMIT :pageSize OFFSET :offset`,
      { userId, pageSize, offset },
    )
    return {
      items: rows.map(toCreditLog),
      total: Number(countRows[0]?.total ?? 0),
      page,
      pageSize,
    }
  }
}
