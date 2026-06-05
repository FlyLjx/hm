import type { ResultSetHeader, RowDataPacket } from 'mysql2'
import { db } from '../../config/db.js'
import { toMysqlDateTime } from '../../shared/mysqlDate.js'
import type { RedeemCode, RedeemCodeStatus } from './redeemCodeTypes.js'

type RedeemCodeRow = RowDataPacket & {
  id: string
  code: string
  credits: string | number
  status: RedeemCodeStatus
  remark?: string | null
  user_id?: string | null
  user_email?: string | null
  used_at?: Date | null
  expires_at?: Date | null
  created_at: Date
  updated_at: Date
}

function toRedeemCode(row: RedeemCodeRow): RedeemCode {
  return {
    id: row.id,
    code: row.code,
    credits: Number(row.credits),
    status: row.status,
    remark: row.remark,
    userId: row.user_id,
    userEmail: row.user_email,
    usedAt: row.used_at?.toISOString() ?? null,
    expiresAt: row.expires_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }
}

export class RedeemCodeRepository {
  async findAll(input?: { page?: number; pageSize?: number; status?: RedeemCodeStatus | 'all'; keyword?: string }) {
    const page = Math.max(1, input?.page ?? 1)
    const pageSize = Math.min(100, Math.max(1, input?.pageSize ?? 20))
    const offset = (page - 1) * pageSize
    const where: string[] = []
    const params: Record<string, string | number> = { pageSize, offset }

    if (input?.status && input.status !== 'all') {
      where.push('redeem_codes.status = :status')
      params.status = input.status
    }
    if (input?.keyword?.trim()) {
      where.push('(redeem_codes.code LIKE :keyword OR redeem_codes.remark LIKE :keyword OR users.email LIKE :keyword)')
      params.keyword = `%${input.keyword.trim()}%`
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const [countRows] = await db.query<Array<RowDataPacket & { total: string | number }>>(
      `SELECT COUNT(*) AS total
       FROM redeem_codes
       LEFT JOIN users ON users.id = redeem_codes.user_id
       ${whereSql}`,
      params,
    )
    const [rows] = await db.query<RedeemCodeRow[]>(
      `SELECT redeem_codes.*, users.email AS user_email
       FROM redeem_codes
       LEFT JOIN users ON users.id = redeem_codes.user_id
       ${whereSql}
       ORDER BY redeem_codes.created_at DESC, redeem_codes.id DESC
       LIMIT :pageSize OFFSET :offset`,
      params,
    )

    return {
      items: rows.map(toRedeemCode),
      total: Number(countRows[0]?.total ?? 0),
      page,
      pageSize,
    }
  }

  async findById(id: string) {
    const [rows] = await db.query<RedeemCodeRow[]>(
      `SELECT redeem_codes.*, users.email AS user_email
       FROM redeem_codes
       LEFT JOIN users ON users.id = redeem_codes.user_id
       WHERE redeem_codes.id = :id
       LIMIT 1`,
      { id },
    )
    return rows[0] ? toRedeemCode(rows[0]) : null
  }

  async findByCode(code: string) {
    const [rows] = await db.query<RedeemCodeRow[]>(
      `SELECT redeem_codes.*, users.email AS user_email
       FROM redeem_codes
       LEFT JOIN users ON users.id = redeem_codes.user_id
       WHERE redeem_codes.code = :code
       LIMIT 1`,
      { code },
    )
    return rows[0] ? toRedeemCode(rows[0]) : null
  }

  async create(code: RedeemCode) {
    await db.query(
      `INSERT INTO redeem_codes (id, code, credits, status, remark, user_id, used_at, expires_at)
       VALUES (:id, :code, :credits, :status, :remark, :userId, :usedAt, :expiresAt)`,
      {
        ...code,
        usedAt: toMysqlDateTime(code.usedAt),
        expiresAt: toMysqlDateTime(code.expiresAt),
      },
    )
    return this.findById(code.id)
  }

  async update(id: string, input: Partial<Pick<RedeemCode, 'credits' | 'status' | 'remark' | 'expiresAt'>>) {
    const fields: string[] = []
    const values: unknown[] = []
    const fieldMap = {
      credits: 'credits',
      status: 'status',
      remark: 'remark',
      expiresAt: 'expires_at',
    } as const

    Object.entries(fieldMap).forEach(([key, column]) => {
      const value = input[key as keyof typeof input]
      if (value !== undefined) {
        fields.push(`${column} = ?`)
        values.push(key === 'expiresAt' ? toMysqlDateTime(value as string | null) : value)
      }
    })

    if (fields.length > 0) {
      await db.query(`UPDATE redeem_codes SET ${fields.join(', ')} WHERE id = ?`, [...values, id])
    }
    return this.findById(id)
  }

  async markUsed(code: string, userId: string) {
    const [result] = await db.query<ResultSetHeader>(
      `UPDATE redeem_codes
       SET status = 'used', user_id = :userId, used_at = CURRENT_TIMESTAMP
       WHERE code = :code
         AND status = 'active'
         AND (expires_at IS NULL OR expires_at > NOW())`,
      { code, userId },
    )
    return {
      changed: result.affectedRows > 0,
      code: await this.findByCode(code),
    }
  }

  async delete(id: string) {
    const [result] = await db.query<ResultSetHeader>('DELETE FROM redeem_codes WHERE id = :id', { id })
    return result.affectedRows > 0
  }
}
