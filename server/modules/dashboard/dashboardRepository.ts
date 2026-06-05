import type { RowDataPacket } from 'mysql2'
import { db } from '../../config/db.js'

type CountRow = RowDataPacket & { total: string | number }
type AmountRow = RowDataPacket & { total: string | number | null }
type TaskStatsRow = RowDataPacket & {
  total: string | number
  running: string | number
  failed: string | number
}
type StatusRow = RowDataPacket & {
  active: string | number
  disabled: string | number
}
type LastTaskRow = RowDataPacket & { last_task_at: Date | null }

function number(value: unknown) {
  return Number(value ?? 0)
}

async function count(sql: string) {
  const [rows] = await db.query<CountRow[]>(sql)
  return number(rows[0]?.total)
}

export class DashboardRepository {
  async getOverview() {
    const [
      todayUsers,
      todayOrders,
      [todayPaidAmountRows],
      [todayTaskRows],
      pendingOrders,
      runningTasks,
      recentFailedTasks,
      privateImages,
      [providerRows],
      [modelRows],
      [lastTaskRows],
    ] = await Promise.all([
      count('SELECT COUNT(*) AS total FROM users WHERE created_at >= CURDATE()'),
      count('SELECT COUNT(*) AS total FROM recharge_orders WHERE created_at >= CURDATE()'),
      db.query<AmountRow[]>(
        "SELECT COALESCE(SUM(amount), 0) AS total FROM recharge_orders WHERE status = 'paid' AND paid_at >= CURDATE()",
      ),
      db.query<TaskStatsRow[]>(
        `SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN status IN ('queued', 'pending', 'processing') THEN 1 ELSE 0 END) AS running,
          SUM(CASE WHEN status IN ('failed', 'canceled') THEN 1 ELSE 0 END) AS failed
         FROM generation_tasks
         WHERE created_at >= CURDATE()`,
      ),
      count("SELECT COUNT(*) AS total FROM recharge_orders WHERE status = 'pending'"),
      count("SELECT COUNT(*) AS total FROM generation_tasks WHERE status IN ('queued', 'pending', 'processing')"),
      count("SELECT COUNT(*) AS total FROM generation_tasks WHERE status IN ('failed', 'canceled') AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)"),
      count("SELECT COUNT(*) AS total FROM generation_tasks WHERE status = 'success' AND display_enabled = 0"),
      db.query<StatusRow[]>(
        "SELECT SUM(status = 'active') AS active, SUM(status = 'disabled') AS disabled FROM api_providers",
      ),
      db.query<StatusRow[]>(
        "SELECT SUM(status = 'active') AS active, SUM(status = 'disabled') AS disabled FROM ai_models WHERE capability = 'chat_image'",
      ),
      db.query<LastTaskRow[]>('SELECT MAX(created_at) AS last_task_at FROM generation_tasks'),
    ])

    const [todayPaidAmount] = todayPaidAmountRows
    const [todayTasks] = todayTaskRows
    const [providers] = providerRows
    const [models] = modelRows
    const lastTaskAt = lastTaskRows[0]?.last_task_at

    return {
      today: {
        users: todayUsers,
        orders: todayOrders,
        paidAmount: number(todayPaidAmount?.total),
        tasks: number(todayTasks?.total),
        runningTasks: number(todayTasks?.running),
        failedTasks: number(todayTasks?.failed),
      },
      pending: {
        pendingOrders,
        runningTasks,
        recentFailedTasks,
        privateImages,
      },
      system: {
        api: 'ok',
        database: 'ok',
        activeProviders: number(providers?.active),
        disabledProviders: number(providers?.disabled),
        activeModels: number(models?.active),
        disabledModels: number(models?.disabled),
        lastTaskAt: lastTaskAt?.toISOString() ?? null,
      },
    }
  }
}
