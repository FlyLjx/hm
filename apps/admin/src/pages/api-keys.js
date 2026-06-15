import { adminApi } from '../api.js'
import { formatDate } from '../format.js'

const { computed, onBeforeUnmount, onMounted, ref, watch } = Vue
const { message, Modal } = antd

function duration(value) {
  const ms = Math.round(Number(value || 0))
  if (!ms) return '-'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

function percent(value) {
  return `${Number(value || 0).toFixed(2)}%`
}

function statusColor(status) {
  return status === 'active' || status === 'success' ? 'green' : 'red'
}

function keyStatusText(row) {
  if (row.deletedAt) return '已删除'
  return row.status === 'active' ? '启用' : '停用'
}

function keyStatusColor(row) {
  if (row.deletedAt) return 'default'
  return statusColor(row.status)
}

function apiKeyText(row) {
  return row.keyPlain || `${row.keyPrefix || ''}********`
}

export const ApiKeysPage = {
  setup() {
    const rows = ref([])
    const stats = ref(null)
    const loading = ref(false)
    const actionLoadingId = ref('')
    const page = ref(1)
    const pageSize = 30
    const pagination = ref(null)
    const status = ref('all')
    const keyword = ref('')
    const activeKey = ref(null)
    const logRows = ref([])
    const logStats = ref(null)
    const logLoading = ref(false)
    const logPage = ref(1)
    const logPagination = ref(null)
    const logDays = ref(30)
    const logStatus = ref('all')

    const summary = computed(() => stats.value || {
      totalKeys: 0,
      activeKeys: 0,
      disabledKeys: 0,
      totalCalls: 0,
      successRate: 0,
      avgDurationMs: 0,
    })

    async function load() {
      loading.value = true
      try {
        const response = await adminApi.listApiKeys({ page: page.value, pageSize, status: status.value, keyword: keyword.value })
        rows.value = response.data || []
        stats.value = response.stats || null
        pagination.value = response.pagination || null
      } catch (error) {
        message.error(error instanceof Error ? error.message : '加载 Key 管理失败')
      } finally {
        loading.value = false
      }
    }

    async function copyKey(row) {
      const value = apiKeyText(row)
      await navigator.clipboard?.writeText(value)
      message.success(row.keyPlain ? '完整 Key 已复制' : '已复制遮罩 Key')
    }

    async function updateStatus(row) {
      const nextStatus = row.status === 'active' ? 'disabled' : 'active'
      actionLoadingId.value = row.id
      try {
        await adminApi.updateApiKeyStatus(row.id, { status: nextStatus })
        await load()
        if (activeKey.value?.id === row.id) activeKey.value = rows.value.find((item) => item.id === row.id) || activeKey.value
        message.success(nextStatus === 'active' ? 'Key 已启用，用户其它 Key 已自动停用' : 'Key 已停用')
      } catch (error) {
        message.error(error instanceof Error ? error.message : '更新 Key 状态失败')
      } finally {
        actionLoadingId.value = ''
      }
    }

    function confirmDelete(row) {
      Modal.confirm({
        title: '删除 API Key',
        content: `确认删除「${row.name}」吗？删除后无法恢复。`,
        okText: '删除',
        okType: 'danger',
        cancelText: '取消',
        async onOk() {
          actionLoadingId.value = row.id
          try {
            await adminApi.deleteApiKey(row.id)
            if (activeKey.value?.id === row.id) activeKey.value = null
            await load()
            message.success('Key 已删除')
          } finally {
            actionLoadingId.value = ''
          }
        },
      })
    }

    async function openLogs(row) {
      activeKey.value = row
      logPage.value = 1
      await loadLogs()
    }

    async function loadLogs() {
      if (!activeKey.value?.id) return
      logLoading.value = true
      try {
        const response = await adminApi.listApiKeyLogs(activeKey.value.id, {
          page: logPage.value,
          pageSize,
          days: logDays.value,
          status: logStatus.value,
        })
        logRows.value = response.data || []
        logStats.value = response.stats || null
        logPagination.value = response.pagination || null
      } catch (error) {
        message.error(error instanceof Error ? error.message : '加载 Key 日志失败')
      } finally {
        logLoading.value = false
      }
    }

    function closeLogs() {
      activeKey.value = null
      logRows.value = []
      logStats.value = null
      logPagination.value = null
    }

    function handleAutoRefresh() {
      if (activeKey.value) loadLogs()
      else load()
    }

    watch(page, load)
    watch(status, () => {
      page.value = 1
      load()
    })
    watch(keyword, () => {
      page.value = 1
      load()
    })
    watch([logPage, logDays, logStatus], loadLogs)

    onMounted(() => {
      load()
      window.addEventListener('admin:auto-refresh', handleAutoRefresh)
    })
    onBeforeUnmount(() => {
      window.removeEventListener('admin:auto-refresh', handleAutoRefresh)
    })

    return {
      rows,
      summary,
      loading,
      actionLoadingId,
      page,
      pageSize,
      pagination,
      status,
      keyword,
      activeKey,
      logRows,
      logStats,
      logLoading,
      logPage,
      logPagination,
      logDays,
      logStatus,
      load,
      copyKey,
      updateStatus,
      confirmDelete,
      openLogs,
      loadLogs,
      closeLogs,
      apiKeyText,
      duration,
      percent,
      statusColor,
      keyStatusText,
      keyStatusColor,
      formatDate,
    }
  },
  template: `
    <div class="page-stack">
      <a-card class="admin-view-card" :bordered="false">
        <div class="admin-card-hero">
          <div>
            <div class="page-kicker">Developer Access</div>
            <div class="page-title">Key 管理</div>
            <div class="page-desc">集中查看用户 API Key、完整 Key、启停状态和调用表现。前台删除会保留后台记录和调用日志。</div>
          </div>
          <a-button :loading="loading" @click="load">刷新</a-button>
        </div>
        <div class="summary-grid api-key-admin-summary">
          <div class="summary-card"><span>Key 总数</span><b>{{ summary.totalKeys }}</b></div>
          <div class="summary-card"><span>启用中</span><b>{{ summary.activeKeys }}</b></div>
          <div class="summary-card"><span>近 30 天调用</span><b>{{ summary.totalCalls }}</b></div>
          <div class="summary-card"><span>成功率</span><b>{{ percent(summary.successRate) }}</b></div>
          <div class="summary-card"><span>平均响应</span><b>{{ duration(summary.avgDurationMs) }}</b></div>
        </div>
        <div class="filter-row">
          <a-select v-model:value="status" style="width:130px">
            <a-select-option value="all">全部状态</a-select-option>
            <a-select-option value="active">启用</a-select-option>
            <a-select-option value="disabled">停用</a-select-option>
          </a-select>
          <a-input v-model:value="keyword" allow-clear placeholder="搜索用户 / Key 名称 / 完整 Key / 前缀" style="width:360px" />
        </div>
      </a-card>

      <a-card class="admin-view-card" :bordered="false">
        <a-spin :spinning="loading">
          <div class="data-table-wrap">
            <table class="data-table admin-api-key-table">
              <thead><tr><th>用户</th><th>名称</th><th>完整 Key</th><th>状态</th><th>调用</th><th>成功率</th><th>平均响应</th><th>最近使用</th><th>创建时间</th><th>操作</th></tr></thead>
              <tbody>
                <tr v-for="row in rows" :key="row.id">
                  <td class="cell-ellipsis" :title="row.userEmail || row.userId">{{ row.userEmail || row.userId || '-' }}</td>
                  <td>{{ row.name }}</td>
                  <td><code class="admin-api-key-code" :title="apiKeyText(row)">{{ apiKeyText(row) }}</code></td>
                  <td><a-tag :color="keyStatusColor(row)">{{ keyStatusText(row) }}</a-tag></td>
                  <td>{{ row.totalCalls || 0 }}</td>
                  <td>{{ percent((row.totalCalls || 0) > 0 ? ((row.successCalls || 0) / row.totalCalls) * 100 : 0) }}</td>
                  <td>{{ duration(row.avgDurationMs) }}</td>
                  <td>{{ row.lastUsedAt ? formatDate(row.lastUsedAt) : '-' }}</td>
                  <td>{{ formatDate(row.createdAt) }}</td>
                  <td>
                    <div class="table-action-row">
                      <a-button size="small" @click="copyKey(row)">复制</a-button>
                      <a-button size="small" :disabled="Boolean(row.deletedAt)" :loading="actionLoadingId === row.id" @click="updateStatus(row)">{{ row.status === 'active' ? '停用' : '启用' }}</a-button>
                      <a-button size="small" @click="openLogs(row)">日志</a-button>
                      <a-button size="small" danger :disabled="Boolean(row.deletedAt)" :loading="actionLoadingId === row.id" @click="confirmDelete(row)">删除</a-button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <a-empty v-if="!rows.length && !loading" description="暂无 API Key" />
        </a-spin>
        <div class="pagination-row"><a-pagination v-model:current="page" size="small" :page-size="pageSize" :total="pagination?.total || 0" /></div>
      </a-card>

      <a-drawer :open="Boolean(activeKey)" title="Key 日志" width="980px" @close="closeLogs">
        <div v-if="activeKey" class="api-key-log-drawer">
          <div class="admin-key-log-head">
            <div>
              <div class="page-kicker">{{ activeKey.userEmail || activeKey.userId || '-' }}</div>
              <div class="page-title" style="font-size:18px">{{ activeKey.name }}</div>
              <code class="admin-api-key-code wide">{{ apiKeyText(activeKey) }}</code>
            </div>
            <a-button @click="copyKey(activeKey)">复制 Key</a-button>
          </div>
          <div class="summary-grid api-key-admin-summary compact">
            <div class="summary-card"><span>调用</span><b>{{ logStats?.total || 0 }}</b></div>
            <div class="summary-card"><span>成功率</span><b>{{ percent(logStats?.successRate || 0) }}</b></div>
            <div class="summary-card"><span>失败</span><b>{{ logStats?.failed || 0 }}</b></div>
            <div class="summary-card"><span>平均响应</span><b>{{ duration(logStats?.avgDurationMs) }}</b></div>
          </div>
          <div class="filter-row">
            <a-select v-model:value="logDays" style="width:140px">
              <a-select-option :value="1">最近 1 天</a-select-option>
              <a-select-option :value="7">最近 7 天</a-select-option>
              <a-select-option :value="30">最近 30 天</a-select-option>
              <a-select-option :value="90">最近 90 天</a-select-option>
            </a-select>
            <a-select v-model:value="logStatus" style="width:130px">
              <a-select-option value="all">全部状态</a-select-option>
              <a-select-option value="success">成功</a-select-option>
              <a-select-option value="failed">失败</a-select-option>
            </a-select>
            <a-button :loading="logLoading" @click="loadLogs">刷新日志</a-button>
          </div>
          <a-spin :spinning="logLoading">
            <div class="data-table-wrap">
              <table class="data-table">
                <thead><tr><th>时间</th><th>接口</th><th>阶段</th><th>状态</th><th>状态码</th><th>耗时</th><th>服务商</th><th>错误</th></tr></thead>
                <tbody>
                  <tr v-for="row in logRows" :key="row.id">
                    <td>{{ formatDate(row.createdAt) }}</td>
                    <td class="cell-mono cell-ellipsis" :title="row.endpoint">{{ row.endpoint }}</td>
                    <td><a-tag>{{ row.phase }}</a-tag></td>
                    <td><a-tag :color="row.status === 'success' ? 'green' : 'red'">{{ row.status === 'success' ? '成功' : '失败' }}</a-tag></td>
                    <td>{{ row.statusCode || '-' }}</td>
                    <td>{{ duration(row.durationMs) }}</td>
                    <td>{{ row.providerName || row.providerId || '-' }}</td>
                    <td class="cell-ellipsis" :title="row.errorMessage || ''">{{ row.errorMessage || '-' }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <a-empty v-if="!logRows.length && !logLoading" description="暂无 Key 调用日志" />
          </a-spin>
          <div class="pagination-row"><a-pagination v-model:current="logPage" size="small" :page-size="pageSize" :total="logPagination?.total || 0" /></div>
        </div>
      </a-drawer>
    </div>
  `,
}
