import type { RowDataPacket } from 'mysql2'
import { db } from '../../config/db.js'
import type { Promotion, PromotionStatus } from './promotionTypes.js'

type PromotionRow = RowDataPacket & {
  id: string
  title: string
  content: string
  badge?: string | null
  action_text?: string | null
  action_url?: string | null
  status: PromotionStatus
  sort_order: string | number
  created_at: Date
  updated_at: Date
}

function toPromotion(row: PromotionRow): Promotion {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    badge: row.badge,
    actionText: row.action_text,
    actionUrl: row.action_url,
    status: row.status,
    sortOrder: Number(row.sort_order),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }
}

export class PromotionRepository {
  async findAll() {
    const [rows] = await db.query<PromotionRow[]>(
      `SELECT * FROM promotions
       ORDER BY sort_order ASC, created_at DESC`,
    )
    return rows.map(toPromotion)
  }

  async findActive() {
    const [rows] = await db.query<PromotionRow[]>(
      `SELECT * FROM promotions
       WHERE status = 'active'
       ORDER BY sort_order ASC, created_at DESC`,
    )
    return rows.map(toPromotion)
  }

  async findById(id: string) {
    const [rows] = await db.query<PromotionRow[]>(
      'SELECT * FROM promotions WHERE id = :id LIMIT 1',
      { id },
    )
    return rows[0] ? toPromotion(rows[0]) : null
  }

  async create(promotion: Promotion) {
    await db.query(
      `INSERT INTO promotions
        (id, title, content, badge, action_text, action_url, status, sort_order)
       VALUES
        (:id, :title, :content, :badge, :actionText, :actionUrl, :status, :sortOrder)`,
      promotion,
    )
    return this.findById(promotion.id)
  }

  async update(id: string, input: Partial<Promotion>) {
    const fields: string[] = []
    const values: unknown[] = []
    const fieldMap = {
      title: 'title',
      content: 'content',
      badge: 'badge',
      actionText: 'action_text',
      actionUrl: 'action_url',
      status: 'status',
      sortOrder: 'sort_order',
    } as const

    Object.entries(fieldMap).forEach(([key, column]) => {
      const value = input[key as keyof Promotion]
      if (value !== undefined) {
        fields.push(`${column} = ?`)
        values.push(value)
      }
    })

    if (fields.length > 0) {
      await db.query(`UPDATE promotions SET ${fields.join(', ')} WHERE id = ?`, [...values, id])
    }
    return this.findById(id)
  }

  async delete(id: string) {
    const [result] = await db.query('DELETE FROM promotions WHERE id = :id', { id })
    return 'affectedRows' in result && result.affectedRows > 0
  }
}
