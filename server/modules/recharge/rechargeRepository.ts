import type { ResultSetHeader, RowDataPacket } from 'mysql2'
import { db } from '../../config/db.js'
import { toMysqlDateTime } from '../../shared/mysqlDate.js'
import type { RechargeOrder, RechargeOrderStatus, RechargeOrderType } from './rechargeTypes.js'

type RechargeOrderRow = RowDataPacket & {
  id: string
  user_id: string
  user_email?: string | null
  out_trade_no: string
  trade_no?: string | null
  order_type: RechargeOrderType
  subscription_plan_id?: string | null
  amount: string | number
  credits: string | number
  status: RechargeOrderStatus
  pay_url?: string | null
  qr_code?: string | null
  paid_at?: Date | null
  created_at: Date
  updated_at: Date
}

function toRechargeOrder(row: RechargeOrderRow): RechargeOrder {
  return {
    id: row.id,
    userId: row.user_id,
    userEmail: row.user_email,
    outTradeNo: row.out_trade_no,
    tradeNo: row.trade_no,
    orderType: row.order_type,
    subscriptionPlanId: row.subscription_plan_id,
    amount: Number(row.amount),
    credits: Number(row.credits),
    status: row.status,
    payUrl: row.pay_url,
    qrCode: row.qr_code,
    paidAt: row.paid_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }
}

export class RechargeRepository {
  async create(order: RechargeOrder) {
    await db.query(
      `INSERT INTO recharge_orders
        (id, user_id, out_trade_no, trade_no, order_type, subscription_plan_id, amount, credits, status, pay_url, qr_code, paid_at)
       VALUES
        (:id, :userId, :outTradeNo, :tradeNo, :orderType, :subscriptionPlanId, :amount, :credits, :status, :payUrl, :qrCode, :paidAt)`,
      order,
    )
    return this.findById(order.id)
  }

  async findById(id: string) {
    const [rows] = await db.query<RechargeOrderRow[]>(
      `SELECT recharge_orders.*, users.email AS user_email
       FROM recharge_orders
       LEFT JOIN users ON users.id = recharge_orders.user_id
       WHERE recharge_orders.id = :id
       LIMIT 1`,
      { id },
    )
    return rows[0] ? toRechargeOrder(rows[0]) : null
  }

  async findByOutTradeNo(outTradeNo: string) {
    const [rows] = await db.query<RechargeOrderRow[]>(
      `SELECT recharge_orders.*, users.email AS user_email
       FROM recharge_orders
       LEFT JOIN users ON users.id = recharge_orders.user_id
       WHERE recharge_orders.out_trade_no = :outTradeNo
       LIMIT 1`,
      { outTradeNo },
    )
    return rows[0] ? toRechargeOrder(rows[0]) : null
  }

  async findAll(input?: { page?: number; pageSize?: number; status?: RechargeOrderStatus | 'all'; keyword?: string }) {
    const page = Math.max(1, input?.page ?? 1)
    const pageSize = Math.min(100, Math.max(1, input?.pageSize ?? 20))
    const offset = (page - 1) * pageSize
    const where: string[] = []
    const params: Record<string, string | number> = { pageSize, offset }

    if (input?.status && input.status !== 'all') {
      where.push('recharge_orders.status = :status')
      params.status = input.status
    }
    if (input?.keyword?.trim()) {
      where.push('(recharge_orders.out_trade_no LIKE :keyword OR recharge_orders.trade_no LIKE :keyword OR users.email LIKE :keyword)')
      params.keyword = `%${input.keyword.trim()}%`
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

    const [countRows] = await db.query<Array<RowDataPacket & { total: string | number }>>(
      `SELECT COUNT(*) AS total
       FROM recharge_orders
       LEFT JOIN users ON users.id = recharge_orders.user_id
       ${whereSql}`,
      params,
    )
    const [rows] = await db.query<RechargeOrderRow[]>(
      `SELECT recharge_orders.*, users.email AS user_email
       FROM recharge_orders
       LEFT JOIN users ON users.id = recharge_orders.user_id
       ${whereSql}
       ORDER BY recharge_orders.created_at DESC, recharge_orders.id DESC
       LIMIT :pageSize OFFSET :offset`,
      params,
    )

    return {
      items: rows.map(toRechargeOrder),
      total: Number(countRows[0]?.total ?? 0),
      page,
      pageSize,
    }
  }

  async updatePaymentInfo(id: string, input: { payUrl?: string | null; qrCode?: string | null }) {
    await db.query(
      `UPDATE recharge_orders
       SET pay_url = :payUrl, qr_code = :qrCode
       WHERE id = :id`,
      {
        id,
        payUrl: input.payUrl ?? null,
        qrCode: input.qrCode ?? null,
      },
    )
    return this.findById(id)
  }

  async markPaid(id: string, input: { tradeNo?: string | null; paidAt: string }) {
    const [result] = await db.query<ResultSetHeader>(
      `UPDATE recharge_orders
       SET status = 'paid', trade_no = :tradeNo, paid_at = :paidAt
       WHERE id = :id AND status = 'pending'`,
      {
        id,
        tradeNo: input.tradeNo ?? null,
        paidAt: toMysqlDateTime(input.paidAt),
      },
    )
    return {
      order: await this.findById(id),
      changed: result.affectedRows > 0,
    }
  }

  async markFailed(id: string) {
    await db.query(
      `UPDATE recharge_orders
       SET status = 'failed'
       WHERE id = :id AND status = 'pending'`,
      { id },
    )
    return this.findById(id)
  }
}
