import type { RowDataPacket } from 'mysql2'
import { db } from '../../config/db.js'
import type { ApiKeyStatus, PublicUserApiKey, UserApiKey } from './apiKeyTypes.js'

type UserApiKeyRow = RowDataPacket & {
  id: string
  user_id: string
  user_email?: string | null
  name: string
  key_prefix: string
  key_hash: string
  key_plain?: string | null
  status: ApiKeyStatus
  last_used_at?: Date | null
  deleted_at?: Date | null
  created_at: Date
  updated_at: Date
}

type AdminApiKeyRow = UserApiKeyRow & {
  total_calls?: string | number
  success_calls?: string | number
  failed_calls?: string | number
  avg_duration_ms?: string | number | null
}

type ApiKeyStatsRow = RowDataPacket & {
  total_keys: string | number
  active_keys: string | number
  disabled_keys: string | number
  total_calls: string | number
  success_calls: string | number
  failed_calls: string | number
  avg_duration_ms: string | number | null
}

function toApiKey(row: UserApiKeyRow): UserApiKey {
  return {
    id: row.id,
    userId: row.user_id,
    userEmail: row.user_email ?? null,
    name: row.name,
    keyPrefix: row.key_prefix,
    keyHash: row.key_hash,
    keyPlain: row.key_plain ?? null,
    status: row.status,
    lastUsedAt: row.last_used_at?.toISOString() ?? null,
    deletedAt: row.deleted_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }
}

export function toPublicApiKey(key: UserApiKey): PublicUserApiKey {
  const { keyHash: _keyHash, ...publicKey } = key
  return publicKey
}

export class ApiKeyRepository {
  async findAllForAdmin(input?: { page?: number; pageSize?: number; status?: 'all' | ApiKeyStatus; keyword?: string }) {
    const page = Math.max(1, input?.page ?? 1)
    const pageSize = Math.min(100, Math.max(1, input?.pageSize ?? 30))
    const offset = (page - 1) * pageSize
    const where: string[] = []
    const params: Record<string, string | number> = { pageSize, offset }

    if (input?.status && input.status !== 'all') {
      where.push('user_api_keys.status = :status')
      params.status = input.status
    }
    if (input?.keyword?.trim()) {
      where.push('(user_api_keys.name LIKE :keyword OR user_api_keys.key_prefix LIKE :keyword OR user_api_keys.key_plain LIKE :keyword OR users.email LIKE :keyword)')
      params.keyword = `%${input.keyword.trim()}%`
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const [countRows] = await db.query<Array<RowDataPacket & { total: string | number }>>(
      `SELECT COUNT(*) AS total
       FROM user_api_keys
       LEFT JOIN users ON users.id = user_api_keys.user_id
       ${whereSql}`,
      params,
    )
    const [rows] = await db.query<AdminApiKeyRow[]>(
      `SELECT
         user_api_keys.*,
         users.email AS user_email,
         COALESCE(log_summary.total_calls, 0) AS total_calls,
         COALESCE(log_summary.success_calls, 0) AS success_calls,
         COALESCE(log_summary.failed_calls, 0) AS failed_calls,
         log_summary.avg_duration_ms
       FROM user_api_keys
       LEFT JOIN users ON users.id = user_api_keys.user_id
       LEFT JOIN (
         SELECT
          api_key_id,
          COUNT(*) AS total_calls,
          SUM(status = 'success') AS success_calls,
          SUM(status = 'failed') AS failed_calls,
          AVG(duration_ms) AS avg_duration_ms
         FROM api_call_logs
         WHERE api_key_id IS NOT NULL
         GROUP BY api_key_id
       ) log_summary ON log_summary.api_key_id = user_api_keys.id
       ${whereSql}
       ORDER BY user_api_keys.created_at DESC, user_api_keys.id DESC
       LIMIT :pageSize OFFSET :offset`,
      params,
    )

    return {
      items: rows.map((row) => ({
        ...toApiKey(row),
        totalCalls: Number(row.total_calls ?? 0),
        successCalls: Number(row.success_calls ?? 0),
        failedCalls: Number(row.failed_calls ?? 0),
        avgDurationMs: Number(row.avg_duration_ms ?? 0),
      })),
      total: Number(countRows[0]?.total ?? 0),
      page,
      pageSize,
    }
  }

  async getAdminStats() {
    const [rows] = await db.query<ApiKeyStatsRow[]>(
      `SELECT
        key_summary.total_keys,
        key_summary.active_keys,
        key_summary.disabled_keys,
        COALESCE(log_summary.total_calls, 0) AS total_calls,
        COALESCE(log_summary.success_calls, 0) AS success_calls,
        COALESCE(log_summary.failed_calls, 0) AS failed_calls,
        log_summary.avg_duration_ms
       FROM (
         SELECT
          COUNT(*) AS total_keys,
          SUM(status = 'active' AND deleted_at IS NULL) AS active_keys,
          SUM(status = 'disabled' AND deleted_at IS NULL) AS disabled_keys
         FROM user_api_keys
       ) key_summary
       CROSS JOIN (
         SELECT
          COUNT(*) AS total_calls,
          SUM(status = 'success') AS success_calls,
          SUM(status = 'failed') AS failed_calls,
          AVG(duration_ms) AS avg_duration_ms
         FROM api_call_logs
         WHERE api_key_id IS NOT NULL
           AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
       ) log_summary`,
    )
    const row = rows[0]
    const totalCalls = Number(row?.total_calls ?? 0)
    const successCalls = Number(row?.success_calls ?? 0)
    return {
      totalKeys: Number(row?.total_keys ?? 0),
      activeKeys: Number(row?.active_keys ?? 0),
      disabledKeys: Number(row?.disabled_keys ?? 0),
      totalCalls,
      successCalls,
      failedCalls: Number(row?.failed_calls ?? 0),
      successRate: totalCalls > 0 ? Number(((successCalls / totalCalls) * 100).toFixed(2)) : 0,
      avgDurationMs: Number(row?.avg_duration_ms ?? 0),
    }
  }

  async findByUserId(userId: string) {
    const [rows] = await db.query<UserApiKeyRow[]>(
      `SELECT user_api_keys.*, users.email AS user_email
       FROM user_api_keys
       LEFT JOIN users ON users.id = user_api_keys.user_id
       WHERE user_api_keys.user_id = :userId
         AND user_api_keys.deleted_at IS NULL
       ORDER BY user_api_keys.created_at DESC, user_api_keys.id DESC`,
      { userId },
    )
    return rows.map(toApiKey)
  }

  async findById(id: string) {
    const [rows] = await db.query<UserApiKeyRow[]>(
      `SELECT user_api_keys.*, users.email AS user_email
       FROM user_api_keys
       LEFT JOIN users ON users.id = user_api_keys.user_id
       WHERE user_api_keys.id = :id
       LIMIT 1`,
      { id },
    )
    return rows[0] ? toApiKey(rows[0]) : null
  }

  async findActiveByPrefix(keyPrefix: string) {
    const [rows] = await db.query<UserApiKeyRow[]>(
      `SELECT user_api_keys.*, users.email AS user_email
       FROM user_api_keys
       LEFT JOIN users ON users.id = user_api_keys.user_id
       WHERE user_api_keys.key_prefix = :keyPrefix
         AND user_api_keys.status = 'active'
         AND user_api_keys.deleted_at IS NULL
       LIMIT 20`,
      { keyPrefix },
    )
    return rows.map(toApiKey)
  }

  async create(input: Pick<UserApiKey, 'id' | 'userId' | 'name' | 'keyPrefix' | 'keyHash' | 'keyPlain' | 'status'>) {
    const connection = await db.getConnection()
    try {
      await connection.beginTransaction()
      if (input.status === 'active') {
        await connection.query(
          `UPDATE user_api_keys
           SET status = 'disabled'
           WHERE user_id = :userId
             AND status = 'active'`,
          { userId: input.userId },
        )
      }
      await connection.query(
        `INSERT INTO user_api_keys (id, user_id, name, key_prefix, key_hash, key_plain, status)
         VALUES (:id, :userId, :name, :keyPrefix, :keyHash, :keyPlain, :status)`,
        input,
      )
      await connection.commit()
    } catch (error) {
      await connection.rollback()
      throw error
    } finally {
      connection.release()
    }
    return this.findById(input.id)
  }

  async updateStatus(id: string, status: ApiKeyStatus, userId?: string) {
    const connection = await db.getConnection()
    try {
      await connection.beginTransaction()
      if (status === 'active') {
        await connection.query(
          `UPDATE user_api_keys
           SET status = 'disabled'
           WHERE user_id = COALESCE(:userId, (SELECT owner.user_id FROM (SELECT user_id FROM user_api_keys WHERE id = :id) owner))
             AND id <> :id
             AND status = 'active'`,
          { id, userId: userId ?? null },
        )
      }
      await connection.query('UPDATE user_api_keys SET status = :status WHERE id = :id AND deleted_at IS NULL', { id, status })
      await connection.commit()
    } catch (error) {
      await connection.rollback()
      throw error
    } finally {
      connection.release()
    }
    return this.findById(id)
  }

  async markUsed(id: string) {
    await db.query('UPDATE user_api_keys SET last_used_at = CURRENT_TIMESTAMP WHERE id = :id', { id })
  }

  async delete(id: string) {
    const [result] = await db.query(
      `UPDATE user_api_keys
       SET status = 'disabled', deleted_at = COALESCE(deleted_at, CURRENT_TIMESTAMP)
       WHERE id = :id`,
      { id },
    )
    return 'affectedRows' in result && result.affectedRows > 0
  }

  async deleteByUserId(id: string, userId: string) {
    const [result] = await db.query(
      `UPDATE user_api_keys
       SET status = 'disabled', deleted_at = COALESCE(deleted_at, CURRENT_TIMESTAMP)
       WHERE id = :id AND user_id = :userId`,
      { id, userId },
    )
    return 'affectedRows' in result && result.affectedRows > 0
  }
}
