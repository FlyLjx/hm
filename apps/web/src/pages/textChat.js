import { clientApi } from '../common/api.js'
import { renderMarkdown } from '../common/markdown.js'

const { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } = Vue

const textChatStoragePrefix = 'aipi:text-chat'
const freeChatModelName = 'GPT-5.5'
const maxVisionImages = 3
const maxVisionImageBytes = 5 * 1024 * 1024
const textChatSystemPrompt = '你是 AIπ 的文字和图片理解助手。回答要清晰、直接；当内容适合对比、清单、参数、步骤或结构化信息时，优先使用 Markdown 表格、列表和代码块。代码块请使用标准三反引号 Markdown。'
const quickPrompts = [
  '帮我把这段广告文案优化得更吸引人',
  '帮我整理一份门店海报设计需求',
  '根据这张图提取可用于生图的提示词',
]

function createSession() {
  const now = Date.now()
  return {
    id: `text-chat-${now}-${Math.random().toString(16).slice(2)}`,
    title: '新的聊天',
    messages: [],
    createdAt: now,
    updatedAt: now,
  }
}

function readStoredState(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '')
    if (!parsed || !Array.isArray(parsed.sessions)) return null
    return parsed
  } catch {
    return null
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function dataUrlBytes(value) {
  const base64 = String(value || '').split(',')[1] || ''
  return Math.ceil((base64.length * 3) / 4)
}

function loadImageElement(url) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('图片读取失败'))
    image.src = url
  })
}

export const TextChatPage = {
  props: ['creditName', 'currentUser'],
  emits: ['login', 'user-updated'],
  setup(props, { emit }) {
    const sessions = ref([createSession()])
    const activeSessionId = ref(sessions.value[0].id)
    const inputText = ref('')
    const visionImages = ref([])
    const fileInput = ref(null)
    const loading = ref(false)
    const chatThread = ref(null)
    let scrollTimer = null
    const storageKey = computed(() => props.currentUser?.id ? `${textChatStoragePrefix}:${props.currentUser.id}` : '')
    const activeSession = computed(() => sessions.value.find((item) => item.id === activeSessionId.value) || sessions.value[0])
    const messages = computed(() => activeSession.value?.messages || [])
    const orderedSessions = computed(() => [...sessions.value].sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0)))

    function saveState() {
      if (!storageKey.value) return
      localStorage.setItem(storageKey.value, JSON.stringify({
        activeSessionId: activeSessionId.value,
        sessions: sessions.value.slice(0, 30),
      }))
    }

    function restoreState() {
      const stored = storageKey.value ? readStoredState(storageKey.value) : readStoredState(textChatStoragePrefix)
      if (!stored?.sessions?.length) return
      sessions.value = stored.sessions
      activeSessionId.value = stored.activeSessionId || stored.sessions[0].id
    }

    function sessionPreview(session) {
      const last = session.messages?.[session.messages.length - 1]
      return last?.content || '暂无消息'
    }

    function sessionNumber(session) {
      const index = orderedSessions.value.findIndex((item) => item.id === session.id)
      return String(index + 1).padStart(2, '0')
    }

    function switchSession(session) {
      activeSessionId.value = session.id
      scrollBottom()
    }

    function newSession() {
      if (!props.currentUser) {
        emit('login')
        return
      }
      const session = createSession()
      sessions.value.unshift(session)
      activeSessionId.value = session.id
      saveState()
      scrollBottom()
    }

    function deleteSession(session) {
      if (sessions.value.length <= 1) {
        sessions.value = [createSession()]
        activeSessionId.value = sessions.value[0].id
      } else {
        sessions.value = sessions.value.filter((item) => item.id !== session.id)
        if (activeSessionId.value === session.id) activeSessionId.value = sessions.value[0].id
      }
      saveState()
    }

    function renameSessionFromText(session, text) {
      if (!session.messages.length) {
        session.title = text.slice(0, 18) || '新的聊天'
      }
    }

    function scrollBottom() {
      nextTick(() => {
        if (!chatThread.value) return
        chatThread.value.scrollTop = chatThread.value.scrollHeight
        if (scrollTimer) window.clearTimeout(scrollTimer)
        scrollTimer = window.setTimeout(() => {
          if (chatThread.value) chatThread.value.scrollTop = chatThread.value.scrollHeight
        }, 60)
      })
    }

    function isNearBottom() {
      const target = chatThread.value
      if (!target) return true
      return target.scrollHeight - target.scrollTop - target.clientHeight < 120
    }

    function scrollBottomIfNeeded(force = false) {
      if (force || isNearBottom()) scrollBottom()
    }

    function messagePayload() {
      const history = messages.value
        .filter((message) => message.role === 'user' || message.role === 'assistant')
        .filter((message) => !message.pending && !message.error)
        .slice(-20)
        .map((message) => {
          if (message.role === 'user' && message.images?.length) {
            return {
              role: message.role,
              content: [
                { type: 'text', text: message.content },
                ...message.images.map((image) => ({ type: 'image_url', image_url: { url: image.url } })),
              ],
            }
          }
          return { role: message.role, content: message.content }
        })
      return [
        { role: 'system', content: textChatSystemPrompt },
        ...history,
      ]
    }

    function wait(ms) {
      return new Promise((resolve) => window.setTimeout(resolve, ms))
    }

    function messageHtml(message) {
      if (!message?.content) return ''
      if (message.role === 'assistant' && !message.error) {
        return renderMarkdown(message.content, { copyCode: true })
      }
      return `<p>${escapeHtml(message.content)}</p>`
    }

    async function copyText(text) {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
        return
      }
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      textarea.remove()
    }

    async function handleThreadClick(event) {
      const button = event.target.closest?.('[data-copy-code]')
      if (!button) return
      const code = button.parentElement?.querySelector('pre code')?.textContent || ''
      if (!code) return
      try {
        await copyText(code)
        const label = button.querySelector('span')
        const previous = label?.textContent || '复制'
        if (label) label.textContent = '已复制'
        window.setTimeout(() => {
          if (label) label.textContent = previous
        }, 1200)
      } catch {
        ElementPlus.ElMessage.error('复制失败')
      }
    }

    async function compressVisionFile(file) {
      const initialUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = () => reject(new Error('图片读取失败'))
        reader.readAsDataURL(file)
      })
      if (dataUrlBytes(initialUrl) <= maxVisionImageBytes) {
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
        output = canvas.toDataURL('image/jpeg', quality)
        if (dataUrlBytes(output) <= maxVisionImageBytes) {
          return { url: output, compressed: true }
        }
        if (quality > 0.55) quality -= 0.12
        else {
          width *= 0.82
          height *= 0.82
        }
      }

      if (dataUrlBytes(output) > maxVisionImageBytes) {
        throw new Error(`${file.name} 压缩后仍超过 5MB，请换一张更小的图片`)
      }
      return { url: output, compressed: true }
    }

    async function handleVisionFile(event) {
      const files = Array.from(event.target.files || []).filter((file) => file.type.startsWith('image/'))
      if (!files.length) return
      const remaining = maxVisionImages - visionImages.value.length
      if (remaining <= 0) {
        ElementPlus.ElMessage.warning(`最多只能添加 ${maxVisionImages} 张图片`)
        event.target.value = ''
        return
      }
      const selectedFiles = files.slice(0, remaining)
      if (files.length > remaining) ElementPlus.ElMessage.warning(`最多只能添加 ${maxVisionImages} 张图片，已自动忽略多余图片`)
      try {
        const nextImages = []
        let compressedCount = 0
        for (const file of selectedFiles) {
          const compressed = await compressVisionFile(file)
          if (compressed.compressed) compressedCount += 1
          nextImages.push({ url: compressed.url, name: file.name })
        }
        visionImages.value = [...visionImages.value, ...nextImages].slice(0, maxVisionImages)
        if (compressedCount > 0) ElementPlus.ElMessage.success(`已自动压缩 ${compressedCount} 张图片到 5MB 以内`)
      } catch (error) {
        ElementPlus.ElMessage.error(error.message || '图片处理失败')
      }
      event.target.value = ''
    }

    function removeVisionImage(index) {
      visionImages.value = visionImages.value.filter((_, itemIndex) => itemIndex !== index)
    }

    function useQuickPrompt(text) {
      inputText.value = text
      nextTick(() => {
        const textarea = document.querySelector('.text-chat-composer-input textarea')
        textarea?.focus?.()
      })
    }

    async function readChatStream(response, assistantMessage) {
      if (!response.ok || !response.body) {
        const contentType = response.headers.get('content-type') || ''
        if (contentType.includes('application/json')) {
          const error = await response.json().catch(() => null)
          throw new Error(error?.message || '聊天接口调用失败')
        }
        const text = await response.text().catch(() => '')
        throw new Error(text || '聊天接口调用失败')
      }
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let textQueue = ''
      let typing = false
      let finished = false
      const flushTypingQueue = async () => {
        if (typing) return
        typing = true
        while (textQueue.length) {
          const chunkSize = textQueue.length > 80 ? 3 : 1
          const nextText = textQueue.slice(0, chunkSize)
          textQueue = textQueue.slice(chunkSize)
          assistantMessage.content += nextText
          assistantMessage.pending = false
          activeSession.value.updatedAt = Date.now()
          saveState()
          scrollBottomIfNeeded(true)
          await wait(textQueue.length > 80 ? 8 : 18)
        }
        typing = false
      }
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
        if (event === 'delta') {
          textQueue += payload.text || ''
          assistantMessage.pending = false
          void flushTypingQueue()
        }
        if (event === 'done') {
          finished = true
          if (!assistantMessage.content && !textQueue) {
            textQueue = payload.message?.content || '没有返回内容'
            void flushTypingQueue()
          }
          assistantMessage.pending = false
        }
        if (event === 'error') {
          textQueue = ''
          assistantMessage.content = payload.message || '聊天失败'
          assistantMessage.error = true
          assistantMessage.pending = false
        }
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
      while (typing || textQueue.length) {
        await wait(20)
      }
      if (finished && !assistantMessage.content) assistantMessage.content = '没有返回内容'
    }

    async function sendMessage() {
      const text = inputText.value.trim()
      if (!props.currentUser) {
        emit('login')
        return
      }
      if ((!text && !visionImages.value.length) || loading.value) return
      const session = activeSession.value
      const submittedImages = visionImages.value.map((image) => ({ ...image }))
      const userMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: text || '请理解这张图片',
        images: submittedImages,
        createdAt: Date.now(),
      }
      renameSessionFromText(session, text)
      session.messages.push(userMessage)
      session.updatedAt = Date.now()
      inputText.value = ''
      visionImages.value = []
      loading.value = true
      saveState()
      scrollBottom()
      scrollBottomIfNeeded(true)
      const assistantMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: '',
        pending: true,
        createdAt: Date.now(),
      }
      session.messages.push(assistantMessage)
      try {
        const response = await clientApi.completeChatStream({
          userId: props.currentUser.id,
          messages: messagePayload(),
        })
        await readChatStream(response, assistantMessage)
        session.updatedAt = Date.now()
        saveState()
      } catch (error) {
        assistantMessage.content = error instanceof Error ? error.message : '聊天失败'
        assistantMessage.error = true
        assistantMessage.pending = false
        session.updatedAt = Date.now()
        saveState()
      } finally {
        if (!assistantMessage.content) assistantMessage.content = '没有返回内容'
        assistantMessage.pending = false
        loading.value = false
        scrollBottom()
      }
    }

    function handleEnter(event) {
      if (event.shiftKey) return
      event.preventDefault()
      sendMessage()
    }

    watch(storageKey, () => {
      restoreState()
    })
    watch([sessions, activeSessionId], saveState, { deep: true })

    onMounted(() => {
      restoreState()
      scrollBottom()
    })
    onBeforeUnmount(() => {
      if (scrollTimer) window.clearTimeout(scrollTimer)
      saveState()
    })

    return {
      loading,
      inputText,
      visionImages,
      fileInput,
      maxVisionImages,
      quickPrompts,
      chatThread,
      freeChatModelName,
      sessions,
      orderedSessions,
      activeSessionId,
      messages,
      sessionPreview,
      sessionNumber,
      switchSession,
      newSession,
      deleteSession,
      sendMessage,
      handleEnter,
      messageHtml,
      handleVisionFile,
      removeVisionImage,
      handleThreadClick,
      useQuickPrompt,
    }
  },
  template: `
    <section class="chat-layout text-chat-page">
      <aside class="chat-sidebar">
        <div class="chat-sidebar-head">
          <div>
            <span>Conversations</span>
            <strong>文字会话</strong>
          </div>
          <small>{{ orderedSessions.length }} 个</small>
        </div>
        <el-button class="new-session-button" type="primary" title="新建聊天" aria-label="新建聊天" @click="newSession">
          <i class="ti ti-plus"></i>
          <span class="new-session-button-text">新建聊天</span>
        </el-button>
        <div class="session-strip">
          <div class="session-list">
            <article v-for="session in orderedSessions" :key="session.id" :class="{ active: activeSessionId === session.id }" class="session-item" role="button" tabindex="0" @click="switchSession(session)" @keydown.enter="switchSession(session)">
              <div class="session-index">{{ sessionNumber(session) }}</div>
              <div class="session-main">
                <div class="session-title-row">
                  <strong :title="session.title">{{ session.title }}</strong>
                </div>
                <small>{{ sessionPreview(session) }}</small>
              </div>
              <div class="session-meta">
                <span class="session-count-badge">{{ session.messages?.length || 0 }} 条</span>
                <button class="session-delete" type="button" title="删除会话" @click.stop="deleteSession(session)">
                  <i class="ti ti-trash"></i>
                </button>
              </div>
            </article>
          </div>
        </div>
      </aside>

      <section class="chat-panel">
        <header class="chat-header text-chat-header">
          <div class="text-chat-title">
            <i class="ti ti-message-chatbot"></i>
            <div>
              <small>AIπ Chat</small>
              <strong>对话聊天</strong>
            </div>
          </div>
          <div class="chat-specs">
            <span>{{ freeChatModelName }}</span>
            <span>免费</span>
            <span>图片理解</span>
          </div>
        </header>

        <div class="chat-thread text-chat-thread" ref="chatThread" @click="handleThreadClick">
          <div v-if="messages.length === 0" class="text-chat-empty">
            <i class="ti ti-message-chatbot"></i>
            <strong>开始一次文字对话</strong>
            <p>可以用来写提示词、改文案、做方案，也可以让模型帮你整理生图思路。</p>
            <div class="text-chat-quick-prompts">
              <button v-for="item in quickPrompts" :key="item" type="button" @click="useQuickPrompt(item)">{{ item }}</button>
            </div>
          </div>
          <div v-for="message in messages" :key="message.id" :class="['message', message.role, { error: message.error }]">
            <div class="avatar">{{ message.role === 'user' ? '我' : 'AIπ' }}</div>
            <div class="bubble">
              <div v-if="message.images?.length" class="text-chat-image-row">
                <img v-for="(image, index) in message.images" :key="image.url || image.name || index" :src="image.url" :alt="image.name || '图片'" />
              </div>
              <div v-if="message.content" class="text-chat-markdown" v-html="messageHtml(message)"></div>
              <span v-else class="text-typing"><i></i><i></i><i></i></span>
            </div>
          </div>
        </div>

        <footer class="composer-card text-chat-composer">
          <div v-if="visionImages.length" class="text-chat-vision-card">
            <div class="composer-reference-thumbs">
              <div v-for="(image, index) in visionImages" :key="image.url || image.name || index" class="composer-reference-thumb">
                <img :src="image.url" alt="待理解图片" />
                <button type="button" title="移除图片" @click="removeVisionImage(index)">
                  <i class="ti ti-x"></i>
                </button>
              </div>
            </div>
            <div class="composer-reference-info">
              <small>图片理解</small>
              <strong>{{ visionImages.length }} / {{ maxVisionImages }} 张图片</strong>
              <span>发送后由 GPT-5.5 读取图片内容</span>
            </div>
          </div>
          <div class="composer-input text-chat-composer-input">
            <input ref="fileInput" type="file" accept="image/*" multiple hidden @change="handleVisionFile" />
            <button class="reference-button text-chat-upload-button" type="button" :disabled="loading" title="上传图片" aria-label="上传图片" @click="fileInput.click()">
              <i class="ti ti-photo-plus"></i>
            </button>
            <div class="prompt-box">
              <el-input v-model="inputText" type="textarea" placeholder="输入聊天内容，或上传图片进行理解" @keydown.enter="handleEnter" />
            </div>
            <el-button
              :class="['generate-button', { 'is-loading': loading }]"
              type="primary"
              :disabled="loading"
              :title="loading ? '回复中' : '发送'"
              :aria-label="loading ? '回复中' : '发送'"
              @click="sendMessage"
            >
              <i :class="['ti', loading ? 'ti-loader-2' : 'ti-send']"></i>
              <span class="generate-button-text">{{ loading ? '回复中' : '发送' }}</span>
            </el-button>
          </div>
        </footer>
      </section>
    </section>
  `,
}
