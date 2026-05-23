import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import {
  Check,
  ChevronDown,
  Coins,
  Download,
  ImagePlus,
  Loader2,
  Maximize2,
  Pencil,
  RotateCcw,
  Send,
  Sparkles,
  Trash2,
  WandSparkles,
  X,
} from 'lucide-react'
import { API_BASE_URL, clientApi, type AiModel, type CurrentUser, type GenerationTask } from '../api/clientApi'
import { CreditToast } from '../components/CreditToast'
import { ModelPicker } from '../components/ModelPicker'
import {
  getActiveModelsByCapability,
  getModelLabel,
  getModelPrice,
  getRatioBoxStyle,
  quantityOptions,
  ratioOptions,
  sizeMap,
  sizeTierOptions,
  type RatioOption,
  type SizeTierOption,
} from '../lib/generationOptions'
import { saveCurrentUser } from '../lib/currentUser'
import { pollGenerationTask } from '../lib/taskPolling'

type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  text: string
  taskId?: string
  imageUrl?: string
  imageUrls?: string[]
  thumbnailUrl?: string
  thumbnailUrls?: string[]
  imageName?: string
  status?: 'waiting' | 'failed'
  errorMessage?: string
}

type ReferenceImage = {
  url: string
  name: string
  source: 'upload' | 'result'
}

type ChatSession = {
  id: string
  no: number
  title: string
  messages: ChatMessage[]
  prompt: string
  currentTask: GenerationTask | null
  referenceImage: ReferenceImage | null
  createdAt: number
  updatedAt: number
}

type ChatImagePageProps = {
  creditName: string
  currentUser: CurrentUser | null
  onUserUpdated: (user: CurrentUser) => void
  onRequireLogin: () => void
}

type StoredChatState = {
  sessions: ChatSession[]
  activeSessionId: string
}

type NoticeState = {
  message: string
  type: 'success' | 'error'
}

const chatStorageKey = 'aipi-chat-image-sessions'

function getChatStorageKey(userId: string) {
  return `${chatStorageKey}:${userId}`
}

function resolveAssetUrl(url: string) {
  if (url.startsWith('/')) return `${API_BASE_URL}${url}`
  return url
}

function resolveOriginalImageUrl(url: string) {
  return resolveAssetUrl(url).replace('/thumbnails/', '/images/')
}

function stripHeavyTaskFields(task: GenerationTask | null): GenerationTask | null {
  if (!task) return null
  return {
    ...task,
    resultJson: undefined,
    resultUrl: task.resultUrl?.startsWith('data:') ? null : task.resultUrl,
    resultUrls: task.resultUrls?.filter((url) => !url.startsWith('data:')),
  }
}

function stripHeavyMessageFields(message: ChatMessage): ChatMessage {
  return {
    ...message,
    imageUrl: message.imageUrl?.startsWith('data:') ? undefined : message.imageUrl,
    imageUrls: message.imageUrls?.filter((url) => !url.startsWith('data:')),
    thumbnailUrl: message.thumbnailUrl?.startsWith('data:') ? undefined : message.thumbnailUrl,
    thumbnailUrls: message.thumbnailUrls?.filter((url) => !url.startsWith('data:')),
  }
}

function sanitizeStoredState(state: StoredChatState): StoredChatState {
  return {
    activeSessionId: state.activeSessionId,
    sessions: state.sessions.map((session) => ({
      ...session,
      messages: session.messages.map(stripHeavyMessageFields),
      currentTask: stripHeavyTaskFields(session.currentTask),
      referenceImage:
        session.referenceImage?.url.startsWith('data:')
          ? null
          : session.referenceImage,
    })),
  }
}

function loadStoredChatState(storageKey: string): StoredChatState | null {
  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredChatState
    if (!Array.isArray(parsed.sessions) || parsed.sessions.length === 0) return null
    return sanitizeStoredState(parsed)
  } catch {
    window.localStorage.removeItem(storageKey)
    return null
  }
}

function createChatSession(no: number): ChatSession {
  const now = Date.now()
  return {
    id: crypto.randomUUID(),
    no,
    title: `当前会话 #${no}`,
    messages: [],
    prompt: '',
    currentTask: null,
    referenceImage: null,
    createdAt: now,
    updatedAt: now,
  }
}

function createInitialChatState(storageKey: string | null) {
  const storedState = storageKey ? loadStoredChatState(storageKey) : null
  const storedSession = storedState?.sessions.find((session) => session.id === storedState.activeSessionId)
    ?? storedState?.sessions[0]
  const activeSession = storedSession ?? createChatSession(1)

  return {
    sessions: storedState?.sessions ?? [activeSession],
    activeSession,
    activeSessionId: storedState?.activeSessionId ?? activeSession.id,
  }
}

function formatWaitTime(seconds: number) {
  if (seconds < 60) {
    return `${seconds}秒`
  }

  const minutes = Math.round(seconds / 60)
  return `${minutes}分钟`
}

function isRunningTask(task: GenerationTask | null | undefined) {
  return task ? ['queued', 'pending', 'processing'].includes(task.status) : false
}

function buildCompletedMessage(task: GenerationTask): ChatMessage {
  return {
    id: `task-result-${task.id}`,
    role: 'assistant',
    text: '生成完成，可以继续输入修改意见。',
    taskId: task.id,
    imageUrl: task.resultUrl ? resolveAssetUrl(task.resultUrl) : undefined,
    imageUrls: task.resultUrls?.length ? task.resultUrls.map(resolveAssetUrl) : undefined,
    thumbnailUrl: task.thumbnailUrl ? resolveAssetUrl(task.thumbnailUrl) : undefined,
    thumbnailUrls: task.thumbnailUrls?.length ? task.thumbnailUrls.map(resolveAssetUrl) : undefined,
    imageName: `生成结果-${task.id.slice(0, 8)}`,
  }
}

function isWaitingMessage(message: ChatMessage) {
  return (
    message.status === 'waiting' ||
    message.text.includes('正在生成图片') ||
    message.text.includes('任务已提交')
  )
}

function isFailedMessage(message: ChatMessage) {
  return message.status === 'failed'
}

function applyCompletedTaskMessages(messages: ChatMessage[], task: GenerationTask) {
  const resultUrls = new Set([
    task.resultUrl,
    ...(task.resultUrls ?? []),
  ].filter(Boolean))
  const taskResultMessage = buildCompletedMessage(task)
  let hasTaskResult = false

  const cleanedMessages = messages
    .filter((message) => !isWaitingMessage(message))
    .map((message) => {
      const isSameTaskResult =
        message.taskId === task.id ||
        message.id === `task-result-${task.id}` ||
        Boolean(message.imageUrl && resultUrls.has(message.imageUrl)) ||
        Boolean(message.imageUrls?.some((url) => resultUrls.has(url)))

      if (!isSameTaskResult) return message

      hasTaskResult = true
      return {
        ...message,
        taskId: task.id,
        imageUrl: message.imageUrl ?? taskResultMessage.imageUrl,
        imageUrls: message.imageUrls?.length ? message.imageUrls : taskResultMessage.imageUrls,
        thumbnailUrl: message.thumbnailUrl ?? taskResultMessage.thumbnailUrl,
        thumbnailUrls: message.thumbnailUrls?.length ? message.thumbnailUrls : taskResultMessage.thumbnailUrls,
        imageName: message.imageName ?? taskResultMessage.imageName,
      }
    })

  const hasImage = cleanedMessages.some(
    (message) =>
      message.taskId === task.id ||
      Boolean(message.imageUrl && resultUrls.has(message.imageUrl)) ||
      Boolean(message.imageUrls?.some((url) => resultUrls.has(url))),
  )

  return hasTaskResult || hasImage ? cleanedMessages : cleanedMessages.concat(taskResultMessage)
}

function getSessionTaskIds(session: ChatSession) {
  return Array.from(new Set([
    session.currentTask?.id,
    ...session.messages.map((message) => message.taskId),
  ].filter((taskId): taskId is string => Boolean(taskId))))
}

function applyTaskUpdatesToMessages(messages: ChatMessage[], tasks: GenerationTask[]) {
  return tasks.reduce((nextMessages, task) => {
    if (task.status !== 'success') return nextMessages
    return applyCompletedTaskMessages(nextMessages, task)
  }, messages)
}

export function ChatImagePage({
  creditName,
  currentUser,
  onRequireLogin,
  onUserUpdated,
}: ChatImagePageProps) {
  const storageKey = currentUser ? getChatStorageKey(currentUser.id) : null
  const initialChatState = useMemo(() => createInitialChatState(storageKey), [storageKey])

  const [models, setModels] = useState<AiModel[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>(() => initialChatState.activeSession.messages)
  const [prompt, setPrompt] = useState(() => initialChatState.activeSession.prompt)
  const [modelId, setModelId] = useState('')
  const [ratio, setRatio] = useState<RatioOption>('16:9')
  const [sizeTier, setSizeTier] = useState<SizeTierOption>('2k')
  const [quantity, setQuantity] = useState(1)
  const [notice, setNotice] = useState<NoticeState | null>(null)
  const [creditToastOpen, setCreditToastOpen] = useState(false)
  const [referenceImage, setReferenceImage] = useState<ReferenceImage | null>(
    () => initialChatState.activeSession.referenceImage,
  )
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null)
  const [sessions, setSessions] = useState<ChatSession[]>(() => initialChatState.sessions)
  const [activeSessionId, setActiveSessionId] = useState(() => initialChatState.activeSessionId)
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [estimatedWaitSeconds, setEstimatedWaitSeconds] = useState(30)
  const [activeConfigMenu, setActiveConfigMenu] = useState<'ratio' | 'size' | 'quantity' | null>(null)
  const sessionRef = useRef(0)
  const lastSyncedSessionIdRef = useRef<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const chatModels = useMemo(() => getActiveModelsByCapability(models, 'chat_image'), [models])
  const selectedModel = chatModels.find((model) => model.id === modelId)
  const outputSize = sizeMap[ratio][sizeTier]
  const estimatedCost = getModelPrice(selectedModel, sizeTier) * quantity
  const activeSession = sessions.find((item) => item.id === activeSessionId) ?? sessions[0]
  const sessionNo = activeSession?.no ?? 1
  const isGenerating = activeSession ? isRunningTask(activeSession.currentTask) : false
  const activeSessionTaskId = activeSession?.currentTask?.id ?? null
  const activeSessionTaskStatus = activeSession?.currentTask?.status ?? null

  const showNotice = (message: string, type: NoticeState['type'] = 'error') => {
    setNotice({ message, type })
  }

  const syncTasksFromBackend = async (sourceSessions: ChatSession[], nextActiveSessionId: string) => {
    const taskRequests = sourceSessions.flatMap((session) =>
      getSessionTaskIds(session).map((taskId) => ({ sessionId: session.id, taskId })),
    )

    if (taskRequests.length === 0) return

    const taskUpdates = await Promise.all(
      taskRequests.map(async ({ sessionId, taskId }) => {
        try {
          const response = await clientApi.getTask(taskId)
          return { sessionId, task: response.data }
        } catch {
          return null
        }
      }),
    )

    setSessions((items) =>
      items.map((session) => {
        const updates = taskUpdates.filter((item) => item?.sessionId === session.id)
        if (updates.length === 0) return session

        const currentTaskUpdate = session.currentTask?.id
          ? updates.find((item) => item?.task.id === session.currentTask?.id)?.task
          : null
        const nextMessages = applyTaskUpdatesToMessages(
          session.messages,
          updates.map((item) => item!.task),
        )

        return {
          ...session,
          currentTask: currentTaskUpdate ?? session.currentTask,
          messages: nextMessages,
          updatedAt: Date.now(),
        }
      }),
    )

    const activeUpdates = taskUpdates
      .filter((item) => item?.sessionId === nextActiveSessionId)
      .map((item) => item!.task)
    if (activeUpdates.length > 0) {
      setMessages((items) => applyTaskUpdatesToMessages(items, activeUpdates))
    }
  }

  useEffect(() => {
    if (!storageKey) return
    const state = sanitizeStoredState({
      sessions,
      activeSessionId,
    })
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(state))
    } catch {
      window.localStorage.removeItem(storageKey)
    }
  }, [activeSessionId, sessions, storageKey])

  useEffect(() => {
    if (!storageKey) return
    if (lastSyncedSessionIdRef.current === activeSessionId) return
    lastSyncedSessionIdRef.current = activeSessionId
    window.setTimeout(() => {
      void syncTasksFromBackend(sessions, activeSessionId)
    }, 0)
  }, [activeSessionId, storageKey])

  const updateActiveSession = (input: Partial<Omit<ChatSession, 'id' | 'no' | 'createdAt'>>) => {
    setSessions((items) =>
      items.map((item) =>
        item.id === activeSessionId
          ? {
              ...item,
              ...input,
              updatedAt: Date.now(),
            }
          : item,
      ),
    )
  }

  const renameSession = (sessionId: string, title: string) => {
    const nextTitle = title.trim()
    if (!nextTitle) {
      setEditingSessionId(null)
      setEditingTitle('')
      return
    }

    setSessions((items) =>
      items.map((item) =>
        item.id === sessionId
          ? {
              ...item,
              title: nextTitle.slice(0, 40),
              updatedAt: Date.now(),
            }
          : item,
      ),
    )
    setEditingSessionId(null)
    setEditingTitle('')
  }

  const startRenameSession = (session: ChatSession) => {
    setEditingSessionId(session.id)
    setEditingTitle(session.title)
  }

  const switchSession = (session: ChatSession) => {
    if (session.id === activeSessionId) return
    sessionRef.current += 1
    setActiveSessionId(session.id)
    setMessages(session.messages)
    setPrompt(session.prompt)
    setReferenceImage(session.referenceImage)
    setNotice(null)
    if (storageKey) {
      void syncTasksFromBackend(sessions, session.id)
    }
  }

  const getSessionTitle = (session: ChatSession) => {
    return session.title || `当前会话 #${session.no}`
  }

  const getSessionSummary = (session: ChatSession) => {
    if (session.currentTask?.status === 'queued' || session.currentTask?.status === 'pending') return '等待中'
    if (session.currentTask?.status === 'processing') return '创作中'
    if (session.currentTask?.status === 'success') return '已生成结果'
    if (session.currentTask?.status === 'canceled') return '已取消'
    if (session.messages.length > 0) return `${session.messages.length} 条消息`
    return '输入提示词开始生成'
  }

  useEffect(() => {
    let ignore = false
    clientApi
      .listModels()
      .then((response) => {
        if (ignore) return
        const activeModels = getActiveModelsByCapability(response.data, 'chat_image')
        setModels(response.data)
        setModelId((current) => current || activeModels[0]?.id || '')
      })
      .catch(() => {
        if (!ignore) setModels([])
      })

    return () => {
      ignore = true
    }
  }, [])

  useEffect(() => {
    if (!creditToastOpen) return
    const timer = window.setTimeout(() => setCreditToastOpen(false), 3000)
    return () => window.clearTimeout(timer)
  }, [creditToastOpen])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), 3000)
    return () => window.clearTimeout(timer)
  }, [notice])

  useEffect(() => {
    let ignore = false
    if (!modelId) {
      return () => {
        ignore = true
      }
    }

    clientApi
      .estimateTaskDuration({
        modelId,
        capability: 'chat_image',
        sizeTier,
        size: outputSize,
        quantity,
      })
      .then((response) => {
        if (!ignore) setEstimatedWaitSeconds(response.data.estimatedSeconds)
      })
      .catch(() => {
        if (!ignore) setEstimatedWaitSeconds(30)
      })

    return () => {
      ignore = true
    }
  }, [modelId, outputSize, quantity, sizeTier])

  useEffect(() => {
    const runningTask = activeSession?.currentTask
    if (!activeSession || !runningTask || !isRunningTask(runningTask)) return

    let ignore = false
    const taskId = runningTask.id

    pollGenerationTask(taskId, (task) => {
      if (ignore) return
      setSessions((items) =>
        items.map((item) =>
          item.id === activeSession.id
            ? {
                ...item,
                currentTask: task,
                updatedAt: Date.now(),
              }
            : item,
        ),
      )
    })
      .then((completedTask) => {
        if (ignore) return
        if (completedTask.status === 'failed' || completedTask.status === 'canceled') {
          showNotice(completedTask.errorMessage || (completedTask.status === 'canceled' ? '任务已取消' : '生成失败'), 'error')
          return
        }

        const nextMessages = applyCompletedTaskMessages(activeSession.messages, completedTask)
        setMessages(nextMessages)
        setSessions((items) =>
          items.map((item) =>
            item.id === activeSession.id
              ? {
                  ...item,
                  messages: nextMessages,
                  currentTask: completedTask,
                  updatedAt: Date.now(),
                }
              : item,
          ),
        )
        if (completedTask.durationSeconds > 0) {
          setEstimatedWaitSeconds(Math.max(10, Math.round(completedTask.durationSeconds)))
        }
        showNotice('生成完成', 'success')
      })
      .catch((error) => {
        if (!ignore) {
          showNotice(error instanceof Error ? error.message : '生成失败', 'error')
        }
      })

    return () => {
      ignore = true
    }
  }, [activeSessionId, activeSessionTaskId, activeSessionTaskStatus])

  const handleReferenceFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.currentTarget.value = ''
    if (!file) return

    if (!file.type.startsWith('image/')) {
      showNotice('请选择图片文件作为参考图', 'error')
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        showNotice('参考图读取失败，请重新选择', 'error')
        return
      }
      setReferenceImage({
        url: reader.result,
        name: file.name,
        source: 'upload',
      })
      updateActiveSession({
        referenceImage: {
          url: reader.result,
          name: file.name,
          source: 'upload',
        },
      })
      showNotice('已添加参考图，可以输入修改要求', 'success')
    }
    reader.onerror = () => showNotice('参考图读取失败，请重新选择', 'error')
    reader.readAsDataURL(file)
  }

  const handleUseImageAsReference = (url: string, name = '生成结果') => {
    const imageUrl = resolveOriginalImageUrl(url)
    const nextReferenceImage: ReferenceImage = {
      url: imageUrl,
      name,
      source: 'result',
    }

    setReferenceImage(nextReferenceImage)
    updateActiveSession({ referenceImage: nextReferenceImage })
    showNotice('已将当前结果作为参考图，请输入想修改的内容', 'success')
    window.setTimeout(() => textareaRef.current?.focus(), 0)
  }

  const getImageExtension = (contentType: string) => {
    if (contentType.includes('jpeg') || contentType.includes('jpg')) return 'jpg'
    if (contentType.includes('webp')) return 'webp'
    if (contentType.includes('gif')) return 'gif'
    return 'png'
  }

  const downloadImage = async (url: string, name = '生成结果') => {
    try {
      const imageUrl = resolveOriginalImageUrl(url)
      const response = await fetch(imageUrl)
      if (!response.ok) {
        throw new Error(`下载失败：${response.status}`)
      }

      const blob = await response.blob()
      if (!blob.type.startsWith('image/')) {
        const text = await blob.text().catch(() => '')
        throw new Error(`下载内容不是图片：${text || blob.type || '未知内容'}`)
      }

      const objectUrl = window.URL.createObjectURL(blob)
      const extension = getImageExtension(blob.type || response.headers.get('content-type') || '')
      const safeName = name.replace(/[\\/:*?"<>|]/g, '-')
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = `${safeName}.${extension}`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(objectUrl)
    } catch (error) {
      showNotice(error instanceof Error ? error.message : '下载失败', 'error')
    }
  }

  const handleGenerate = async (overridePrompt?: string, retryMessageId?: string) => {
    setNotice(null)
    if (!currentUser) {
      onRequireLogin()
      return
    }
    if (!modelId) {
      showNotice('请先选择可用模型', 'error')
      return
    }
    const userPrompt = (overridePrompt ?? prompt).trim()
    if (!userPrompt) {
      showNotice('请输入想生成或修改的内容', 'error')
      return
    }
    if (currentUser.credits < estimatedCost) {
      setCreditToastOpen(true)
      return
    }

    const activeSession = sessionRef.current
    const userMessageId = retryMessageId ?? crypto.randomUUID()
    const waitingMessageId = crypto.randomUUID()
    const waitingMessage: ChatMessage = {
      id: waitingMessageId,
      role: 'assistant',
      text: `正在生成图片，预计等待${formatWaitTime(estimatedWaitSeconds)}`,
      status: 'waiting',
    }
    const submittedMessages = retryMessageId
      ? [
          ...messages
            .filter((message) => !isWaitingMessage(message))
            .map((message) =>
              message.id === retryMessageId
                ? { ...message, status: undefined, errorMessage: undefined }
                : message,
            ),
          waitingMessage,
        ]
      : [
          ...messages,
          { id: userMessageId, role: 'user' as const, text: userPrompt },
          waitingMessage,
        ]
    if (!retryMessageId) {
      setPrompt('')
    }
    setMessages(submittedMessages)
    updateActiveSession({ messages: submittedMessages, prompt: retryMessageId ? prompt : '' })

    try {
      const response = await clientApi.generateImage({
        userId: currentUser.id,
        modelId,
        prompt: userPrompt,
        sizeTier,
        size: outputSize,
        quantity,
        referenceImageUrl: referenceImage?.url,
      })
      if (sessionRef.current !== activeSession) return
      updateActiveSession({ currentTask: response.data })

      const completedTask = await pollGenerationTask(response.data.id, (task) => {
        if (sessionRef.current === activeSession) {
          updateActiveSession({ currentTask: task })
        }
      })
      if (completedTask.status === 'failed') {
        throw new Error(completedTask.errorMessage || '生成失败')
      }

      const nextUser = {
        ...currentUser,
        credits: completedTask.remainingCredits,
      }
      saveCurrentUser(nextUser)
      onUserUpdated(nextUser)
      if (sessionRef.current !== activeSession) return
      const completedMessages = applyCompletedTaskMessages(submittedMessages, completedTask)
      setMessages(completedMessages)
      setReferenceImage(null)
      updateActiveSession({ messages: completedMessages, currentTask: completedTask, referenceImage: null })
      if (completedTask.durationSeconds > 0) {
        setEstimatedWaitSeconds(Math.max(10, Math.round(completedTask.durationSeconds)))
      }
    } catch (error) {
      if (sessionRef.current !== activeSession) return
      const message = error instanceof Error ? error.message : '生成失败'
      const failedMessages = submittedMessages
        .filter((item) => item.id !== waitingMessageId)
        .map((item) =>
          item.id === userMessageId
            ? {
                ...item,
                status: 'failed' as const,
                errorMessage: message,
              }
            : item,
        )
      setMessages(failedMessages)
      updateActiveSession({ messages: failedMessages, currentTask: null })
      if (message.includes('积分不足') || message.includes('余额不足')) {
        setCreditToastOpen(true)
      } else {
        showNotice(message, 'error')
      }
    }
  }

  const resetChat = () => {
    sessionRef.current += 1
    const maxSessionNo = sessions.reduce((max, session) => Math.max(max, session.no), 0)
    const nextSession = createChatSession(maxSessionNo + 1)
    setSessions((items) => [nextSession, ...items])
    setActiveSessionId(nextSession.id)
    setMessages([])
    setPrompt('')
    setReferenceImage(null)
    setNotice(null)
  }

  const deleteSession = (sessionId: string) => {
    sessionRef.current += 1

    if (sessions.length <= 1) {
      const nextSession = createChatSession(1)
      setSessions([nextSession])
      setActiveSessionId(nextSession.id)
      setMessages([])
      setPrompt('')
      setReferenceImage(null)
      setNotice(null)
      return
    }

    const nextSessions = sessions.filter((session) => session.id !== sessionId)
    setSessions(nextSessions)

    if (sessionId !== activeSessionId) return

    const nextActiveSession = nextSessions[0]
    setActiveSessionId(nextActiveSession.id)
    setMessages(nextActiveSession.messages)
    setPrompt(nextActiveSession.prompt)
    setReferenceImage(nextActiveSession.referenceImage)
    setNotice(null)
  }

  return (
    <section className="center-page wide chat-page">
      {/* <PageTitle title="对话生图" subtitle="用连续对话生成、修改和迭代图片" /> */}

      <div className="chat-studio">
        <aside className="chat-list-panel">
          <button className="new-chat-button" onClick={resetChat} type="button">
            <Sparkles size={16} aria-hidden="true" />
            新建对话
          </button>

          <div className="chat-list" aria-label="对话列表">
            {sessions.map((session) => (
              <button
                className={session.id === activeSessionId ? 'active' : ''}
                key={session.id}
                onClick={() => switchSession(session)}
                type="button"
              >
                <span className="chat-session-row">
                  <strong>{getSessionTitle(session)}</strong>
                  <span
                    aria-label="删除对话"
                    className="delete-session-button"
                    onClick={(event) => {
                      event.stopPropagation()
                      deleteSession(session.id)
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <Trash2 size={13} aria-hidden="true" />
                  </span>
                </span>
                <span className="chat-session-summary">{getSessionSummary(session)}</span>
              </button>
            ))}
          </div>
        </aside>

        <section className="chat-flow-panel" key={activeSessionId}>
          <div className="chat-flow-header">
            <div className="chat-title-area">
              {activeSession && editingSessionId === activeSession.id ? (
                <div className="chat-title-editor large">
                  <input
                    autoFocus
                    maxLength={40}
                    onBlur={() => renameSession(activeSession.id, editingTitle)}
                    onChange={(event) => setEditingTitle(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') renameSession(activeSession.id, editingTitle)
                      if (event.key === 'Escape') {
                        setEditingSessionId(null)
                        setEditingTitle('')
                      }
                    }}
                    value={editingTitle}
                  />
                  <span
                    aria-label="保存标题"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => renameSession(activeSession.id, editingTitle)}
                    role="button"
                    tabIndex={0}
                  >
                    <Check size={15} aria-hidden="true" />
                  </span>
                </div>
              ) : (
                <div className="chat-title-view">
                  <h2>{activeSession ? getSessionTitle(activeSession) : `当前会话 #${sessionNo}`}</h2>
                  {activeSession && (
                    <button onClick={() => startRenameSession(activeSession)} type="button">
                      <Pencil size={14} aria-hidden="true" />
                    </button>
                  )}
                </div>
              )}
              <div className="chat-meta-labels">
                <span>{getModelLabel(selectedModel)}</span>
                <span>{ratio}</span>
                <span>{sizeTier.toUpperCase()}</span>
                <span>{outputSize}</span>
              </div>
            </div>
          </div>

          <div className={`chat-thread ${messages.length === 0 ? 'empty' : ''}`}>
            {messages.length === 0 && (
              <div className="chat-empty-state">
                <Sparkles size={22} aria-hidden="true" />
                <strong>输入提示词开始生成</strong>
                <p>预计需要等待{formatWaitTime(estimatedWaitSeconds)}哦...</p>
              </div>
            )}
            {messages.map((message) => (
              <div
                className={`chat-message ${message.role}${isFailedMessage(message) ? ' failed' : ''}`}
                key={message.id}
              >
                <div className="chat-message-avatar">{message.role === 'user' ? '我' : 'AI'}</div>
                <div className="chat-message-body">
                  <strong>{message.role === 'user' ? currentUser?.email || '我' : 'AIπ 生图助手'}</strong>
                  <p className={isWaitingMessage(message) ? 'chat-waiting-text' : undefined}>
                    {message.text}
                    {isWaitingMessage(message) && (
                      <span aria-hidden="true">
                        <i />
                        <i />
                        <i />
                      </span>
                    )}
                  </p>
                  {isFailedMessage(message) && (
                    <div className="chat-message-error">
                      <span>{message.errorMessage || '发送失败，请重试'}</span>
                      <button
                        disabled={isGenerating}
                        onClick={() => handleGenerate(message.text, message.id)}
                        type="button"
                      >
                        <RotateCcw size={13} aria-hidden="true" />
                        重新发送
                      </button>
                    </div>
                  )}
                  {(message.imageUrls?.length || message.imageUrl) && (
                    <div className="chat-message-result">
                      {(message.imageUrls?.length ? message.imageUrls : [message.imageUrl!]).map((imageUrl, index) => {
                        const originalUrl = resolveOriginalImageUrl(imageUrl)
                        const thumbnailUrl = resolveAssetUrl(
                          message.thumbnailUrls?.[index] ?? message.thumbnailUrl ?? imageUrl,
                        )
                        const imageName =
                          (message.imageUrls?.length ?? 0) > 1
                            ? `${message.imageName || '生成结果'}-${index + 1}`
                            : message.imageName
                        return (
                          <div className="chat-message-result-item" key={`${imageUrl}-${index}`}>
                            <button
                              className="chat-result-thumb"
                              onClick={() => setPreviewImageUrl(originalUrl)}
                              type="button"
                            >
                              <img src={thumbnailUrl} alt={imageName || '生成结果'} loading="lazy" />
                            </button>
                            <div>
                              <button
                                onClick={() => handleUseImageAsReference(originalUrl, imageName)}
                                type="button"
                              >
                                <ImagePlus size={14} aria-hidden="true" />
                                基于此图修改
                              </button>
                              <button onClick={() => setPreviewImageUrl(originalUrl)} type="button">
                                <Maximize2 size={14} aria-hidden="true" />
                                放大
                              </button>
                              <button
                                onClick={() => downloadImage(originalUrl, imageName)}
                                type="button"
                              >
                                <Download size={14} aria-hidden="true" />
                                下载
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="chat-composer-card">
            <div className="composer-toolbar">
              <ModelPicker compact models={chatModels} value={modelId} onChange={setModelId} />

              <div className="composer-select-chip">
                <button
                  className={activeConfigMenu === 'ratio' ? 'active' : ''}
                  onClick={() => setActiveConfigMenu((current) => (current === 'ratio' ? null : 'ratio'))}
                  type="button"
                >
                  <span className="ratio-shape" style={getRatioBoxStyle(ratio)} />
                  <strong>{ratio}</strong>
                  <ChevronDown size={14} aria-hidden="true" />
                </button>
                {activeConfigMenu === 'ratio' && (
                  <div className="composer-menu ratio-menu">
                    {ratioOptions.map((item) => (
                      <button
                        className={ratio === item ? 'selected' : ''}
                        key={item}
                        onClick={() => {
                          setRatio(item)
                          setActiveConfigMenu(null)
                        }}
                        type="button"
                      >
                        <span className="ratio-shape" style={getRatioBoxStyle(item)} />
                        {item}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="composer-select-chip">
                <button
                  className={activeConfigMenu === 'size' ? 'active' : ''}
                  onClick={() => setActiveConfigMenu((current) => (current === 'size' ? null : 'size'))}
                  type="button"
                >
                  <WandSparkles size={15} aria-hidden="true" />
                  <strong>{sizeTier.toUpperCase()}</strong>
                  <small>{sizeMap[ratio][sizeTier]}</small>
                  <ChevronDown size={14} aria-hidden="true" />
                </button>
                {activeConfigMenu === 'size' && (
                  <div className="composer-menu">
                    {sizeTierOptions.map((item) => (
                      <button
                        className={sizeTier === item ? 'selected' : ''}
                        key={item}
                        onClick={() => {
                          setSizeTier(item)
                          setActiveConfigMenu(null)
                        }}
                        type="button"
                      >
                        <strong>{item.toUpperCase()}</strong>
                        <span>
                          {sizeMap[ratio][item]} · {getModelPrice(selectedModel, item).toFixed(2)}
                          {creditName}/次
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="composer-select-chip compact">
                <button
                  className={activeConfigMenu === 'quantity' ? 'active' : ''}
                  onClick={() => setActiveConfigMenu((current) => (current === 'quantity' ? null : 'quantity'))}
                  type="button"
                >
                  <strong>{quantity} 张</strong>
                  <ChevronDown size={14} aria-hidden="true" />
                </button>
                {activeConfigMenu === 'quantity' && (
                  <div className="composer-menu quantity-menu">
                    {quantityOptions.map((item) => (
                      <button
                        className={quantity === item ? 'selected' : ''}
                        key={item}
                        onClick={() => {
                          setQuantity(item)
                          setActiveConfigMenu(null)
                        }}
                        type="button"
                      >
                        {item} 张
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <span className="composer-cost-chip">
                <Coins size={15} aria-hidden="true" />
                预计扣费 {estimatedCost.toFixed(2)} {creditName}
              </span>
            </div>

            {referenceImage && (
              <div className="composer-reference">
                <div className="composer-reference-thumb">
                  <img src={referenceImage.url} alt="参考图" />
                  <span>{referenceImage.source === 'result' ? '结果图' : '参考图'}</span>
                </div>
                <div className="composer-reference-meta">
                  <strong>{referenceImage.source === 'result' ? '基于当前结果修改' : '参考图已添加'}</strong>
                  <small>{referenceImage.name}</small>
                </div>
                <button
                  aria-label="移除参考图"
                  onClick={() => {
                    setReferenceImage(null)
                    updateActiveSession({ referenceImage: null })
                  }}
                  type="button"
                >
                  <X size={15} aria-hidden="true" />
                </button>
              </div>
            )}
            <div className="composer-row">
              <input
                accept="image/*"
                className="reference-file-input"
                onChange={handleReferenceFileChange}
                ref={fileInputRef}
                type="file"
              />
              <button onClick={() => fileInputRef.current?.click()} type="button" title="添加参考图">
                <ImagePlus size={18} aria-hidden="true" />
              </button>
              <textarea
                onChange={(event) => {
                  setPrompt(event.target.value)
                  updateActiveSession({ prompt: event.target.value })
                }}
                placeholder="描述你想生成或修改的图片..."
                ref={textareaRef}
                value={prompt}
              />
              <button
                className="send-generate-button"
                disabled={isGenerating}
                onClick={() => handleGenerate()}
                type="button"
              >
                {isGenerating ? <Loader2 size={18} aria-hidden="true" /> : <Send size={18} aria-hidden="true" />}
                {isGenerating ? '生成中' : '生成'}
              </button>
            </div>
          </div>
        </section>

      </div>

      {previewImageUrl && (
        <div className="image-lightbox" onClick={() => setPreviewImageUrl(null)} role="presentation">
          <button aria-label="关闭预览" onClick={() => setPreviewImageUrl(null)} type="button">
            <X size={18} aria-hidden="true" />
          </button>
          <img alt="放大预览" src={previewImageUrl} />
        </div>
      )}

      <CreditToast
        balance={currentUser?.credits}
        cost={estimatedCost}
        creditName={creditName}
        open={creditToastOpen}
      />
      {notice && (
        <div className={`notice-toast ${notice.type}`} role="status" aria-live="polite">
          <strong>{notice.message}</strong>
        </div>
      )}
    </section>
  )
}

