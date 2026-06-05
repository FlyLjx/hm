import type { RowDataPacket } from 'mysql2'
import { db } from '../../config/db.js'
import type { RechargeProduct, RechargeProductStatus } from './shopTypes.js'

type RechargeProductRow = RowDataPacket & {
  id: string
  name: string
  amount: string | number
  credits: string | number
  badge?: string | null
  sort_order: string | number
  status: RechargeProductStatus
  created_at: Date
  updated_at: Date
}

function toRechargeProduct(row: RechargeProductRow): RechargeProduct {
  return {
    id: row.id,
    name: row.name,
    amount: Number(row.amount),
    credits: Number(row.credits),
    badge: row.badge,
    sortOrder: Number(row.sort_order),
    status: row.status,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }
}

export class ShopRepository {
  async findAll() {
    const [rows] = await db.query<RechargeProductRow[]>(
      `SELECT * FROM recharge_products
       ORDER BY sort_order ASC, amount ASC, created_at DESC`,
    )
    return rows.map(toRechargeProduct)
  }

  async findActive() {
    const [rows] = await db.query<RechargeProductRow[]>(
      `SELECT * FROM recharge_products
       WHERE status = 'active'
       ORDER BY sort_order ASC, amount ASC, created_at DESC`,
    )
    return rows.map(toRechargeProduct)
  }

  async findById(id: string) {
    const [rows] = await db.query<RechargeProductRow[]>(
      'SELECT * FROM recharge_products WHERE id = :id LIMIT 1',
      { id },
    )
    return rows[0] ? toRechargeProduct(rows[0]) : null
  }

  async create(product: RechargeProduct) {
    await db.query(
      `INSERT INTO recharge_products
        (id, name, amount, credits, badge, sort_order, status)
       VALUES
        (:id, :name, :amount, :credits, :badge, :sortOrder, :status)`,
      product,
    )
    return this.findById(product.id)
  }

  async update(id: string, input: Partial<RechargeProduct>) {
    const fields: string[] = []
    const values: unknown[] = []
    const fieldMap = {
      name: 'name',
      amount: 'amount',
      credits: 'credits',
      badge: 'badge',
      sortOrder: 'sort_order',
      status: 'status',
    } as const

    Object.entries(fieldMap).forEach(([key, column]) => {
      const value = input[key as keyof RechargeProduct]
      if (value !== undefined) {
        fields.push(`${column} = ?`)
        values.push(value)
      }
    })

    if (fields.length > 0) {
      await db.query(`UPDATE recharge_products SET ${fields.join(', ')} WHERE id = ?`, [...values, id])
    }
    return this.findById(id)
  }

  async delete(id: string) {
    const [result] = await db.query('DELETE FROM recharge_products WHERE id = :id', { id })
    return 'affectedRows' in result && result.affectedRows > 0
  }
}
