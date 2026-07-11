import { clientApi } from '../common/api.js?v=20260711-api-key-concurrency-title-v1'
import { formatDate } from '../common/format.js?v=20260711-api-key-concurrency-title-v1'
import { notifyError, notifySuccess } from '../common/notify.js'

const { computed, onBeforeUnmount, onMounted, reactive, ref, watch } = Vue
const DEFAULT_API_KEY_CONCURRENCY = 10

const LOG_STATUS_OPTIONS = Object.freeze([
  { value: 'all', label: '全部状态' },
  { value: 'queued', label: '排队中' },
  { value: 'processing', label: '处理中' },
  { value: 'success', label: '成功' },
  { value: 'failed', label: '失败' },
])

function statusLabel(status) {
  return status === 'active' ? '启用' : '禁用'
}

function statusClass(status) {
  if (status === 'active') return 'active'
  if (status === 'disabled') return 'disabled'
  if (status === 'success') return 'success'
  if (status === 'failed') return 'failed'
  return 'queued'
}

function numberText(value) {
  return Number(value || 0).toLocaleString('zh-CN')
}

function positiveNumber(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : fallback
}

function truncatePrompt(value) {
  const text = String(value || '')
  return text.length > 42 ? `${text.slice(0, 42)}...` : text
}

function logStatusText(status) {
  if (status === 'success') return '成功'
  if (status === 'failed') return '失败'
  if (status === 'queued' || status === 'processing') return '处理中'
  return '处理中'
}

function isPaidSubscription(subscription) {
  return Boolean(subscription?.isPaid || subscription?.tier === 'paid' || (subscription?.status === 'active' && subscription?.planId))
}

function quotaWindowLabel(window) {
  if (window?.label) return window.label
  if (window?.key === 'hour') return '小时'
  if (window?.key === 'day') return '今日'
  if (window?.key === 'month') return '本月'
  return '当前'
}

export const ApiAccessPage = {
  props: ['currentUser'],
  emits: ['login', 'go', 'auth-expired'],
  setup(props, { emit }) {
    const loading = ref(false)
    const logsLoading = ref(false)
    const creating = ref(false)
    const keys = ref([])
    const logs = ref([])
    const entitlement = ref(null)
    const pagination = ref({ total: 0, page: 1, pageSize: 8 })
    const createOpen = ref(false)
    const createdKey = ref(null)
    const viewKeyOpen = ref(false)
    const viewingKey = ref(null)
    const logsOpen = ref(false)
    const statusDropdownOpen = ref(false)
    const statusDropdownRef = ref(null)
    const form = reactive({ name: '默认 Key' })
    const logFilter = reactive({ status: 'all', keyword: '' })

    const userToken = computed(() => props.currentUser?.token || '')
    const baseUrl = computed(() => `${location.origin}/v1`)
    const hasKeys = computed(() => keys.value.length > 0)
    const stats = computed(() => ({
      requests: keys.value.reduce((sum, item) => sum + Number(item.requestCount || 0), 0),
      success: keys.value.reduce((sum, item) => sum + Number(item.successCount || 0), 0),
      failed: keys.value.reduce((sum, item) => sum + Number(item.failedCount || 0), 0),
      images: keys.value.reduce((sum, item) => sum + Number(item.imageCount || 0), 0),
    }))
    const subscription = computed(() => entitlement.value || props.currentUser?.subscription || null)
    const quotaSummary = computed(() => {
      const current = subscription.value || {}
      const paid = isPaidSubscription(current)
      const windows = Array.isArray(current.quotaWindows) ? current.quotaWindows : []
      const limitingWindow = !paid && windows.length
        ? [...windows].sort((a, b) => positiveNumber(a.quotaRemaining, positiveNumber(a.quotaLimit, 0)) - positiveNumber(b.quotaRemaining, positiveNumber(b.quotaLimit, 0)))[0]
        : null
      const baseLimit = positiveNumber(current.quotaLimit || current.quotaImages || current.plan?.quotaImages, 0)
      const limit = limitingWindow ? positiveNumber(limitingWindow.quotaLimit, baseLimit) : baseLimit
      const directRemaining = positiveNumber(current.effectiveQuotaRemaining, Number.NaN)
      const fallbackRemaining = positiveNumber(current.quotaRemaining, limit)
      const remaining = limitingWindow
        ? positiveNumber(limitingWindow.quotaRemaining, fallbackRemaining)
        : (Number.isFinite(directRemaining) ? directRemaining : fallbackRemaining)
      const used = limitingWindow
        ? positiveNumber(limitingWindow.quotaUsed, Math.max(0, limit - remaining))
        : positiveNumber(current.quotaUsed, Math.max(0, limit - remaining))
      const percent = limit > 0 ? Math.max(0, Math.min(100, Math.round((used / limit) * 100))) : 0
      const label = limitingWindow ? `${quotaWindowLabel(limitingWindow)}额度` : (paid ? '订阅额度' : '免费额度')
      const planName = current.planName || current.plan?.name || (paid ? '订阅套餐' : '免费版')
      return {
        paid,
        label,
        planName,
        limit,
        remaining,
        used,
        percent,
        windows,
        windowItems: windows.map((item) => ({
          key: item.key || quotaWindowLabel(item),
          label: quotaWindowLabel(item),
          remaining: positiveNumber(item.quotaRemaining, 0),
          used: positiveNumber(item.quotaUsed, 0),
          limit: positiveNumber(item.quotaLimit, 0),
        })),
      }
    })
    const quotaLimitText = computed(() => quotaSummary.value.limit > 0 ? `${numberText(quotaSummary.value.limit)} 张` : '未配置')
    const quotaRemainingText = computed(() => quotaSummary.value.limit > 0 ? `${numberText(quotaSummary.value.remaining)} 张` : '未配置')
    const quotaUsedText = computed(() => quotaSummary.value.limit > 0 ? `${numberText(quotaSummary.value.used)} 张已使用` : '暂无额度数据')
    const quotaDescription = computed(() => {
      if (!subscription.value) return '暂未获取到订阅额度，刷新后会自动同步。'
      if (!quotaSummary.value.paid && quotaSummary.value.windowItems.length) {
        return `免费额度按小时 / 今日 / 本月共同限制，当前按「${quotaSummary.value.label}」计算可用量。`
      }
      return 'API 调用与网页生图共用同一份订阅额度。'
    })
    const userName = computed(() => props.currentUser?.email || props.currentUser?.name || props.currentUser?.id || '当前账号')
    const userInitial = computed(() => String(userName.value || 'A').slice(0, 1).toUpperCase())
    const keyCountText = computed(() => `${keys.value.length} 个 Key`)
    const defaultConcurrencyText = computed(() => `${numberText(DEFAULT_API_KEY_CONCURRENCY)} 个并发`)
    const viewingKeyText = computed(() => viewingKey.value?.keyPlain || viewingKey.value?.key || '')
    const selectedLogStatusLabel = computed(() => LOG_STATUS_OPTIONS.find((item) => item.value === logFilter.status)?.label || '全部状态')
    const totalLogPages = computed(() => Math.max(1, Math.ceil(Number(pagination.value.total || 0) / Number(pagination.value.pageSize || 1))))

    function apiAuthInput(extra = {}) {
      return { userId: props.currentUser?.id, token: userToken.value, ...extra }
    }

    function isAuthExpiredError(error) {
      const message = String(error?.message || '')
      return message.includes('登录已失效') || message.includes('请先登录')
    }

    function handleLoadError(error, fallback) {
      if (isAuthExpiredError(error)) {
        emit('auth-expired')
        return
      }
      notifyError(error, fallback)
    }

    async function loadKeys() {
      if (!props.currentUser?.id) {
        keys.value = []
        return
      }
      loading.value = true
      try {
        const response = await clientApi.listApiAccessKeys(apiAuthInput())
        keys.value = response.data || []
      } catch (error) {
        handleLoadError(error, 'API Key 加载失败')
      } finally {
        loading.value = false
      }
    }

    async function loadSubscription() {
      if (!props.currentUser?.id) {
        entitlement.value = null
        return
      }
      try {
        const response = await clientApi.getCurrentSubscription(props.currentUser.id)
        entitlement.value = response.data || null
      } catch (error) {
        entitlement.value = props.currentUser?.subscription || null
      }
    }

    async function loadLogs(page = pagination.value.page) {
      if (!props.currentUser?.id) {
        logs.value = []
        pagination.value = { total: 0, page: 1, pageSize: 8 }
        return
      }
      logsLoading.value = true
      try {
        const response = await clientApi.listApiAccessLogs(apiAuthInput({
          status: logFilter.status === 'all' ? '' : logFilter.status,
          keyword: logFilter.keyword,
          page,
          pageSize: pagination.value.pageSize,
        }))
        logs.value = response.data || []
        pagination.value = response.pagination || { ...pagination.value, page }
      } catch (error) {
        handleLoadError(error, '调用记录加载失败')
      } finally {
        logsLoading.value = false
      }
    }

    async function refreshAll() {
      await Promise.all([loadKeys(), loadSubscription(), logsOpen.value ? loadLogs(1) : Promise.resolve()])
    }

    function openLogs() {
      if (!props.currentUser?.id) {
        emit('login')
        return
      }
      logsOpen.value = true
      loadLogs(1)
    }

    function openCreate() {
      if (!props.currentUser?.id) {
        emit('login')
        return
      }
      form.name = `API Key ${keys.value.length + 1}`
      createdKey.value = null
      createOpen.value = true
    }

    async function createKey() {
      if (!props.currentUser?.id) {
        emit('login')
        return
      }
      creating.value = true
      try {
        const response = await clientApi.createApiAccessKey(apiAuthInput({ name: form.name }))
        createdKey.value = response.data || null
        notifySuccess('API Key 已创建，请立即复制保存')
        await loadKeys()
      } catch (error) {
        handleLoadError(error, '创建失败')
      } finally {
        creating.value = false
      }
    }

    async function updateStatus(item) {
      const nextStatus = item.status === 'active' ? 'disabled' : 'active'
      try {
        await clientApi.updateApiAccessKey(item.id, apiAuthInput({ status: nextStatus }))
        notifySuccess(nextStatus === 'active' ? 'API Key 已启用' : 'API Key 已禁用')
        await loadKeys()
      } catch (error) {
        handleLoadError(error, '状态更新失败')
      }
    }

    async function deleteKey(item) {
      if (!confirm(`确定删除 ${item.name || item.keyPrefix} 吗？删除后该 Key 将无法继续调用接口。`)) return
      try {
        await clientApi.deleteApiAccessKey(item.id, apiAuthInput())
        notifySuccess('API Key 已删除')
        await refreshAll()
      } catch (error) {
        handleLoadError(error, '删除失败')
      }
    }

    async function copyText(text, message = '已复制') {
      try {
        await navigator.clipboard.writeText(text)
        notifySuccess(message)
      } catch (error) {
        notifyError(error, '复制失败')
      }
    }

    function copyCreatedKey() {
      if (createdKey.value?.key) copyText(createdKey.value.key, '完整 Key 已复制')
    }

    function showKey(item) {
      viewingKey.value = item || null
      viewKeyOpen.value = true
    }

    function copyViewingKey() {
      if (!viewingKeyText.value) {
        notifyError(new Error('这个 Key 创建于旧版本，未保存完整 Key，请删除后重新创建'))
        return
      }
      copyText(viewingKeyText.value, '完整 Key 已复制')
    }

    function setLogStatus(value) {
      logFilter.status = value
      statusDropdownOpen.value = false
    }

    function handleOutsideClick(event) {
      const root = statusDropdownRef.value
      if (root && !root.contains(event.target)) {
        statusDropdownOpen.value = false
      }
    }

    function pageTo(page) {
      if (page < 1 || page > totalLogPages.value) return
      loadLogs(page)
    }

    onMounted(() => {
      refreshAll()
      if (typeof document !== 'undefined') {
        document.addEventListener('click', handleOutsideClick)
      }
    })
    onBeforeUnmount(() => {
      if (typeof document !== 'undefined') {
        document.removeEventListener('click', handleOutsideClick)
      }
    })
    watch(() => props.currentUser?.id || '', refreshAll)
    watch(() => props.currentUser?.subscription, (value) => {
      if (value) entitlement.value = value
    })
    watch(() => [logFilter.status, logFilter.keyword], () => {
      if (logsOpen.value) loadLogs(1)
    })

    return {
      loading,
      logsLoading,
      creating,
      keys,
      logs,
      entitlement,
      pagination,
      createOpen,
      createdKey,
      viewKeyOpen,
      viewingKey,
      logsOpen,
      form,
      logFilter,
      logStatusOptions: LOG_STATUS_OPTIONS,
      baseUrl,
      hasKeys,
      stats,
      subscription,
      quotaSummary,
      quotaLimitText,
      quotaRemainingText,
      quotaUsedText,
      quotaDescription,
      userName,
      userInitial,
      keyCountText,
      defaultConcurrencyText,
      viewingKeyText,
      selectedLogStatusLabel,
      totalLogPages,
      statusDropdownOpen,
      statusDropdownRef,
      loadKeys,
      loadLogs,
      refreshAll,
      openLogs,
      openCreate,
      createKey,
      updateStatus,
      deleteKey,
      copyCreatedKey,
      showKey,
      copyViewingKey,
      copyText,
      setLogStatus,
      pageTo,
      statusLabel,
      statusClass,
      numberText,
      truncatePrompt,
      logStatusText,
      formatDate,
    }
  },
  template: `
    <div class="invite-v2-page api-access-v2-page">
      <section v-if="!currentUser" class="auth-required-panel invite-v2-auth api-access-v2-auth">
        <i class="ti ti-key"></i>
        <strong>登录后管理 API Key</strong>
        <p>创建 Key 后可通过 OpenAI 规范图片接口调用 AI PAI 生图能力，额度与网页生图共享。</p>
        <button class="auth-required-button" type="button" @click="$emit('login')">去登录</button>
      </section>

      <main v-else v-loading="loading" class="invite-v2-main api-access-v2-main">
        <section class="invite-v2-hero api-access-v2-hero">
          <div class="invite-v2-hero-copy">
            <span>OPENAI IMAGE API</span>
            <h2>API 管理</h2>
            <div class="invite-v2-actions">
              <button class="invite-v2-primary" type="button" @click="openCreate">
                <i class="ti ti-plus"></i>
                新建 Key
              </button>
              <button class="invite-v2-ghost" type="button" :disabled="loading || logsLoading" @click="refreshAll">
                <i :class="['ti', 'ti-refresh', { 'is-spinning': loading || logsLoading }]"></i>
                刷新
              </button>
              <button class="invite-v2-ghost api-access-v2-log-entry" type="button" @click="openLogs">
                <i class="ti ti-list-details"></i>
                调用记录
              </button>
            </div>
          </div>
          <div class="invite-v2-identity api-access-v2-identity">
            <span class="invite-v2-avatar">{{ userInitial }}</span>
            <div>
              <small>当前账号</small>
              <strong>{{ userName }}</strong>
              <em>已创建：{{ keyCountText }} · 默认并发：{{ defaultConcurrencyText }}</em>
            </div>
          </div>
        </section>

        <section class="invite-v2-summary api-access-v2-summary" aria-label="API 使用统计">
          <article>
            <span><i class="ti ti-key"></i></span>
            <div>
              <strong>{{ numberText(keys.length) }}</strong>
              <small>API Key</small>
            </div>
          </article>
          <article>
            <span class="blue"><i class="ti ti-arrows-split"></i></span>
            <div>
              <strong>{{ defaultConcurrencyText }}</strong>
              <small>单 Key 默认并发</small>
            </div>
          </article>
          <article>
            <span class="gold"><i class="ti ti-photo-spark"></i></span>
            <div>
              <strong>{{ quotaLimitText }}</strong>
              <small>调用额度</small>
            </div>
          </article>
          <article>
            <span class="green"><i class="ti ti-battery-vertical-3"></i></span>
            <div>
              <strong>{{ quotaRemainingText }}</strong>
              <small>剩余额度</small>
            </div>
          </article>
        </section>

        <section class="api-access-v2-quota-panel" aria-label="API 调用额度">
          <div class="api-access-v2-quota-head">
            <span><i class="ti ti-gauge"></i></span>
            <div>
              <small>{{ quotaSummary.planName }} · {{ quotaSummary.label }}</small>
              <strong>API 调用额度</strong>
            </div>
          </div>
          <div class="api-access-v2-quota-metrics">
            <article>
              <small>调用额度</small>
              <strong>{{ quotaLimitText }}</strong>
            </article>
            <article>
              <small>剩余额度</small>
              <strong>{{ quotaRemainingText }}</strong>
            </article>
            <article>
              <small>API 出图</small>
              <strong>{{ numberText(stats.images) }} 张</strong>
            </article>
          </div>
          <div class="api-access-v2-quota-progress" :class="{ empty: quotaSummary.remaining <= 0 && quotaSummary.limit > 0 }">
            <span :style="{ width: quotaSummary.percent + '%' }"></span>
          </div>
          <div v-if="quotaSummary.windowItems.length" class="api-access-v2-quota-windows">
            <span v-for="item in quotaSummary.windowItems" :key="item.key">
              <em>{{ item.label }}</em>
              <strong>剩余 {{ numberText(item.remaining) }} / {{ numberText(item.limit) }}</strong>
            </span>
          </div>
          <p>
            <span>{{ quotaUsedText }}</span>
            <em>{{ quotaDescription }}</em>
          </p>
        </section>

        <section class="invite-v2-grid api-access-v2-grid">
          <main class="invite-v2-content api-access-v2-content">
            <article class="invite-v2-panel api-access-v2-panel">
              <header class="invite-v2-panel-head">
                <div>
                  <h3><i class="ti ti-key"></i>我的 API Key</h3>
                  <p>新建 Key 会保存完整内容，可在列表中点击“查看 Key”再次查看；旧版本 Key 无法反推。</p>
                </div>
                <span>{{ keys.length }} 个</span>
              </header>

              <div v-loading="loading" class="api-access-v2-key-list">
                <div v-if="hasKeys" v-for="item in keys" :key="item.id" class="api-access-v2-key-row">
                  <div class="api-access-v2-key-top">
                    <div class="api-access-v2-key-main">
                      <span :class="['api-access-v2-status', statusClass(item.status)]">{{ statusLabel(item.status) }}</span>
                      <div class="api-access-v2-key-title">
                        <div class="api-access-v2-key-name-line">
                          <strong>{{ item.name }}</strong>
                          <span class="api-access-v2-concurrency-badge">
                            <i class="ti ti-arrows-split"></i>
                            并发 {{ numberText(item.concurrencyLimit || 10) }}
                          </span>
                        </div>
                        <small>Key 内容已隐藏，需要时点击右侧查看</small>
                      </div>
                    </div>
                    <button class="api-access-v2-view-key" type="button" @click="showKey(item)">
                      <i class="ti ti-eye"></i>
                      查看 Key
                    </button>
                  </div>

                  <div class="api-access-v2-key-stats">
                    <article>
                      <small>请求</small>
                      <strong>{{ numberText(item.requestCount) }}</strong>
                    </article>
                    <article>
                      <small>成功</small>
                      <strong>{{ numberText(item.successCount) }}</strong>
                    </article>
                    <article>
                      <small>失败</small>
                      <strong>{{ numberText(item.failedCount) }}</strong>
                    </article>
                    <article>
                      <small>图片</small>
                      <strong>{{ numberText(item.imageCount) }}</strong>
                    </article>
                  </div>

                  <div class="api-access-v2-key-foot">
                    <div class="api-access-v2-key-meta">
                      <span><i class="ti ti-calendar"></i>创建：{{ formatDate(item.createdAt) }}</span>
                      <span><i class="ti ti-arrows-split"></i>并发：{{ numberText(item.concurrencyLimit || 1) }}</span>
                      <span><i class="ti ti-clock"></i>最近使用：{{ item.lastUsedAt ? formatDate(item.lastUsedAt) : '暂无' }}</span>
                    </div>
                    <div class="api-access-v2-row-actions">
                      <button type="button" @click="updateStatus(item)">{{ item.status === 'active' ? '禁用' : '启用' }}</button>
                      <button class="danger" type="button" @click="deleteKey(item)">删除</button>
                    </div>
                  </div>
                </div>

                <div v-if="!loading && !hasKeys" class="invite-v2-empty api-access-v2-empty">
                  <i class="ti ti-key-off"></i>
                  <strong>暂无 API Key</strong>
                  <p>系统不会默认创建 Key，需要你手动创建。新建 Key 默认支持 {{ defaultConcurrencyText }}，超出后自动进入队列等待。</p>
                  <button class="invite-v2-primary" type="button" @click="openCreate">新建 Key</button>
                </div>
              </div>
            </article>

            <article class="invite-v2-panel api-access-v2-panel api-access-v2-log-card">
              <div class="api-access-v2-log-card-icon">
                <i class="ti ti-list-details"></i>
              </div>
              <div class="api-access-v2-log-card-copy">
                <h3>调用记录</h3>
                <p>按时间查看每次 API 调用，支持状态筛选、关键词搜索和分页。</p>
              </div>
              <button class="invite-v2-primary api-access-v2-log-card-button" type="button" @click="openLogs">
                查看记录
              </button>
            </article>
          </main>

          <aside class="invite-v2-side api-access-v2-side">
            <article class="invite-v2-panel api-access-v2-panel api-access-v2-doc">
              <header class="invite-v2-panel-head">
                <div>
                  <h3><i class="ti ti-plug-connected"></i>接入信息</h3>
                  <p>按 OpenAI Images 规范接入，额度与网页生图保持一致。</p>
                </div>
              </header>

              <section class="api-access-v2-connect-card">
                <div class="api-access-v2-connect-card-head">
                  <span><i class="ti ti-world"></i></span>
                  <div>
                    <small>Base URL</small>
                    <code>{{ baseUrl }}</code>
                  </div>
                </div>
                <button type="button" @click="copyText(baseUrl, 'Base URL 已复制')">
                  <i class="ti ti-copy"></i>
                  复制地址
                </button>
              </section>

              <section class="api-access-v2-auth-strip">
                <span><i class="ti ti-shield-lock"></i></span>
                <div>
                  <small>请求头</small>
                  <strong>Authorization: Bearer 你的 API Key</strong>
                </div>
              </section>

              <section class="api-access-v2-auth-strip api-access-v2-concurrency-strip">
                <span><i class="ti ti-arrows-split"></i></span>
                <div>
                  <small>并发规则</small>
                  <strong>单 Key 默认 {{ defaultConcurrencyText }}，超出后排队处理</strong>
                </div>
              </section>

              <section class="api-access-v2-endpoint-box">
                <div class="api-access-v2-endpoint-box-head">
                  <strong>开放接口</strong>
                  <small>以下为基于 Base URL 的相对路径</small>
                </div>
                <div class="api-access-v2-endpoint-list">
                  <button type="button" @click="copyText(baseUrl + '/models', '完整接口地址已复制')">
                    <em>GET</em>
                    <div>
                      <strong>获取模型</strong>
                      <small>查看当前可用模型</small>
                    </div>
                    <code>/models</code>
                  </button>
                  <button type="button" @click="copyText(baseUrl + '/images/generations', '完整接口地址已复制')">
                    <em>POST</em>
                    <div>
                      <strong>图片生成</strong>
                      <small>文本生成图片</small>
                    </div>
                    <code>/images/generations</code>
                  </button>
                  <button type="button" @click="copyText(baseUrl + '/images/edits', '完整接口地址已复制')">
                    <em>POST</em>
                    <div>
                      <strong>图片编辑</strong>
                      <small>参考图 / 蒙版编辑</small>
                    </div>
                    <code>/images/edits</code>
                  </button>
                </div>
              </section>
            </article>

            <article class="invite-v2-panel api-access-v2-panel api-access-v2-guide">
              <header class="invite-v2-panel-head">
                <div>
                  <h3><i class="ti ti-route"></i>使用流程</h3>
                </div>
              </header>
              <ol>
                <li><span>1</span>新建并保存 API Key</li>
                <li><span>2</span>按 OpenAI 图片接口发起请求</li>
                <li><span>3</span>在调用记录查看状态与消耗</li>
              </ol>
              <button type="button" @click="openLogs"><i class="ti ti-list-details"></i>查看调用记录</button>
            </article>
          </aside>
        </section>
      </main>

      <el-dialog v-model="logsOpen" width="1040px" class="api-access-log-dialog" custom-class="api-access-log-panel" @close="statusDropdownOpen = false">
        <template #header>
          <div class="api-access-dialog-head api-access-log-dialog-head">
            <i class="ti ti-list-details"></i>
            <div>
              <strong>调用记录</strong>
              <p>共 {{ numberText(pagination.total) }} 条真实 API 调用记录</p>
            </div>
          </div>
        </template>

        <div class="api-access-log-toolbar">
          <div class="api-access-log-toolbar-copy">
            <span>{{ selectedLogStatusLabel }}</span>
            <small>每页 {{ pagination.pageSize }} 条 · 第 {{ pagination.page }} / {{ totalLogPages }} 页</small>
          </div>
          <div class="api-access-v2-filter api-access-log-filter">
            <div ref="statusDropdownRef" :class="['api-access-v2-select', { open: statusDropdownOpen }]">
              <button type="button" @click.stop="statusDropdownOpen = !statusDropdownOpen">
                <span>{{ selectedLogStatusLabel }}</span>
                <i class="ti ti-chevron-down"></i>
              </button>
              <div v-if="statusDropdownOpen" class="api-access-v2-select-menu">
                <button
                  v-for="option in logStatusOptions"
                  :key="option.value"
                  :class="{ active: logFilter.status === option.value }"
                  type="button"
                  @click="setLogStatus(option.value)"
                >
                  <span>{{ option.label }}</span>
                  <i v-if="logFilter.status === option.value" class="ti ti-check"></i>
                </button>
              </div>
            </div>
            <input v-model.trim="logFilter.keyword" placeholder="搜索模型 / 提示词" />
            <button class="api-access-log-refresh" type="button" :disabled="logsLoading" @click="loadLogs(1)">
              <i :class="['ti', 'ti-refresh', { 'is-spinning': logsLoading }]"></i>
              刷新
            </button>
          </div>
        </div>

        <div v-loading="logsLoading" class="invite-v2-table api-access-v2-table api-access-log-table">
          <div v-if="logs.length" class="invite-v2-table-head api-access-v2-table-head">
            <span>接口</span>
            <span>模型</span>
            <span>结果</span>
            <span>时间</span>
          </div>
          <div v-for="item in logs" :key="item.id" class="invite-v2-table-row api-access-v2-table-row">
            <div class="api-access-v2-endpoint">
              <strong>{{ item.endpoint }}</strong>
              <small>{{ truncatePrompt(item.prompt) || '暂无提示词' }}</small>
            </div>
            <div class="api-access-v2-model">
              <strong>{{ item.model || '-' }}</strong>
              <small>{{ item.size || '默认尺寸' }} · {{ item.quality || '默认质量' }}</small>
            </div>
            <div class="invite-v2-reward api-access-v2-result">
              <em :class="statusClass(item.status)">{{ logStatusText(item.status) }}</em>
              <strong>{{ item.imageCount || item.quantity || 0 }} 张</strong>
            </div>
            <time>{{ formatDate(item.createdAt) }}</time>
          </div>
          <div v-if="!logsLoading && !logs.length" class="invite-v2-empty api-access-v2-empty small">
            <i class="ti ti-database-off"></i>
            <strong>暂无调用记录</strong>
            <p>通过 API Key 调用生图接口后，这里会显示真实使用情况。</p>
          </div>
        </div>

        <template #footer>
          <div class="api-access-log-footer">
            <span>共 {{ numberText(pagination.total) }} 条</span>
            <div class="api-access-v2-pages">
              <button type="button" :disabled="pagination.page <= 1 || logsLoading" @click="pageTo(pagination.page - 1)">上一页</button>
              <span>{{ pagination.page }} / {{ totalLogPages }}</span>
              <button type="button" :disabled="pagination.page >= totalLogPages || logsLoading" @click="pageTo(pagination.page + 1)">下一页</button>
            </div>
          </div>
        </template>
      </el-dialog>

      <el-dialog v-model="createOpen" width="520px" class="api-access-create-dialog" custom-class="api-access-create-panel" :close-on-click-modal="!createdKey">
        <template #header>
          <div class="api-access-dialog-head">
            <i class="ti ti-key"></i>
            <div>
              <strong>新建 API Key</strong>
              <p>创建后可在列表中再次查看完整 Key。</p>
            </div>
          </div>
        </template>
        <div class="api-access-create-body">
          <label>
            <span>Key 名称</span>
            <input v-model.trim="form.name" placeholder="例如：本地脚本 / 客户端调用" :disabled="Boolean(createdKey)" />
          </label>
          <div v-if="createdKey?.key" class="api-access-created-key">
            <span>请立即复制保存</span>
            <code>{{ createdKey.key }}</code>
            <button class="invite-v2-secondary" type="button" @click="copyCreatedKey"><i class="ti ti-copy"></i>复制完整 Key</button>
          </div>
          <p class="api-access-create-tip"><i class="ti ti-info-circle"></i> API Key 生图会占用当前账号订阅额度，与网页生图额度共享。</p>
        </div>
        <template #footer>
          <button class="invite-v2-ghost api-access-v2-dialog-button" type="button" @click="createOpen = false">关闭</button>
          <button v-if="!createdKey" class="invite-v2-primary api-access-v2-dialog-button" type="button" :disabled="creating" @click="createKey">
            <i :class="['ti', creating ? 'ti-loader-2 is-spinning' : 'ti-plus']"></i>{{ creating ? '创建中' : '确认创建' }}
          </button>
        </template>
      </el-dialog>

      <el-dialog v-model="viewKeyOpen" width="560px" class="api-access-create-dialog" custom-class="api-access-create-panel">
        <template #header>
          <div class="api-access-dialog-head">
            <i class="ti ti-eye"></i>
            <div>
              <strong>查看 API Key</strong>
              <p>{{ viewingKey?.name || 'API Key' }}</p>
            </div>
          </div>
        </template>
        <div class="api-access-create-body">
          <div v-if="viewingKeyText" class="api-access-created-key">
            <span>完整 Key</span>
            <code>{{ viewingKeyText }}</code>
            <button class="invite-v2-secondary" type="button" @click="copyViewingKey"><i class="ti ti-copy"></i>复制完整 Key</button>
          </div>
          <div v-else class="api-access-v2-view-missing">
            <i class="ti ti-alert-circle"></i>
            <strong>这个 Key 暂不支持再次查看</strong>
            <p>它创建于旧版本，当时只保存了 Hash，无法反推出完整 Key。请删除后重新创建，新 Key 会支持再次查看。</p>
          </div>
        </div>
        <template #footer>
          <button class="invite-v2-ghost api-access-v2-dialog-button" type="button" @click="viewKeyOpen = false">关闭</button>
          <button v-if="viewingKeyText" class="invite-v2-primary api-access-v2-dialog-button" type="button" @click="copyViewingKey">
            <i class="ti ti-copy"></i>复制
          </button>
        </template>
      </el-dialog>
    </div>
  `,
}
