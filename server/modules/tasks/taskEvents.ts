import { EventEmitter } from 'node:events'
import type { GenerationTask } from './taskTypes.js'

type TaskEventMap = {
  updated: [GenerationTask]
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
}

export const taskEvents = new TaskEventBus()
