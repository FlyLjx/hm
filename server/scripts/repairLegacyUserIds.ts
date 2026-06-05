import { db, rootDb } from '../config/db.js'
import { initializeDatabase } from '../config/migrate.js'
import { repairLegacyUserIds } from '../config/legacyUserIdRepair.js'

async function main() {
  await initializeDatabase({ repairLegacyUserIds: false })
  const stats = await repairLegacyUserIds()
  console.log(
    `旧用户ID修复完成：发现 ${stats.found} 个，用户 ${stats.repairedUsers} 个，关联 ${stats.repairedReferences} 条，跳过 ${stats.skipped} 个。`,
  )
  await db.end()
  await rootDb.end()
}

main().catch(async (error) => {
  console.error('旧用户ID修复失败')
  console.error(error)
  await db.end()
  await rootDb.end()
  process.exit(1)
})
