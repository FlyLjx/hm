import type { RowDataPacket } from 'mysql2'
import { db } from '../../config/db.js'
import type { GenerationSizeTier } from '../tasks/taskTypes.js'

type SummaryRow = RowDataPacket & {
  paid_amount: string | number | null
  paid_orders: string | number
  task_revenue: string | number | null
  model_cost: string | number | null
  success_tasks: string | number
  images: string | number | null
}

type ModelRow = RowDataPacket & {
  model_id: string | null
  model_name: string | null
  display_name: string | null
  task_revenue: string | number | null
  model_cost: string | number | null
  success_tasks: string | number
  images: string | number | null
}

type TrendRow = RowDataPacket & {
  day: string
  paid_amount: string | number | null
  task_revenue: string | number | null
  model_cost: string | number | null
  success_tasks: string | number
}

function number(value: unknown) {
  return Number(value ?? 0)
}

function round(value: number) {
  return Number(value.toFixed(4))
}

function normalizeDays(days?: number) {
  return Math.min(90, Math.max(1, Number(days) || 30))
}

function modelCostExpression(alias = 'generation_tasks') {
  return `CASE
    WHEN ${alias}.model_cost_credits > 0 THEN ${alias}.model_cost_credits
    WHEN ${alias}.size_tier = '4k' THEN COALESCE(ai_models.cost_4k, 0) * ${alias}.quantity
    WHEN ${alias}.size_tier = '2k' THEN COALESCE(ai_models.cost_2k, 0) * ${alias}.quantity
    ELSE COALESCE(ai_models.cost_1k, 0) * ${alias}.quantity
  END`
}

function toProfit(taskRevenue: number, modelCost: number) {
  const grossProfit = round(taskRevenue - modelCost)
  return {
    grossProfit,
    grossProfitRate: taskRevenue > 0 ? Number(((grossProfit / taskRevenue) * 100).toFixed(2)) : 0,
  }
}

export class FinanceStatsRepository {
  async getCostStats(input?: { days?: number }) {
    const days = normalizeDays(input?.days)
    const params = { days }
    const modelCostSql = modelCostExpression()

    const [summaryResult, modelResult, trendResult] = await Promise.all([
      db.query<SummaryRow[]>(
        `SELECT
          (SELECT COALESCE(SUM(amount), 0)
           FROM recharge_orders
           WHERE status = 'paid'
             AND paid_at >= DATE_SUB(NOW(), INTERVAL :days DAY)) AS paid_amount,
          (SELECT COUNT(*)
           FROM recharge_orders
           WHERE status = 'paid'
             AND paid_at >= DATE_SUB(NOW(), INTERVAL :days DAY)) AS paid_orders,
          COALESCE(SUM(generation_tasks.cost_credits), 0) AS task_revenue,
          COALESCE(SUM(${modelCostSql}), 0) AS model_cost,
          COUNT(generation_tasks.id) AS success_tasks,
          COALESCE(SUM(generation_tasks.quantity), 0) AS images
         FROM generation_tasks
         LEFT JOIN ai_models ON ai_models.id = generation_tasks.model_id
         WHERE generation_tasks.status = 'success'
           AND generation_tasks.created_at >= DATE_SUB(NOW(), INTERVAL :days DAY)`,
        params,
      ),
      db.query<ModelRow[]>(
        `SELECT
          generation_tasks.model_id,
          ai_models.model_name,
          ai_models.display_name,
          COALESCE(SUM(generation_tasks.cost_credits), 0) AS task_revenue,
          COALESCE(SUM(${modelCostSql}), 0) AS model_cost,
          COUNT(*) AS success_tasks,
          COALESCE(SUM(generation_tasks.quantity), 0) AS images
         FROM generation_tasks
         LEFT JOIN ai_models ON ai_models.id = generation_tasks.model_id
         WHERE generation_tasks.status = 'success'
           AND generation_tasks.created_at >= DATE_SUB(NOW(), INTERVAL :days DAY)
         GROUP BY generation_tasks.model_id, ai_models.model_name, ai_models.display_name
         ORDER BY model_cost DESC, task_revenue DESC
         LIMIT 20`,
        params,
      ),
      db.query<TrendRow[]>(
        `SELECT
          day_rows.day,
          COALESCE(order_rows.paid_amount, 0) AS paid_amount,
          COALESCE(task_rows.task_revenue, 0) AS task_revenue,
          COALESCE(task_rows.model_cost, 0) AS model_cost,
          COALESCE(task_rows.success_tasks, 0) AS success_tasks
         FROM (
          SELECT DATE(created_at) AS day FROM generation_tasks WHERE created_at >= DATE_SUB(NOW(), INTERVAL :days DAY)
          UNION
          SELECT DATE(paid_at) AS day FROM recharge_orders WHERE status = 'paid' AND paid_at >= DATE_SUB(NOW(), INTERVAL :days DAY)
         ) day_rows
         LEFT JOIN (
          SELECT
            DATE(generation_tasks.created_at) AS day,
            COALESCE(SUM(generation_tasks.cost_credits), 0) AS task_revenue,
            COALESCE(SUM(${modelCostSql}), 0) AS model_cost,
            COUNT(*) AS success_tasks
          FROM generation_tasks
          LEFT JOIN ai_models ON ai_models.id = generation_tasks.model_id
          WHERE generation_tasks.status = 'success'
            AND generation_tasks.created_at >= DATE_SUB(NOW(), INTERVAL :days DAY)
          GROUP BY DATE(generation_tasks.created_at)
         ) task_rows ON task_rows.day = day_rows.day
         LEFT JOIN (
          SELECT DATE(paid_at) AS day, COALESCE(SUM(amount), 0) AS paid_amount
          FROM recharge_orders
          WHERE status = 'paid'
            AND paid_at >= DATE_SUB(NOW(), INTERVAL :days DAY)
          GROUP BY DATE(paid_at)
         ) order_rows ON order_rows.day = day_rows.day
         ORDER BY day_rows.day ASC`,
        params,
      ),
    ])
    const summaryRows = summaryResult[0]
    const modelRows = modelResult[0]
    const trendRows = trendResult[0]
    const summary = summaryRows[0]

    const paidAmount = number(summary?.paid_amount)
    const taskRevenue = number(summary?.task_revenue)
    const modelCost = number(summary?.model_cost)
    const overallProfit = toProfit(taskRevenue, modelCost)

    return {
      days,
      summary: {
        paidAmount: round(paidAmount),
        paidOrders: number(summary?.paid_orders),
        taskRevenue: round(taskRevenue),
        modelCost: round(modelCost),
        successTasks: number(summary?.success_tasks),
        images: number(summary?.images),
        ...overallProfit,
        cashMinusModelCost: round(paidAmount - modelCost),
      },
      models: modelRows.map((row) => {
        const rowRevenue = number(row.task_revenue)
        const rowCost = number(row.model_cost)
        return {
          modelId: row.model_id,
          modelName: row.model_name,
          displayName: row.display_name,
          taskRevenue: round(rowRevenue),
          modelCost: round(rowCost),
          successTasks: number(row.success_tasks),
          images: number(row.images),
          ...toProfit(rowRevenue, rowCost),
        }
      }),
      trends: trendRows.map((row) => {
        const rowRevenue = number(row.task_revenue)
        const rowCost = number(row.model_cost)
        return {
          day: row.day,
          paidAmount: round(number(row.paid_amount)),
          taskRevenue: round(rowRevenue),
          modelCost: round(rowCost),
          successTasks: number(row.success_tasks),
          ...toProfit(rowRevenue, rowCost),
        }
      }),
    }
  }
}
