import { clientApi } from '../common/api.js'
import { chatStoragePrefix, createClientId, createSession, taskImages } from '../common/chatSession.js'
import { formatAmount, resolveOriginalImageUrl, resolveThumbnailImageUrl } from '../common/format.js'
import {
  getActiveModelsByCapability,
  getAvailableRatioOptions,
  getAvailableSizeTierOptions,
  getModelLabel,
  getModelVariantPrice,
  getSizeForRatio,
  quantityOptions,
} from '../common/options.js'
import { readTransferredPrompt } from '../common/promptTransfer.js'
import { subscribeGenerationTask } from '../common/taskSocket.js'

const { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } = Vue
const terminalTaskStatuses = ['success', 'failed', 'canceled']
const generatingStatuses = ['waiting', 'queued', 'pending', 'running', 'processing']
const orphanWaitingExpireMs = 3 * 60 * 1000
const maxReferenceImages = 5
const maxReferenceImageBytes = 5 * 1024 * 1024
const downloadTokenChars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
const generatingStages = [
  {
    key: 'queued',
    title: '正在构思画面...',
    detail: '任务已进入队列，正在准备生成参数',
    tags: ['队列', '参数', '构思'],
  },
  {
    key: 'processing',
    title: '正在生成图片...',
    detail: '已开始调用生成模型，请稍等片刻',
    tags: ['模型', '生成', '处理中'],
  },
  {
    key: 'upstream',
    title: '正在读取流式结果...',
    detail: '上游模型已开始返回生成数据',
    tags: ['流式', '读取', '同步'],
  },
  {
    key: 'render',
    title: '正在渲染高清图...',
    detail: '已收到预览结果，正在同步高清图像',
    tags: ['预览', '高清', '同步'],
  },
  {
    key: 'finalizing',
    title: '正在整理最终结果...',
    detail: '图片已经生成，正在保存结果',
    tags: ['保存', '扣费', '完成'],
  },
]

function isTerminalTaskStatus(status) {
  return terminalTaskStatuses.includes(status)
}

function isGeneratingStatus(status) {
  return generatingStatuses.includes(status)
}

function randomDownloadToken(length = 6) {
  const values = new Uint32Array(length)
  crypto.getRandomValues(values)
  return Array.from(values, (value) => downloadTokenChars[value % downloadTokenChars.length]).join('')
}

function sanitizeDownloadBaseName(value) {
  const cleaned = String(value || '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/\s+/g, '')
    .replace(/^[.]+|[.]+$/g, '')
    .slice(0, 42)
  return cleaned || '生成图片'
}

function imageExtensionFromUrl(value) {
  const text = String(value || '')
  const dataMatch = text.match(/^data:image\/([a-zA-Z0-9.+-]+);/i)
  if (dataMatch) return dataMatch[1].toLowerCase().replace('jpeg', 'jpg')
  const path = text.split(/[?#]/)[0] || ''
  const extensionMatch = path.match(/\.([a-zA-Z0-9]+)$/)
  const extension = extensionMatch?.[1]?.toLowerCase()
  return ['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif'].includes(extension)
    ? extension.replace('jpeg', 'jpg')
    : 'png'
}

export const ChatPage = {
  props: ['creditName', 'currentUser', 'siteName'],
  emits: ['login', 'preview', 'user-updated'],
  setup(props, { emit }) {
    const models = ref([])
    const modelId = ref('')
    const ratio = ref('1:1')
    const sizeTier = ref('2k')
    const quantity = ref(1)
    const prompt = ref('')
    const messages = ref([])
    const sessions = ref([createSession(1)])
    const activeSessionId = ref(sessions.value[0].id)
    const referenceImages = ref([])
    const fileInput = ref(null)
    const chatThread = ref(null)
    const unsubscribers = new Map()
    const storageKey = computed(() => props.currentUser?.id ? `${chatStoragePrefix}:${props.currentUser.id}` : '')
    const chatModels = computed(() => getActiveModelsByCapability(models.value))
    const selectedModel = computed(() => chatModels.value.find((item) => item.id === modelId.value))
    const availableRatios = computed(() => getAvailableRatioOptions(selectedModel.value))
    const availableSizeTiers = computed(() => getAvailableSizeTierOptions(selectedModel.value, ratio.value))
    const outputSize = computed(() => getSizeForRatio(ratio.value, sizeTier.value))
    const subscriptionDiscountPercent = computed(() => Number(props.currentUser?.subscription?.discountPercent || 0))
    const hasSubscriptionDiscount = computed(() => modelHasSubscriptionDiscount(selectedModel.value))
    const originalEstimatedCost = computed(() => getModelVariantPrice(selectedModel.value, ratio.value, sizeTier.value) * quantity.value)
    const estimatedCost = computed(() => discountedPrice(originalEstimatedCost.value))
    const activeSession = computed(() => sessions.value.find((item) => item.id === activeSessionId.value) || sessions.value[0])
    const orderedSessions = computed(() => [...sessions.value].sort((a, b) => (a.no || 0) - (b.no || 0)))
    const activeSessionLoading = computed(() => messages.value.some((message) => isGeneratingStatus(message.status)))

    function autoSessionTitle(no) {
      return `当前会话 #${no}`
    }

    function isAutoSessionTitle(title) {
      return /^当前会话 #\d+$/.test(String(title || ''))
    }

    function isLocalImageDataUrl(image) {
      return /^data:image\//i.test(String(image?.url || image || ''))
    }

    function normalizeReferenceImages(value) {
      if (Array.isArray(value)) return value.filter(Boolean).slice(0, maxReferenceImages)
      return value ? [value].slice(0, maxReferenceImages) : []
    }

    function persistableReferenceImage(image) {
      if (!image) return null
      if (image.source === 'upload' || isLocalImageDataUrl(image)) {
        return {
          name: image.name || '本地参考图',
          source: 'upload',
          omitted: true,
        }
      }
      return image
    }

    function persistableReferenceImages(images) {
      return normalizeReferenceImages(images).map(persistableReferenceImage).filter(Boolean)
    }

    function persistableMessage(message) {
      return {
        ...message,
        referenceImage: persistableReferenceImage(message.referenceImage),
        referenceImages: persistableReferenceImages(message.referenceImages || message.referenceImage),
      }
    }

    function persistableSession(session) {
      return {
        ...session,
        referenceImage: null,
        referenceImages: normalizeReferenceImages(session.referenceImages || session.referenceImage)
          .filter((image) => image?.source !== 'upload' && !isLocalImageDataUrl(image)),
        messages: (session.messages || []).map(persistableMessage),
      }
    }

    function serializedState() {
      return JSON.stringify({
        sessions: sessions.value.map(persistableSession),
        activeSessionId: activeSessionId.value,
      })
    }

    function saveState() {
      if (!storageKey.value) return
      try {
        localStorage.setItem(storageKey.value, serializedState())
      } catch (error) {
        if (error?.name !== 'QuotaExceededError') throw error
        const compactSessions = sessions.value.map((session) => ({
          ...persistableSession(session),
          messages: (session.messages || []).map((message) => {
            const nextMessage = persistableMessage(message)
            if (nextMessage.status && !isTerminalTaskStatus(nextMessage.status)) {
              return {
                ...nextMessage,
                text: '生成状态已中断，请刷新后查看任务结果',
                status: 'failed',
                errorMessage: '',
                progress: null,
              }
            }
            return nextMessage
          }),
        }))
        localStorage.setItem(storageKey.value, JSON.stringify({
          sessions: compactSessions,
          activeSessionId: activeSessionId.value,
        }))
        ElementPlus.ElMessage.warning('参考图较大，已只保存会话文字和生成结果')
      }
    }

    function readStoredState(key) {
      const raw = localStorage.getItem(key)
      if (!raw) return null
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed.sessions) || !parsed.sessions.length) return null
      return parsed
    }

    function isLegacyTaskSyncError(message) {
      const text = `${message?.text || ''}\n${message?.errorMessage || ''}`
      return text.includes('任务状态暂时无法同步') || text.includes('Failed to fetch')
    }

    function normalizeStoredMessages(messages = []) {
      let changed = false
      const nextMessages = []
      for (const message of messages) {
        const nextMessage = persistableMessage(message)
        if (nextMessage.referenceImage !== message.referenceImage) changed = true
        if (JSON.stringify(nextMessage.referenceImages || []) !== JSON.stringify(message.referenceImages || [])) changed = true
        if (!isLegacyTaskSyncError(message)) {
          nextMessages.push(nextMessage)
          continue
        }
        changed = true
        if (nextMessage.images?.length) {
          nextMessages.push({
            ...nextMessage,
            text: '生成完毕！',
            status: 'success',
            errorMessage: '',
          })
        }
      }
      return { messages: nextMessages, changed }
    }

    function normalizeStoredSessions(storedSessions = []) {
      let changed = false
      const nextSessions = storedSessions.map((session) => {
        const normalized = normalizeStoredMessages(session.messages || [])
        if (normalized.changed) changed = true
        const referenceImages = normalizeReferenceImages(session.referenceImages || session.referenceImage)
          .filter((image) => image?.source !== 'upload' && !isLocalImageDataUrl(image))
        if (JSON.stringify(referenceImages) !== JSON.stringify(session.referenceImages || [])) changed = true
        return {
          ...session,
          referenceImage: null,
          referenceImages,
          messages: normalized.messages,
        }
      })
      return { sessions: nextSessions, changed }
    }

    function loadState() {
      if (!storageKey.value) {
        resetLocalSessions()
        return
      }
      try {
        let parsed = readStoredState(storageKey.value)
        if (!parsed) {
          parsed = readStoredState(chatStoragePrefix)
          if (parsed) {
            localStorage.setItem(storageKey.value, JSON.stringify(parsed))
          }
        }
        if (!parsed) {
          resetLocalSessions()
          return
        }
        const normalized = normalizeStoredSessions(parsed.sessions)
        sessions.value = normalized.sessions
        normalizeSessionNumbers()
        activeSessionId.value = parsed.activeSessionId || parsed.sessions[0].id
        switchSession(sessions.value.find((item) => item.id === activeSessionId.value) || sessions.value[0])
        syncAllTaskMessages()
        if (normalized.changed) saveState()
      } catch {
        resetLocalSessions()
      }
    }

    function resetLocalSessions() {
      sessions.value = [createSession(1)]
      switchSession(sessions.value[0])
      saveState()
    }

    function normalizeSessionNumbers() {
      sessions.value = [...sessions.value]
        .sort((a, b) => (a.no || 0) - (b.no || 0))
        .map((session, index) => {
          const no = index + 1
          const customTitle = session.customTitle === true || (session.customTitle !== false && session.title && !isAutoSessionTitle(session.title))
          return {
            ...session,
            no,
            customTitle,
            title: customTitle ? session.title : autoSessionTitle(no),
          }
        })
    }

    function syncActiveSession() {
      const session = activeSession.value
      session.messages = messages.value
      session.prompt = prompt.value
      session.referenceImage = null
      session.referenceImages = referenceImages.value
      session.updatedAt = Date.now()
      saveState()
    }

    function syncSessionMessages(sessionId, nextMessages) {
      const session = sessions.value.find((item) => item.id === sessionId)
      if (!session) return false
      session.messages = nextMessages
      session.updatedAt = Date.now()
      if (sessionId === activeSessionId.value) messages.value = session.messages
      saveState()
      return true
    }

    function readSessionMessages(sessionId) {
      const session = sessions.value.find((item) => item.id === sessionId)
      return session ? session.messages || [] : []
    }

    function switchSession(session) {
      activeSessionId.value = session.id
      messages.value = session.messages || []
      prompt.value = session.prompt || ''
      referenceImages.value = normalizeReferenceImages(session.referenceImages || session.referenceImage)
      if (ensureDownloadTokensForMessages()) syncActiveSession()
      void syncTaskMessages(session.id)
      nextTick(scrollBottom)
    }

    function newSession() {
      if (!props.currentUser) {
        ElementPlus.ElMessage.warning('请先登录，登录后才能新建对话')
        emit('login')
        return
      }
      const no = Math.max(0, ...sessions.value.map((item) => item.no || 0)) + 1
      const session = createSession(no)
      sessions.value.push(session)
      switchSession(session)
      saveState()
    }

    function deleteSession(session) {
      if (sessions.value.length <= 1) {
        sessions.value = [createSession(1)]
        switchSession(sessions.value[0])
        return
      }
      sessions.value = sessions.value.filter((item) => item.id !== session.id)
      normalizeSessionNumbers()
      if (activeSessionId.value === session.id) switchSession(orderedSessions.value[0] || sessions.value[0])
      saveState()
    }

    async function renameSession(session) {
      if (!props.currentUser) {
        ElementPlus.ElMessage.warning('请先登录，登录后才能保存会话名称')
        emit('login')
        return
      }
      const currentTitle = session.title || autoSessionTitle(sessionNumber(session))
      try {
        const { value } = await ElementPlus.ElMessageBox.prompt('请输入新的会话名称', '重命名会话', {
          confirmButtonText: '保存',
          cancelButtonText: '取消',
          inputValue: currentTitle,
          inputPlaceholder: '例如：产品海报方案',
          inputValidator(value) {
            const title = String(value || '').trim()
            if (!title) return '名称不能为空'
            if (title.length > 20) return '最多输入 20 个字'
            return true
          },
        })
        session.title = String(value || '').trim()
        session.customTitle = true
        session.updatedAt = Date.now()
        sessions.value = [...sessions.value]
        saveState()
      } catch {}
    }

    function sessionNumber(session) {
      return session.no || orderedSessions.value.findIndex((item) => item.id === session.id) + 1
    }

    function sessionPreview(session) {
      return session.messages?.[session.messages.length - 1]?.text || '暂无消息，点击继续创作'
    }

    function sessionCount(session) {
      return session.messages?.length || 0
    }

    function discountedPrice(value) {
      const price = Number(value || 0)
      if (!hasSubscriptionDiscount.value) return price
      return Number((price * (1 - subscriptionDiscountPercent.value / 100)).toFixed(4))
    }

    function subscriptionAllowedForModel(model) {
      const subscription = props.currentUser?.subscription
      if (!subscription || subscription.status !== 'active' || !model) return false
      const providerIds = Array.isArray(subscription.allowedProviderIds) ? subscription.allowedProviderIds : []
      const modelIds = Array.isArray(subscription.allowedModelIds) ? subscription.allowedModelIds : []
      const providerAllowed = providerIds.length === 0 || providerIds.includes(model.providerId)
      const candidateModelIds = [model.id, ...(model.variants || []).map((item) => item.id)].filter(Boolean)
      const modelAllowed = modelIds.length === 0 || candidateModelIds.some((id) => modelIds.includes(id))
      return providerAllowed && modelAllowed
    }

    function modelHasSubscriptionDiscount(model) {
      return subscriptionDiscountPercent.value > 0 && subscriptionAllowedForModel(model)
    }

    function modelUnitOriginalPrice(model) {
      return getModelVariantPrice(model, ratio.value, sizeTier.value)
    }

    function modelUnitPrice(model) {
      const price = modelUnitOriginalPrice(model)
      if (!modelHasSubscriptionDiscount(model)) return price
      return Number((price * (1 - subscriptionDiscountPercent.value / 100)).toFixed(4))
    }

    function ratioIconStyle(value) {
      const [width = 1, height = 1] = String(value || '1:1').split(':').map((item) => Number(item) || 1)
      const max = Math.max(width, height)
      const normalizedWidth = Math.max(10, Math.round((width / max) * 26))
      const normalizedHeight = Math.max(10, Math.round((height / max) * 26))
      return {
        width: `${normalizedWidth}px`,
        height: `${normalizedHeight}px`,
      }
    }

    function scrollBottom() {
      if (chatThread.value) chatThread.value.scrollTop = chatThread.value.scrollHeight
    }

    function taskMessage(task, sourceMessages = messages.value) {
      const isSuccess = task.status === 'success'
      const images = isSuccess ? taskImages(task) : []
      const previous = sourceMessages.find((item) => item.taskId === task.id || item.id === `task-${task.id}`)
      const effectiveStatus = task.status
      const statusText = effectiveStatus === 'success'
        ? '生成完毕！'
        : effectiveStatus === 'failed'
          ? '生成失败'
          : effectiveStatus === 'canceled'
            ? '生成已取消'
            : effectiveStatus === 'queued'
              ? '任务已进入队列...'
              : effectiveStatus === 'processing'
                ? '正在生成图片...'
                : '正在生成图片...'
      return {
        id: `task-${task.id}`,
        role: 'assistant',
        text: statusText,
        taskId: task.id,
        status: effectiveStatus,
        errorMessage: task.errorMessage,
        images,
        thumbnails: task.thumbnailUrls?.length ? task.thumbnailUrls : task.thumbnailUrl ? [task.thumbnailUrl] : images,
        downloadTokens: createDownloadTokens(images.length, previous?.downloadTokens),
        size: task.size,
        createdAt: previous?.createdAt || task.createdAt || Date.now(),
        stageKey: resolveTaskStageKey(task, previous),
        progress: previous?.progress,
        updatedAt: task.updatedAt,
      }
    }

    function resolveTaskStageKey(task, previous) {
      if (task.status === 'queued' || task.status === 'pending' || task.status === 'waiting') return previous?.stageKey || 'queued'
      if (task.status !== 'processing') return previous?.stageKey || 'queued'
      return previous?.stageKey === 'render' ? 'render' : 'processing'
    }

    function createDownloadTokens(count, existing = []) {
      return Array.from({ length: count }, (_, index) => existing[index] || randomDownloadToken())
    }

    function ensureDownloadTokensForMessages() {
      let changed = false
      messages.value.forEach((message) => {
        if (!message.images?.length) return
        const tokens = createDownloadTokens(message.images.length, message.downloadTokens)
        if (tokens.some((token, index) => token !== message.downloadTokens?.[index])) {
          message.downloadTokens = tokens
          changed = true
        }
      })
      return changed
    }

    function downloadImageName(message, index, image = message.images?.[index]) {
      const token = message.downloadTokens?.[index] || randomDownloadToken()
      return `${sanitizeDownloadBaseName(activeSession.value?.title)}-${token}.${imageExtensionFromUrl(image)}`
    }

    function downloadImageUrl(message, image, index) {
      const filename = downloadImageName(message, index, image)
      if (message.taskId) {
        return `/api/tasks/${encodeURIComponent(message.taskId)}/images/${index}/download?filename=${encodeURIComponent(filename)}`
      }
      return resolveOriginalImageUrl(image)
    }

    function findSessionIdByTaskId(taskId) {
      return sessions.value.find((session) => (session.messages || []).some((message) => message.taskId === taskId || message.id === `task-${taskId}`))?.id || activeSessionId.value
    }

    function subscribeTask(taskId, sessionId = findSessionIdByTaskId(taskId)) {
      if (!taskId || unsubscribers.has(taskId)) return
      const unsubscribe = subscribeGenerationTask(taskId, (task) => applyTask(task, sessionId))
      unsubscribers.set(taskId, unsubscribe)
    }

    function applyProgress(progress, sessionId = findSessionIdByTaskId(progress?.taskId)) {
      if (!progress?.taskId) return
      const sessionMessages = [...readSessionMessages(sessionId)]
      const index = sessionMessages.findIndex((item) => item.taskId === progress.taskId || item.id === `task-${progress.taskId}`)
      if (index < 0) return
      const current = sessionMessages[index]
      const stageKey = progress.stage === 'partial' ? 'render' : progress.stage
      sessionMessages.splice(index, 1, {
        ...current,
        stageKey,
        progress,
      })
      syncSessionMessages(sessionId, sessionMessages)
    }

    function syncUserCreditsFromTask(task) {
      if (!props.currentUser || task.status !== 'success') return
      const remainingCredits = Number(task.remainingCredits)
      if (!Number.isFinite(remainingCredits)) return
      emit('user-updated', {
        ...props.currentUser,
        credits: remainingCredits,
      })
    }

    function applyTask(task, sessionId = findSessionIdByTaskId(task?.id)) {
      if (task?.__progress) {
        applyProgress(task, sessionId)
        return
      }
      const sessionMessages = [...readSessionMessages(sessionId)]
      const next = taskMessage(task, sessionMessages)
      const index = sessionMessages.findIndex((item) => item.taskId === task.id || item.id === next.id)
      if (index >= 0) sessionMessages.splice(index, 1, next)
      else sessionMessages.push(next)
      syncSessionMessages(sessionId, sessionMessages)
      if (sessionId === activeSessionId.value) nextTick(scrollBottom)
      syncUserCreditsFromTask(task)
      if (isTerminalTaskStatus(task.status)) {
        unsubscribers.get(task.id)?.()
        unsubscribers.delete(task.id)
        if (task.status === 'success' && props.currentUser?.id) {
          clientApi.getCurrentUser(props.currentUser.id).then((response) => {
            emit('user-updated', response.data)
          }).catch(() => {})
        }
      }
    }

    function bindWaitingMessageToTask(waitingId, task, sessionId = activeSessionId.value) {
      if (!waitingId || !task?.id) return
      const sessionMessages = [...readSessionMessages(sessionId)]
      const index = sessionMessages.findIndex((item) => item.id === waitingId)
      if (index < 0) return
      sessionMessages.splice(index, 1, {
        ...sessionMessages[index],
        id: `task-${task.id}`,
        taskId: task.id,
      })
      syncSessionMessages(sessionId, sessionMessages)
    }

    function expireOrphanWaitingMessages() {
      const now = Date.now()
      let changed = false
      messages.value = messages.value.map((message) => {
        if (!isGeneratingStatus(message.status) || message.taskId) return message
        const createdAt = Number(message.createdAt || 0)
        if (createdAt && now - createdAt <= orphanWaitingExpireMs) return message
        changed = true
        return {
          ...message,
          status: 'failed',
          text: '该生成任务已失效，请重新生成',
          errorMessage: '本地只保存了等待状态，没有拿到后台任务编号。',
        }
      })
      return changed
    }

    async function syncTaskMessages(sessionId = activeSessionId.value) {
      const expired = expireOrphanWaitingMessages()
      if (expired) syncActiveSession()
      const sessionMessages = readSessionMessages(sessionId)
      const taskIds = [...new Set(sessionMessages
        .filter((message) => message.taskId && (isGeneratingStatus(message.status) || message.status === 'success'))
        .map((message) => message.taskId))]
      for (const taskId of taskIds) {
        try {
          const response = await clientApi.getTask(taskId)
          const task = response.data
          applyTask(task, sessionId)
          if (!isTerminalTaskStatus(task.status)) subscribeTask(task.id, sessionId)
        } catch (error) {
          const message = readSessionMessages(sessionId).find((item) => item.taskId === taskId)
          if (message && isGeneratingStatus(message.status)) subscribeTask(taskId, sessionId)
        }
      }
    }

    function syncAllTaskMessages() {
      for (const session of sessions.value) {
        void syncTaskMessages(session.id)
      }
    }

    async function readGenerationStream(response, onTask, sessionId = activeSessionId.value) {
      if (!response.ok || !response.body) {
        const error = await response.json().catch(() => null)
        throw new Error(error?.message || '流式生成接口调用失败')
      }
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      const handleBlock = (block) => {
        const lines = block.split(/\r?\n/)
        const event = lines.find((line) => line.startsWith('event:'))?.replace(/^event:\s?/, '').trim() || 'message'
        const data = lines
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.replace(/^data:\s?/, ''))
          .join('\n')
          .trim()
        if (!data) return
        const payload = JSON.parse(data)
        if (event === 'task') onTask(payload)
        if (event === 'progress') applyProgress(payload, sessionId)
      }
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const blocks = buffer.split(/\r?\n\r?\n/)
        buffer = blocks.pop() || ''
        blocks.forEach(handleBlock)
      }
      if (buffer.trim()) handleBlock(buffer.trim())
    }

    async function createGenerationTask(payload, waitingId, sessionId = activeSessionId.value) {
      let firstTask = null
      try {
        const response = await clientApi.generateImageStream(payload)
        await readGenerationStream(response, (task) => {
          firstTask ||= task
          bindWaitingMessageToTask(waitingId, task, sessionId)
          applyTask(task, sessionId)
          if (!isTerminalTaskStatus(task.status)) subscribeTask(task.id, sessionId)
        }, sessionId)
        if (firstTask && !isTerminalTaskStatus(firstTask.status)) subscribeTask(firstTask.id, sessionId)
        return firstTask
      } catch (error) {
        if (firstTask?.id) {
          if (!isTerminalTaskStatus(firstTask.status)) subscribeTask(firstTask.id, sessionId)
          return firstTask
        }
        const response = await clientApi.generateImage(payload)
        bindWaitingMessageToTask(waitingId, response.data, sessionId)
        applyTask(response.data, sessionId)
        if (!isTerminalTaskStatus(response.data.status)) subscribeTask(response.data.id, sessionId)
        return response.data
      }
    }

    async function handleGenerate(text = prompt.value) {
      if (!props.currentUser) {
        emit('login')
        return
      }
      if (!text.trim()) {
        ElementPlus.ElMessage.warning('请输入提示词')
        return
      }
      if (!modelId.value) {
        ElementPlus.ElMessage.warning('请选择模型')
        return
      }
      const sessionId = activeSessionId.value
      const submittedReferenceImages = normalizeReferenceImages(referenceImages.value)
      const userMessage = {
        id: createClientId('message'),
        role: 'user',
        text: text.trim(),
        referenceImage: submittedReferenceImages[0] || null,
        referenceImages: submittedReferenceImages,
        createdAt: Date.now(),
      }
      const waitingId = `waiting-${userMessage.id}`
      const waitingMessage = { id: waitingId, role: 'assistant', text: '正在连接流式生成通道...', status: 'waiting', streamStage: 'connecting', createdAt: Date.now() }
      syncSessionMessages(sessionId, [...readSessionMessages(sessionId), userMessage, waitingMessage])
      prompt.value = ''
      referenceImages.value = []
      nextTick(scrollBottom)
      try {
        await createGenerationTask({
          userId: props.currentUser.id,
          modelId: modelId.value,
          prompt: userMessage.text,
          sizeTier: sizeTier.value,
          size: outputSize.value,
          quantity: quantity.value,
          referenceImageUrl: submittedReferenceImages[0]?.url,
          referenceImageUrls: submittedReferenceImages.map((image) => image.url).filter(Boolean),
        }, waitingId, sessionId)
      } catch (error) {
        const sessionMessages = readSessionMessages(sessionId).filter((item) => item.id !== waitingId)
        sessionMessages.push({ id: createClientId('message'), role: 'assistant', text: error.message || '生成失败', status: 'failed' })
        syncSessionMessages(sessionId, sessionMessages)
        ElementPlus.ElMessage.error(error.message || '生成失败')
      }
    }

    function useAsReference(url, name = '生成结果') {
      addReferenceImages([{ url: resolveOriginalImageUrl(url), name, source: 'result' }])
      syncActiveSession()
      ElementPlus.ElMessage.success('已设为参考图')
    }

    function referenceSourceLabel(image) {
      return image?.source === 'upload' ? '本地上传' : '生成结果'
    }

    function dataUrlBytes(dataUrl) {
      const base64 = String(dataUrl || '').split(',')[1] || ''
      return Math.ceil(base64.length * 0.75)
    }

    function loadImageElement(url) {
      return new Promise((resolve, reject) => {
        const image = new Image()
        image.onload = () => resolve(image)
        image.onerror = () => reject(new Error('参考图读取失败'))
        image.src = url
      })
    }

    function canvasToDataUrl(canvas, type, quality) {
      return canvas.toDataURL(type, quality)
    }

    async function compressImageFile(file) {
      const initialUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = () => reject(new Error('参考图读取失败'))
        reader.readAsDataURL(file)
      })
      if (dataUrlBytes(initialUrl) <= maxReferenceImageBytes) {
        return { url: initialUrl, compressed: false }
      }

      const image = await loadImageElement(initialUrl)
      let width = image.naturalWidth || image.width
      let height = image.naturalHeight || image.height
      let quality = 0.86
      let output = initialUrl

      for (let attempt = 0; attempt < 12; attempt += 1) {
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(width))
        canvas.height = Math.max(1, Math.round(height))
        const context = canvas.getContext('2d')
        context.drawImage(image, 0, 0, canvas.width, canvas.height)
        output = canvasToDataUrl(canvas, 'image/jpeg', quality)
        if (dataUrlBytes(output) <= maxReferenceImageBytes) {
          return { url: output, compressed: true }
        }
        if (quality > 0.55) quality -= 0.12
        else {
          width *= 0.82
          height *= 0.82
        }
      }

      if (dataUrlBytes(output) > maxReferenceImageBytes) {
        throw new Error(`${file.name} 压缩后仍超过 5MB，请换一张更小的图片`)
      }
      return { url: output, compressed: true }
    }

    function addReferenceImages(images) {
      const nextImages = [...referenceImages.value]
      let skipped = 0
      for (const image of images) {
        if (nextImages.length >= maxReferenceImages) {
          skipped += 1
          continue
        }
        nextImages.push(image)
      }
      referenceImages.value = nextImages
      if (skipped > 0) ElementPlus.ElMessage.warning(`最多只能添加 ${maxReferenceImages} 张参考图`)
      return skipped === 0
    }

    function removeReferenceImage(index) {
      referenceImages.value = referenceImages.value.filter((_, itemIndex) => itemIndex !== index)
      syncActiveSession()
    }

    function generatingStage(message) {
      if (message.progress?.message) {
        return {
          key: message.stageKey,
          title: message.progress.message,
          detail: message.progress.detail || '',
          tags: message.progress.tags?.length ? message.progress.tags : ['生成', '同步', '等待'],
        }
      }
      if (message.stageKey === 'render' || message.images?.length) {
        return generatingStages.find((stage) => stage.key === 'render') || generatingStages[0]
      }
      const fallbackKey = message.status === 'queued' || message.status === 'pending' || message.status === 'waiting'
        ? 'queued'
        : message.stageKey || 'processing'
      return generatingStages.find((stage) => stage.key === fallbackKey) || generatingStages[0]
    }

    function generatingTitle(message) {
      return String(generatingStage(message).title || '').replace(/[.。…]+$/u, '')
    }

    async function handleFile(event) {
      const files = Array.from(event.target.files || []).filter((file) => file.type.startsWith('image/'))
      if (!files.length) return
      const remaining = maxReferenceImages - referenceImages.value.length
      if (remaining <= 0) {
        ElementPlus.ElMessage.warning(`最多只能添加 ${maxReferenceImages} 张参考图`)
        event.target.value = ''
        return
      }
      const selectedFiles = files.slice(0, remaining)
      if (files.length > remaining) ElementPlus.ElMessage.warning(`最多只能添加 ${maxReferenceImages} 张参考图，已自动忽略多余图片`)
      try {
        const addedImages = []
        let compressedCount = 0
        for (const file of selectedFiles) {
          const compressed = await compressImageFile(file)
          if (compressed.compressed) compressedCount += 1
          addedImages.push({ url: compressed.url, name: file.name, source: 'upload' })
        }
        addReferenceImages(addedImages)
        syncActiveSession()
        if (compressedCount > 0) ElementPlus.ElMessage.success(`已自动压缩 ${compressedCount} 张参考图到 5MB 以内`)
      } catch (error) {
        ElementPlus.ElMessage.error(error.message || '参考图处理失败')
      }
      event.target.value = ''
    }

    onMounted(async () => {
      loadState()
      const transferred = readTransferredPrompt()
      if (transferred) {
        prompt.value = transferred.prompt
        if (transferred.imageUrl) {
          referenceImages.value = [{ url: transferred.imageUrl, name: transferred.title || '广场图片', source: 'result' }]
        }
      }
      try {
        const response = await clientApi.listModels()
        models.value = response.data || []
        modelId.value = chatModels.value[0]?.id || ''
      } catch (error) {
        ElementPlus.ElMessage.error(error.message || '模型加载失败')
      }
    })
    onBeforeUnmount(() => {
      for (const unsubscribe of unsubscribers.values()) unsubscribe()
      unsubscribers.clear()
    })
    watch([messages, prompt, referenceImages], syncActiveSession, { deep: true })
    watch(() => props.currentUser?.id || '', () => {
      loadState()
    })
    return {
      models,
      modelId,
      ratio,
      sizeTier,
      quantity,
      prompt,
      messages,
      sessions,
      orderedSessions,
      activeSessionId,
      referenceImages,
      maxReferenceImages,
      fileInput,
      loading: activeSessionLoading,
      chatThread,
      chatModels,
      selectedModel,
      availableRatios,
      availableSizeTiers,
      quantityOptions,
      outputSize,
      estimatedCost,
      originalEstimatedCost,
      hasSubscriptionDiscount,
      subscriptionDiscountPercent,
      modelHasSubscriptionDiscount,
      modelUnitOriginalPrice,
      modelUnitPrice,
      getModelLabel,
      getModelVariantPrice,
      isGeneratingStatus,
      normalizeReferenceImages,
      downloadImageName,
      downloadImageUrl,
      switchSession,
      newSession,
      deleteSession,
      renameSession,
      sessionNumber,
      sessionPreview,
      sessionCount,
      ratioIconStyle,
      handleGenerate,
      useAsReference,
      referenceSourceLabel,
      removeReferenceImage,
      generatingStage,
      generatingTitle,
      handleFile,
      resolveOriginalImageUrl,
      resolveThumbnailImageUrl,
      formatAmount,
    }
  },
  template: `
    <section class="chat-layout">
      <aside class="chat-sidebar">
        <div class="chat-sidebar-head">
          <div>
            <span>Sessions</span>
            <strong>创作会话</strong>
          </div>
          <small>{{ orderedSessions.length }} 个</small>
        </div>
        <el-button class="new-session-button" type="primary" title="新建对话" aria-label="新建对话" @click="newSession">
          <i class="ti ti-plus"></i>
        </el-button>
        <div class="session-strip">
          <div class="session-list">
            <article v-for="session in orderedSessions" :key="session.id" :class="{ active: activeSessionId === session.id }" class="session-item" role="button" tabindex="0" @click="switchSession(session)" @keydown.enter="switchSession(session)">
              <div class="session-index">{{ sessionNumber(session) }}</div>
              <div class="session-main">
                <div class="session-title-row">
                  <strong :title="session.title">{{ session.title }}</strong>
                  <button class="session-rename" type="button" :title="currentUser ? '修改名称' : '登录后可保存名称'" @click.stop="renameSession(session)">
                    <i class="ti ti-pencil"></i>
                  </button>
                </div>
                <small>{{ sessionPreview(session) }}</small>
              </div>
              <div class="session-meta">
                <span class="session-count-badge">{{ sessionCount(session) }} 条</span>
                <button class="session-delete" type="button" title="删除会话" @click.stop="deleteSession(session)">
                  <i class="ti ti-trash"></i>
                </button>
              </div>
            </article>
          </div>
        </div>
      </aside>
      <section class="chat-panel">
        <header class="chat-header">
          <div>
            <small>Current model</small>
            <strong>{{ getModelLabel(selectedModel) }}</strong>
          </div>
          <div class="chat-specs">
            <span>{{ ratio }}</span>
            <span>{{ sizeTier.toUpperCase() }}</span>
            <span>{{ outputSize }}</span>
          </div>
        </header>
        <div class="chat-thread" ref="chatThread">
          <div v-if="messages.length === 0" class="chat-empty">
            <div class="chat-empty-icon"><i class="ti ti-sparkles"></i></div>
            <strong>开始一次图像创作</strong>
            <p>输入提示词，选择比例和清晰度，就可以生成图片。也可以上传参考图进行二次创作。</p>
            <div class="empty-tip-row">
              <span>产品海报</span>
              <span>头像写真</span>
              <span>场景插画</span>
            </div>
          </div>
          <div v-for="message in messages" :key="message.id" :class="['message', message.role]">
            <div class="avatar">{{ message.role === 'user' ? '我' : 'AI' }}</div>
            <div :class="['bubble', { 'generating-bubble': isGeneratingStatus(message.status) }]">
              <template v-if="isGeneratingStatus(message.status)">
                <div class="generating-card">
                  <div class="generating-orb"><i class="ti ti-sparkles"></i></div>
                  <div class="generating-copy">
                    <strong>
                      {{ generatingTitle(message) }}
                      <span class="generating-title-dots"><i></i><i></i><i></i></span>
                    </strong>
                    <span>{{ generatingStage(message).detail }}</span>
                  </div>
                  <div class="generating-progress"><i></i></div>
                  <div class="generating-tags">
                    <span v-for="tag in generatingStage(message).tags" :key="tag">{{ tag }}</span>
                  </div>
                </div>
              </template>
              <p v-else>{{ message.text }}</p>
              <p v-if="message.errorMessage" style="color:var(--red)">{{ message.errorMessage }}</p>
              <div v-if="normalizeReferenceImages(message.referenceImages || message.referenceImage).length" class="reference-preview-list">
                <div v-for="(image, index) in normalizeReferenceImages(message.referenceImages || message.referenceImage)" :key="image.url || image.name || index" :class="['reference-preview', { 'is-omitted': image.omitted }]">
                  <img v-if="image.url" :src="image.url" alt="参考图" />
                  <span v-else>
                    <i class="ti ti-photo-off"></i>
                    本地参考图未保存
                  </span>
                </div>
              </div>
              <div v-if="message.images?.length" class="result-grid">
                <div v-for="(image, index) in message.images" :key="image" class="result-item">
                  <img :src="message.thumbnails?.[index] || image" alt="生成结果" @click="$emit('preview', { url: resolveOriginalImageUrl(image), title: '生成结果' })" />
                  <div class="card-actions">
                    <button class="result-action" type="button" @click="$emit('preview', { url: resolveOriginalImageUrl(image), title: '生成结果' })">
                      <i class="ti ti-maximize"></i>
                      放大
                    </button>
                    <button class="result-action primary" type="button" @click="useAsReference(image)">
                      <i class="ti ti-wand"></i>
                      改图
                    </button>
                    <a class="result-action" :href="downloadImageUrl(message, image, index)" :download="downloadImageName(message, index)">
                      <i class="ti ti-download"></i>
                      下载
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <footer class="composer-card">
          <div class="composer-grid">
            <div class="composer-field composer-model">
              <span>模型</span>
              <el-select v-model="modelId" placeholder="选择模型" popper-class="composer-select-popper model-select-popper">
                <template #label="{ label }">
                  <span class="composer-selected model-selected">
                    <i class="ti ti-robot composer-select-icon"></i>
                    {{ label }}
                  </span>
                </template>
                <el-option v-for="model in chatModels" :key="model.id" :label="getModelLabel(model)" :value="model.id">
                  <span class="composer-option model-option">
                    <i class="ti ti-robot composer-select-icon"></i>
                    <span class="model-option-main">{{ getModelLabel(model) }}</span>
                    <span class="model-option-price">
                      <template v-if="modelHasSubscriptionDiscount(model)">
                        <del>{{ formatAmount(modelUnitOriginalPrice(model)) }}</del>
                        <b>{{ formatAmount(modelUnitPrice(model)) }}</b>
                      </template>
                      <template v-else>{{ formatAmount(modelUnitOriginalPrice(model)) }}</template>
                      {{ creditName }}
                    </span>
                  </span>
                </el-option>
              </el-select>
            </div>
            <div class="composer-field">
              <span>比例</span>
              <el-select v-model="ratio" popper-class="composer-select-popper ratio-select-popper">
                <template #label="{ label }">
                  <span class="composer-selected ratio-selected">
                    <i class="ratio-shape" :style="ratioIconStyle(label)"></i>
                    {{ label }}
                  </span>
                </template>
                <el-option v-for="item in availableRatios" :key="item" :label="item" :value="item">
                  <span class="composer-option ratio-option">
                    <i class="ratio-shape" :style="ratioIconStyle(item)"></i>
                    <span>{{ item }}</span>
                  </span>
                </el-option>
              </el-select>
            </div>
            <div class="composer-field">
              <span>清晰度</span>
              <el-select v-model="sizeTier" popper-class="composer-select-popper">
                <template #label="{ label }">
                  <span class="composer-selected">
                    <i class="ti ti-badge-hd composer-select-icon"></i>
                    {{ label }}
                  </span>
                </template>
                <el-option v-for="item in availableSizeTiers" :key="item" :label="item.toUpperCase()" :value="item">
                  <span class="composer-option">
                    <i class="ti ti-badge-hd composer-select-icon"></i>
                    <span>{{ item.toUpperCase() }}</span>
                  </span>
                </el-option>
              </el-select>
            </div>
            <div class="composer-field">
              <span>数量</span>
              <el-select v-model="quantity" popper-class="composer-select-popper">
                <template #label="{ label }">
                  <span class="composer-selected">
                    <i class="ti ti-copy composer-select-icon"></i>
                    {{ label }}
                  </span>
                </template>
                <el-option v-for="item in quantityOptions" :key="item" :label="item + ' 张'" :value="item">
                  <span class="composer-option">
                    <i class="ti ti-copy composer-select-icon"></i>
                    <span>{{ item }} 张</span>
                  </span>
                </el-option>
              </el-select>
            </div>
            <span class="cost-chip">
              <i class="ti ti-coins"></i>
              <template v-if="hasSubscriptionDiscount">
                <em>会员价</em>
                <del>{{ formatAmount(originalEstimatedCost) }}</del>
                <strong>{{ formatAmount(estimatedCost) }}</strong>
                {{ creditName }}
              </template>
              <template v-else>
                扣费 {{ formatAmount(estimatedCost) }} {{ creditName }}
              </template>
            </span>
          </div>
          <div v-if="referenceImages.length" class="composer-reference-card">
            <div class="composer-reference-thumbs">
              <div v-for="(image, index) in referenceImages" :key="image.url || image.name || index" class="composer-reference-thumb">
                <img :src="image.url" alt="参考图" />
                <button type="button" title="移除参考图" @click="removeReferenceImage(index)">
                  <i class="ti ti-x"></i>
                </button>
              </div>
            </div>
            <div class="composer-reference-info">
              <small>参考素材</small>
              <strong>{{ referenceImages.length }} / {{ maxReferenceImages }} 张参考图</strong>
              <span>{{ referenceImages.map(referenceSourceLabel).join('、') }} · 每张不超过 5MB</span>
            </div>
            <button class="composer-reference-remove" type="button" @click="referenceImages = []">
              <i class="ti ti-x"></i>
              清空
            </button>
          </div>
          <div class="composer-input">
            <input ref="fileInput" type="file" accept="image/*" multiple hidden @change="handleFile" />
            <button class="reference-button" type="button" @click="fileInput.click()">
              <i class="ti ti-photo-plus"></i>
              <span>参考图</span>
            </button>
            <div class="prompt-box">
              <el-input v-model="prompt" type="textarea" placeholder="描述你想生成或修改的图片..." />
            </div>
            <el-button
              :class="['generate-button', { 'is-loading': loading }]"
              type="primary"
              :disabled="loading"
              :title="loading ? '生成中' : '生成'"
              :aria-label="loading ? '生成中' : '生成'"
              @click="handleGenerate()"
            >
              <i :class="['ti', loading ? 'ti-loader-2' : 'ti-sparkles']"></i>
              <span class="generate-button-text">{{ loading ? '生成中' : '生成' }}</span>
            </el-button>
          </div>
        </footer>
      </section>
    </section>
  `,
}
