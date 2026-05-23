import type { RowDataPacket } from 'mysql2'
import { db } from '../../config/db.js'
import type { ApiProvider } from './apiProviderTypes.js'

type ApiProviderRow = RowDataPacket & {
  id: string
  name: string
  type: 'sub2api' | 'custom'
  base_url: string
  api_key: string
  status: 'active' | 'disabled'
  created_at: Date
  updated_at: Date
}

function toApiProvider(row: ApiProviderRow): ApiProvider {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    baseUrl: row.base_url,
    apiKey: row.api_key,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }
}

export class ApiProviderRepository {
  async findAll() {
    const [rows] = await db.query<ApiProviderRow[]>(
      'SELECT * FROM api_providers ORDER BY created_at DESC',
    )
    return rows.map(toApiProvider)
  }

  async findById(id: string) {
    const [rows] = await db.query<ApiProviderRow[]>(
      'SELECT * FROM api_providers WHERE id = :id LIMIT 1',
      { id },
    )
    return rows[0] ? toApiProvider(rows[0]) : null
  }

  async create(provider: ApiProvider) {
    await db.query(
      `INSERT INTO api_providers
        (id, name, type, base_url, api_key, status)
       VALUES
        (:id, :name, :type, :baseUrl, :apiKey, :status)`,
      provider,
    )
    return this.findById(provider.id)
  }

  async update(id: string, input: Partial<ApiProvider>) {
    const fields: string[] = []
    const values: unknown[] = []

    const fieldMap = {
      name: 'name',
      type: 'type',
      baseUrl: 'base_url',
      apiKey: 'api_key',
      status: 'status',
    } as const

    Object.entries(fieldMap).forEach(([key, column]) => {
      const value = input[key as keyof ApiProvider]
      if (value !== undefined) {
        fields.push(`${column} = ?`)
        values.push(value)
      }
    })

    if (fields.length > 0) {
      await db.query(`UPDATE api_providers SET ${fields.join(', ')} WHERE id = ?`, [...values, id])
    }

    return this.findById(id)
  }

  async delete(id: string) {
    const [result] = await db.query('DELETE FROM api_providers WHERE id = :id', { id })
    return 'affectedRows' in result && result.affectedRows > 0
  }
}
