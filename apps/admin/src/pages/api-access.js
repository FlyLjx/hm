import { adminApi } from '../api.js?v=20260710-shanghai-tz-v1'
import { formatDate, text } from '../format.js?v=20260710-shanghai-tz-v1'

const { computed, onMounted, reactive, ref, watch } = Vue
const { message, Modal } = antd

function numberText(value) {
  return Number(value || 0).toLocaleString('zh-CN')
}

function statusLabel(status) {
  return status === 'active' ? '启用' : '禁用'
}

function statusColor(status) {
  if (status === 'active') return 'green'
  if (status === 'success') return 'green'
  if (status === 'failed') return 'red'
  if (status === 'queued' || status === 'processing') return 'blue'
  return 'default'
}

function logStatusLabel(status) {
  if (status === 'success') return '成功'
  if (status === 'failed') return '失败'
  if (status === 'queued' || status === 'processing') return '处理中'
  return status || '-'
}

function shortPrompt(value) {
  const prompt = String(value || '')
  return prompt.length > 48 ? `${prompt.slice(0, 48)}...` : prompt
}

export const ApiAccessPage = {
  setup() {
    const loading = ref(false)
    const logsLoading = ref(false)
    const keys = ref([])
    const stats = ref({})
    const logs = ref([])
    const pagination = ref({ total: 0, page: 1, pageSize: 10 })
    const filters = reactive({ keyword: '', status: 'all' })

    const activeKeyCount = computed(() => keys.value.filter((item) => item.status === 'active').length)

    async function loadKeys() {
      loading.value = true
      try {
        const response = await adminApi.listApiAccessKeys()
        const data = response.data || {}
        keys.value = data.items || []
        stats.value = data.stats || {}
      } catch (error) {
        message.error(error instanceof Error ? error.message : 'API Key 加载失败')
      } finally {
        loading.value = false
      }
    }

    async function loadLogs(page = pagination.value.page) {
      logsLoading.value = true
      try {
        const response = await adminApi.listApiAccessLogs({
          page,
          pageSize: pagination.value.pageSize,
          status: filters.status === 'all' ? '' : filters.status,
          keyword: filters.keyword,
        })
        logs.value = response.data || []
        pagination.value = response.pagination || { ...pagination.value, page }
      } catch (error) {
        message.error(error instanceof Error ? error.message : '调用日志加载失败')
      } finally {
        logsLoading.value = false
      }
    }

    async function refreshAll() {
      await Promise.all([loadKeys(), loadLogs(1)])
    }

    async function toggleStatus(row) {
      const nextStatus = row.status === 'active' ? 'disabled' : 'active'
      try {
        await adminApi.updateApiAccessKey(row.id, { status: nextStatus })
        message.success(nextStatus === 'active' ? '已启用 Key' : '已禁用 Key')
        await refreshAll()
      } catch (error) {
        message.error(error instanceof Error ? error.message : '状态更新失败')
      }
    }

    async function saveConcurrency(row) {
      const value = Number(row.concurrencyLimit || 1)
      if (!Number.isFinite(value) || value < 1 || value > 50) {
        message.warning('并发上限必须在 1 到 50 之间')
        return
      }
      try {
        await adminApi.updateApiAccessKey(row.id, { concurrencyLimit: Math.floor(value) })
        message.success('并发上限已保存')
        await loadKeys()
      } catch (error) {
        message.error(error instanceof Error ? error.message : '并发设置失败')
      }
    }

    function deleteKey(row) {
      Modal.confirm({
        title: '删除 API Key',
        content: `确定删除 ${row.name || row.keyPrefix} 吗？删除后用户将无法继续使用该 Key 调用接口。`,
        okText: '删除',
        okType: 'danger',
        cancelText: '取消',
        async onOk() {
          await adminApi.deleteApiAccessKey(row.id)
          message.success('API Key 已删除')
          await refreshAll()
        },
      })
    }

    watch(() => [filters.keyword, filters.status], () => loadLogs(1))
    onMounted(refreshAll)

    return {
      loading,
      logsLoading,
      keys,
      stats,
      logs,
      pagination,
      filters,
      activeKeyCount,
      loadKeys,
      loadLogs,
      refreshAll,
      toggleStatus,
      saveConcurrency,
      deleteKey,
      numberText,
      statusLabel,
      statusColor,
      logStatusLabel,
      shortPrompt,
      formatDate,
      text,
    }
  },
  template: `
    <div class="page-stack admin-api-access-page">
      <a-card class="admin-view-card" :bordered="false">
        <div class="admin-card-hero">
          <div>
            <div class="page-kicker">OpenAI Image API</div>
            <div class="page-title">API 管理</div>
            <div class="page-desc">查看用户创建的 API Key、绑定用户和 OpenAI 图片接口调用情况。</div>
          </div>
          <div class="toolbar">
            <a-button :loading="loading || logsLoading" @click="refreshAll">刷新</a-button>
          </div>
        </div>
        <div class="summary-grid admin-api-access-summary">
          <div class="summary-card"><span>Key 总数</span><b>{{ numberText(stats.totalKeys || keys.length) }}</b><div class="muted">用户手动创建</div></div>
          <div class="summary-card"><span>启用 Key</span><b>{{ numberText(stats.activeKeys || activeKeyCount) }}</b><div class="muted">可调用接口</div></div>
          <div class="summary-card"><span>今日请求</span><b>{{ numberText(stats.todayRequests) }}</b><div class="muted">OpenAI 图片接口</div></div>
          <div class="summary-card"><span>今日生成</span><b>{{ numberText(stats.todayImageCount) }}</b><div class="muted">成功图片数</div></div>
        </div>
      </a-card>

      <a-card class="admin-view-card" :bordered="false">
        <template #title>用户 API Key</template>
        <a-spin :spinning="loading">
          <div class="data-table-wrap">
            <table class="data-table admin-api-key-table">
              <thead><tr><th>用户</th><th>Key 名称</th><th>Key 前缀</th><th>状态</th><th>并发</th><th>请求</th><th>成功/失败</th><th>图片</th><th>最近使用</th><th>创建时间</th><th>操作</th></tr></thead>
              <tbody>
                <tr v-for="row in keys" :key="row.id">
                  <td>{{ text(row.userEmail || row.userId) }}</td>
                  <td>{{ text(row.name) }}</td>
                  <td><code>{{ row.keyPrefix }}••••••</code></td>
                  <td><a-tag :color="statusColor(row.status)">{{ statusLabel(row.status) }}</a-tag></td>
                  <td>
                    <div class="admin-api-concurrency-cell">
                      <a-input-number v-model:value="row.concurrencyLimit" :min="1" :max="50" size="small" />
                      <a-button size="small" @click="saveConcurrency(row)">保存</a-button>
                    </div>
                  </td>
                  <td>{{ numberText(row.requestCount) }}</td>
                  <td><span class="admin-api-success">{{ numberText(row.successCount) }}</span> / <span class="admin-api-failed">{{ numberText(row.failedCount) }}</span></td>
                  <td>{{ numberText(row.imageCount) }}</td>
                  <td>{{ row.lastUsedAt ? formatDate(row.lastUsedAt) : '-' }}</td>
                  <td>{{ formatDate(row.createdAt) }}</td>
                  <td>
                    <div class="table-actions">
                      <a-button type="link" size="small" @click="toggleStatus(row)">{{ row.status === 'active' ? '禁用' : '启用' }}</a-button>
                      <a-button type="link" size="small" danger @click="deleteKey(row)">删除</a-button>
                    </div>
                  </td>
                </tr>
                <tr v-if="!loading && !keys.length"><td colspan="11" class="muted" style="text-align:center;padding:28px">暂无用户 API Key</td></tr>
              </tbody>
            </table>
          </div>
        </a-spin>
      </a-card>

      <a-card class="admin-view-card" :bordered="false">
        <div class="admin-api-log-head">
          <div>
            <div class="page-title" style="font-size:16px">调用日志</div>
            <div class="page-desc">展示真实 API 图片调用记录，失败会保留错误信息。</div>
          </div>
          <div class="toolbar">
            <a-input v-model:value="filters.keyword" allow-clear placeholder="搜索用户 / 模型 / 提示词" style="width:260px" />
            <a-select v-model:value="filters.status" style="width:120px">
              <a-select-option value="all">全部状态</a-select-option>
              <a-select-option value="queued">排队中</a-select-option>
              <a-select-option value="processing">处理中</a-select-option>
              <a-select-option value="success">成功</a-select-option>
              <a-select-option value="failed">失败</a-select-option>
            </a-select>
          </div>
        </div>
        <a-spin :spinning="logsLoading">
          <div class="data-table-wrap">
            <table class="data-table admin-api-log-table">
              <thead><tr><th>时间</th><th>用户</th><th>Key</th><th>接口</th><th>模型</th><th>提示词</th><th>数量</th><th>状态</th><th>错误</th></tr></thead>
              <tbody>
                <tr v-for="row in logs" :key="row.id">
                  <td>{{ formatDate(row.createdAt) }}</td>
                  <td>{{ text(row.userEmail || row.userId) }}</td>
                  <td>{{ text(row.keyName || row.keyPrefix) }}</td>
                  <td><code>{{ row.endpoint }}</code></td>
                  <td>{{ text(row.model) }}</td>
                  <td><a-tooltip :title="row.prompt">{{ shortPrompt(row.prompt) }}</a-tooltip></td>
                  <td>{{ row.imageCount || row.quantity }}</td>
                  <td><a-tag :color="statusColor(row.status)">{{ logStatusLabel(row.status) }}</a-tag></td>
                  <td>{{ text(row.errorMessage || '-') }}</td>
                </tr>
                <tr v-if="!logsLoading && !logs.length"><td colspan="9" class="muted" style="text-align:center;padding:28px">暂无 API 调用日志</td></tr>
              </tbody>
            </table>
          </div>
        </a-spin>
        <div class="pagination-row"><a-pagination v-model:current="pagination.page" size="small" :page-size="pagination.pageSize" :total="pagination.total" @change="loadLogs" /></div>
      </a-card>
    </div>
  `,
}
