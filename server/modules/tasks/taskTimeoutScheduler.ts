import { SettingService } from '../settings/settingService.js'
import { TaskService } from './taskService.js'

const checkIntervalMs = 60 * 1000

function formatLogTime(date = new Date()) {
  return date.toLocaleString('zh-CN', {
    hour12: false,
    timeZone: 'Asia/Shanghai',
  })
}

export function startTaskTimeoutScheduler() {
  const taskService = new TaskService()
  const settingService = new SettingService()
  let running = false
  console.info(`[task-timeout] scheduler started at ${formatLogTime()}, interval=${Math.round(checkIntervalMs / 1000)}s`)

  const checkTimedOutTasks = async () => {
    if (running) {
      console.info(`[task-timeout] skip check at ${formatLogTime()}, previous check still running`)
      return
    }
    running = true
    const startedAt = Date.now()
    try {
      const settings = await settingService.getSettings()
      const timeoutMinutes = Math.max(1, Math.floor(settings.taskTimeoutMinutes || 3))
      const canceledTasks = await taskService.cancelTimedOutRunningTasks(timeoutMinutes)
      console.info(
        `[task-timeout] checked at ${formatLogTime()}, timeout=${timeoutMinutes}m, canceled=${canceledTasks.length}, duration=${Date.now() - startedAt}ms`,
      )
    } catch (error) {
      console.error(`[task-timeout] failed at ${formatLogTime()}, duration=${Date.now() - startedAt}ms`)
      console.error(error)
    } finally {
      running = false
    }
  }

  void checkTimedOutTasks()
  const timer = setInterval(checkTimedOutTasks, checkIntervalMs)

  return () => {
    clearInterval(timer)
    console.info(`[task-timeout] scheduler stopped at ${formatLogTime()}`)
  }
}
