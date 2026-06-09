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

  async findAll(input?: {
    page?: number
    pageSize?: number
    type?: 'all' | CreditLogType
    keyword?: string
    days?: number
  }) {
    const page = Math.max(1, input?.page ?? 1)
    const pageSize = Math.min(100, Math.max(1, input?.pageSize ?? 20))
    const offset = (page - 1) * pageSize
    const conditions: string[] = []
    const params: {
      pageSize: number
      offset: number
      type?: CreditLogType
      days?: number
      keyword?: string
    } = { pageSize, offset }

    if (input?.type && input.type !== 'all') {
      conditions.push('credit_logs.type = :type')
      params.type = input.type
    }
    if (input?.days) {
      conditions.push('credit_logs.created_at >= DATE_SUB(NOW(), INTERVAL :days DAY)')
      params.days = input.days
    }
    const keyword = input?.keyword?.trim()
    if (keyword) {
      conditions.push(`(
        credit_logs.user_id LIKE :keyword
        OR users.email LIKE :keyword
        OR credit_logs.remark LIKE :keyword
        OR credit_logs.id LIKE :keyword
      )`)
      params.keyword = `%${keyword}%`
    }

    const whereSql = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const [countRows] = await db.query<Array<RowDataPacket & { total: string | number }>>(
      `SELECT COUNT(*) AS total
       FROM credit_logs
       LEFT JOIN users ON users.id = credit_logs.user_id
       ${whereSql}`,
      params,
    )
    const [rows] = await db.query<CreditLogRow[]>(
      `SELECT credit_logs.*, users.email AS user_email
       FROM credit_logs
       LEFT JOIN users ON users.id = credit_logs.user_id
       ${whereSql}
       ORDER BY credit_logs.created_at DESC, credit_logs.id DESC
       LIMIT :pageSize OFFSET :offset`,
      params,
    )

    return {
      items: rows.map(toCreditLog),
      total: Number(countRows[0]?.total ?? 0),
      page,
      pageSize,
    }
  }

  async getStats(input?: { days?: number }) {
    const params: { days?: number } = {}
    const whereSql = input?.days ? 'WHERE created_at >= DATE_SUB(NOW(), INTERVAL :days DAY)' : ''
    if (input?.days) params.days = input.days
    const [rows] = await db.query<Array<RowDataPacket & {
      total: string | number
      recharge_total: string | number | null
      deduct_total: string | number | null
      recharge_count: string | number
      deduct_count: string | number
    }>>(
      `SELECT
        COUNT(*) AS total,
        COALESCE(SUM(CASE WHEN type = 'recharge' THEN amount ELSE 0 END), 0) AS recharge_total,
        COALESCE(SUM(CASE WHEN type = 'deduct' THEN amount ELSE 0 END), 0) AS deduct_total,
        SUM(type = 'recharge') AS recharge_count,
        SUM(type = 'deduct') AS deduct_count
       FROM credit_logs
       ${whereSql}`,
      params,
    )
    const row = rows[0]
    return {
      total: Number(row?.total ?? 0),
      rechargeTotal: Number(row?.recharge_total ?? 0),
      deductTotal: Number(row?.deduct_total ?? 0),
      rechargeCount: Number(row?.recharge_count ?? 0),
      deductCount: Number(row?.deduct_count ?? 0),
    }
  }

  async delete(id: string) {
    const [result] = await db.query(
      'DELETE FROM credit_logs WHERE id = :id',
      { id },
    )
    return Number((result as { affectedRows?: number }).affectedRows ?? 0) > 0
  }
}
