import type { PoolConnection } from 'mysql2/promise'
import { db } from './db.js'

type QueryExecutor = Pick<PoolConnection, 'query'>

type RepairStats = {
  found: number
  repairedUsers: number
  repairedReferences: number
  skipped: number
}

const legacyReferenceColumns = [
  { table: 'generation_tasks', column: 'user_id' },
  { table: 'credit_logs', column: 'user_id' },
  { table: 'email_tokens', column: 'user_id' },
  { table: 'recharge_orders', column: 'user_id' },
  { table: 'redeem_codes', column: 'user_id' },
  { table: 'user_invites', column: 'inviter_id' },
] as const

export function legacyUserId(oldId: number) {
  return `00000000-0000-4000-8000-${String(oldId).padStart(12, '0')}`
}

function parseLegacyUserId(id: string) {
  const match = id.match(/^legacy-(\d+)$/)
  return match ? Number(match[1]) : null
}

function affectedRows(result: unknown) {
  return typeof result === 'object' && result !== null && 'affectedRows' in result
    ? Number((result as { affectedRows: number }).affectedRows) || 0
    : 0
}

async function queryLegacyIds(sql: string) {
  const [rows] = await db.query(sql)
  if (!Array.isArray(rows)) return []
  return (rows as Array<{ id: string | null }>).map((row) => row.id).filter(Boolean) as string[]
}

async function updateLegacyReferences(
  connection: QueryExecutor,
  legacyId: string,
  uuidId: string,
) {
  let updated = 0

  for (const reference of legacyReferenceColumns) {
    const [result] = await connection.query(
      `UPDATE ${reference.table} SET ${reference.column} = :uuidId WHERE ${reference.column} = :legacyId`,
      { legacyId, uuidId },
    )
    updated += affectedRows(result)
  }

  const [announcementUserResult] = await connection.query(
    `INSERT IGNORE INTO announcement_users (announcement_id, user_id, created_at)
     SELECT announcement_id, :uuidId, created_at
     FROM announcement_users
     WHERE user_id = :legacyId`,
    { legacyId, uuidId },
  )
  updated += affectedRows(announcementUserResult)
  await connection.query('DELETE FROM announcement_users WHERE user_id = :legacyId', { legacyId })

  const [announcementReceiptResult] = await connection.query(
    `INSERT IGNORE INTO announcement_receipts (announcement_id, user_id, signed_at)
     SELECT announcement_id, :uuidId, signed_at
     FROM announcement_receipts
     WHERE user_id = :legacyId`,
    { legacyId, uuidId },
  )
  updated += affectedRows(announcementReceiptResult)
  await connection.query('DELETE FROM announcement_receipts WHERE user_id = :legacyId', { legacyId })

  const [checkinResult] = await connection.query(
    `INSERT IGNORE INTO user_checkins (id, user_id, reward_credits, checkin_date, user_ip, created_at)
     SELECT UUID(), :uuidId, reward_credits, checkin_date, user_ip, created_at
     FROM user_checkins
     WHERE user_id = :legacyId`,
    { legacyId, uuidId },
  )
  updated += affectedRows(checkinResult)
  await connection.query('DELETE FROM user_checkins WHERE user_id = :legacyId', { legacyId })

  const [inviteeResult] = await connection.query(
    'UPDATE IGNORE user_invites SET invitee_id = :uuidId WHERE invitee_id = :legacyId',
    { legacyId, uuidId },
  )
  updated += affectedRows(inviteeResult)
  await connection.query('DELETE FROM user_invites WHERE invitee_id = :legacyId', { legacyId })

  return updated
}

async function repairOneLegacyUserId(legacyId: string, uuidId: string) {
  const connection = await db.getConnection()
  try {
    await connection.beginTransaction()

    const [legacyRows] = await connection.query(
      'SELECT id, email FROM users WHERE id = :legacyId LIMIT 1 FOR UPDATE',
      { legacyId },
    )
    const legacyUser = Array.isArray(legacyRows)
      ? legacyRows[0] as { id: string; email: string } | undefined
      : undefined

    const [uuidRows] = await connection.query(
      'SELECT id, email FROM users WHERE id = :uuidId LIMIT 1 FOR UPDATE',
      { uuidId },
    )
    const uuidUser = Array.isArray(uuidRows)
      ? uuidRows[0] as { id: string; email: string } | undefined
      : undefined

    if (legacyUser && uuidUser && uuidUser.email !== legacyUser.email) {
      throw new Error(`无法迁移 ${legacyId}：目标 UUID ${uuidId} 已属于 ${uuidUser.email}`)
    }

    const repairedReferences = await updateLegacyReferences(connection, legacyId, uuidId)
    let repairedUser = false

    if (legacyUser && uuidUser) {
      await connection.query('DELETE FROM users WHERE id = :legacyId', { legacyId })
      repairedUser = true
    } else if (legacyUser) {
      await connection.query('UPDATE users SET id = :uuidId WHERE id = :legacyId', {
        legacyId,
        uuidId,
      })
      repairedUser = true
    }

    await connection.commit()
    return { repairedUser, repairedReferences }
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

export async function repairLegacyUserIds(): Promise<RepairStats> {
  const legacyIds = new Set<string>()

  for (const id of await queryLegacyIds('SELECT id FROM users WHERE id LIKE "legacy-%"')) {
    legacyIds.add(id)
  }

  for (const reference of legacyReferenceColumns) {
    const ids = await queryLegacyIds(
      `SELECT DISTINCT ${reference.column} AS id
       FROM ${reference.table}
       WHERE ${reference.column} LIKE "legacy-%"`,
    )
    for (const id of ids) legacyIds.add(id)
  }

  const extraQueries = [
    'SELECT DISTINCT user_id AS id FROM announcement_users WHERE user_id LIKE "legacy-%"',
    'SELECT DISTINCT user_id AS id FROM announcement_receipts WHERE user_id LIKE "legacy-%"',
    'SELECT DISTINCT user_id AS id FROM user_checkins WHERE user_id LIKE "legacy-%"',
    'SELECT DISTINCT invitee_id AS id FROM user_invites WHERE invitee_id LIKE "legacy-%"',
  ]

  for (const query of extraQueries) {
    for (const id of await queryLegacyIds(query)) legacyIds.add(id)
  }

  const stats: RepairStats = {
    found: legacyIds.size,
    repairedUsers: 0,
    repairedReferences: 0,
    skipped: 0,
  }

  for (const legacyId of legacyIds) {
    const oldId = parseLegacyUserId(legacyId)
    if (!oldId) {
      stats.skipped += 1
      continue
    }

    const { repairedUser, repairedReferences } = await repairOneLegacyUserId(
      legacyId,
      legacyUserId(oldId),
    )
    if (repairedUser) stats.repairedUsers += 1
    stats.repairedReferences += repairedReferences
  }

  return stats
}
