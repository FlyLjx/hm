import type { RowDataPacket } from 'mysql2'
import { db } from '../../config/db.js'
import type { EmailToken, EmailTokenType } from './emailTokenTypes.js'

type EmailTokenRow = RowDataPacket & {
  id: string
  email: string
  user_id: string | null
  type: EmailTokenType
  token_hash: string
  expires_at: Date
  used_at: Date | null
  created_at: Date
}

function toEmailToken(row: EmailTokenRow): EmailToken {
  return {
    id: row.id,
    email: row.email,
    userId: row.user_id,
    type: row.type,
    tokenHash: row.token_hash,
    expiresAt: row.expires_at.toISOString(),
    usedAt: row.used_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
  }
}

export class EmailTokenRepository {
  async create(token: EmailToken) {
    await db.query(
      `INSERT INTO email_tokens
        (id, email, user_id, type, token_hash, expires_at, used_at, created_at)
       VALUES
        (
          :id,
          :email,
          :userId,
          :type,
          :tokenHash,
          DATE_ADD(CURRENT_TIMESTAMP, INTERVAL :expiresInMinutes MINUTE),
          :usedAt,
          CURRENT_TIMESTAMP
        )`,
      {
        ...token,
        expiresInMinutes: token.expiresInMinutes ?? 30,
      },
    )
    return this.findById(token.id)
  }

  async findActiveByHash(tokenHash: string, type: EmailTokenType) {
    const [rows] = await db.query<EmailTokenRow[]>(
      `SELECT *
       FROM email_tokens
       WHERE token_hash = :tokenHash
         AND type = :type
         AND used_at IS NULL
         AND expires_at > CURRENT_TIMESTAMP
       LIMIT 1`,
      { tokenHash, type },
    )
    return rows[0] ? toEmailToken(rows[0]) : null
  }

  async markUsed(id: string) {
    await db.query('UPDATE email_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = :id', { id })
  }

  async invalidateOpenTokens(email: string, type: EmailTokenType) {
    await db.query(
      `UPDATE email_tokens
       SET used_at = CURRENT_TIMESTAMP
       WHERE email = :email
         AND type = :type
         AND used_at IS NULL`,
      { email, type },
    )
  }

  private async findById(id: string) {
    const [rows] = await db.query<EmailTokenRow[]>('SELECT * FROM email_tokens WHERE id = :id', {
      id,
    })
    return rows[0] ? toEmailToken(rows[0]) : null
  }
}
