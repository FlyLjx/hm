import { adminApi } from '../api.js'
import { formatDate } from '../format.js'

const { computed, onBeforeUnmount, onMounted, ref, watch } = Vue
const { message } = antd

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
  return status === 'success' ? 'green' : 'red'
}

function directionLabel(value) {
  return value === 'downstream' ? '下游' : '上游'
}

function directionColor(value) {
  return value === 'downstream' ? 'cyan' : 'blue'
}

function jsonText(value) {
  if (value === undefined || value === null || value === '') return '-'
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

export const ApiLogsPage = {
  setup() {
    const rows = ref([])
    const stats = ref(null)
    const loading = ref(false)
    const detailLoading = ref(false)
    const detail = ref(null)
    const page = ref(1)
    const pageSize = 30
    const pagination = ref(null)
    const days = ref(7)
    const status = ref('all')
    const direction = ref('all')
    const keyword = ref('')

    const summary = computed(() => stats.value || {
      total: 0,
      success: 0,
      failed: 0,
      successRate: 0,
      avgDurationMs: 0,
      maxDurationMs: 0,
      groups: [],
    })

    async function load() {
      loading.value = true
      try {
        const params = { page: page.value, pageSize, days: days.value, status: status.value, direction: direction.value, keyword: keyword.value }
        const [listResponse, statsResponse] = await Promise.all([
          adminApi.listApiLogs(params),
          adminApi.getApiLogStats({ days: days.value }),
        ])
        rows.value = listResponse.data || []
        pagination.value = listResponse.pagination
        stats.value = statsResponse.data
      } catch (error) {
        message.error(error instanceof Error ? error.message : '加载 API 日志失败')
      } finally {
        loading.value = false
      }
    }

    async function openDetail(row) {
      detailLoading.value = true
      detail.value = row
      try {
        const response = await adminApi.getApiLogDetail(row.id)
        detail.value = response.data || row
      } catch (error) {
        message.error(error instanceof Error ? error.message : '加载日志明细失败')
      } finally {
        detailLoading.value = false
      }
    }

    function handleAutoRefresh() {
      if (!detail.value) load()
    }

    watch(page, load)
    watch([days, status, direction], () => {
      page.value = 1
      load()
    })
    watch(keyword, () => {
      page.value = 1
      load()
    })

    onMounted(() => {
      load()
      window.addEventListener('admin:auto-refresh', handleAutoRefresh)
    })
    onBeforeUnmount(() => {
      window.removeEventListener('admin:auto-refresh', handleAutoRefresh)
    })

    return { rows, summary, loading, detailLoading, detail, page, pageSize, pagination, days, status, direction, keyword, load, openDetail, duration, percent, statusColor, directionLabel, directionColor, jsonText, formatDate }
  },
  template: `
    <div class="page-stack">
      <a-card class="admin-view-card" :bordered="false">
        <div class="admin-card-hero">
          <div>
            <div class="page-kicker">Upstream Monitor</div>
            <div class="page-title">API 日志</div>
            <div class="page-desc">查看上游接口调用耗时、状态码、成功率和错误信息。</div>
          </div>
          <a-button :loading="loading" @click="load">刷新</a-button>
        </div>
        <div class="summary-grid api-log-summary">
          <div class="summary-card"><span>总调用</span><b>{{ summary.total }}</b></div>
          <div class="summary-card"><span>成功率</span><b>{{ percent(summary.successRate) }}</b></div>
          <div class="summary-card"><span>平均响应</span><b>{{ duration(summary.avgDurationMs) }}</b></div>
          <div class="summary-card"><span>最长响应</span><b>{{ duration(summary.maxDurationMs) }}</b></div>
          <div class="summary-card"><span>失败</span><b>{{ summary.failed }}</b></div>
        </div>
        <div class="filter-row">
          <a-select v-model:value="days" style="width:140px">
            <a-select-option :value="1">最近 1 天</a-select-option>
            <a-select-option :value="7">最近 7 天</a-select-option>
            <a-select-option :value="30">最近 30 天</a-select-option>
            <a-select-option :value="90">最近 90 天</a-select-option>
          </a-select>
          <a-select v-model:value="status" style="width:130px">
            <a-select-option value="all">全部状态</a-select-option>
            <a-select-option value="success">成功</a-select-option>
            <a-select-option value="failed">失败</a-select-option>
          </a-select>
          <a-select v-model:value="direction" style="width:130px">
            <a-select-option value="all">全部方向</a-select-option>
            <a-select-option value="upstream">上游</a-select-option>
            <a-select-option value="downstream">下游</a-select-option>
          </a-select>
          <a-input v-model:value="keyword" allow-clear placeholder="搜索接口 / 阶段 / 服务商 / 用户 / 错误" style="width:360px" />
        </div>
      </a-card>

      <a-card class="admin-view-card" :bordered="false">
        <div class="admin-card-hero compact">
          <div><div class="page-title" style="font-size:18px">接口统计</div><div class="page-desc">按服务商、接口地址和调用阶段聚合。</div></div>
        </div>
        <div class="data-table-wrap">
          <table class="data-table">
            <thead><tr><th>方向</th><th>服务商</th><th>阶段</th><th>Endpoint</th><th>调用</th><th>成功率</th><th>平均响应</th></tr></thead>
            <tbody>
              <tr v-for="item in summary.groups" :key="[item.direction, item.providerId, item.endpoint, item.phase].join(':')">
                <td><a-tag :color="directionColor(item.direction)">{{ directionLabel(item.direction) }}</a-tag></td>
                <td>{{ item.providerName || item.providerId || '-' }}</td>
                <td><a-tag>{{ item.phase }}</a-tag></td>
                <td class="cell-mono cell-ellipsis" :title="item.endpoint">{{ item.endpoint }}</td>
                <td>{{ item.total }}</td>
                <td>{{ percent(item.successRate) }}</td>
                <td>{{ duration(item.avgDurationMs) }}</td>
              </tr>
            </tbody>
          </table>
          <a-empty v-if="!summary.groups?.length" description="暂无统计" />
        </div>
      </a-card>

      <a-card class="admin-view-card" :bordered="false">
        <a-spin :spinning="loading">
          <div class="data-table-wrap">
            <table class="data-table">
              <thead><tr><th>时间</th><th>方向</th><th>用户 / Key</th><th>服务商</th><th>类型</th><th>阶段</th><th>状态</th><th>状态码</th><th>耗时</th><th>Endpoint</th><th>错误</th><th>操作</th></tr></thead>
              <tbody>
                <tr v-for="row in rows" :key="row.id">
                  <td>{{ formatDate(row.createdAt) }}</td>
                  <td><a-tag :color="directionColor(row.direction)">{{ directionLabel(row.direction) }}</a-tag></td>
                  <td><span class="cell-ellipsis">{{ row.userEmail || row.userId || row.apiKeyName || row.apiKeyId || '-' }}</span></td>
                  <td>{{ row.providerName || row.providerId || '-' }}</td>
                  <td>{{ row.providerType || '-' }}</td>
                  <td><a-tag>{{ row.phase }}</a-tag></td>
                  <td><a-tag :color="statusColor(row.status)">{{ row.status === 'success' ? '成功' : '失败' }}</a-tag></td>
                  <td>{{ row.statusCode || '-' }}</td>
                  <td>{{ duration(row.durationMs) }}</td>
                  <td class="cell-mono cell-ellipsis" :title="row.endpoint">{{ row.endpoint }}</td>
                  <td class="cell-ellipsis" :title="row.errorMessage || ''">{{ row.errorMessage || '-' }}</td>
                  <td><a-button type="link" size="small" @click="openDetail(row)">明细</a-button></td>
                </tr>
              </tbody>
            </table>
          </div>
          <a-empty v-if="!rows.length && !loading" description="暂无 API 日志" />
        </a-spin>
        <div class="pagination-row"><a-pagination v-model:current="page" size="small" :page-size="pageSize" :total="pagination?.total || 0" /></div>
      </a-card>

      <a-drawer :open="Boolean(detail)" title="API 调用明细" width="860px" @close="detail = null">
        <a-spin :spinning="detailLoading">
          <div v-if="detail" class="api-log-detail">
            <div class="api-log-detail-head">
              <a-tag :color="directionColor(detail.direction)">{{ directionLabel(detail.direction) }}</a-tag>
              <a-tag :color="statusColor(detail.status)">{{ detail.status === 'success' ? '成功' : '失败' }}</a-tag>
              <span class="cell-mono">{{ detail.method }} {{ detail.statusCode || '-' }}</span>
              <span>{{ duration(detail.durationMs) }}</span>
            </div>
            <div class="summary-grid" style="padding:0">
              <div class="summary-card"><span>时间</span><b style="font-size:15px">{{ formatDate(detail.createdAt) }}</b></div>
              <div class="summary-card"><span>任务</span><b class="cell-mono" style="font-size:13px">{{ detail.taskId || '-' }}</b></div>
              <div class="summary-card"><span>用户</span><b style="font-size:15px">{{ detail.userEmail || detail.userId || '-' }}</b></div>
              <div class="summary-card"><span>服务商</span><b style="font-size:15px">{{ detail.providerName || detail.providerId || '-' }}</b></div>
            </div>
            <section class="api-log-detail-section">
              <div class="api-log-detail-title">Endpoint</div>
              <pre>{{ detail.endpoint }}</pre>
            </section>
            <section v-if="detail.errorMessage" class="api-log-detail-section">
              <div class="api-log-detail-title">错误信息</div>
              <pre>{{ detail.errorMessage }}</pre>
            </section>
            <section class="api-log-detail-section">
              <div class="api-log-detail-title">请求摘要</div>
              <pre>{{ jsonText(detail.requestSummary) }}</pre>
            </section>
            <section class="api-log-detail-section">
              <div class="api-log-detail-title">响应摘要</div>
              <pre>{{ jsonText(detail.responseSummary) }}</pre>
            </section>
          </div>
        </a-spin>
      </a-drawer>
    </div>
  `,
}
