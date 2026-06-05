import { EventEmitter } from 'node:events'
import type { PublicUser } from './userTypes.js'

type UserEventMap = {
  updated: [PublicUser]
}

class UserEventBus extends EventEmitter {
  emitUpdated(user: PublicUser | null | undefined) {
    if (user) {
      this.emit('updated', user)
    }
  }

  onUpdated(listener: (...args: UserEventMap['updated']) => void) {
    this.on('updated', listener)
    return () => this.off('updated', listener)
  }
}

export const userEvents = new UserEventBus()
