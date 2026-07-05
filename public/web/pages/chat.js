import { clientApi } from '../common/api.js'
import { chatStoragePrefix, createClientId, createSession, taskImages } from '../common/chatSession.js'
import { resolveOriginalImageUrl, resolveThumbnailImageUrl } from '../common/format.js'
import {
  getActiveModelsByCapability,
  getAvailableRatioOptions,
  getAvailableSizeTierOptions,
  getModelLabel,
  getModelVariantPrice,
  getSizeForRatio,
  quantityOptions,
} from '../common/options.js'
import { readTransferredPrompt } from '../common/promptTransfer.js?v=20260704-brand-ai-pai'
import { subscribeGenerationTask } from '../common/taskSocket.js'

const { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } = Vue
const terminalTaskStatuses = ['success', 'failed', 'canceled']
const generatingStatuses = ['waiting', 'queued', 'pending', 'running', 'processing']
const orphanWaitingExpireMs = 3 * 60 * 1000
const maxReferenceImages = 10
const maxReferenceImageBytes = 5 * 1024 * 1024
const maskBrushRgb = '22, 163, 91'
const maskPreviewColor = '#16a35b'
const nonPassiveTouchListener = { passive: false }
const downloadTokenChars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
const outputFormatOptions = [
  { value: 'jpeg', label: 'JPG' },
  { value: 'png', label: 'PNG' },
  { value: 'webp', label: 'WEBP' },
]
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
    tags: ['保存', '同步', '完成'],
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
  props: ['currentUser', 'settings', 'siteName'],
  emits: ['login', 'preview', 'user-updated'],
  setup(props, { emit }) {
    const models = ref([])
    const modelId = ref('')
    const ratio = ref('1:1')
    const sizeTier = ref('2k')
    const quantity = ref(1)
    const outputFormat = ref('jpeg')
    const transparentBackground = ref(false)
    const prompt = ref('')
    const messages = ref([])
    const sessions = ref([createSession(1)])
    const activeSessionId = ref(sessions.value[0].id)
    const referenceImages = ref([])
    const fileInput = ref(null)
    const chatThread = ref(null)
    const maskEditorOpen = ref(false)
    const maskEditor = ref({ sourceUrl: '', prompt: '', brushSize: 42, brushOpacity: 64, drawing: false, loading: false, lastPoint: null })
    const maskCanvas = ref(null)
    const maskImageCanvas = ref(null)
    const perspectiveEditorOpen = ref(false)
    const perspectiveEditor = ref({ sourceUrl: '', sourceName: '', sourceIndex: -1, points: [], draggingIndex: null, loading: false })
    const perspectiveCanvas = ref(null)
    const perspectiveOverlayCanvas = ref(null)
    let perspectiveDragListening = false
    const unsubscribers = new Map()
    const failedTaskNotices = new Set()
    const storageKey = computed(() => props.currentUser?.id ? `${chatStoragePrefix}:${props.currentUser.id}` : '')
    const chatModels = computed(() => getActiveModelsByCapability(models.value))
    const selectedModel = computed(() => chatModels.value.find((item) => item.id === modelId.value))
    const availableRatios = computed(() => getAvailableRatioOptions(selectedModel.value))
    const availableSizeTiers = computed(() => getAvailableSizeTierOptions(selectedModel.value, ratio.value))
    const outputSize = computed(() => getSizeForRatio(ratio.value, sizeTier.value))
    const currentSubscription = computed(() => props.currentUser?.subscription || null)
    const subscriptionDiscountPercent = computed(() => Number(props.currentUser?.subscription?.discountPercent || 0))
    const hasSubscriptionDiscount = computed(() => modelHasSubscriptionDiscount(selectedModel.value))
    const activeSession = computed(() => sessions.value.find((item) => item.id === activeSessionId.value) || sessions.value[0])
    const orderedSessions = computed(() => [...sessions.value].sort((a, b) => (a.no || 0) - (b.no || 0)))
    const activeSessionLoading = computed(() => messages.value.some((message) => isGeneratingStatus(message.status)))
    const streamGenerationEnabled = computed(() => {
      const value = props.settings?.streamGenerationEnabled
      return value === true || value === 'true' || value === 1 || value === '1'
    })

    watch(transparentBackground, (enabled) => {
      if (enabled) outputFormat.value = 'png'
    })

    watch(outputFormat, (format) => {
      transparentBackground.value = format === 'png'
    })
    watch(availableSizeTiers, (items) => {
      if (items.length && !items.includes(sizeTier.value)) {
        sizeTier.value = items[0]
      }
    }, { immediate: true })

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
      if (subscriptionDiscountPercent.value >= 100) return 0
      return Number((price * (1 - subscriptionDiscountPercent.value / 100)).toFixed(4))
    }

    function subscriptionIsPaid(subscription) {
      return Boolean(subscription?.isPaid || subscription?.tier === 'paid' || (subscription?.status === 'active' && subscription?.planId))
    }

    function subscriptionAllowedForModel(model) {
      const subscription = props.currentUser?.subscription
      if (!subscriptionIsPaid(subscription) || !model) return false
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
      const subscriptionDiscount = modelHasSubscriptionDiscount(model) ? subscriptionDiscountPercent.value : 0
      if (subscriptionDiscount <= 0) return price
      if (subscriptionDiscount >= 100) return 0
      return Number((price * (1 - subscriptionDiscount / 100)).toFixed(4))
    }

    function hasAnyDiscount(model = selectedModel.value) {
      return modelUnitPrice(model) < modelUnitOriginalPrice(model)
    }

    function priceBadgeText(model = selectedModel.value) {
      const subscriptionDiscount = modelHasSubscriptionDiscount(model) ? subscriptionDiscountPercent.value : 0
      if (subscriptionDiscount > 0) return '会员价'
      return ''
    }

    function quotaRemaining() {
      if (!currentSubscription.value) return freeQuotaLimit()
      const value = Number(currentSubscription.value?.quotaRemaining)
      return Number.isFinite(value) && value >= 0 ? value : quotaLimit()
    }

    function quotaLimit() {
      if (!currentSubscription.value) return freeQuotaLimit()
      const fallback = subscriptionIsPaid(currentSubscription.value) ? 0 : freeQuotaLimit()
      const value = Number(currentSubscription.value?.quotaLimit || currentSubscription.value?.quotaImages)
      return Number.isFinite(value) && value > 0 ? value : fallback
    }

    function freeQuotaLimit(scope = 'month') {
      const keyMap = {
        hour: 'freeHourlyGenerationQuota',
        day: 'freeDailyGenerationQuota',
        month: 'freeGenerationQuota',
      }
      const fallbackMap = { hour: 2, day: 5, month: 10 }
      const key = keyMap[scope] || keyMap.month
      const value = Number(props.settings?.[key])
      return Number.isFinite(value) && value >= 0 ? value : (fallbackMap[scope] || fallbackMap.month)
    }

    function fallbackFreeQuotaWindows() {
      return [
        { key: 'hour', label: '小时', quotaLimit: freeQuotaLimit('hour'), quotaUsed: 0, quotaRemaining: freeQuotaLimit('hour') },
        { key: 'day', label: '今日', quotaLimit: freeQuotaLimit('day'), quotaUsed: 0, quotaRemaining: freeQuotaLimit('day') },
        { key: 'month', label: '本月', quotaLimit: freeQuotaLimit('month'), quotaUsed: 0, quotaRemaining: freeQuotaLimit('month') },
      ]
    }

    function freeQuotaWindows() {
      const windows = Array.isArray(currentSubscription.value?.quotaWindows) ? currentSubscription.value.quotaWindows : []
      return windows.length ? windows : fallbackFreeQuotaWindows()
    }

    function freeEffectiveQuotaRemaining() {
      const explicit = Number(currentSubscription.value?.effectiveQuotaRemaining)
      if (Number.isFinite(explicit) && explicit >= 0) return explicit
      const values = freeQuotaWindows().map((item) => Number(item.quotaRemaining)).filter((value) => Number.isFinite(value) && value >= 0)
      return values.length ? Math.min(...values) : freeQuotaLimit()
    }

    function freeQuotaRows() {
      return freeQuotaWindows().map((item) => {
        const label = item.label || ({ hour: '小时', day: '今日', month: '本月' }[item.key] || '周期')
        const remaining = Number.isFinite(Number(item.quotaRemaining)) ? Math.max(0, Number(item.quotaRemaining)) : Number(item.quotaLimit || 0)
        const limit = Number.isFinite(Number(item.quotaLimit)) ? Math.max(0, Number(item.quotaLimit)) : 0
        return { key: item.key || label, label, remaining, limit }
      })
    }

    function freeQuotaLimitingRow(rows, effectiveRemaining) {
      if (!rows.length) return null
      const order = { hour: 1, day: 2, month: 3 }
      const candidates = rows
        .filter((row) => row.remaining === effectiveRemaining)
        .sort((left, right) => (order[left.key] || 99) - (order[right.key] || 99))
      if (candidates.length) return candidates[0]
      return [...rows].sort((left, right) => left.remaining - right.remaining)[0]
    }

    function decoratedFreeQuotaRows() {
      const rows = freeQuotaRows()
      const effective = Math.max(0, Number(freeEffectiveQuotaRemaining()) || 0)
      const limiting = freeQuotaLimitingRow(rows, effective)
      return rows.map((row) => {
        const displayRemaining = Math.min(row.remaining, effective)
        const limitedByOtherWindow = limiting && limiting.key !== row.key && displayRemaining < row.remaining
        return {
          ...row,
          remaining: displayRemaining,
          rawRemaining: row.remaining,
          limitNote: limitedByOtherWindow ? `受${limiting.label}限制` : '',
          empty: displayRemaining <= 0,
        }
      })
    }

    function freeQuotaSummary() {
      return decoratedFreeQuotaRows().map((item) => {
        const suffix = item.limitNote ? `（${item.limitNote}）` : ''
        return `${item.label} ${item.remaining}/${item.limit}${suffix}`
      }).join(' · ')
    }

    function quotaChipText() {
      const remaining = subscriptionIsPaid(currentSubscription.value) ? quotaRemaining() : freeEffectiveQuotaRemaining()
      return subscriptionIsPaid(currentSubscription.value) ? `本周期剩余 ${remaining} 张` : `免费额度剩余 ${remaining} 张`
    }

    function quotaChipTitle() {
      return subscriptionIsPaid(currentSubscription.value) ? '订阅额度' : '免费额度'
    }

    function quotaChipValue() {
      const remaining = subscriptionIsPaid(currentSubscription.value) ? quotaRemaining() : freeEffectiveQuotaRemaining()
      return `${remaining} 张`
    }

    function quotaWindowPills() {
      if (subscriptionIsPaid(currentSubscription.value)) return []
      return decoratedFreeQuotaRows()
    }

    function quotaChipNote() {
      if (!subscriptionIsPaid(currentSubscription.value)) {
        return `本次消耗 ${Number(quantity.value || 1)} 张 · ${freeQuotaSummary()}`
      }
      return `本次消耗 ${Number(quantity.value || 1)} 张 · 周期额度 ${quotaLimit()} 张`
    }

    function hasEnoughGenerationQuota() {
      const remaining = subscriptionIsPaid(currentSubscription.value) ? quotaRemaining() : freeEffectiveQuotaRemaining()
      return remaining >= Number(quantity.value || 1)
    }

    function quotaInsufficientMessage() {
      return subscriptionIsPaid(currentSubscription.value)
        ? '本周期生成额度不足，请续费或升级订阅'
        : '免费版额度不足，请稍后再试或开通订阅'
    }

    function refreshCurrentUser() {
      if (!props.currentUser?.id) return
      clientApi.getCurrentUser(props.currentUser.id).then((response) => {
        emit('user-updated', response.data)
      }).catch(() => {})
    }

    function modelSelectLabel(model) {
      if (!model) return ''
      return getModelLabel(model)
    }

    function resolveTransferredModelId(input) {
      const candidates = [input?.modelId, input?.model]
        .map((item) => String(item || '').trim())
        .filter(Boolean)
      if (!candidates.length) return ''
      const model = chatModels.value.find((item) => {
        const values = [item.id, item.modelName, item.displayName, getModelLabel(item)]
          .map((value) => String(value || '').trim())
          .filter(Boolean)
        return values.some((value) => candidates.includes(value))
      })
      return model?.id || ''
    }

    function applyTransferredGenerationOptions(input) {
      const transferredModelId = resolveTransferredModelId(input)
      const fallbackModelId = chatModels.value[0]?.id || ''
      modelId.value = transferredModelId || fallbackModelId

      const ratios = getAvailableRatioOptions(selectedModel.value)
      const transferredRatio = String(input?.ratio || '').trim()
      if (transferredRatio && ratios.includes(transferredRatio)) {
        ratio.value = transferredRatio
      } else if (ratios.length && !ratios.includes(ratio.value)) {
        ratio.value = ratios[0]
      }

      const tiers = getAvailableSizeTierOptions(selectedModel.value, ratio.value)
      const transferredSizeTier = String(input?.sizeTier || '').trim()
      if (transferredSizeTier && tiers.includes(transferredSizeTier)) {
        sizeTier.value = transferredSizeTier
      } else if (tiers.length && !tiers.includes(sizeTier.value)) {
        sizeTier.value = tiers[0]
      }
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

    function aspectRatioFromSize(value) {
      const match = String(value || '').match(/(\d+)\D+(\d+)/)
      if (!match) return ''
      const width = Number(match[1])
      const height = Number(match[2])
      if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return ''
      return `${width} / ${height}`
    }

    function resultImageAspectRatio(message, index) {
      const measuredRatio = Number(message?.imageAspectRatios?.[index])
      if (Number.isFinite(measuredRatio) && measuredRatio > 0) return `${measuredRatio} / 1`
      return aspectRatioFromSize(message?.size) || '1 / 1'
    }

    function resultImageStyle(message, index) {
      return { aspectRatio: resultImageAspectRatio(message, index) }
    }

    function rememberResultImageRatio(event, message, index) {
      const image = event?.target
      const width = Number(image?.naturalWidth || image?.width)
      const height = Number(image?.naturalHeight || image?.height)
      if (!message || !Number.isInteger(index) || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return
      const ratio = Number((width / height).toFixed(4))
      if (Number(message.imageAspectRatios?.[index]) === ratio) return
      const nextRatios = [...(message.imageAspectRatios || [])]
      nextRatios[index] = ratio
      message.imageAspectRatios = nextRatios
    }

    function cleanDisplayErrorMessage(value) {
      return String(value || '')
        .replace(/\s*\/\s*invalid_request_error\s*\/\s*content_policy_violation\s*$/i, '')
        .replace(/\s*\/\s*content_policy_violation\s*$/i, '')
        .trim()
    }

    function isThreadNearBottom(offset = 96) {
      if (!chatThread.value) return true
      const distance = chatThread.value.scrollHeight - chatThread.value.scrollTop - chatThread.value.clientHeight
      return distance <= offset
    }

    function scrollBottom() {
      if (chatThread.value) chatThread.value.scrollTop = chatThread.value.scrollHeight
    }

    function taskMessage(task, sourceMessages = messages.value) {
      const isSuccess = task.status === 'success'
      const taskResultImages = taskImages(task)
      const previous = sourceMessages.find((item) => item.taskId === task.id || item.id === `task-${task.id}`)
      const preservePreviousImages = previous?.images?.length && task.status === 'failed' && taskResultImages.length === 0
      const images = preservePreviousImages
        ? previous.images
        : isSuccess || taskResultImages.length
          ? taskResultImages
          : []
      const hiddenImageIndexes = (previous?.hiddenImageIndexes || []).filter((index) => index >= 0 && index < images.length)
      const activeImageIndex = Math.min(previous?.activeImageIndex || 0, Math.max(0, images.length - 1))
      const effectiveStatus = preservePreviousImages ? 'success' : task.status
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
        errorMessage: preservePreviousImages ? '' : cleanDisplayErrorMessage(task.errorMessage),
        images,
        thumbnails: preservePreviousImages
          ? previous.thumbnails?.length ? previous.thumbnails : images
          : task.thumbnailUrls?.length ? task.thumbnailUrls : task.thumbnailUrl ? [task.thumbnailUrl] : images,
        activeImageIndex,
        hiddenImageIndexes,
        downloadTokens: createDownloadTokens(images.length, previous?.downloadTokens),
        imageAspectRatios: previous?.imageAspectRatios,
        galleryExpanded: previous?.galleryExpanded === true,
        favoriteEnabled: task.favoriteEnabled,
        publicStatus: task.publicStatus,
        displayNote: task.displayNote,
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

    function visibleResultIndexes(message) {
      const hiddenIndexes = new Set(message.hiddenImageIndexes || [])
      return (message.images || [])
        .map((image, index) => ({ image, index }))
        .filter((item) => String(item.image || '').trim() && !hiddenIndexes.has(item.index))
        .map((item) => item.index)
    }

    function activeResultIndex(message) {
      const visibleIndexes = visibleResultIndexes(message)
      if (!visibleIndexes.length) return 0
      const index = Number(message.activeImageIndex || 0)
      return visibleIndexes.includes(index) ? index : visibleIndexes[0]
    }

    function activeResultImage(message) {
      return message.images?.[activeResultIndex(message)]
    }

    function activeResultThumbnail(message) {
      const index = activeResultIndex(message)
      return message.thumbnails?.[index] || message.images?.[index]
    }

    function selectResultImage(message, index) {
      message.activeImageIndex = Number(index) || 0
    }

    function openResultImage(message, index) {
      selectResultImage(message, index)
      if (!isResultGalleryExpanded(message)) toggleResultGallery(message)
    }

    function isResultGalleryExpanded(message) {
      return message?.galleryExpanded === true
    }

    function toggleResultGallery(message) {
      message.galleryExpanded = !message.galleryExpanded
    }

    function resultGalleryStackStyle(message, index) {
      const visibleIndexes = visibleResultIndexes(message)
      const foldedIndex = visibleIndexes.indexOf(index)
      const safeIndex = Math.max(0, foldedIndex)
      const offset = Math.min(safeIndex, 4)
      const rotate = [-1.6, 1.2, -0.9, 1.8, -1.1][offset] || 0
      return {
        ...resultImageStyle(message, index),
        '--stack-offset': `${offset * 10}px`,
        '--stack-rotate': `${rotate}deg`,
        '--stack-z': String(20 - offset),
      }
    }

    function hideBrokenImage(event, message, index) {
      event.target?.closest?.('.result-main-card, .result-gallery-item, .result-thumb')?.classList.add('image-load-failed')
      if (!message || !Number.isInteger(index)) return
      const hiddenIndexes = new Set(message.hiddenImageIndexes || [])
      hiddenIndexes.add(index)
      message.hiddenImageIndexes = [...hiddenIndexes]
      const nextVisibleIndex = (message.images || []).findIndex((image, itemIndex) => String(image || '').trim() && !hiddenIndexes.has(itemIndex))
      message.activeImageIndex = nextVisibleIndex >= 0 ? nextVisibleIndex : 0
    }

    function allResultImagesBroken(message) {
      return Boolean(message?.images?.length) && visibleResultIndexes(message).length === 0
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
      const shouldKeepBottom = sessionId === activeSessionId.value && isThreadNearBottom()
      syncSessionMessages(sessionId, sessionMessages)
      if (shouldKeepBottom) nextTick(scrollBottom)
      if (task.status === 'failed' && task.errorMessage && !failedTaskNotices.has(task.id)) {
        failedTaskNotices.add(task.id)
        ElementPlus.ElMessage.error(cleanDisplayErrorMessage(task.errorMessage))
      }
      if (isTerminalTaskStatus(task.status)) {
        unsubscribers.get(task.id)?.()
        unsubscribers.delete(task.id)
        if (props.currentUser?.id) {
          refreshCurrentUser()
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
        .filter((message) => message.taskId && isGeneratingStatus(message.status))
        .map((message) => message.taskId))]
      for (const taskId of taskIds) {
        subscribeTask(taskId, sessionId)
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
      if (!streamGenerationEnabled.value) {
        const response = await clientApi.generateImage(payload)
        bindWaitingMessageToTask(waitingId, response.data, sessionId)
        applyTask(response.data, sessionId)
        refreshCurrentUser()
        if (!isTerminalTaskStatus(response.data.status)) subscribeTask(response.data.id, sessionId)
        return response.data
      }

      let firstTask = null
      let quotaRefreshed = false
      try {
        const response = await clientApi.generateImageStream(payload)
        await readGenerationStream(response, (task) => {
          firstTask ||= task
          bindWaitingMessageToTask(waitingId, task, sessionId)
          applyTask(task, sessionId)
          if (!quotaRefreshed) {
            quotaRefreshed = true
            refreshCurrentUser()
          }
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
        refreshCurrentUser()
        if (!isTerminalTaskStatus(response.data.status)) subscribeTask(response.data.id, sessionId)
        return response.data
      }
    }

    async function handleGenerate(text = prompt.value, extraPayload = {}, options = {}) {
      if (!props.currentUser) {
        emit('login')
        return
      }
      if (!hasEnoughGenerationQuota()) {
        ElementPlus.ElMessage.warning(quotaInsufficientMessage())
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
      const displayReferenceImages = normalizeReferenceImages(options.displayReferenceImages ?? submittedReferenceImages)
      const userMessage = {
        id: createClientId('message'),
        role: 'user',
        text: text.trim(),
        referenceImage: displayReferenceImages[0] || null,
        referenceImages: displayReferenceImages,
        createdAt: Date.now(),
      }
      const waitingId = `waiting-${userMessage.id}`
      const waitingMessage = {
        id: waitingId,
        role: 'assistant',
        text: streamGenerationEnabled.value ? '正在连接流式生成通道...' : '正在提交生成任务...',
        status: 'waiting',
        streamStage: 'connecting',
        createdAt: Date.now(),
      }
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
          outputFormat: outputFormat.value,
          transparentBackground: transparentBackground.value || outputFormat.value === 'png',
          quantity: quantity.value,
          referenceImageUrl: submittedReferenceImages[0]?.url,
          referenceImageUrls: submittedReferenceImages.map((image) => image.url).filter(Boolean),
          ...extraPayload,
        }, waitingId, sessionId)
      } catch (error) {
        const sessionMessages = readSessionMessages(sessionId).filter((item) => item.id !== waitingId)
        sessionMessages.push({
          id: createClientId('message'),
          role: 'assistant',
          text: '生成失败',
          status: 'failed',
          errorMessage: cleanDisplayErrorMessage(error.message || '生成失败'),
        })
        syncSessionMessages(sessionId, sessionMessages)
        ElementPlus.ElMessage.error(cleanDisplayErrorMessage(error.message || '生成失败'))
      }
    }

    function useAsReference(url, name = '生成结果') {
      addReferenceImages([{ url: resolveOriginalImageUrl(url), name, source: 'result' }])
      syncActiveSession()
      ElementPlus.ElMessage.success('已设为参考图')
    }

    function patchTaskMessage(taskId, patch) {
      if (!taskId) return
      const sessionId = findSessionIdByTaskId(taskId)
      const sessionMessages = [...readSessionMessages(sessionId)]
      const index = sessionMessages.findIndex((item) => item.taskId === taskId || item.id === `task-${taskId}`)
      if (index < 0) return
      sessionMessages.splice(index, 1, { ...sessionMessages[index], ...patch })
      syncSessionMessages(sessionId, sessionMessages)
    }

    async function toggleFavorite(message) {
      if (!props.currentUser) {
        emit('login')
        return
      }
      if (!message.taskId) return
      try {
        const nextValue = !message.favoriteEnabled
        const response = await clientApi.updateTaskFavorite(message.taskId, { userId: props.currentUser.id, favoriteEnabled: nextValue })
        patchTaskMessage(message.taskId, {
          favoriteEnabled: response.data?.favoriteEnabled ?? nextValue,
          publicStatus: response.data?.publicStatus ?? message.publicStatus,
        })
        ElementPlus.ElMessage.success(nextValue ? '已收藏' : '已取消收藏')
      } catch (error) {
        ElementPlus.ElMessage.error(error.message || '收藏失败')
      }
    }

    async function requestPublic(message) {
      if (!props.currentUser) {
        emit('login')
        return
      }
      if (!message.taskId || message.publicStatus === 'pending' || message.publicStatus === 'approved') return
      try {
        const response = await clientApi.requestTaskPublic(message.taskId, { userId: props.currentUser.id, displayNote: message.displayNote || prompt.value || '公开作品' })
        patchTaskMessage(message.taskId, {
          publicStatus: response.data?.publicStatus ?? 'pending',
          displayNote: response.data?.displayNote ?? message.displayNote,
        })
        ElementPlus.ElMessage.success('已提交公开审核')
      } catch (error) {
        ElementPlus.ElMessage.error(error.message || '提交失败')
      }
    }

    function publicActionLabel(message) {
      if (message.publicStatus === 'approved') return '已公开'
      if (message.publicStatus === 'pending') return '审核中'
      if (message.publicStatus === 'rejected') return '重新公开'
      return '公开'
    }

    async function openMaskEditor(url) {
      const sourceUrl = resolveOriginalImageUrl(url)
      maskEditor.value = { sourceUrl, prompt: prompt.value || '', brushSize: 42, brushOpacity: 64, drawing: false, loading: false, lastPoint: null }
      maskEditorOpen.value = true
      await nextTick()
      await setupMaskCanvas(sourceUrl)
    }

    async function setupMaskCanvas(sourceUrl) {
      const image = await loadImageElement(sourceUrl)
      const maxWidth = 860
      const scale = Math.min(1, maxWidth / (image.naturalWidth || image.width || maxWidth))
      const width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale))
      const height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale))
      const sourceCanvas = maskImageCanvas.value
      const drawCanvas = maskCanvas.value
      if (!sourceCanvas || !drawCanvas) return
      ;[sourceCanvas, drawCanvas].forEach((canvas) => {
        canvas.width = width
        canvas.height = height
      })
      const sourceContext = sourceCanvas.getContext('2d')
      sourceContext.clearRect(0, 0, width, height)
      sourceContext.drawImage(image, 0, 0, width, height)
      clearMask()
    }

    function clearMask() {
      const canvas = maskCanvas.value
      if (!canvas) return
      const context = canvas.getContext('2d')
      context.clearRect(0, 0, canvas.width, canvas.height)
    }

    function maskPoint(event) {
      const canvas = maskCanvas.value
      const rect = canvas.getBoundingClientRect()
      const source = event.touches?.[0] || event
      return {
        x: ((source.clientX - rect.left) / rect.width) * canvas.width,
        y: ((source.clientY - rect.top) / rect.height) * canvas.height,
      }
    }

    function drawMaskStroke(point) {
      const canvas = maskCanvas.value
      if (!canvas) return
      const context = canvas.getContext('2d')
      const brushSize = Number(maskEditor.value.brushSize || 42)
      const brushOpacity = Math.max(5, Math.min(100, Number(maskEditor.value.brushOpacity || 64))) / 100
      const lastPoint = maskEditor.value.lastPoint
      context.globalCompositeOperation = 'source-over'
      context.strokeStyle = `rgba(${maskBrushRgb}, ${brushOpacity})`
      context.fillStyle = `rgba(${maskBrushRgb}, ${brushOpacity})`
      context.lineWidth = brushSize
      context.lineCap = 'round'
      context.lineJoin = 'round'
      context.beginPath()
      if (lastPoint) {
        context.moveTo(lastPoint.x, lastPoint.y)
        context.lineTo(point.x, point.y)
        context.stroke()
      } else {
        context.arc(point.x, point.y, brushSize / 2, 0, Math.PI * 2)
        context.fill()
      }
      maskEditor.value.lastPoint = point
    }

    function startMaskDraw(event) {
      event.preventDefault()
      maskEditor.value.drawing = true
      maskEditor.value.lastPoint = null
      drawMaskStroke(maskPoint(event))
    }

    function moveMaskDraw(event) {
      if (!maskEditor.value.drawing) return
      event.preventDefault()
      drawMaskStroke(maskPoint(event))
    }

    function stopMaskDraw() {
      maskEditor.value.drawing = false
      maskEditor.value.lastPoint = null
    }

    function exportEditMaskDataUrl() {
      const canvas = maskCanvas.value
      if (!canvas) return ''
      const output = document.createElement('canvas')
      output.width = canvas.width
      output.height = canvas.height
      const context = output.getContext('2d')
      context.fillStyle = '#000'
      context.fillRect(0, 0, output.width, output.height)
      context.globalCompositeOperation = 'destination-out'
      context.drawImage(canvas, 0, 0)
      return output.toDataURL('image/png')
    }

    function exportMaskPreviewDataUrl() {
      const sourceCanvas = maskImageCanvas.value
      const drawCanvas = maskCanvas.value
      if (!sourceCanvas || !drawCanvas) return ''
      const output = document.createElement('canvas')
      output.width = sourceCanvas.width
      output.height = sourceCanvas.height
      const context = output.getContext('2d')
      context.drawImage(sourceCanvas, 0, 0)
      const overlay = document.createElement('canvas')
      overlay.width = output.width
      overlay.height = output.height
      const overlayContext = overlay.getContext('2d')
      const brushOpacity = Math.max(5, Math.min(100, Number(maskEditor.value.brushOpacity || 64))) / 100
      context.globalAlpha = Math.min(0.86, Math.max(0.18, brushOpacity))
      context.fillStyle = maskPreviewColor
      context.globalCompositeOperation = 'source-over'
      context.fillRect(0, 0, output.width, output.height)
      context.globalAlpha = 1
      context.globalCompositeOperation = 'destination-in'
      context.drawImage(drawCanvas, 0, 0)
      overlayContext.drawImage(sourceCanvas, 0, 0)
      overlayContext.drawImage(output, 0, 0)
      return overlay.toDataURL('image/png')
    }

    async function submitMaskEdit() {
      if (!props.currentUser) {
        emit('login')
        return
      }
      const text = maskEditor.value.prompt.trim()
      if (!text) {
        ElementPlus.ElMessage.warning('请输入蒙版编辑提示词')
        return
      }
      const canvas = maskCanvas.value
      if (!canvas) return
      const maskImageUrl = exportEditMaskDataUrl()
      const maskPreviewUrl = exportMaskPreviewDataUrl()
      maskEditor.value.loading = true
      try {
        maskEditorOpen.value = false
        await handleGenerate(text, {
          referenceImageUrl: maskEditor.value.sourceUrl,
          referenceImageUrls: [maskEditor.value.sourceUrl],
          maskImageUrl,
        }, {
          displayReferenceImages: [{
            url: maskPreviewUrl || maskEditor.value.sourceUrl,
            name: '蒙版编辑预览',
            source: 'mask',
          }],
        })
      } finally {
        maskEditor.value.loading = false
      }
    }

    function referenceSourceLabel(image) {
      if (image?.source === 'mask') return '蒙版编辑'
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

    function readFileAsDataUrl(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = () => reject(new Error('参考图读取失败'))
        reader.readAsDataURL(file)
      })
    }

    async function compressImageFile(file) {
      const initialUrl = await readFileAsDataUrl(file)
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

    async function addReferenceFiles(files, source = 'upload') {
      const imageFiles = Array.from(files || []).filter((file) => file.type?.startsWith('image/'))
      if (!imageFiles.length) return 0
      const remaining = maxReferenceImages - referenceImages.value.length
      if (remaining <= 0) {
        ElementPlus.ElMessage.warning(`最多只能添加 ${maxReferenceImages} 张参考图`)
        return 0
      }
      const selectedFiles = imageFiles.slice(0, remaining)
      if (imageFiles.length > remaining) ElementPlus.ElMessage.warning(`最多只能添加 ${maxReferenceImages} 张参考图，已自动忽略多余图片`)
      const addedImages = []
      let compressedCount = 0
      for (const file of selectedFiles) {
        const compressed = await compressImageFile(file)
        if (compressed.compressed) compressedCount += 1
        addedImages.push({ url: compressed.url, name: file.name || '粘贴图片', source })
      }
      addReferenceImages(addedImages)
      syncActiveSession()
      if (compressedCount > 0) ElementPlus.ElMessage.success(`已自动压缩 ${compressedCount} 张参考图到 5MB 以内`)
      return addedImages.length
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

    async function handlePasteReferenceImage(event) {
      const target = event.target
      const isTypingTarget = target?.closest?.('textarea, input, [contenteditable="true"]')
      const files = Array.from(event.clipboardData?.files || []).filter((file) => file.type?.startsWith('image/'))
      const itemFiles = Array.from(event.clipboardData?.items || [])
        .filter((item) => item.kind === 'file' && item.type?.startsWith('image/'))
        .map((item) => item.getAsFile())
        .filter(Boolean)
      const images = files.length ? files : itemFiles
      if (!images.length) return
      event.preventDefault()
      try {
        const addedCount = await addReferenceFiles(images.map((file, index) => {
          if (file.name) return file
          return new File([file], `粘贴参考图-${Date.now()}-${index + 1}.png`, { type: file.type || 'image/png' })
        }), 'upload')
        if (addedCount > 0) ElementPlus.ElMessage.success(isTypingTarget ? '已从剪贴板添加参考图' : `已粘贴 ${addedCount} 张参考图`)
      } catch (error) {
        ElementPlus.ElMessage.error(error.message || '粘贴参考图失败')
      }
    }

    function distanceBetweenPoints(a, b) {
      return Math.hypot((a?.x || 0) - (b?.x || 0), (a?.y || 0) - (b?.y || 0))
    }

    function defaultPerspectivePoints(width, height) {
      const paddingX = Math.max(24, width * 0.08)
      const paddingY = Math.max(24, height * 0.08)
      return [
        { x: paddingX, y: paddingY },
        { x: width - paddingX, y: paddingY },
        { x: width - paddingX, y: height - paddingY },
        { x: paddingX, y: height - paddingY },
      ]
    }

    function getPerspectivePointer(event) {
      const canvas = perspectiveOverlayCanvas.value
      if (!canvas) return { x: 0, y: 0 }
      const rect = canvas.getBoundingClientRect()
      const source = event.touches?.[0] || event
      return {
        x: ((source.clientX - rect.left) / rect.width) * canvas.width,
        y: ((source.clientY - rect.top) / rect.height) * canvas.height,
      }
    }

    function drawPerspectiveOverlay() {
      const canvas = perspectiveOverlayCanvas.value
      if (!canvas) return
      const context = canvas.getContext('2d')
      const points = perspectiveEditor.value.points || []
      context.clearRect(0, 0, canvas.width, canvas.height)
      if (points.length !== 4) return
      context.fillStyle = 'rgba(58, 195, 105, 0.22)'
      context.strokeStyle = '#35bf64'
      context.lineWidth = Math.max(2, canvas.width / 360)
      context.beginPath()
      context.moveTo(points[0].x, points[0].y)
      points.slice(1).forEach((point) => context.lineTo(point.x, point.y))
      context.closePath()
      context.fill()
      context.stroke()
      points.forEach((point, index) => {
        context.beginPath()
        context.fillStyle = '#35bf64'
        context.strokeStyle = '#ffffff'
        context.lineWidth = 2
        context.arc(point.x, point.y, Math.max(7, canvas.width / 80), 0, Math.PI * 2)
        context.fill()
        context.stroke()
        context.fillStyle = '#ffffff'
        context.font = `700 ${Math.max(10, canvas.width / 52)}px sans-serif`
        context.textAlign = 'center'
        context.textBaseline = 'middle'
        context.fillText(String(index + 1), point.x, point.y)
      })
    }

    async function openPerspectiveEditor(image, index) {
      if (!image?.url) return
      const sourceUrl = image.url
      perspectiveEditor.value = { sourceUrl, sourceName: image.name || '参考图', sourceIndex: index, points: [], draggingIndex: null, loading: false }
      perspectiveEditorOpen.value = true
      await nextTick()
      await setupPerspectiveCanvas(sourceUrl)
    }

    async function setupPerspectiveCanvas(sourceUrl) {
      const image = await loadImageElement(sourceUrl)
      const maxWidth = 860
      const maxHeight = Math.max(320, Math.min(window.innerHeight * 0.66, 720))
      const scale = Math.min(1, maxWidth / (image.naturalWidth || image.width || maxWidth), maxHeight / (image.naturalHeight || image.height || maxHeight))
      const width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale))
      const height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale))
      const sourceCanvas = perspectiveCanvas.value
      const overlayCanvas = perspectiveOverlayCanvas.value
      if (!sourceCanvas || !overlayCanvas) return
      ;[sourceCanvas, overlayCanvas].forEach((canvas) => {
        canvas.width = width
        canvas.height = height
      })
      const context = sourceCanvas.getContext('2d')
      context.clearRect(0, 0, width, height)
      context.drawImage(image, 0, 0, width, height)
      perspectiveEditor.value.points = defaultPerspectivePoints(width, height)
      drawPerspectiveOverlay()
    }

    function startPerspectiveDrag(event) {
      event.preventDefault()
      const point = getPerspectivePointer(event)
      const points = perspectiveEditor.value.points || []
      let nearestIndex = -1
      let nearestDistance = Infinity
      points.forEach((item, index) => {
        const distance = distanceBetweenPoints(point, item)
        if (distance < nearestDistance) {
          nearestDistance = distance
          nearestIndex = index
        }
      })
      if (nearestIndex >= 0) {
        perspectiveEditor.value.draggingIndex = nearestIndex
        addPerspectiveDragListeners()
      }
      movePerspectivePoint(event)
    }

    function movePerspectivePoint(event) {
      const draggingIndex = perspectiveEditor.value.draggingIndex
      if (draggingIndex === null || draggingIndex === undefined) return
      event.preventDefault()
      const canvas = perspectiveOverlayCanvas.value
      const point = getPerspectivePointer(event)
      const points = [...(perspectiveEditor.value.points || [])]
      points[draggingIndex] = {
        x: Math.max(0, Math.min(canvas.width, point.x)),
        y: Math.max(0, Math.min(canvas.height, point.y)),
      }
      perspectiveEditor.value.points = points
      drawPerspectiveOverlay()
    }

    function stopPerspectiveDrag() {
      perspectiveEditor.value.draggingIndex = null
      removePerspectiveDragListeners()
    }

    function addPerspectiveDragListeners() {
      if (perspectiveDragListening) return
      perspectiveDragListening = true
      window.addEventListener('mousemove', movePerspectivePoint)
      window.addEventListener('mouseup', stopPerspectiveDrag)
      window.addEventListener('touchmove', movePerspectivePoint, nonPassiveTouchListener)
      window.addEventListener('touchend', stopPerspectiveDrag)
      window.addEventListener('touchcancel', stopPerspectiveDrag)
    }

    function removePerspectiveDragListeners() {
      if (!perspectiveDragListening) return
      perspectiveDragListening = false
      window.removeEventListener('mousemove', movePerspectivePoint)
      window.removeEventListener('mouseup', stopPerspectiveDrag)
      window.removeEventListener('touchmove', movePerspectivePoint, nonPassiveTouchListener)
      window.removeEventListener('touchend', stopPerspectiveDrag)
      window.removeEventListener('touchcancel', stopPerspectiveDrag)
    }

    function resetPerspectivePoints() {
      const canvas = perspectiveOverlayCanvas.value
      if (!canvas) return
      perspectiveEditor.value.points = defaultPerspectivePoints(canvas.width, canvas.height)
      drawPerspectiveOverlay()
    }

    function interpolatePoint(left, right, ratio) {
      return {
        x: left.x + (right.x - left.x) * ratio,
        y: left.y + (right.y - left.y) * ratio,
      }
    }

    function samplePerspective(sourceData, sourceWidth, sourceHeight, x, y) {
      const clampedX = Math.max(0, Math.min(sourceWidth - 1, x))
      const clampedY = Math.max(0, Math.min(sourceHeight - 1, y))
      const x0 = Math.floor(clampedX)
      const y0 = Math.floor(clampedY)
      const x1 = Math.min(sourceWidth - 1, x0 + 1)
      const y1 = Math.min(sourceHeight - 1, y0 + 1)
      const dx = clampedX - x0
      const dy = clampedY - y0
      const result = [0, 0, 0, 0]
      for (let channel = 0; channel < 4; channel += 1) {
        const topLeft = sourceData[(y0 * sourceWidth + x0) * 4 + channel]
        const topRight = sourceData[(y0 * sourceWidth + x1) * 4 + channel]
        const bottomLeft = sourceData[(y1 * sourceWidth + x0) * 4 + channel]
        const bottomRight = sourceData[(y1 * sourceWidth + x1) * 4 + channel]
        result[channel] = topLeft * (1 - dx) * (1 - dy)
          + topRight * dx * (1 - dy)
          + bottomLeft * (1 - dx) * dy
          + bottomRight * dx * dy
      }
      return result
    }

    function solveLinearSystem(matrix, vector) {
      const size = vector.length
      const rows = matrix.map((row, index) => [...row, vector[index]])
      for (let column = 0; column < size; column += 1) {
        let pivotRow = column
        for (let row = column + 1; row < size; row += 1) {
          if (Math.abs(rows[row][column]) > Math.abs(rows[pivotRow][column])) pivotRow = row
        }
        if (Math.abs(rows[pivotRow][column]) < 1e-8) return null
        ;[rows[column], rows[pivotRow]] = [rows[pivotRow], rows[column]]
        const pivot = rows[column][column]
        for (let item = column; item <= size; item += 1) rows[column][item] /= pivot
        for (let row = 0; row < size; row += 1) {
          if (row === column) continue
          const factor = rows[row][column]
          for (let item = column; item <= size; item += 1) {
            rows[row][item] -= factor * rows[column][item]
          }
        }
      }
      return rows.map((row) => row[size])
    }

    function computePerspectiveTransform(sourcePoints, targetPoints) {
      const matrix = []
      const vector = []
      sourcePoints.forEach((source, index) => {
        const target = targetPoints[index]
        matrix.push([source.x, source.y, 1, 0, 0, 0, -target.x * source.x, -target.x * source.y])
        vector.push(target.x)
        matrix.push([0, 0, 0, source.x, source.y, 1, -target.y * source.x, -target.y * source.y])
        vector.push(target.y)
      })
      const solution = solveLinearSystem(matrix, vector)
      if (!solution) return null
      return [
        solution[0], solution[1], solution[2],
        solution[3], solution[4], solution[5],
        solution[6], solution[7], 1,
      ]
    }

    function applyPerspectiveTransform(transform, point) {
      const denominator = transform[6] * point.x + transform[7] * point.y + transform[8]
      if (Math.abs(denominator) < 1e-8) return point
      return {
        x: (transform[0] * point.x + transform[1] * point.y + transform[2]) / denominator,
        y: (transform[3] * point.x + transform[4] * point.y + transform[5]) / denominator,
      }
    }

    function exportPerspectiveDataUrl() {
      const sourceCanvas = perspectiveCanvas.value
      const points = perspectiveEditor.value.points || []
      if (!sourceCanvas || points.length !== 4) return ''
      const [topLeft, topRight, bottomRight, bottomLeft] = points
      const outputWidth = Math.max(64, Math.round(Math.max(distanceBetweenPoints(topLeft, topRight), distanceBetweenPoints(bottomLeft, bottomRight))))
      const outputHeight = Math.max(64, Math.round(Math.max(distanceBetweenPoints(topLeft, bottomLeft), distanceBetweenPoints(topRight, bottomRight))))
      const sourceContext = sourceCanvas.getContext('2d')
      const sourceImageData = sourceContext.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height)
      const outputCanvas = document.createElement('canvas')
      outputCanvas.width = outputWidth
      outputCanvas.height = outputHeight
      const outputContext = outputCanvas.getContext('2d')
      const outputImageData = outputContext.createImageData(outputWidth, outputHeight)
      const transform = computePerspectiveTransform([
        { x: 0, y: 0 },
        { x: outputWidth - 1, y: 0 },
        { x: outputWidth - 1, y: outputHeight - 1 },
        { x: 0, y: outputHeight - 1 },
      ], points)
      for (let y = 0; y < outputHeight; y += 1) {
        for (let x = 0; x < outputWidth; x += 1) {
          const sourcePoint = transform
            ? applyPerspectiveTransform(transform, { x, y })
            : interpolatePoint(
              interpolatePoint(topLeft, bottomLeft, outputHeight <= 1 ? 0 : y / (outputHeight - 1)),
              interpolatePoint(topRight, bottomRight, outputHeight <= 1 ? 0 : y / (outputHeight - 1)),
              outputWidth <= 1 ? 0 : x / (outputWidth - 1),
            )
          const sample = samplePerspective(sourceImageData.data, sourceCanvas.width, sourceCanvas.height, sourcePoint.x, sourcePoint.y)
          const offset = (y * outputWidth + x) * 4
          outputImageData.data[offset] = sample[0]
          outputImageData.data[offset + 1] = sample[1]
          outputImageData.data[offset + 2] = sample[2]
          outputImageData.data[offset + 3] = sample[3]
        }
      }
      outputContext.putImageData(outputImageData, 0, 0)
      return outputCanvas.toDataURL('image/png')
    }

    async function savePerspectiveImage() {
      perspectiveEditor.value.loading = true
      try {
        const url = exportPerspectiveDataUrl()
        if (!url) throw new Error('透视矫正失败')
        const nextImages = [...referenceImages.value]
        const index = perspectiveEditor.value.sourceIndex
        const corrected = {
          url,
          name: `${perspectiveEditor.value.sourceName || '参考图'}-透视矫正`,
          source: 'upload',
        }
        if (index >= 0 && nextImages[index]) nextImages.splice(index, 1, corrected)
        else nextImages.push(corrected)
        referenceImages.value = nextImages.slice(0, maxReferenceImages)
        perspectiveEditorOpen.value = false
        syncActiveSession()
        ElementPlus.ElMessage.success('已完成透视矫正')
      } catch (error) {
        ElementPlus.ElMessage.error(error.message || '透视矫正失败')
      } finally {
        perspectiveEditor.value.loading = false
      }
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
      try {
        await addReferenceFiles(event.target.files || [], 'upload')
      } catch (error) {
        ElementPlus.ElMessage.error(error.message || '参考图处理失败')
      } finally {
        event.target.value = ''
      }
    }

    onMounted(async () => {
      window.addEventListener('paste', handlePasteReferenceImage)
      loadState()
      const transferred = readTransferredPrompt()
      if (transferred) {
        const transferredPrompt = String(transferred.prompt || '').trim()
        if (transferredPrompt) prompt.value = transferredPrompt
        if (transferred.imageUrl) {
          referenceImages.value = [{ url: transferred.imageUrl, name: transferred.title || '广场图片', source: 'result' }]
        }
      }
      try {
        const response = await clientApi.listModels()
        models.value = response.data || []
        applyTransferredGenerationOptions(transferred)
      } catch (error) {
        ElementPlus.ElMessage.error(error.message || '模型加载失败')
      }
    })
    onBeforeUnmount(() => {
      window.removeEventListener('paste', handlePasteReferenceImage)
      removePerspectiveDragListeners()
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
      outputFormat,
      transparentBackground,
      prompt,
      messages,
      sessions,
      orderedSessions,
      activeSessionId,
      referenceImages,
      maxReferenceImages,
      fileInput,
      maskEditorOpen,
      maskEditor,
      maskCanvas,
      maskImageCanvas,
      perspectiveEditorOpen,
      perspectiveEditor,
      perspectiveCanvas,
      perspectiveOverlayCanvas,
      loading: activeSessionLoading,
      chatThread,
      chatModels,
      selectedModel,
      availableRatios,
      availableSizeTiers,
      quantityOptions,
      outputFormatOptions,
      outputSize,
      activeSession,
      hasSubscriptionDiscount,
      subscriptionDiscountPercent,
      modelHasSubscriptionDiscount,
      modelUnitOriginalPrice,
      modelUnitPrice,
      hasAnyDiscount,
      priceBadgeText,
      quotaChipTitle,
      quotaChipText,
      quotaChipValue,
      quotaChipNote,
      quotaWindowPills,
      modelSelectLabel,
      getModelLabel,
      getModelVariantPrice,
      isGeneratingStatus,
      normalizeReferenceImages,
      downloadImageName,
      downloadImageUrl,
      visibleResultIndexes,
      activeResultIndex,
      activeResultImage,
      activeResultThumbnail,
      selectResultImage,
      openResultImage,
      isResultGalleryExpanded,
      toggleResultGallery,
      resultGalleryStackStyle,
      hideBrokenImage,
      allResultImagesBroken,
      switchSession,
      newSession,
      deleteSession,
      renameSession,
      sessionNumber,
      sessionPreview,
      sessionCount,
      ratioIconStyle,
      resultImageStyle,
      rememberResultImageRatio,
      cleanDisplayErrorMessage,
      handleGenerate,
      useAsReference,
      toggleFavorite,
      requestPublic,
      publicActionLabel,
      openMaskEditor,
      clearMask,
      startMaskDraw,
      moveMaskDraw,
      stopMaskDraw,
      submitMaskEdit,
      openPerspectiveEditor,
      startPerspectiveDrag,
      movePerspectivePoint,
      stopPerspectiveDrag,
      resetPerspectivePoints,
      savePerspectiveImage,
      referenceSourceLabel,
      removeReferenceImage,
      generatingStage,
      generatingTitle,
      handleFile,
      resolveOriginalImageUrl,
      resolveThumbnailImageUrl,
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
          <span class="new-session-button-text">新建会话</span>
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
          <div class="chat-header-copy">
            <strong>{{ activeSession?.title || '当前会话' }}</strong>
            <div class="chat-session-meta-row">
              <small>{{ getModelLabel(selectedModel) }} · {{ ratio }} · {{ outputSize }}</small>
              <span v-if="quotaWindowPills().length" class="session-quota-list">
                <span v-for="item in quotaWindowPills()" :key="item.key" :class="{ empty: item.empty, limited: item.limitNote }" class="session-quota-pill">
                  <b>{{ item.label }}</b><em>{{ item.remaining }}/{{ item.limit }}</em>
                  <small v-if="item.limitNote">{{ item.limitNote }}</small>
                </span>
              </span>
              <small v-else class="session-quota-note">{{ quotaChipNote() }}</small>
            </div>
          </div>
          <div class="chat-header-actions">
            <button type="button" title="重命名会话" aria-label="重命名会话" @click="renameSession(activeSession)">
              <i class="ti ti-pencil"></i>
            </button>
            <button type="button" title="删除会话" aria-label="删除会话" @click="deleteSession(activeSession)">
              <i class="ti ti-trash"></i>
            </button>
          </div>
        </header>
        <div class="chat-thread" ref="chatThread">
          <div v-for="message in messages" :key="message.id" :class="['message', message.role]">
            <div class="avatar">{{ message.role === 'user' ? '我' : 'AI-PAI' }}</div>
            <div :class="['bubble', { 'generating-bubble': isGeneratingStatus(message.status) }]">
              <template v-if="isGeneratingStatus(message.status)">
                <div class="generating-card">
                  <div class="generating-progress" :style="resultImageStyle(message, 0)">
                    <i></i>
                    <div class="generating-placeholder-copy">
                      <strong>{{ generatingStage(message).detail || '正在处理图片，请稍候' }}</strong>
                      <div class="generating-tags">
                        <span v-for="tag in generatingStage(message).tags" :key="tag">{{ tag }}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </template>
              <p v-else-if="!visibleResultIndexes(message).length && !allResultImagesBroken(message) && !(['failed', 'canceled'].includes(message.status) && !message.images?.length)">{{ message.text }}</p>
              <div v-if="message.status === 'failed' && !message.images?.length" class="lost-image-card">
                <i class="ti ti-photo-off"></i>
                <strong>生成失败</strong>
                <small v-if="message.errorMessage">{{ cleanDisplayErrorMessage(message.errorMessage) }}</small>
              </div>
              <div v-if="message.status === 'canceled' && !message.images?.length" class="lost-image-card is-canceled">
                <i class="ti ti-circle-x"></i>
                <strong>生成已取消</strong>
                <small>{{ cleanDisplayErrorMessage(message.errorMessage) || '后台已取消这个生成任务' }}</small>
              </div>
              <div v-if="allResultImagesBroken(message)" class="lost-image-card is-missing" :style="resultImageStyle(message, 0)">
                <i class="ti ti-photo-off"></i>
                <strong>图片跑丢了</strong>
                <small>原图片链接已失效或已被上游清理</small>
              </div>
              <div v-if="normalizeReferenceImages(message.referenceImages || message.referenceImage).length" class="reference-preview-list">
                <button v-for="(image, index) in normalizeReferenceImages(message.referenceImages || message.referenceImage)" :key="image.url || image.name || index" :class="['reference-preview', { 'is-omitted': image.omitted }]" type="button" :disabled="!image.url" :title="image.url ? '预览参考图' : '本地参考图未保存'" @click="image.url && $emit('preview', { url: image.url, title: image.name || '参考图' })">
                  <img v-if="image.url" :src="image.url" alt="参考图" />
                  <span v-else>
                    <i class="ti ti-photo-off"></i>
                    本地参考图未保存
                  </span>
                </button>
              </div>
              <div v-if="visibleResultIndexes(message).length" :class="['result-stack', { 'is-expanded': isResultGalleryExpanded(message), 'is-folded': !isResultGalleryExpanded(message) }]">
                <div class="result-stage">
                  <button
                    class="result-main-card"
                    type="button"
                    :style="resultImageStyle(message, activeResultIndex(message))"
                    title="双击放大当前图片"
                    @click="toggleResultGallery(message)"
                    @dblclick="$emit('preview', { url: resolveOriginalImageUrl(activeResultImage(message)), title: '生成结果 ' + (activeResultIndex(message) + 1) })"
                  >
                    <img :key="message.id + '-' + activeResultIndex(message) + '-' + (activeResultImage(message) || '')" :src="activeResultImage(message)" :alt="'生成结果 ' + (activeResultIndex(message) + 1)" @load="(event) => rememberResultImageRatio(event, message, activeResultIndex(message))" @error="(event) => hideBrokenImage(event, message, activeResultIndex(message))" />
                    <span class="result-main-badge">{{ activeResultIndex(message) + 1 }}</span>
                    <span v-if="visibleResultIndexes(message).length > 1" class="result-fold-hint">
                      <i class="ti ti-stack-2"></i>
                      {{ isResultGalleryExpanded(message) ? '点击收起' : '点击展开 ' + visibleResultIndexes(message).length + ' 张' }}
                    </span>
                  </button>
                  <div v-if="visibleResultIndexes(message).length > 1 && !isResultGalleryExpanded(message)" class="result-fold-peek" aria-hidden="true">
                    <i v-for="(_, peekIndex) in visibleResultIndexes(message).slice(1, 4)" :key="peekIndex" :style="{ '--peek': peekIndex + 1 }"></i>
                  </div>
                </div>
                <div v-if="visibleResultIndexes(message).length > 1" class="result-gallery">
                  <button
                    v-for="index in visibleResultIndexes(message)"
                    :key="message.images[index] || index"
                    :class="['result-gallery-item', { active: activeResultIndex(message) === index }]"
                    :style="resultGalleryStackStyle(message, index)"
                    type="button"
                    :aria-label="'查看生成结果 ' + (index + 1)"
                    @click="openResultImage(message, index)"
                    @dblclick="$emit('preview', { url: resolveOriginalImageUrl(message.images[index]), title: '生成结果 ' + (index + 1) })"
                  >
                    <img :src="message.thumbnails?.[index] || message.images?.[index]" :alt="'生成结果 ' + (index + 1)" @load="(event) => rememberResultImageRatio(event, message, index)" @error="(event) => hideBrokenImage(event, message, index)" />
                    <span>{{ index + 1 }}</span>
                  </button>
                </div>
                <div class="result-toolbar">
                  <button class="result-action" type="button" title="放大" @click="$emit('preview', { url: resolveOriginalImageUrl(activeResultImage(message)), title: '生成结果' })">
                    <i class="ti ti-maximize"></i>
                    <span>放大</span>
                  </button>
                  <button class="result-action primary" type="button" title="作为参考图继续创作" @click="useAsReference(activeResultImage(message))">
                    <i class="ti ti-wand"></i>
                    <span>改图</span>
                  </button>
                  <button class="result-action" type="button" title="蒙版编辑" @click="openMaskEditor(activeResultImage(message))">
                    <i class="ti ti-brush"></i>
                    <span>蒙版</span>
                  </button>
                  <button class="result-action" type="button" :title="message.favoriteEnabled ? '取消收藏' : '收藏'" @click="toggleFavorite(message)">
                    <i :class="['ti', message.favoriteEnabled ? 'ti-heart-filled' : 'ti-heart']"></i>
                    <span>{{ message.favoriteEnabled ? '已收藏' : '收藏' }}</span>
                  </button>
                  <button class="result-action" type="button" :disabled="message.publicStatus === 'pending' || message.publicStatus === 'approved'" :title="publicActionLabel(message)" @click="requestPublic(message)">
                    <i class="ti ti-world-upload"></i>
                    <span>{{ publicActionLabel(message) }}</span>
                  </button>
                  <a class="result-action" title="下载当前图片" :href="downloadImageUrl(message, activeResultImage(message), activeResultIndex(message))" :download="downloadImageName(message, activeResultIndex(message))">
                    <i class="ti ti-download"></i>
                    <span>下载</span>
                  </a>
                  <small>已选择第 {{ activeResultIndex(message) + 1 }} 张</small>
                </div>
              </div>
            </div>
          </div>
        </div>
        <footer class="composer-card">
          <div class="composer-grid">
            <div class="composer-field composer-model">
              <span>模型</span>
              <el-select v-model="modelId" class="model-select-link" placeholder="选择模型" popper-class="composer-select-popper model-select-popper">
                <template #label="{ label }">
                  <span class="composer-selected model-selected">
                    <i class="ti ti-robot composer-select-icon"></i>
                    <span>{{ label }}</span>
                  </span>
                </template>
                <el-option v-for="model in chatModels" :key="model.id" :label="modelSelectLabel(model)" :value="model.id">
                  <span class="composer-option model-option" :title="getModelLabel(model)">
                    <i class="ti ti-robot composer-select-icon"></i>
                    <span class="model-option-copy">
                      <span class="model-option-main">{{ getModelLabel(model) }}</span>
                    </span>
                  </span>
                </el-option>
              </el-select>
            </div>
            <div class="composer-field composer-ratio">
              <span>比例</span>
              <el-select v-model="ratio" fit-input-width popper-class="composer-select-popper ratio-select-popper">
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
            <div class="composer-field composer-quality">
              <span>清晰度</span>
              <el-select v-model="sizeTier" fit-input-width popper-class="composer-select-popper quality-select-popper">
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
            <div class="composer-field composer-quantity">
              <span>数量</span>
              <el-select v-model="quantity" fit-input-width popper-class="composer-select-popper quantity-select-popper">
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
            <div class="composer-field composer-format">
              <span>格式</span>
              <el-select v-model="outputFormat" fit-input-width popper-class="composer-select-popper format-select-popper">
                <template #label="{ label }">
                  <span class="composer-selected">
                    <i class="ti ti-file-type-png composer-select-icon"></i>
                    {{ label }}
                  </span>
                </template>
                <el-option v-for="item in outputFormatOptions" :key="item.value" :label="item.label" :value="item.value">
                  <span class="composer-option">
                    <i class="ti ti-file-type-png composer-select-icon"></i>
                    <span>{{ item.label }}</span>
                  </span>
                </el-option>
              </el-select>
            </div>
            <div class="composer-field composer-transparent">
              <span>透明</span>
              <label class="transparent-toggle">
                <i class="ti ti-layers-intersect"></i>
                <strong>底图</strong>
                <el-switch v-model="transparentBackground" :disabled="outputFormat === 'png'" active-text="开" inactive-text="关" />
              </label>
            </div>
            <span class="cost-chip subscription-chip" :class="{ 'free-quota-chip': quotaWindowPills().length }">
              <span class="cost-chip-main">
                <i :class="['ti', quotaWindowPills().length ? 'ti-sparkles' : 'ti-crown']"></i>
                <span class="quota-chip-copy">
                  <span class="quota-chip-title">{{ quotaChipTitle() }}</span>
                  <strong>{{ quotaChipValue() }}</strong>
                </span>
              </span>
            </span>
          </div>
          <div v-if="referenceImages.length" class="composer-reference-card">
            <div class="composer-reference-thumbs">
              <div v-for="(image, index) in referenceImages" :key="image.url || image.name || index" class="composer-reference-thumb">
                <img :src="image.url" alt="参考图" />
                <div class="composer-reference-thumb-actions">
                  <button class="composer-reference-tool" type="button" title="透视矫正" @click="openPerspectiveEditor(image, index)">
                    <i class="ti ti-perspective"></i>
                  </button>
                  <button class="composer-reference-tool danger" type="button" title="移除参考图" @click="removeReferenceImage(index)">
                    <i class="ti ti-x"></i>
                  </button>
                </div>
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
      <el-dialog v-model="maskEditorOpen" width="min(96vw, 1120px)" class="mask-editor-dialog" custom-class="mask-editor-panel">
        <template #header>
          <div class="mask-editor-head">
            <div>
              <span>Mask Edit</span>
              <strong>蒙版编辑</strong>
            </div>
            <i class="ti ti-brush"></i>
          </div>
        </template>
        <div class="mask-editor-body">
          <div class="mask-canvas-wrap">
            <div class="mask-canvas-stage" @mousedown="startMaskDraw" @mousemove="moveMaskDraw" @mouseup="stopMaskDraw" @mouseleave="stopMaskDraw" @touchstart="startMaskDraw" @touchmove="moveMaskDraw" @touchend="stopMaskDraw">
              <canvas ref="maskImageCanvas" class="mask-source-canvas"></canvas>
              <canvas ref="maskCanvas" class="mask-draw-canvas"></canvas>
            </div>
          </div>
          <div class="mask-editor-tools">
            <div class="mask-editor-hint">
              <i class="ti ti-info-circle"></i>
              <span>涂抹需要修改的区域，透明底图会以棋盘格显示。</span>
            </div>
            <label>
              <span>画笔</span>
              <el-slider v-model="maskEditor.brushSize" :min="12" :max="120" />
            </label>
            <label class="mask-opacity-control">
              <span>透明度 {{ maskEditor.brushOpacity }}%</span>
              <input v-model.number="maskEditor.brushOpacity" class="mask-opacity-range" type="range" min="5" max="100" />
            </label>
            <el-input v-model="maskEditor.prompt" type="textarea" placeholder="请根据蒙版区域修改图片" />
            <div class="mask-editor-actions">
              <button class="result-action" type="button" @click="clearMask"><i class="ti ti-eraser"></i>清空</button>
              <button class="result-action primary" type="button" :disabled="maskEditor.loading" @click="submitMaskEdit"><i class="ti ti-sparkles"></i>提交编辑</button>
            </div>
          </div>
        </div>
      </el-dialog>
      <el-dialog v-model="perspectiveEditorOpen" width="min(96vw, 1120px)" class="mask-editor-dialog perspective-editor-dialog" custom-class="mask-editor-panel perspective-editor-panel">
        <template #header>
          <div class="mask-editor-head">
            <div>
              <span>Perspective</span>
              <strong>透视矫正</strong>
            </div>
            <i class="ti ti-perspective"></i>
          </div>
        </template>
        <div class="mask-editor-body perspective-editor-body">
          <div class="mask-canvas-wrap perspective-canvas-wrap">
            <div class="mask-canvas-stage perspective-canvas-stage" @mousedown="startPerspectiveDrag" @touchstart="startPerspectiveDrag">
              <canvas ref="perspectiveCanvas" class="mask-source-canvas perspective-source-canvas"></canvas>
              <canvas ref="perspectiveOverlayCanvas" class="mask-draw-canvas perspective-overlay-canvas"></canvas>
            </div>
          </div>
          <div class="mask-editor-tools">
            <div class="mask-editor-hint">
              <i class="ti ti-info-circle"></i>
              <span>拖动四个绿色角点框住需要拉正的区域，确认后会替换当前参考图。</span>
            </div>
            <div class="perspective-point-list">
              <span v-for="(point, index) in perspectiveEditor.points" :key="index">
                {{ index + 1 }}: {{ Math.round(point.x) }}, {{ Math.round(point.y) }}
              </span>
            </div>
            <div class="mask-editor-actions">
              <button class="result-action" type="button" @click="resetPerspectivePoints"><i class="ti ti-rotate-2"></i>重置</button>
              <button class="result-action primary" type="button" :disabled="perspectiveEditor.loading" @click="savePerspectiveImage"><i class="ti ti-device-floppy"></i>确定保存</button>
            </div>
          </div>
        </div>
      </el-dialog>
    </section>
  `,
}
