import type { RowDataPacket } from 'mysql2'
import { db } from '../../config/db.js'
import { toMysqlDateTime } from '../../shared/mysqlDate.js'
import type { User, UserRole, UserStatus } from './userTypes.js'

type UserRow = RowDataPacket & {
  id: string
  email: string
  password_hash: string
  credits: string | number
  role: 'admin' | 'user'
  status: UserStatus
  email_verified_at: Date | null
  created_at: Date
  updated_at: Date
}

function toUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    credits: Number(row.credits),
    role: row.role,
    status: row.status,
    emailVerifiedAt: row.email_verified_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }
}

function legacyIdFromCompatUuid(id: string) {
  const match = id.match(/^00000000-0000-4000-8000-(\d{12})$/)
  if (!match) return null
  return `legacy-${Number(match[1])}`
}

export class UserRepository {
  async findAll() {
    const [rows] = await db.query<UserRow[]>('SELECT * FROM users ORDER BY created_at DESC')
    return rows.map(toUser)
  }

  async findById(id: string) {
    const legacyId = legacyIdFromCompatUuid(id)
    const [rows] = await db.query<UserRow[]>(
      legacyId
        ? 'SELECT * FROM users WHERE id IN (:id, :legacyId) ORDER BY id = :id DESC LIMIT 1'
        : 'SELECT * FROM users WHERE id = :id LIMIT 1',
      { id, legacyId },
    )
    return rows[0] ? toUser(rows[0]) : null
  }

  async findByEmail(email: string) {
    const [rows] = await db.query<UserRow[]>(
      'SELECT * FROM users WHERE email = :email LIMIT 1',
      { email },
    )
    return rows[0] ? toUser(rows[0]) : null
  }

  async create(user: User) {
    await db.query(
      `INSERT INTO users
        (id, email, password_hash, credits, role, status, email_verified_at)
       VALUES
        (:id, :email, :passwordHash, :credits, :role, :status, :emailVerifiedAt)`,
      {
        ...user,
        emailVerifiedAt: toMysqlDateTime(user.emailVerifiedAt),
      },
    )
    return this.findById(user.id)
  }

  async updateStatus(id: string, status: UserStatus) {
    await db.query('UPDATE users SET status = :status WHERE id = :id', { id, status })
    return this.findById(id)
  }

  async update(
    id: string,
    input: Partial<Pick<User, 'email' | 'passwordHash'>> & {
      credits?: number
      role?: UserRole
      status?: UserStatus
      emailVerifiedAt?: string | null
    },
  ) {
    const fields: string[] = []
    const values: unknown[] = []

    const fieldMap = {
      email: 'email',
      passwordHash: 'password_hash',
      credits: 'credits',
      role: 'role',
      status: 'status',
      emailVerifiedAt: 'email_verified_at',
    } as const

    Object.entries(fieldMap).forEach(([key, column]) => {
      const value = input[key as keyof typeof input]
      if (value !== undefined) {
        fields.push(`${column} = ?`)
        values.push(key === 'emailVerifiedAt' ? toMysqlDateTime(value as string | null) : value)
      }
    })

    if (fields.length > 0) {
      await db.query(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, [...values, id])
    }

    return this.findById(id)
  }

  async markEmailVerified(id: string) {
    await db.query('UPDATE users SET email_verified_at = CURRENT_TIMESTAMP WHERE id = :id', { id })
    return this.findById(id)
  }

  async deductCredits(id: string, cost: number) {
    await db.query('UPDATE users SET credits = credits - :cost WHERE id = :id', { id, cost })
    return this.findById(id)
  }

  async addCredits(id: string, amount: number) {
    await db.query('UPDATE users SET credits = credits + :amount WHERE id = :id', { id, amount })
    return this.findById(id)
  }

  async delete(id: string) {
    const [result] = await db.query('DELETE FROM users WHERE id = :id', { id })
    return 'affectedRows' in result && result.affectedRows > 0
  }
}
