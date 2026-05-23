import type { RowDataPacket } from 'mysql2'
import { db } from '../../config/db.js'
import type { AiModel, AiModelCapability, AiModelStatus } from './modelTypes.js'

type AiModelRow = RowDataPacket & {
  id: string
  provider_id: string
  provider_name?: string
  model_name: string
  display_name: string
  capability: AiModelCapability
  price_1k: string | number
  price_2k: string | number
  price_4k: string | number
  status: AiModelStatus
  created_at: Date
  updated_at: Date
}

function toAiModel(row: AiModelRow): AiModel {
  return {
    id: row.id,
    providerId: row.provider_id,
    providerName: row.provider_name,
    modelName: row.model_name,
    displayName: row.display_name,
    capability: row.capability,
    price1k: Number(row.price_1k),
    price2k: Number(row.price_2k),
    price4k: Number(row.price_4k),
    status: row.status,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }
}

export class ModelRepository {
  async findAll() {
    const [rows] = await db.query<AiModelRow[]>(
      `SELECT ai_models.*, api_providers.name AS provider_name
       FROM ai_models
       LEFT JOIN api_providers ON api_providers.id = ai_models.provider_id
       ORDER BY
        api_providers.name ASC,
        ai_models.model_name ASC,
        FIELD(ai_models.capability, 'image', 'chat_image', 'workflow', 'video') ASC,
        ai_models.created_at DESC,
        ai_models.id ASC`,
    )
    return rows.map(toAiModel)
  }

  async findById(id: string) {
    const [rows] = await db.query<AiModelRow[]>(
      `SELECT ai_models.*, api_providers.name AS provider_name
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
        (id, provider_id, model_name, display_name, capability, price_1k, price_2k, price_4k, status)
       VALUES
        (:id, :providerId, :modelName, :displayName, :capability, :price1k, :price2k, :price4k, :status)
       ON DUPLICATE KEY UPDATE
        display_name = VALUES(display_name),
        price_1k = VALUES(price_1k),
        price_2k = VALUES(price_2k),
        price_4k = VALUES(price_4k),
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
      `SELECT ai_models.*, api_providers.name AS provider_name
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

  async update(id: string, input: Partial<AiModel>) {
    const fields: string[] = []
    const values: unknown[] = []

    const fieldMap = {
      providerId: 'provider_id',
      modelName: 'model_name',
      displayName: 'display_name',
      capability: 'capability',
      price1k: 'price_1k',
      price2k: 'price_2k',
      price4k: 'price_4k',
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
}
