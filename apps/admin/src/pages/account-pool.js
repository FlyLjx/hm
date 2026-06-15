import { adminApi } from '../api.js'
import { formatDate, text } from '../format.js'

const { computed, onBeforeUnmount, onMounted, reactive, ref } = Vue
const { message } = antd

function maskSecret(value) {
  const content = String(value || '')
  if (!content) return '-'
  if (content.length <= 18) return content
  return `${content.slice(0, 8)}...${content.slice(-8)}`
}

function limitLabel(item) {
  const nameMap = {
    image_gen: '生图',
    file_upload: '文件',
    deep_research: '研究',
    paste_text_to_file: '粘贴',
  }
  return nameMap[item.featureName] || item.featureName || '-'
}

export const AccountPoolPage = {
  setup() {
    const rows = ref([])
    const loading = ref(false)
    const keyword = ref('')
    const statusFilter = ref('all')
    const typeFilter = ref('all')
    const fetchedAt = ref('')
    const source = ref('')
    const settingsLoading = ref(false)
    const settingsVisible = ref(false)
    const settingsForm = reactive({
      accountPoolEndpoint: 'https://free-api.yccc.me/api/accounts',
      accountPoolAuthHeader: 'Authorization',
      accountPoolApiKey: '',
    })
    const page = ref(1)
    const pageSize = 12

    const summary = computed(() => ({
      total: rows.value.length,
      normal: rows.value.filter((row) => row.status === '正常').length,
      quota: rows.value.reduce((sum, row) => sum + Number(row.quota || 0), 0),
      imageRemaining: rows.value.reduce((sum, row) => sum + Number(row.limitsProgress?.find((item) => item.featureName === 'image_gen')?.remaining || 0), 0),
    }))

    const typeOptions = computed(() => Array.from(new Set(rows.value.map((row) => row.type).filter(Boolean))))
    const statusOptions = computed(() => Array.from(new Set(rows.value.map((row) => row.status).filter(Boolean))))
    const filteredRows = computed(() => {
      const nextKeyword = keyword.value.trim().toLowerCase()
      return rows.value.filter((row) => {
        const matchesKeyword = !nextKeyword || [
          row.email,
          row.userId,
          row.status,
          row.type,
          row.sourceType,
          row.defaultModelSlug,
        ].some((item) => String(item || '').toLowerCase().includes(nextKeyword))
        const matchesStatus = statusFilter.value === 'all' || row.status === statusFilter.value
        const matchesType = typeFilter.value === 'all' || row.type === typeFilter.value
        return matchesKeyword && matchesStatus && matchesType
      })
    })
    const visibleRows = computed(() => filteredRows.value.slice((page.value - 1) * pageSize, page.value * pageSize))

    async function load() {
      loading.value = true
      try {
        const response = await adminApi.listAccountPoolAccounts()
        rows.value = response.data?.items || []
        fetchedAt.value = response.data?.fetchedAt || ''
        source.value = response.data?.source || ''
      } catch (error) {
        message.error(error instanceof Error ? error.message : '加载号池失败')
      } finally {
        loading.value = false
      }
    }

    async function loadSettings() {
      settingsLoading.value = true
      try {
        const response = await adminApi.getAccountPoolSettings()
        Object.assign(settingsForm, response.data || {})
      } catch (error) {
        message.error(error instanceof Error ? error.message : '加载号池配置失败')
      } finally {
        settingsLoading.value = false
      }
    }

    async function saveSettings() {
      settingsLoading.value = true
      try {
        const response = await adminApi.updateAccountPoolSettings({ ...settingsForm })
        Object.assign(settingsForm, response.data || {})
        message.success('号池配置已保存')
        settingsVisible.value = false
        await load()
      } catch (error) {
        message.error(error instanceof Error ? error.message : '保存号池配置失败')
      } finally {
        settingsLoading.value = false
      }
    }

    function resetFilters() {
      keyword.value = ''
      statusFilter.value = 'all'
      typeFilter.value = 'all'
      page.value = 1
    }

    async function copyValue(value, label = '内容') {
      const content = String(value || '').trim()
      if (!content) return
      try {
        await navigator.clipboard.writeText(content)
        message.success(`${label}已复制`)
      } catch {
        message.error('复制失败，请手动复制')
      }
    }

    function statusColor(status) {
      if (status === '正常') return 'green'
      if (String(status || '').includes('异常') || String(status || '').includes('失效')) return 'red'
      return 'blue'
    }

    function handleAutoRefresh() {
      load()
    }

    onMounted(() => {
      loadSettings()
      load()
      window.addEventListener('admin:auto-refresh', handleAutoRefresh)
    })
    onBeforeUnmount(() => {
      window.removeEventListener('admin:auto-refresh', handleAutoRefresh)
    })

    return { rows, loading, keyword, statusFilter, typeFilter, fetchedAt, source, settingsLoading, settingsVisible, settingsForm, page, pageSize, summary, typeOptions, statusOptions, filteredRows, visibleRows, load, loadSettings, saveSettings, resetFilters, copyValue, statusColor, maskSecret, limitLabel, text, formatDate }
  },
  template: `
    <div class="page-stack">
      <a-card class="admin-view-card" :bordered="false">
        <div class="admin-card-hero">
          <div>
            <div class="page-kicker">Account Pool</div>
            <div class="page-title">号池管理</div>
            <div class="page-desc">查看外部号池账号、额度、限制进度和最近使用状态。</div>
          </div>
          <div class="toolbar">
            <a-button :loading="loading" @click="load">刷新号池</a-button>
          </div>
        </div>
        <div class="summary-grid">
          <div class="summary-card"><span>账号总数</span><b>{{ summary.total }}</b></div>
          <div class="summary-card"><span>正常账号</span><b>{{ summary.normal }}</b></div>
          <div class="summary-card"><span>总额度</span><b>{{ summary.quota }}</b></div>
          <div class="summary-card"><span>生图剩余</span><b>{{ summary.imageRemaining }}</b></div>
        </div>
        <div class="filter-row">
          <a-input v-model:value="keyword" allow-clear placeholder="搜索邮箱 / 用户ID / 状态 / 模型" style="width:320px" />
          <a-select v-model:value="statusFilter" style="width:150px">
            <a-select-option value="all">全部状态</a-select-option>
            <a-select-option v-for="item in statusOptions" :key="item" :value="item">{{ item }}</a-select-option>
          </a-select>
          <a-select v-model:value="typeFilter" style="width:150px">
            <a-select-option value="all">全部类型</a-select-option>
            <a-select-option v-for="item in typeOptions" :key="item" :value="item">{{ item }}</a-select-option>
          </a-select>
          <a-button @click="resetFilters">重置</a-button>
          <a-tag color="blue">筛选 {{ filteredRows.length }} 条</a-tag>
          <a-tag v-if="fetchedAt">更新 {{ formatDate(fetchedAt) }}</a-tag>
        </div>
      </a-card>

      <a-card class="admin-view-card" :bordered="false">
        <template #title>号池接口配置</template>
        <template #extra><a-button type="primary" :loading="settingsLoading" @click="settingsVisible = true">编辑配置</a-button></template>
        <div class="settings-read-grid">
          <div class="settings-read-item"><span>接口地址</span><b>{{ settingsForm.accountPoolEndpoint || '-' }}</b></div>
          <div class="settings-read-item"><span>鉴权请求头</span><b>{{ settingsForm.accountPoolAuthHeader || '-' }}</b></div>
          <div class="settings-read-item"><span>接口 Key</span><b>{{ maskSecret(settingsForm.accountPoolApiKey) }}</b></div>
        </div>
      </a-card>

      <a-card class="admin-view-card" :bordered="false">
        <template #title>账号列表</template>
        <template #extra><span class="page-desc">{{ source || 'https://free-api.yccc.me/api/accounts' }}</span></template>
        <a-spin :spinning="loading">
          <div class="data-table-wrap">
            <table class="data-table account-pool-table">
              <thead>
                <tr>
                  <th>邮箱</th>
                  <th>状态</th>
                  <th>类型</th>
                  <th>额度</th>
                  <th>限制进度</th>
                  <th>成功 / 失败</th>
                  <th>最近使用</th>
                  <th>令牌</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in visibleRows" :key="row.email || row.userId">
                  <td>
                    <div class="account-main">
                      <button class="copy-cell" type="button" @click="copyValue(row.email, '邮箱')">
                        <span class="cell-ellipsis">{{ text(row.email) }}</span>
                        <i class="ti ti-copy"></i>
                      </button>
                      <small>{{ text(row.userId) }}</small>
                    </div>
                  </td>
                  <td><a-tag :color="statusColor(row.status)">{{ text(row.status) }}</a-tag></td>
                  <td><a-tag>{{ text(row.type) }}</a-tag><a-tag>{{ text(row.sourceType) }}</a-tag></td>
                  <td>
                    <div class="metric-stack">
                      <strong>{{ row.quota ?? '-' }}</strong>
                      <span>{{ row.imageQuotaUnknown ? '生图未知' : '额度可读' }}</span>
                    </div>
                  </td>
                  <td>
                    <div class="limit-tags">
                      <a-tag v-for="item in row.limitsProgress || []" :key="item.featureName" color="cyan">
                        {{ limitLabel(item) }} {{ item.remaining ?? '-' }}
                      </a-tag>
                    </div>
                  </td>
                  <td>{{ row.success || 0 }} / {{ row.fail || 0 }} <span class="muted">失效 {{ row.invalidCount || 0 }}</span></td>
                  <td>
                    <div class="metric-stack">
                      <span>{{ text(row.lastUsedAt) }}</span>
                      <small v-if="row.restoreAt">恢复 {{ formatDate(row.restoreAt) }}</small>
                    </div>
                  </td>
                  <td>
                    <div class="token-stack">
                      <button class="copy-cell" type="button" @click="copyValue(row.accessToken, 'Access Token')"><span class="cell-ellipsis">AT {{ maskSecret(row.accessToken) }}</span><i class="ti ti-copy"></i></button>
                      <button class="copy-cell" type="button" @click="copyValue(row.refreshToken, 'Refresh Token')"><span class="cell-ellipsis">RT {{ maskSecret(row.refreshToken) }}</span><i class="ti ti-copy"></i></button>
                    </div>
                  </td>
                  <td>
                    <div class="table-actions">
                      <a-button type="link" size="small" @click="copyValue(row.password, '密码')">复制密码</a-button>
                      <a-button type="link" size="small" @click="copyValue(row.idToken, 'ID Token')">复制ID令牌</a-button>
                    </div>
                  </td>
                </tr>
                <tr v-if="!visibleRows.length">
                  <td colspan="9"><div class="empty-state">暂无号池账号</div></td>
                </tr>
              </tbody>
            </table>
          </div>
        </a-spin>
        <div class="pagination-row"><a-pagination v-model:current="page" size="small" :page-size="pageSize" :total="filteredRows.length" /></div>
      </a-card>
      <a-drawer
        v-model:open="settingsVisible"
        title="编辑号池接口配置"
        width="min(92vw, 720px)"
        class="admin-edit-drawer"
        destroy-on-close
      >
        <div class="form-grid drawer-form-grid account-pool-config">
          <label class="full">
            <div class="muted">接口地址</div>
            <a-input v-model:value="settingsForm.accountPoolEndpoint" placeholder="https://free-api.yccc.me/api/accounts" />
          </label>
          <label>
            <div class="muted">鉴权请求头</div>
            <a-select v-model:value="settingsForm.accountPoolAuthHeader" style="width:100%">
              <a-select-option value="Authorization">Authorization Bearer</a-select-option>
              <a-select-option value="x-api-key">x-api-key</a-select-option>
              <a-select-option value="token">token</a-select-option>
            </a-select>
          </label>
          <label>
            <div class="muted">接口 Key</div>
            <a-input-password v-model:value="settingsForm.accountPoolApiKey" placeholder="请输入号池接口 Key" />
          </label>
        </div>
        <template #footer>
          <div class="drawer-footer-actions">
            <a-button @click="settingsVisible = false">取消</a-button>
            <a-button type="primary" :loading="settingsLoading" @click="saveSettings">保存</a-button>
          </div>
        </template>
      </a-drawer>
    </div>
  `,
}
