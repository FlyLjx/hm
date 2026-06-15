import { API_BASE_URL, adminApi, getAdminToken } from '../api.js'
import { formatDate } from '../format.js'

const { computed, nextTick, onBeforeUnmount, onMounted, ref } = Vue
const { message } = antd

function fileSize(value) {
  const size = Number(value || 0)
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(2)} MB`
}

function parseLogLine(line, index) {
  const raw = String(line || '')
  const match = raw.match(/^(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z)?)\s+\[([A-Z]+)]\s*(.*)$/)
  const time = match?.[1] || ''
  const level = match?.[2] || ''
  let message = match?.[3] || raw
  const eventMatch = message.match(/^\[([^\]]+)]\s*(.*)$/)
  const event = eventMatch?.[1] || ''
  if (eventMatch) message = eventMatch[2] || ''
  const category = logCategory(event, message)
  const severity = logSeverity(level, event, message)

  return {
    id: `${index}-${raw.slice(0, 16)}`,
    raw,
    time,
    shortTime: time.replace(/^\d{4}-\d{2}-\d{2}[ T]/, ''),
    level,
    event,
    message: message || raw,
    continuation: !match,
    category,
    severity,
  }
}

function logCategory(event, message) {
  const source = `${event || ''} ${message || ''}`.toLowerCase()
  if (event.startsWith('generation:')) return { key: 'generation', label: '生图' }
  if (source.includes('upstream')) return { key: 'upstream', label: '上游' }
  if (source.includes('service-monitor') || source.includes('provider')) return { key: 'service', label: '服务' }
  if (source.includes('task-timeout') || source.includes('task:')) return { key: 'task', label: '任务' }
  if (source.includes('file-logger') || source.includes('server') || source.includes('database') || source.includes('migrate')) return { key: 'system', label: '系统' }
  return { key: 'other', label: '其他' }
}

function logSeverity(level, event, message) {
  const source = `${event || ''} ${message || ''}`.toLowerCase()
  if (level === 'ERROR' || /error|failed|失败|异常|content_policy|调用失败|未返回|fetch failed|socket|exception/.test(source)) return 'error'
  if (level === 'WARN' || /warn|warning|retry|重试|取消|canceled/.test(source)) return 'warn'
  if (/success|finished.*success|request-accepted|queued|processing|complete|完成/.test(source)) return 'success'
  return 'info'
}

function parseLogContent(content) {
  return String(content || '')
    .split(/\r?\n/)
    .filter((line, index, lines) => line || index < lines.length - 1)
    .map(parseLogLine)
}

function logFileDate(name) {
  const match = String(name || '').match(/app-(\d{4})-(\d{2})-(\d{2})\.log/)
  if (!match) return { day: '--', month: '日志', date: String(name || '-') }
  return {
    day: match[3],
    month: `${match[1]}-${match[2]}`,
    date: `${match[1]}-${match[2]}-${match[3]}`,
  }
}

export const SystemLogsPage = {
  setup() {
    const files = ref([])
    const activeName = ref('')
    const detail = ref(null)
    const loading = ref(false)
    const deleting = ref(false)
    const streaming = ref(false)
    const logContentRef = ref(null)
    const logLines = computed(() => parseLogContent(detail.value?.content || ''))
    const logStats = computed(() => {
      const stats = {
        generation: 0,
        upstream: 0,
        service: 0,
        task: 0,
        system: 0,
        other: 0,
        error: 0,
        warn: 0,
      }
      logLines.value.forEach((line) => {
        if (line.continuation) return
        if (Object.prototype.hasOwnProperty.call(stats, line.category.key)) stats[line.category.key] += 1
        if (line.severity === 'error') stats.error += 1
        if (line.severity === 'warn') stats.warn += 1
      })
      return stats
    })
    const activeFileMeta = computed(() => files.value.find((file) => file.name === activeName.value) || null)
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
        if (!activeName.value) {
          detail.value = null
          closeStream()
          return
        }
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

    async function deleteActiveFile() {
      const name = activeName.value || detail.value?.name
      if (!name) return
      if (!window.confirm(`确定删除日志文件「${name}」？删除后不可恢复。`)) return
      deleting.value = true
      closeStream()
      try {
        const response = await adminApi.deleteSystemLog(name)
        const truncated = response?.data?.truncated
        message.success(truncated ? '当前日志已清空' : '日志文件已删除')
        activeName.value = ''
        detail.value = null
        await loadFiles()
        if (files.value[0]) {
          activeName.value = files.value[0].name
          const response = await adminApi.getSystemLog({ name: activeName.value, maxBytes: 500000 })
          detail.value = response.data
          scrollLogToBottom()
          startStream()
        }
      } catch (error) {
        message.error(error instanceof Error ? error.message : '删除日志文件失败')
        await load()
      } finally {
        deleting.value = false
      }
    }

    onMounted(load)
    onBeforeUnmount(closeStream)

    return { files, activeName, detail, loading, deleting, streaming, logContentRef, logLines, logStats, activeFileMeta, load, selectFile, deleteActiveFile, fileSize, formatDate, logFileDate }
  },
  template: `
    <div class="page-stack system-logs-page">
      <a-card class="admin-view-card system-log-hero" :bordered="false">
        <div class="system-log-hero-line">
          <div>
            <div class="page-title">系统日志</div>
            <div class="page-desc">服务器运行、上游报错和启动异常，保存在 logs 文件夹。</div>
          </div>
          <div class="system-log-hero-actions">
            <span :class="['system-log-live-pill', { active: streaming }]">
              <i class="ti ti-point-filled"></i>{{ streaming ? '实时刷新中' : '实时未连接' }}
            </span>
            <a-button :loading="loading" @click="load"><i class="ti ti-refresh"></i>刷新</a-button>
          </div>
        </div>
      </a-card>

      <div class="system-log-layout">
        <a-card class="admin-view-card system-log-file-card" :bordered="false">
          <div class="system-log-file-head">
            <div>
              <div class="page-title">日志文件</div>
              <div class="page-desc">按日期自动生成</div>
            </div>
            <span>{{ files.length }} 个</span>
          </div>
          <div class="system-log-files">
            <button
              v-for="file in files"
              :key="file.name"
              :class="['system-log-file', { active: activeName === file.name }]"
              type="button"
              @click="selectFile(file.name)"
            >
              <span class="system-log-file-date">
                <strong>{{ logFileDate(file.name).day }}</strong>
                <small>{{ logFileDate(file.name).month }}</small>
              </span>
              <span class="system-log-file-copy">
                <strong>{{ file.name }}</strong>
                <small>{{ fileSize(file.size) }}</small>
              </span>
            </button>
          </div>
          <a-empty v-if="!files.length && !loading" description="暂无日志文件" />
        </a-card>

        <a-card class="admin-view-card system-log-viewer-card" :bordered="false">
          <a-spin :spinning="loading">
            <div class="system-log-console-head">
              <div class="system-log-title-block">
                <div>
                  <strong>{{ detail?.name || activeName || '系统日志' }}</strong>
                  <span>{{ detail?.truncated ? '仅显示文件末尾内容' : '完整读取当前范围' }} · {{ logLines.length }} 行 · {{ activeFileMeta ? formatDate(activeFileMeta.updatedAt) : '-' }}</span>
                </div>
              </div>
              <div class="system-log-actions">
                <span class="system-log-size-pill">{{ fileSize(detail?.size || 0) }}</span>
                <a-button danger size="small" :disabled="!detail?.name" :loading="deleting" @click="deleteActiveFile"><i class="ti ti-trash"></i>删除</a-button>
              </div>
            </div>
            <div class="system-log-legend">
              <span class="system-log-legend-item category-generation"><i></i>生图 {{ logStats.generation }}</span>
              <span class="system-log-legend-item category-upstream"><i></i>上游 {{ logStats.upstream }}</span>
              <span class="system-log-legend-item category-service"><i></i>服务 {{ logStats.service }}</span>
              <span class="system-log-legend-item category-task"><i></i>任务 {{ logStats.task }}</span>
              <span class="system-log-legend-item severity-error"><i></i>错误 {{ logStats.error }}</span>
              <span class="system-log-legend-item severity-warn"><i></i>警告 {{ logStats.warn }}</span>
            </div>
            <div ref="logContentRef" class="system-log-content">
              <div class="system-log-table-head">
                <span></span>
                <span>时间</span>
                <span>级别</span>
                <span>类型</span>
                <span>事件</span>
                <span>内容</span>
              </div>
              <div v-if="logLines.length" class="system-log-lines">
                <div
                  v-for="line in logLines"
                  :key="line.id"
                  :class="['system-log-line', 'category-' + line.category.key, 'severity-' + line.severity, { 'is-continuation': line.continuation }]"
                >
                  <span v-if="line.time" class="system-log-time" :title="line.time">{{ line.shortTime }}</span>
                  <span v-if="line.level" class="system-log-level">{{ line.level }}</span>
                  <span v-if="line.category && !line.continuation" class="system-log-badge">{{ line.category.label }}</span>
                  <span v-if="!line.continuation" :class="['system-log-event', { muted: !line.event }]" :title="line.event || 'runtime'">{{ line.event || 'runtime' }}</span>
                  <span class="system-log-message">{{ line.message }}</span>
                </div>
              </div>
              <div v-else class="system-log-empty">暂无日志内容</div>
            </div>
          </a-spin>
        </a-card>
      </div>
    </div>
  `,
}
