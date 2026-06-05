import { EventEmitter } from 'node:events'
import type { GenerationTask } from './taskTypes.js'

export type GenerationTaskProgress = {
  taskId: string
  stage: 'queued' | 'processing' | 'upstream' | 'partial' | 'finalizing'
  message: string
  detail?: string
  tags?: string[]
  createdAt: string
}

type TaskEventMap = {
  updated: [GenerationTask]
  progress: [GenerationTaskProgress]
}

class TaskEventBus extends EventEmitter {
  emitUpdated(task: GenerationTask | null) {
    if (task) {
      this.emit('updated', task)
    }
  }

  onUpdated(listener: (...args: TaskEventMap['updated']) => void) {
    this.on('updated', listener)
    return () => this.off('updated', listener)
  }

  emitProgress(progress: Omit<GenerationTaskProgress, 'createdAt'>) {
    this.emit('progress', {
      ...progress,
      createdAt: new Date().toISOString(),
    })
  }

  onProgress(listener: (...args: TaskEventMap['progress']) => void) {
    this.on('progress', listener)
    return () => this.off('progress', listener)
  }
}

export const taskEvents = new TaskEventBus()
