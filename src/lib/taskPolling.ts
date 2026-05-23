import { clientApi, getWsBaseUrl, type GenerationTask } from '../api/clientApi'

function isTerminalTask(task: GenerationTask) {
  return !['queued', 'pending', 'processing'].includes(task.status)
}

function summarizeTask(task: GenerationTask) {
  return {
    id: task.id,
    status: task.status,
    sizeTier: task.sizeTier,
    size: task.size,
    quantity: task.quantity,
    costCredits: task.costCredits,
    remainingCredits: task.remainingCredits,
    durationSeconds: task.durationSeconds,
    errorMessage: task.errorMessage,
    resultUrl: task.resultUrl?.startsWith('data:image/')
      ? `data:image/*;base64,length=${task.resultUrl.length}`
      : task.resultUrl,
    resultUrls: task.resultUrls?.map((url) =>
      url.startsWith('data:image/') ? `data:image/*;base64,length=${url.length}` : url,
    ),
  }
}

async function pollTaskByHttp(
  taskId: string,
  onUpdate: (task: GenerationTask) => void,
) {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const response = await clientApi.getTask(taskId)
    console.info('[task-http:update]', {
      attempt: attempt + 1,
      task: summarizeTask(response.data),
    })
    onUpdate(response.data)

    if (isTerminalTask(response.data)) {
      return response.data
    }

    await new Promise((resolve) => {
      window.setTimeout(resolve, 1500)
    })
  }

  throw new Error('任务处理超时，请稍后在任务列表查看')
}

function watchTaskByWebSocket(
  taskId: string,
  onUpdate: (task: GenerationTask) => void,
) {
  return new Promise<GenerationTask>((resolve, reject) => {
    const wsUrl = `${getWsBaseUrl()}/ws/tasks`
    const socket = new WebSocket(wsUrl)
    let settled = false

    const finish = (callback: () => void) => {
      if (settled) return
      settled = true
      window.clearTimeout(fallbackTimer)
      callback()
    }

    const fallbackTimer = window.setTimeout(() => {
      console.warn('[task-ws:timeout]', { taskId, wsUrl })
      socket.close()
      finish(() => reject(new Error('WS连接超时')))
    }, 5000)

    socket.onopen = () => {
      window.clearTimeout(fallbackTimer)
      console.info('[task-ws:open]', { taskId, wsUrl })
      socket.send(JSON.stringify({ type: 'subscribe', taskId }))
    }

    socket.onmessage = (event) => {
      const message = JSON.parse(event.data) as {
        type?: string
        data?: GenerationTask | null
        message?: string
      }

      if (message.type === 'error') {
        console.error('[task-ws:error-message]', { taskId, message: message.message })
        socket.close()
        finish(() => reject(new Error(message.message || '任务订阅失败')))
        return
      }

      if (message.type !== 'task' || !message.data) return

      console.info('[task-ws:update]', { task: summarizeTask(message.data) })
      onUpdate(message.data)

      if (isTerminalTask(message.data)) {
        console.info('[task-ws:terminal]', { task: summarizeTask(message.data) })
        socket.close()
        finish(() => resolve(message.data!))
      }
    }

    socket.onerror = () => {
      console.error('[task-ws:error]', { taskId, wsUrl })
      finish(() => reject(new Error('WS连接失败')))
    }

    socket.onclose = (event) => {
      window.clearTimeout(fallbackTimer)
      console.info('[task-ws:close]', {
        taskId,
        code: event.code,
        reason: event.reason,
        wasClean: event.wasClean,
        settled,
      })

      if (!settled) {
        finish(() => reject(new Error('WS连接提前关闭')))
      }
    }
  })
}

export async function pollGenerationTask(
  taskId: string,
  onUpdate: (task: GenerationTask) => void,
) {
  try {
    return await watchTaskByWebSocket(taskId, onUpdate)
  } catch (error) {
    console.warn('[task-http:fallback]', {
      taskId,
      reason: error instanceof Error ? error.message : 'WS连接失败',
    })
    return pollTaskByHttp(taskId, onUpdate)
  }
}
