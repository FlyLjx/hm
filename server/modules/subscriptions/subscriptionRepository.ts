import type { RowDataPacket } from 'mysql2'
import { db } from '../../config/db.js'
import { toMysqlDateTime } from '../../shared/mysqlDate.js'
import type { SubscriptionPlan, SubscriptionPlanStatus, UserSubscription, UserSubscriptionStatus } from './subscriptionTypes.js'

type PlanRow = RowDataPacket & {
  id: string
  name: string
  description?: string | null
  amount: string | number
  duration_days: string | number
  bonus_credits: string | number
  discount_percent: string | number
  allowed_provider_ids?: string | null
  allowed_model_ids?: string | null
  badge?: string | null
  sort_order: string | number
  status: SubscriptionPlanStatus
  created_at: Date
  updated_at: Date
}

type UserSubscriptionRow = RowDataPacket & {
  id: string
  user_id: string
  plan_id: string
  plan_name?: string | null
  status: UserSubscriptionStatus
  started_at: Date
  expires_at: Date
  created_at: Date
  updated_at: Date
}

function toPlan(row: PlanRow): SubscriptionPlan {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    amount: Number(row.amount),
    durationDays: Number(row.duration_days),
    bonusCredits: Number(row.bonus_credits),
    discountPercent: Number(row.discount_percent),
    allowedProviderIds: parseJsonArray(row.allowed_provider_ids),
    allowedModelIds: parseJsonArray(row.allowed_model_ids),
    badge: row.badge,
    sortOrder: Number(row.sort_order),
    status: row.status,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }
}

function parseJsonArray(value?: unknown) {
  if (!value) return []
  if (Array.isArray(value)) return value.map(String).filter(Boolean)
  if (Buffer.isBuffer(value)) return parseJsonArray(value.toString('utf8'))
  if (typeof value !== 'string') return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : []
  } catch {
    return []
  }
}

function stringifyIds(value?: string[]) {
  return JSON.stringify(Array.isArray(value) ? value.filter(Boolean) : [])
}

function toUserSubscription(row: UserSubscriptionRow): UserSubscription {
  return {
    id: row.id,
    userId: row.user_id,
    planId: row.plan_id,
    planName: row.plan_name,
    status: row.status,
    startedAt: row.started_at.toISOString(),
    expiresAt: row.expires_at.toISOString(),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }
}

export class SubscriptionRepository {
  async findPlans() {
    const [rows] = await db.query<PlanRow[]>(
      `SELECT * FROM subscription_plans
       ORDER BY sort_order ASC, amount ASC, created_at DESC`,
    )
    return rows.map(toPlan)
  }

  async findActivePlans() {
    const [rows] = await db.query<PlanRow[]>(
      `SELECT * FROM subscription_plans
       WHERE status = 'active'
       ORDER BY sort_order ASC, amount ASC, created_at DESC`,
    )
    return rows.map(toPlan)
  }

  async findPlanById(id: string) {
    const [rows] = await db.query<PlanRow[]>('SELECT * FROM subscription_plans WHERE id = :id LIMIT 1', { id })
    return rows[0] ? toPlan(rows[0]) : null
  }

  async createPlan(plan: SubscriptionPlan) {
    await db.query(
      `INSERT INTO subscription_plans
        (id, name, description, amount, duration_days, bonus_credits, discount_percent, allowed_provider_ids, allowed_model_ids, badge, sort_order, status)
       VALUES
        (:id, :name, :description, :amount, :durationDays, :bonusCredits, :discountPercent, :allowedProviderIds, :allowedModelIds, :badge, :sortOrder, :status)`,
      {
        ...plan,
        allowedProviderIds: stringifyIds(plan.allowedProviderIds),
        allowedModelIds: stringifyIds(plan.allowedModelIds),
      },
    )
    return this.findPlanById(plan.id)
  }

  async updatePlan(id: string, input: Partial<SubscriptionPlan>) {
    const fields: string[] = []
    const values: unknown[] = []
    const fieldMap = {
      name: 'name',
      description: 'description',
      amount: 'amount',
      durationDays: 'duration_days',
      bonusCredits: 'bonus_credits',
      discountPercent: 'discount_percent',
      allowedProviderIds: 'allowed_provider_ids',
      allowedModelIds: 'allowed_model_ids',
      badge: 'badge',
      sortOrder: 'sort_order',
      status: 'status',
    } as const

    Object.entries(fieldMap).forEach(([key, column]) => {
      const value = input[key as keyof SubscriptionPlan]
      if (value !== undefined) {
        fields.push(`${column} = ?`)
        values.push(key === 'allowedProviderIds' || key === 'allowedModelIds' ? stringifyIds(value as string[]) : value)
      }
    })

    if (fields.length > 0) {
      await db.query(`UPDATE subscription_plans SET ${fields.join(', ')} WHERE id = ?`, [...values, id])
    }
    return this.findPlanById(id)
  }

  async deletePlan(id: string) {
    const [result] = await db.query('DELETE FROM subscription_plans WHERE id = :id', { id })
    return 'affectedRows' in result && result.affectedRows > 0
  }

  async findActiveUserSubscription(userId: string) {
    await db.query(
      `UPDATE user_subscriptions
       SET status = 'expired'
       WHERE user_id = :userId AND status = 'active' AND expires_at <= NOW()`,
      { userId },
    )
    const [rows] = await db.query<UserSubscriptionRow[]>(
      `SELECT user_subscriptions.*, subscription_plans.name AS plan_name
       FROM user_subscriptions
       LEFT JOIN subscription_plans ON subscription_plans.id = user_subscriptions.plan_id
       WHERE user_subscriptions.user_id = :userId
         AND user_subscriptions.status = 'active'
         AND user_subscriptions.expires_at > NOW()
       ORDER BY user_subscriptions.expires_at DESC
       LIMIT 1`,
      { userId },
    )
    return rows[0] ? toUserSubscription(rows[0]) : null
  }

  async upsertUserSubscription(input: { id: string; userId: string; planId: string; startedAt: string; expiresAt: string }) {
    await db.query(
      `INSERT INTO user_subscriptions (id, user_id, plan_id, status, started_at, expires_at)
       VALUES (:id, :userId, :planId, 'active', :startedAt, :expiresAt)
       ON DUPLICATE KEY UPDATE
         plan_id = VALUES(plan_id),
         status = 'active',
         started_at = VALUES(started_at),
         expires_at = VALUES(expires_at)`,
      {
        ...input,
        startedAt: toMysqlDateTime(input.startedAt),
        expiresAt: toMysqlDateTime(input.expiresAt),
      },
    )
    return this.findActiveUserSubscription(input.userId)
  }
}
