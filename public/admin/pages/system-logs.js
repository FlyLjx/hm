import { API_BASE_URL, adminApi, getAdminToken } from '../api.js'
import { formatDate } from '../format.js'

const { nextTick, onBeforeUnmount, onMounted, ref } = Vue
const { message } = antd

function fileSize(value) {
  const size = Number(value || 0)
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(2)} MB`
}

export const SystemLogsPage = {
  setup() {
    const files = ref([])
    const activeName = ref('')
    const detail = ref(null)
    const loading = ref(false)
    const streaming = ref(false)
    const logContentRef = ref(null)
    let streamSource = null

    function closeStream() {
      streaming.value = false
      if (streamSource) {
        streamSource.close()
        streamSource = null
      }
    }

    function scrollLogToBottom() {
      nextTick(() => {
        const target = logContentRef.value
        if (target) target.scrollTop = target.scrollHeight
      })
    }

    function streamUrl() {
      const params = new URLSearchParams()
      if (activeName.value) params.set('name', activeName.value)
      if (detail.value?.size) params.set('offset', String(detail.value.size))
      const token = getAdminToken()
      if (token) params.set('token', token)
      return `${API_BASE_URL}/api/system-logs/stream?${params.toString()}`
    }

    function startStream() {
      closeStream()
      if (!activeName.value || !window.EventSource) return
      streamSource = new EventSource(streamUrl())
      streaming.value = true
      streamSource.addEventListener('append', (event) => {
        const payload = JSON.parse(event.data || '{}')
        if (!detail.value || payload.name !== detail.value.name) return
        detail.value = {
          ...detail.value,
          content: `${detail.value.content || ''}${payload.content || ''}`,
          size: payload.size || detail.value.size,
          truncated: detail.value.truncated || Boolean(payload.truncated),
        }
        scrollLogToBottom()
      })
      streamSource.onerror = () => {
        streaming.value = false
      }
    }

    async function loadFiles() {
      const response = await adminApi.listSystemLogs()
      files.value = response.data || []
      if (!activeName.value && files.value[0]) activeName.value = files.value[0].name
    }

    async function load() {
      loading.value = true
      try {
        await loadFiles()
        const response = await adminApi.getSystemLog({ name: activeName.value, maxBytes: 500000 })
        detail.value = response.data
        scrollLogToBottom()
        startStream()
      } catch (error) {
        message.error(error instanceof Error ? error.message : '加载系统日志失败')
      } finally {
        loading.value = false
      }
    }

    async function selectFile(name) {
      activeName.value = name
      await load()
    }

    onMounted(load)
    onBeforeUnmount(closeStream)

    return { files, activeName, detail, loading, streaming, logContentRef, load, selectFile, fileSize, formatDate }
  },
  template: `
    <div class="page-stack">
      <a-card class="admin-view-card" :bordered="false">
        <div class="admin-card-hero">
          <div>
            <div class="page-kicker">Runtime Logs</div>
            <div class="page-title">系统日志</div>
            <div class="page-desc">查看服务器运行日志、上游报错和启动异常。日志文件保存在服务器项目目录的 logs 文件夹。</div>
          </div>
          <div style="display:flex;align-items:center;gap:10px">
            <a-tag :color="streaming ? 'green' : 'default'">{{ streaming ? '实时刷新中' : '实时未连接' }}</a-tag>
            <a-button :loading="loading" @click="load">刷新</a-button>
          </div>
        </div>
      </a-card>

      <div class="system-log-layout">
        <a-card class="admin-view-card" :bordered="false">
          <div class="admin-card-hero compact">
            <div><div class="page-title" style="font-size:18px">日志文件</div><div class="page-desc">按日期自动生成。</div></div>
          </div>
          <div class="system-log-files">
            <button
              v-for="file in files"
              :key="file.name"
              :class="['system-log-file', { active: activeName === file.name }]"
              type="button"
              @click="selectFile(file.name)"
            >
              <strong>{{ file.name }}</strong>
              <span>{{ fileSize(file.size) }} · {{ formatDate(file.updatedAt) }}</span>
            </button>
          </div>
          <a-empty v-if="!files.length && !loading" description="暂无日志文件" />
        </a-card>

        <a-card class="admin-view-card" :bordered="false">
          <a-spin :spinning="loading">
            <div class="system-log-head">
              <div>
                <strong>{{ detail?.name || activeName || '系统日志' }}</strong>
                <span v-if="detail?.truncated">仅显示文件末尾内容</span>
              </div>
              <a-tag>{{ fileSize(detail?.size || 0) }}</a-tag>
            </div>
            <pre ref="logContentRef" class="system-log-content">{{ detail?.content || '暂无日志内容' }}</pre>
          </a-spin>
        </a-card>
      </div>
    </div>
  `,
}
