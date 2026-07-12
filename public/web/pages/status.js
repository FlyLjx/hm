import { clientApi } from '../common/api.js?v=20260713-status-page-align-v1'
import { notifyError } from '../common/notify.js'

const { computed, onBeforeUnmount, onMounted, ref } = Vue
const REFRESH_SECONDS = 15

function hasReturnedTime(data) {
  return Boolean(data?.generated_at || data?.window_end || data?.fetched_at)
}

function healthClass(data) {
  if (!data || data.reachable === false || data.status === 'unreachable' || !hasReturnedTime(data)) return 'down'
  return 'good'
}

function clampPercent(value, fallback) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.max(0, Math.min(100, number))
}

function percentText(value) {
  return `${clampPercent(value, 0).toFixed(2)}%`
}

export const StatusPage = {
  emits: ['go'],
  setup(_, { emit }) {
    const loading = ref(false)
    const error = ref('')
    const data = ref(null)
    const autoRefresh = ref(true)
    const countdown = ref(REFRESH_SECONDS)
    const responseDuration = ref(0)
    let timer = null

    const safeData = computed(() => data.value || {})
    const currentStatusClass = computed(() => healthClass(safeData.value))
    const isHealthy = computed(() => currentStatusClass.value === 'good')
    const returnedAt = computed(() => safeData.value.generated_at || safeData.value.window_end || safeData.value.fetched_at || '')
    const statusLabel = computed(() => isHealthy.value ? '正常' : '异常')
    const serviceDesc = computed(() => isHealthy.value ? '图片生成服务可用，API 状态检测通过。' : (error.value || '等待上游服务恢复。'))
    const availability = computed(() => isHealthy.value ? clampPercent(safeData.value.stability_percent, 100) : 0)
    const responseMs = computed(() => responseDuration.value > 0 ? responseDuration.value : '-')
    const httpStatus = computed(() => safeData.value.upstream_status_code || '-')
    const dotList = computed(() => {
      const source = Array.isArray(safeData.value.series) ? safeData.value.series.slice(-60) : []
      if (!source.length && returnedAt.value) {
        return Array.from({ length: 60 }, (_, index) => ({ key: `ok-${index}`, state: 'good' }))
      }
      return source.map((item, index) => ({
        key: item.time || index,
        state: item.time || item.success || item.failed ? 'good' : 'muted',
        title: item.time ? '有响应' : '',
      }))
    })
    const sampleCount = computed(() => dotList.value.length)
    const capabilityCards = computed(() => [
      { icon: 'ti-photo', title: '图片生成', desc: 'Generations', status: isHealthy.value ? '可用' : '异常' },
      { icon: 'ti-edit', title: '图片编辑', desc: 'Edits', status: isHealthy.value ? '可用' : '异常' },
      { icon: 'ti-database', title: '模型列表', desc: 'Models', status: isHealthy.value ? '可用' : '异常' },
    ])

    async function loadStatus(silent = false) {
      if (loading.value && !silent) return
      loading.value = true
      if (!silent) error.value = ''
      const startedAt = Date.now()
      try {
        const response = await clientApi.getUpstreamStability()
        responseDuration.value = Math.max(1, Date.now() - startedAt)
        data.value = response.data || {}
        error.value = data.value.error || ''
      } catch (err) {
        responseDuration.value = Math.max(1, Date.now() - startedAt)
        error.value = err.message || '服务状态加载失败'
        if (!silent) notifyError(err, '服务状态加载失败')
      } finally {
        loading.value = false
        countdown.value = REFRESH_SECONDS
      }
    }

    function restartTimer() {
      if (timer) {
        clearInterval(timer)
        timer = null
      }
      countdown.value = REFRESH_SECONDS
      if (!autoRefresh.value) return
      timer = setInterval(() => {
        if (loading.value) return
        countdown.value = Math.max(0, countdown.value - 1)
        if (countdown.value <= 0) loadStatus(true)
      }, 1000)
    }

    function toggleAutoRefresh() {
      autoRefresh.value = !autoRefresh.value
      restartTimer()
    }

    onMounted(() => {
      loadStatus()
      restartTimer()
    })

    onBeforeUnmount(() => {
      if (timer) clearInterval(timer)
    })

    return {
      autoRefresh,
      availability,
      capabilityCards,
      countdown,
      currentStatusClass,
      dotList,
      emit,
      error,
      httpStatus,
      isHealthy,
      loadStatus,
      loading,
      percentText,
      responseMs,
      sampleCount,
      serviceDesc,
      statusLabel,
      toggleAutoRefresh,
    }
  },
  template: `
    <div class="status-dashboard-page">
      <section class="status-dashboard-hero">
        <div>
          <span><i class="ti ti-activity-heartbeat"></i> Service Monitor</span>
          <h1>服务状态</h1>
          <p>查看 AI PAI 生图通道是否可用，页面会自动刷新并展示最近响应采样。</p>
        </div>
        <div class="status-dashboard-actions">
          <button class="status-dashboard-primary" type="button" @click="emit('go', 'chat')">
            <i class="ti ti-sparkles"></i>
            开始生图
          </button>
          <button class="status-dashboard-ghost" type="button" :disabled="loading" @click="loadStatus()">
            <i :class="['ti', loading ? 'ti-loader-2' : 'ti-refresh']"></i>
            刷新
          </button>
          <button :class="['status-dashboard-auto', { active: autoRefresh }]" type="button" @click="toggleAutoRefresh">
            <i class="ti ti-clock"></i>
            {{ autoRefresh ? countdown + 's 后刷新' : '手动刷新' }}
          </button>
        </div>
      </section>

      <section class="status-dashboard-grid">
        <main :class="['status-dashboard-main-card', currentStatusClass]">
          <header class="status-dashboard-main-head">
            <div class="status-dashboard-service">
              <span class="status-dashboard-logo"><i class="ti ti-sparkles"></i></span>
              <div>
                <h2>AI PAI 生图服务</h2>
                <p><b>Image API</b><span>上游状态检测</span></p>
              </div>
            </div>
            <span :class="['status-dashboard-state', currentStatusClass]">{{ statusLabel }}</span>
          </header>

          <div class="status-dashboard-summary">
            <div>
              <span>当前可用性</span>
              <strong>{{ percentText(availability) }}</strong>
              <small>{{ serviceDesc }}</small>
            </div>
            <i :class="['ti', isHealthy ? 'ti-circle-check' : 'ti-alert-triangle']"></i>
          </div>

          <div class="status-dashboard-metrics">
            <article>
              <span><i class="ti ti-bolt"></i> 接口响应</span>
              <strong>{{ responseMs }}<small v-if="responseMs !== '-'">ms</small></strong>
            </article>
            <article>
              <span><i class="ti ti-world-check"></i> HTTP 状态</span>
              <strong>{{ httpStatus }}</strong>
            </article>
            <article>
              <span><i class="ti ti-wave-sine"></i> 采样记录</span>
              <strong>{{ sampleCount }}<small>次</small></strong>
            </article>
          </div>

          <footer class="status-dashboard-samples">
            <div class="status-dashboard-sample-head">
              <span>近 60 次响应记录</span>
              <em>{{ isHealthy ? '稳定' : '待恢复' }}</em>
            </div>
            <div v-if="dotList.length" class="status-dashboard-bars">
              <span v-for="item in dotList" :key="item.key" :class="['status-dashboard-bar', item.state]" :title="item.title"></span>
            </div>
            <div v-else class="status-dashboard-empty">
              <i class="ti ti-clock-exclamation"></i>
              <span>暂无状态响应</span>
            </div>
            <div class="status-dashboard-axis"><span>PAST</span><span>NOW</span></div>
          </footer>
        </main>

        <aside class="status-dashboard-side">
          <section class="status-dashboard-capabilities">
            <div class="status-dashboard-side-head">
              <span>接口能力</span>
              <strong>开放服务</strong>
            </div>
            <article v-for="item in capabilityCards" :key="item.title" :class="['status-dashboard-capability', currentStatusClass]">
              <i :class="['ti', item.icon]"></i>
              <div>
                <strong>{{ item.title }}</strong>
                <span>{{ item.desc }}</span>
              </div>
              <em>{{ item.status }}</em>
            </article>
          </section>

          <section class="status-dashboard-panel">
            <div class="status-dashboard-side-head">
              <span>检测策略</span>
              <strong>自动监控</strong>
            </div>
            <p>页面只展示服务是否有响应，不暴露上游地址和冗余时间信息。</p>
            <button type="button" @click="toggleAutoRefresh">
              <i class="ti ti-refresh"></i>
              {{ autoRefresh ? '关闭自动刷新' : '开启自动刷新' }}
            </button>
          </section>
        </aside>
      </section>
    </div>
  `,
}


