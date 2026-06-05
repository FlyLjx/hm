export const chatStoragePrefix = 'aipi-web-chat-sessions'

export function createClientId(prefix = 'id') {
  if (crypto?.randomUUID) return crypto.randomUUID()

  const randomPart = new Uint32Array(4)
  if (crypto?.getRandomValues) {
    crypto.getRandomValues(randomPart)
  } else {
    randomPart.forEach((_, index) => {
      randomPart[index] = Math.floor(Math.random() * 0xffffffff)
    })
  }

  const entropy = Array.from(randomPart, (value) => value.toString(16).padStart(8, '0')).join('')
  return `${prefix}-${Date.now().toString(36)}-${entropy}`
}

export function createSession(no = 1) {
  return {
    id: createClientId('session'),
    no,
    title: `当前会话 #${no}`,
    customTitle: false,
    messages: [],
    prompt: '',
    referenceImage: null,
    referenceImages: [],
    currentTask: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

export function taskImages(task) {
  return task?.resultUrls?.length ? task.resultUrls : task?.resultUrl ? [task.resultUrl] : []
}
