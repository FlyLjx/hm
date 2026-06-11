import type { RowDataPacket } from 'mysql2'
import { db } from '../../config/db.js'
import type { AiModel, AiModelCapability, AiModelStatus } from './modelTypes.js'

type AiModelRow = RowDataPacket & {
  id: string
  provider_id: string
  provider_name?: string
  provider_type?: 'sub2api' | 'custom'
  provider_status?: 'active' | 'disabled'
  model_name: string
  display_name: string
  capability: AiModelCapability
  cost_1k: string | number
  cost_2k: string | number
  cost_4k: string | number
  markup_percent: string | number
  price_change_percent: string | number
  price_1k: string | number
  price_2k: string | number
  price_4k: string | number
  append_size_to_prompt: number | boolean
  sort_order: string | number
  status: AiModelStatus
  created_at: Date
  updated_at: Date
}

function toAiModel(row: AiModelRow): AiModel {
  return {
    id: row.id,
    providerId: row.provider_id,
    providerName: row.provider_name,
    providerType: row.provider_type,
    providerStatus: row.provider_status,
    modelName: row.model_name,
    displayName: row.display_name,
    capability: row.capability,
    cost1k: Number(row.cost_1k),
    cost2k: Number(row.cost_2k),
    cost4k: Number(row.cost_4k),
    markupPercent: Number(row.markup_percent),
    priceChangePercent: Number(row.price_change_percent),
    price1k: Number(row.price_1k),
    price2k: Number(row.price_2k),
    price4k: Number(row.price_4k),
    appendSizeToPrompt: Boolean(row.append_size_to_prompt),
    sortOrder: Number(row.sort_order ?? 100),
    status: row.status,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }
}

export class ModelRepository {
  async findAll() {
    const [rows] = await db.query<AiModelRow[]>(
      `SELECT ai_models.*, api_providers.name AS provider_name, api_providers.type AS provider_type, api_providers.status AS provider_status
       FROM ai_models
       LEFT JOIN api_providers ON api_providers.id = ai_models.provider_id
       WHERE ai_models.capability = 'chat_image'
       ORDER BY
        ai_models.sort_order ASC,
        api_providers.name ASC,
        ai_models.model_name ASC,
        ai_models.created_at DESC,
        ai_models.id ASC`,
    )
    return rows.map(toAiModel)
  }

  async findById(id: string) {
    const [rows] = await db.query<AiModelRow[]>(
      `SELECT ai_models.*, api_providers.name AS provider_name, api_providers.type AS provider_type, api_providers.status AS provider_status
       FROM ai_models
       LEFT JOIN api_providers ON api_providers.id = ai_models.provider_id
       WHERE ai_models.id = :id
       LIMIT 1`,
      { id },
    )
    return rows[0] ? toAiModel(rows[0]) : null
  }

  async create(model: AiModel) {
    await db.query(
      `INSERT INTO ai_models
        (id, provider_id, model_name, display_name, capability,
         cost_1k, cost_2k, cost_4k, markup_percent,
         price_change_percent, price_1k, price_2k, price_4k, append_size_to_prompt, sort_order, status)
       VALUES
        (:id, :providerId, :modelName, :displayName, :capability,
         :cost1k, :cost2k, :cost4k, :markupPercent,
         :priceChangePercent, :price1k, :price2k, :price4k, :appendSizeToPrompt, :sortOrder, :status)
       ON DUPLICATE KEY UPDATE
        display_name = VALUES(display_name),
        cost_1k = VALUES(cost_1k),
        cost_2k = VALUES(cost_2k),
        cost_4k = VALUES(cost_4k),
        markup_percent = VALUES(markup_percent),
        price_change_percent = VALUES(price_change_percent),
        price_1k = VALUES(price_1k),
        price_2k = VALUES(price_2k),
        price_4k = VALUES(price_4k),
        append_size_to_prompt = VALUES(append_size_to_prompt),
        sort_order = VALUES(sort_order),
        updated_at = CURRENT_TIMESTAMP`,
      model,
    )
    return this.findByProviderNameAndCapability(model.providerId, model.modelName, model.capability)
  }

  async findByProviderNameAndCapability(
    providerId: string,
    modelName: string,
    capability: AiModelCapability,
  ) {
    const [rows] = await db.query<AiModelRow[]>(
      `SELECT ai_models.*, api_providers.name AS provider_name, api_providers.type AS provider_type, api_providers.status AS provider_status
       FROM ai_models
       LEFT JOIN api_providers ON api_providers.id = ai_models.provider_id
       WHERE ai_models.provider_id = :providerId
         AND ai_models.model_name = :modelName
         AND ai_models.capability = :capability
       LIMIT 1`,
      { providerId, modelName, capability },
    )
    return rows[0] ? toAiModel(rows[0]) : null
  }

  async findActiveByNameOrDisplayName(modelName: string, capability: AiModelCapability) {
    const [rows] = await db.query<AiModelRow[]>(
      `SELECT ai_models.*, api_providers.name AS provider_name, api_providers.type AS provider_type, api_providers.status AS provider_status
       FROM ai_models
       LEFT JOIN api_providers ON api_providers.id = ai_models.provider_id
       WHERE ai_models.capability = :capability
         AND ai_models.status = 'active'
         AND api_providers.status = 'active'
         AND (ai_models.model_name = :modelName OR ai_models.display_name = :modelName)
       ORDER BY ai_models.created_at DESC, ai_models.id ASC
       LIMIT 1`,
      { modelName, capability },
    )
    return rows[0] ? toAiModel(rows[0]) : null
  }

  async findActiveByModelName(modelName: string, capability: AiModelCapability) {
    const [rows] = await db.query<AiModelRow[]>(
      `SELECT ai_models.*, api_providers.name AS provider_name, api_providers.type AS provider_type, api_providers.status AS provider_status
       FROM ai_models
       LEFT JOIN api_providers ON api_providers.id = ai_models.provider_id
       WHERE ai_models.capability = :capability
         AND ai_models.status = 'active'
         AND api_providers.status = 'active'
         AND ai_models.model_name = :modelName
       ORDER BY ai_models.created_at DESC, ai_models.id ASC
       LIMIT 1`,
      { modelName, capability },
    )
    return rows[0] ? toAiModel(rows[0]) : null
  }

  async findByProviderDisplayNameAndCapability(
    providerId: string,
    displayName: string,
    capability: AiModelCapability,
  ) {
    const [rows] = await db.query<AiModelRow[]>(
      `SELECT ai_models.*, api_providers.name AS provider_name, api_providers.type AS provider_type, api_providers.status AS provider_status
       FROM ai_models
       LEFT JOIN api_providers ON api_providers.id = ai_models.provider_id
       WHERE ai_models.provider_id = :providerId
         AND ai_models.display_name = :displayName
         AND ai_models.capability = :capability
         AND ai_models.status = 'active'
       ORDER BY ai_models.model_name ASC`,
      { providerId, displayName, capability },
    )
    return rows.map(toAiModel)
  }

  async update(id: string, input: Partial<AiModel>) {
    const fields: string[] = []
    const values: unknown[] = []

    const fieldMap = {
      providerId: 'provider_id',
      modelName: 'model_name',
      displayName: 'display_name',
      capability: 'capability',
      cost1k: 'cost_1k',
      cost2k: 'cost_2k',
      cost4k: 'cost_4k',
      markupPercent: 'markup_percent',
      priceChangePercent: 'price_change_percent',
      price1k: 'price_1k',
      price2k: 'price_2k',
      price4k: 'price_4k',
      appendSizeToPrompt: 'append_size_to_prompt',
      sortOrder: 'sort_order',
      status: 'status',
    } as const

    Object.entries(fieldMap).forEach(([key, column]) => {
      const value = input[key as keyof AiModel]
      if (value !== undefined) {
        fields.push(`${column} = ?`)
        values.push(value)
      }
    })

    if (fields.length > 0) {
      await db.query(`UPDATE ai_models SET ${fields.join(', ')} WHERE id = ?`, [...values, id])
    }

    return this.findById(id)
  }

  async delete(id: string) {
    const [result] = await db.query('DELETE FROM ai_models WHERE id = :id', { id })
    return 'affectedRows' in result && result.affectedRows > 0
  }

  async deleteMany(ids: string[]) {
    const placeholders = ids.map(() => '?').join(', ')
    const [result] = await db.query(`DELETE FROM ai_models WHERE id IN (${placeholders})`, ids)
    return 'affectedRows' in result ? result.affectedRows : 0
  }

  async deleteByProviderId(providerId: string) {
    const [result] = await db.query('DELETE FROM ai_models WHERE provider_id = :providerId', { providerId })
    return 'affectedRows' in result ? result.affectedRows : 0
  }

  async updateSortOrders(items: Array<{ id: string; sortOrder: number }>) {
    await Promise.all(
      items.map((item) => db.query(
        'UPDATE ai_models SET sort_order = :sortOrder WHERE id = :id',
        { id: item.id, sortOrder: item.sortOrder },
      )),
    )
    return { updatedCount: items.length }
  }
}
