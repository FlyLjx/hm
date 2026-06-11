import '../config/env.js'
import { TaskRepository } from '../modules/tasks/taskRepository.js'

function detectImageContentType(buffer: Buffer, fallback = 'image/png') {
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png'
  if (buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return 'image/jpeg'
  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp'
  if (buffer.subarray(0, 6).toString('ascii').startsWith('GIF')) return 'image/gif'
  return fallback.startsWith('image/') ? fallback : 'image/png'
}

function imageDataUrl(buffer: Buffer, contentType: string) {
  return `data:${contentType};base64,${buffer.toString('base64')}`
}

async function fetchImageAsDataUrl(url: string) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const buffer = Buffer.from(await response.arrayBuffer())
  const contentType = detectImageContentType(buffer, response.headers.get('content-type') ?? 'image/png')
  return imageDataUrl(buffer, contentType)
}

async function main() {
  const limit = Number(process.argv.find((item) => item.startsWith('--limit='))?.split('=')[1] || 200)
  const repository = new TaskRepository()
  const tasks = await repository.findTasksWithRemoteResultImages(limit)
  let converted = 0
  let failed = 0

  for (const task of tasks) {
    for (const [index, url] of task.urls.entries()) {
      if (!/^https?:\/\//i.test(url)) continue
      try {
        const dataUrl = await fetchImageAsDataUrl(url)
        const ok = await repository.materializeImageUrlByIndex(task.id, index, dataUrl)
        if (ok) converted += 1
        console.info('[materialize-task-images:converted]', { taskId: task.id, index })
      } catch (error) {
        failed += 1
        console.warn('[materialize-task-images:failed]', {
          taskId: task.id,
          index,
          url,
          errorMessage: error instanceof Error ? error.message : String(error),
        })
      }
    }
  }

  console.info('[materialize-task-images:done]', {
    tasks: tasks.length,
    converted,
    failed,
  })
}

main().then(() => {
  process.exit(0)
}).catch((error) => {
  console.error(error)
  process.exit(1)
})
