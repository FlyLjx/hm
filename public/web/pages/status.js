import { clientApi } from '../common/api.js'

const { computed, onBeforeUnmount, onMounted, ref } = Vue

function duration(value) {
  const ms = Math.round(Number(value || 0))
  if (!ms) return '-'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

function msValue(value) {
  const ms = Math.round(Number(value || 0))
  return ms > 0 ? String(ms) : '-'
}

function percent(value) {
  return `${Number(value || 0).toFixed(2)}%`
}

function availability(provider) {
  return provider?.total ? percent(provider.successRate) : '-'
}

function healthLevel(rate, total) {
  if (!total) return 'unknown'
  if (rate >= 99) return 'excellent'
  if (rate >= 95) return 'stable'
  if (rate >= 85) return 'degraded'
  return 'incident'
}

function healthText(level) {
  return {
    excellent: '运行优秀',
    stable: '运行稳定',
    degraded: '轻微波动',
    incident: '服务异常',
    unknown: '暂无样本',
  }[level] || '暂无样本'
}

function formatDate(value) {
  if (!value) return '-'
  const date = new Date(String(value))
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString('zh-CN', { hour12: false })
}

function providerState(provider) {
  if (provider?.providerStatus === 'disabled') return 'disabled'
  if (!provider?.total) return 'unknown'
  if (provider.lastStatus === 'failed') return 'incident'
  return healthLevel(provider.successRate, provider.total)
}

function providerStateText(provider) {
  const state = providerState(provider)
  return {
    excellent: '正常',
    stable: '正常',
    degraded: '波动',
    incident: '错误',
    disabled: '停用',
    unknown: '待监控',
  }[state] || '待监控'
}

function providerModelText(provider) {
  const names = provider?.modelNames || []
  if (names.length > 0) return names.join(' / ')
  return provider?.providerType || '接口'
}

function historySlots(provider) {
  const items = provider?.history || []
  const padding = Array.from({ length: Math.max(0, 60 - items.length) }, () => ({ status: 'unknown' }))
  return [...padding, ...items].slice(-60)
}

export const StatusPage = {
  setup() {
    const status = ref(null)
    const loading = ref(false)
    const error = ref('')
    let timer = null

    const overall = computed(() => status.value?.overall || { total: 0, successRate: 0, avgDurationMs: 0, lastCheckedAt: null })
    const weekly = computed(() => status.value?.weekly || { total: 0, successRate: 0, avgDurationMs: 0, lastCheckedAt: null })
    const providers = computed(() => status.value?.providers || [])
    const level = computed(() => healthLevel(overall.value.successRate, overall.value.total))

    async function load() {
      loading.value = true
      error.value = ''
      try {
        const response = await clientApi.getServiceStatus()
        status.value = response.data || null
      } catch (err) {
        error.value = err?.message || '服务状态加载失败'
      } finally {
        loading.value = false
      }
    }

    onMounted(() => {
      load()
      timer = setInterval(load, 60000)
    })
    onBeforeUnmount(() => {
      if (timer) clearInterval(timer)
    })

    return { status, loading, error, overall, weekly, providers, level, load, duration, msValue, percent, availability, healthLevel, healthText, formatDate, providerState, providerStateText, providerModelText, historySlots }
  },
  template: `
    <section class="status-page">
      <div class="status-hero glass-card">
        <div class="status-hero-copy">
          <span class="eyebrow"><i class="ti ti-activity-heartbeat"></i> Service Monitor</span>
          <h2>服务状态</h2>
          <p>这里展示最近调用样本的接口可用率和响应表现，帮助你判断当前生成服务是否稳定。</p>
        </div>
        <div :class="['status-orb', level]">
          <strong>{{ percent(overall.successRate) }}</strong>
          <span>{{ healthText(level) }}</span>
        </div>
      </div>

      <div class="status-metrics">
        <article class="status-metric glass-card">
          <span>最近 24 小时可用率</span>
          <strong>{{ percent(overall.successRate) }}</strong>
          <small>{{ overall.total }} 次监控样本</small>
        </article>
        <article class="status-metric glass-card">
          <span>最近 7 天可用率</span>
          <strong>{{ percent(weekly.successRate) }}</strong>
          <small>{{ weekly.total }} 次监控样本</small>
        </article>
        <article class="status-metric glass-card">
          <span>平均响应</span>
          <strong>{{ msValue(overall.avgDurationMs) }} ms</strong>
          <small>最近 24 小时</small>
        </article>
        <article class="status-metric glass-card">
          <span>最近检查</span>
          <strong class="status-time">{{ formatDate(overall.lastCheckedAt) }}</strong>
          <small>每分钟自动刷新</small>
        </article>
      </div>

      <section class="status-panel">
        <div class="status-panel-head">
          <div>
            <span>Provider Health</span>
            <h2>接口管理监控</h2>
          </div>
          <el-button :loading="loading" @click="load">
            <i class="ti ti-refresh"></i>
            刷新
          </el-button>
        </div>
        <div v-if="error" class="status-error">{{ error }}</div>
        <div v-if="!providers.length && !loading" class="status-empty">暂无接口配置，请先在后台接口管理中新增接口。</div>
        <div v-else class="status-provider-grid">
          <article v-for="provider in providers" :key="provider.providerId || provider.providerName" :class="['status-interface-card', providerState(provider)]">
            <header class="status-interface-head">
              <div class="status-interface-brand">
                <span class="status-interface-icon"><i class="ti ti-brand-openai"></i></span>
                <div>
                  <strong>{{ provider.providerName || '默认接口' }}</strong>
                  <small><b>{{ provider.providerType || 'custom' }}</b> {{ providerModelText(provider) }}</small>
                </div>
              </div>
              <span class="status-interface-state">{{ providerStateText(provider) }}</span>
            </header>

            <div class="status-latency-grid">
              <div class="status-latency-box">
                <span><i class="ti ti-bolt"></i> 最近延迟</span>
                <strong>{{ msValue(provider.lastDurationMs || provider.avgDurationMs) }}<small>ms</small></strong>
              </div>
              <div class="status-latency-box">
                <span><i class="ti ti-world-ping"></i> 平均延迟</span>
                <strong>{{ msValue(provider.avgDurationMs) }}<small>ms</small></strong>
              </div>
            </div>

            <div class="status-availability">
              <span>可用性 · 7 天</span>
              <strong>{{ availability(provider) }}</strong>
            </div>

            <div class="status-history-head">
              <span>近 60 次记录</span>
              <span>{{ provider.total }} 次样本</span>
            </div>
            <div class="status-history-bars" aria-label="最近 60 次调用状态">
              <i v-for="(item, index) in historySlots(provider)" :key="index" :class="item.status"></i>
            </div>
            <div class="status-history-foot">
              <span>PAST</span>
              <span>{{ provider.lastCheckedAt ? formatDate(provider.lastCheckedAt) : '暂无刷新' }}</span>
              <span>NOW</span>
            </div>
          </article>
        </div>
      </section>
    </section>
  `,
}
