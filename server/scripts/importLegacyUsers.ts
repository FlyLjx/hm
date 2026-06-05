import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { PoolConnection } from 'mysql2/promise'
import { db } from '../config/db.js'
import { initializeDatabase } from '../config/migrate.js'

type LegacyUser = {
  oldId: number
  username: string
  email: string
  passwordHash: string
  role: 'admin' | 'user'
  credits: number
  status: 'active' | 'disabled'
  createdAt: string
  updatedAt: string
}

type QueryExecutor = Pick<PoolConnection, 'query'>

const legacyReferenceColumns = [
  { table: 'generation_tasks', column: 'user_id' },
  { table: 'credit_logs', column: 'user_id' },
  { table: 'email_tokens', column: 'user_id' },
  { table: 'recharge_orders', column: 'user_id' },
  { table: 'redeem_codes', column: 'user_id' },
  { table: 'user_invites', column: 'inviter_id' },
] as const

function usage() {
  return [
    '用法:',
    '  npm run db:import-legacy-users -- <legacy-sql-file>',
    '',
    '示例:',
    '  npm run db:import-legacy-users -- aisystem_2026-05-27_14-05-32_mysql_data_uFLj0.sql',
  ].join('\n')
}

function legacyUserId(oldId: number) {
  return `00000000-0000-4000-8000-${String(oldId).padStart(12, '0')}`
}

function parseLegacyUserId(id: string) {
  const match = id.match(/^legacy-(\d+)$/)
  return match ? Number(match[1]) : null
}

function extractUsersInsert(sql: string) {
  const match = sql.match(/INSERT INTO `users` VALUES\s*([\s\S]*?);/i)
  if (!match?.[1]) {
    throw new Error('没有在 SQL 文件中找到 INSERT INTO `users` VALUES 语句')
  }
  return match[1].trim()
}

function splitTuples(valuesSql: string) {
  const tuples: string[] = []
  let start = -1
  let depth = 0
  let inString = false
  let escaped = false

  for (let index = 0; index < valuesSql.length; index += 1) {
    const char = valuesSql[index]
    if (inString) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === "'") {
        inString = false
      }
      continue
    }

    if (char === "'") {
      inString = true
      continue
    }
    if (char === '(') {
      if (depth === 0) start = index + 1
      depth += 1
      continue
    }
    if (char === ')') {
      depth -= 1
      if (depth === 0 && start >= 0) {
        tuples.push(valuesSql.slice(start, index))
        start = -1
      }
    }
  }

  return tuples
}

function splitFields(tupleSql: string) {
  const fields: string[] = []
  let value = ''
  let inString = false
  let escaped = false

  for (let index = 0; index < tupleSql.length; index += 1) {
    const char = tupleSql[index]
    if (inString) {
      value += char
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === "'") {
        inString = false
      }
      continue
    }

    if (char === "'") {
      inString = true
      value += char
      continue
    }
    if (char === ',') {
      fields.push(value.trim())
      value = ''
      continue
    }
    value += char
  }
  fields.push(value.trim())
  return fields
}

function parseSqlValue(value: string) {
  if (/^null$/i.test(value)) return null
  if (value.startsWith("'") && value.endsWith("'")) {
    return value
      .slice(1, -1)
      .replace(/\\0/g, '\0')
      .replace(/\\'/g, "'")
      .replace(/\\"/g, '"')
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t')
      .replace(/\\\\/g, '\\')
  }
  return value
}

function toEmail(email: unknown, username: unknown, oldId: unknown) {
  const normalized = String(email || '').trim().toLowerCase()
  if (normalized.includes('@')) return normalized
  const name = String(username || `legacy-${oldId}`).trim() || `legacy-${oldId}`
  return `${name.replace(/[^a-z0-9._-]/gi, '_').toLowerCase()}@legacy.local`
}

function parseLegacyUsers(sql: string) {
  const valuesSql = extractUsersInsert(sql)
  return splitTuples(valuesSql).map((tupleSql) => {
    const fields = splitFields(tupleSql).map(parseSqlValue)
    return {
      oldId: Number(fields[0]),
      username: String(fields[1] || ''),
      email: toEmail(fields[2], fields[1], fields[0]),
      passwordHash: String(fields[3] || ''),
      role: fields[4] === 'admin' ? 'admin' : 'user',
      credits: Number(fields[5]) || 0,
      status: Number(fields[8]) === 1 ? 'disabled' : 'active',
      createdAt: String(fields[13] || new Date().toISOString()),
      updatedAt: String(fields[14] || fields[13] || new Date().toISOString()),
    } satisfies LegacyUser
  })
}

async function updateLegacyReferences(
  connection: QueryExecutor,
  legacyId: string,
  uuidId: string,
) {
  for (const reference of legacyReferenceColumns) {
    await connection.query(
      `UPDATE ${reference.table} SET ${reference.column} = :uuidId WHERE ${reference.column} = :legacyId`,
      { legacyId, uuidId },
    )
  }

  await connection.query(
    `INSERT IGNORE INTO announcement_users (announcement_id, user_id, created_at)
     SELECT announcement_id, :uuidId, created_at
     FROM announcement_users
     WHERE user_id = :legacyId`,
    { legacyId, uuidId },
  )
  await connection.query('DELETE FROM announcement_users WHERE user_id = :legacyId', { legacyId })

  await connection.query(
    `INSERT IGNORE INTO announcement_receipts (announcement_id, user_id, signed_at)
     SELECT announcement_id, :uuidId, signed_at
     FROM announcement_receipts
     WHERE user_id = :legacyId`,
    { legacyId, uuidId },
  )
  await connection.query('DELETE FROM announcement_receipts WHERE user_id = :legacyId', { legacyId })

  await connection.query(
    `INSERT IGNORE INTO user_checkins (id, user_id, reward_credits, checkin_date, user_ip, created_at)
     SELECT UUID(), :uuidId, reward_credits, checkin_date, user_ip, created_at
     FROM user_checkins
     WHERE user_id = :legacyId`,
    { legacyId, uuidId },
  )
  await connection.query('DELETE FROM user_checkins WHERE user_id = :legacyId', { legacyId })

  await connection.query(
    'UPDATE IGNORE user_invites SET invitee_id = :uuidId WHERE invitee_id = :legacyId',
    { legacyId, uuidId },
  )
  await connection.query('DELETE FROM user_invites WHERE invitee_id = :legacyId', { legacyId })
}

async function repairUserId(legacyId: string, uuidId: string) {
  if (legacyId === uuidId) return false

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

    if (!legacyUser) {
      await connection.rollback()
      return false
    }

    const [uuidRows] = await connection.query(
      'SELECT id, email FROM users WHERE id = :uuidId LIMIT 1 FOR UPDATE',
      { uuidId },
    )
    const uuidUser = Array.isArray(uuidRows)
      ? uuidRows[0] as { id: string; email: string } | undefined
      : undefined

    if (uuidUser && uuidUser.email !== legacyUser.email) {
      throw new Error(`无法迁移 ${legacyId}：目标 UUID ${uuidId} 已属于 ${uuidUser.email}`)
    }

    await updateLegacyReferences(connection, legacyId, uuidId)

    if (uuidUser) {
      await connection.query('DELETE FROM users WHERE id = :legacyId', { legacyId })
    } else {
      await connection.query('UPDATE users SET id = :uuidId WHERE id = :legacyId', {
        legacyId,
        uuidId,
      })
    }

    await connection.commit()
    return true
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

async function repairExistingLegacyUsers() {
  const legacyIds = new Set<string>()
  const [userRows] = await db.query('SELECT id FROM users WHERE id LIKE "legacy-%"')
  if (Array.isArray(userRows)) {
    for (const row of userRows as Array<{ id: string }>) {
      legacyIds.add(row.id)
    }
  }

  for (const reference of legacyReferenceColumns) {
    const [rows] = await db.query(
      `SELECT DISTINCT ${reference.column} AS id
       FROM ${reference.table}
       WHERE ${reference.column} LIKE "legacy-%"`,
    )
    if (Array.isArray(rows)) {
      for (const row of rows as Array<{ id: string }>) {
        legacyIds.add(row.id)
      }
    }
  }

  const [announcementUserRows] = await db.query(
    'SELECT DISTINCT user_id AS id FROM announcement_users WHERE user_id LIKE "legacy-%"',
  )
  if (Array.isArray(announcementUserRows)) {
    for (const row of announcementUserRows as Array<{ id: string }>) legacyIds.add(row.id)
  }

  const [announcementReceiptRows] = await db.query(
    'SELECT DISTINCT user_id AS id FROM announcement_receipts WHERE user_id LIKE "legacy-%"',
  )
  if (Array.isArray(announcementReceiptRows)) {
    for (const row of announcementReceiptRows as Array<{ id: string }>) legacyIds.add(row.id)
  }

  const [checkinRows] = await db.query(
    'SELECT DISTINCT user_id AS id FROM user_checkins WHERE user_id LIKE "legacy-%"',
  )
  if (Array.isArray(checkinRows)) {
    for (const row of checkinRows as Array<{ id: string }>) legacyIds.add(row.id)
  }

  const [inviteeRows] = await db.query(
    'SELECT DISTINCT invitee_id AS id FROM user_invites WHERE invitee_id LIKE "legacy-%"',
  )
  if (Array.isArray(inviteeRows)) {
    for (const row of inviteeRows as Array<{ id: string }>) legacyIds.add(row.id)
  }

  let repaired = 0

  for (const legacyId of legacyIds) {
    const oldId = parseLegacyUserId(legacyId)
    if (!oldId) continue
    const uuidId = legacyUserId(oldId)
    await updateLegacyReferences(db, legacyId, uuidId)
    const wasRepaired = await repairUserId(legacyId, uuidId)
    if (wasRepaired) repaired += 1
  }

  return repaired
}

async function importUser(user: LegacyUser) {
  const legacyId = `legacy-${user.oldId}`
  const id = legacyUserId(user.oldId)
  const [existingRows] = await db.query(
    `SELECT id, email
     FROM users
     WHERE id IN (:id, :legacyId) OR email = :email
     ORDER BY id = :id DESC, id = :legacyId DESC
     LIMIT 1`,
    { id, legacyId, email: user.email },
  )
  const existing = Array.isArray(existingRows) ? existingRows[0] as { id: string; email: string } | undefined : undefined
  if (existing) {
    if (existing.id === legacyId) {
      await repairUserId(legacyId, id)
    }
    const targetId = existing.id === legacyId ? id : existing.id
    await db.query(
      `UPDATE users
       SET email = :email,
           password_hash = :passwordHash,
           credits = :credits,
           role = :role,
           status = :status,
           email_verified_at = COALESCE(email_verified_at, :createdAt),
           updated_at = :updatedAt
       WHERE id = :targetId`,
      {
        targetId,
        email: user.email,
        passwordHash: user.passwordHash,
        credits: user.credits,
        role: user.role,
        status: user.status,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    )
    return 'updated'
  }

  await db.query(
    `INSERT INTO users
      (id, email, password_hash, credits, role, status, email_verified_at, created_at, updated_at)
     VALUES
      (:id, :email, :passwordHash, :credits, :role, :status, :createdAt, :createdAt, :updatedAt)`,
    {
      id,
      email: user.email,
      passwordHash: user.passwordHash,
      credits: user.credits,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    },
  )
  await db.query(
    `INSERT INTO credit_logs
      (id, user_id, type, amount, balance_after, remark, created_at)
     VALUES
      (:id, :userId, 'recharge', :amount, :balanceAfter, :remark, :createdAt)`,
    {
      id: randomUUID(),
      userId: id,
      amount: Math.max(0, user.credits),
      balanceAfter: user.credits,
      remark: `旧系统用户余额迁移（旧ID: ${user.oldId}，用户名: ${user.username || '-'}）`,
      createdAt: user.createdAt,
    },
  )
  return 'inserted'
}

async function main() {
  const filePath = process.argv[2]
  if (!filePath) {
    console.error(usage())
    process.exit(1)
  }

  const sql = await readFile(resolve(filePath), 'utf8')
  const users = parseLegacyUsers(sql)
  if (!users.length) {
    throw new Error('没有解析到旧用户数据')
  }

  await initializeDatabase()
  const repaired = await repairExistingLegacyUsers()
  let inserted = 0
  let updated = 0
  for (const user of users) {
    const result = await importUser(user)
    if (result === 'inserted') inserted += 1
    else updated += 1
  }

  console.log(`旧用户迁移完成：新增 ${inserted} 个，更新 ${updated} 个，修复旧ID ${repaired} 个，总计 ${users.length} 个。`)
  process.exit(0)
}

main().catch((error) => {
  console.error('旧用户迁移失败')
  console.error(error)
  process.exit(1)
})
