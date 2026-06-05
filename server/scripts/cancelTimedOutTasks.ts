import { initializeDatabase } from '../config/migrate.js'
import { SettingService } from '../modules/settings/settingService.js'
import { TaskService } from '../modules/tasks/taskService.js'

async function main() {
  await initializeDatabase()
  const settingService = new SettingService()
  const taskService = new TaskService()
  const settings = await settingService.getSettings()
  const timeoutMinutes = Math.max(1, Math.floor(settings.taskTimeoutMinutes || 3))
  const canceledTasks = await taskService.cancelTimedOutRunningTasks(timeoutMinutes)
  console.log(`已自动关闭 ${canceledTasks.length} 个超过 ${timeoutMinutes} 分钟的生成中任务`)
}

main().catch((error) => {
  console.error('清理超时任务失败')
  console.error(error)
  process.exit(1)
})
