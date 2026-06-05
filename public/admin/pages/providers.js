import { adminApi } from '../api.js'
import { formatDate, statusItem, text } from '../format.js'

const { computed, onBeforeUnmount, onMounted, reactive, ref, watch } = Vue
const { message, Modal } = antd

export const ProvidersPage = {
  setup() {
    const rows = ref([])
    const loading = ref(false)
    const keyword = ref('')
    const typeFilter = ref('all')
    const statusFilter = ref('all')
    const page = ref(1)
    const pageSize = 12
    const dialogVisible = ref(false)
    const editing = ref(null)
    const form = reactive({ name: '', type: 'sub2api', capability: 'chat_image', status: 'active', baseUrl: '', apiKey: '' })

    const summary = computed(() => ({
      total: rows.value.length,
      active: rows.value.filter((row) => row.status === 'active').length,
      disabled: rows.value.filter((row) => row.status === 'disabled').length,
      sub2api: rows.value.filter((row) => row.type === 'sub2api').length,
    }))

    const filteredRows = computed(() => {
      const nextKeyword = keyword.value.trim().toLowerCase()
      return rows.value.filter((row) => {
        const matchesKeyword = !nextKeyword || [row.name, row.baseUrl, row.type].some((item) => String(item || '').toLowerCase().includes(nextKeyword))
        const matchesType = typeFilter.value === 'all' || row.type === typeFilter.value
        const matchesStatus = statusFilter.value === 'all' || row.status === statusFilter.value
        return matchesKeyword && matchesType && matchesStatus
      })
    })
    const visibleRows = computed(() => filteredRows.value.slice((page.value - 1) * pageSize, page.value * pageSize))
    watch([keyword, typeFilter, statusFilter], () => { page.value = 1 })

    async function load() {
      loading.value = true
      try {
        const response = await adminApi.listApiProviders()
        rows.value = response.data || []
      } catch (error) {
        message.error(error instanceof Error ? error.message : '加载接口失败')
      } finally {
        loading.value = false
      }
    }

    function openCreate() {
      editing.value = null
      Object.assign(form, { name: '', type: 'sub2api', capability: 'chat_image', status: 'active', baseUrl: '', apiKey: '' })
      dialogVisible.value = true
    }

    function openEdit(row) {
      editing.value = row
      Object.assign(form, { name: row.name || '', type: row.type || 'sub2api', capability: row.capability || 'chat_image', status: row.status || 'active', baseUrl: row.baseUrl || '', apiKey: row.apiKey || '' })
      dialogVisible.value = true
    }

    async function saveProvider() {
      try {
        if (editing.value) await adminApi.updateApiProvider(editing.value.id, { ...form })
        else await adminApi.createApiProvider({ ...form })
        message.success('保存成功')
        dialogVisible.value = false
        await load()
      } catch (error) {
        message.error(error instanceof Error ? error.message : '保存失败')
      }
    }

    function removeProvider(row) {
      Modal.confirm({
        title: '删除接口',
        content: `确定删除接口「${row.name}」吗？`,
        okText: '删除',
        okType: 'danger',
        cancelText: '取消',
        async onOk() {
          await adminApi.deleteApiProvider(row.id)
          message.success('删除成功')
          await load()
        },
      })
    }

    function resetFilters() {
      keyword.value = ''
      typeFilter.value = 'all'
      statusFilter.value = 'all'
    }

    function maskKey(value) {
      const next = String(value || '')
      if (!next) return '-'
      if (next.length <= 10) return '******'
      return `${next.slice(0, 6)}****${next.slice(-4)}`
    }

    function handleAutoRefresh() {
      if (dialogVisible.value) return
      load()
    }

    onMounted(() => {
      load()
      window.addEventListener('admin:auto-refresh', handleAutoRefresh)
    })
    onBeforeUnmount(() => {
      window.removeEventListener('admin:auto-refresh', handleAutoRefresh)
    })
    return { rows, loading, keyword, typeFilter, statusFilter, page, pageSize, dialogVisible, editing, form, summary, filteredRows, visibleRows, load, openCreate, openEdit, saveProvider, removeProvider, resetFilters, maskKey, statusItem, text, formatDate }
  },
  template: `
    <div class="page-stack">
      <a-card class="admin-view-card" :bordered="false">
        <div class="admin-card-hero">
          <div><div class="page-kicker">Provider Center</div><div class="page-title">接口管理</div><div class="page-desc">维护兼容接口、密钥、地址与启用状态。</div></div>
          <div class="toolbar"><a-button :loading="loading" @click="load">刷新</a-button><a-button type="primary" @click="openCreate">新增接口</a-button></div>
        </div>
        <div class="summary-grid">
          <div class="summary-card"><span>接口总数</span><b>{{ summary.total }}</b></div>
          <div class="summary-card"><span>启用接口</span><b>{{ summary.active }}</b></div>
          <div class="summary-card"><span>禁用接口</span><b>{{ summary.disabled }}</b></div>
          <div class="summary-card"><span>Sub2API</span><b>{{ summary.sub2api }}</b></div>
        </div>
        <div class="filter-row">
          <a-input v-model:value="keyword" allow-clear placeholder="搜索名称 / 地址 / 类型" style="width:300px" />
          <a-select v-model:value="typeFilter" style="width:140px"><a-select-option value="all">全部类型</a-select-option><a-select-option value="sub2api">Sub2API</a-select-option><a-select-option value="custom">Custom</a-select-option></a-select>
          <a-select v-model:value="statusFilter" style="width:140px"><a-select-option value="all">全部状态</a-select-option><a-select-option value="active">启用</a-select-option><a-select-option value="disabled">禁用</a-select-option></a-select>
          <a-button @click="resetFilters">重置</a-button>
          <a-tag color="blue">筛选 {{ filteredRows.length }} 条</a-tag>
        </div>
      </a-card>
      <a-card class="admin-view-card" :bordered="false">
        <template #title>接口列表</template>
        <a-spin :spinning="loading">
          <div class="data-table-wrap">
            <table class="data-table">
              <thead><tr><th>接口名称</th><th>类型</th><th>用途</th><th>接口地址</th><th>API Key</th><th>状态</th><th>更新时间</th><th>操作</th></tr></thead>
              <tbody>
                <tr v-for="row in visibleRows" :key="row.id">
                  <td>{{ text(row.name) }}</td>
                  <td><a-tag>{{ row.type }}</a-tag></td>
                  <td>对话生图</td>
                  <td><span class="cell-ellipsis">{{ text(row.baseUrl) }}</span></td>
                  <td>{{ maskKey(row.apiKey) }}</td>
                  <td><a-tag :color="statusItem('common', row.status).color">{{ statusItem('common', row.status).label }}</a-tag></td>
                  <td>{{ formatDate(row.updatedAt) }}</td>
                  <td><div class="table-actions"><a-button type="link" size="small" @click="openEdit(row)">编辑</a-button><a-button type="link" size="small" danger @click="removeProvider(row)">删除</a-button></div></td>
                </tr>
              </tbody>
            </table>
          </div>
        </a-spin>
        <div class="pagination-row"><a-pagination v-model:current="page" size="small" :page-size="pageSize" :total="filteredRows.length" /></div>
      </a-card>
      <a-modal v-model:open="dialogVisible" :title="editing ? '编辑接口' : '新增接口'" width="760px" @ok="saveProvider">
        <div class="form-grid">
          <label><div class="muted">接口名称</div><a-input v-model:value="form.name" /></label>
          <label><div class="muted">接口类型</div><a-select v-model:value="form.type" style="width:100%"><a-select-option value="sub2api">Sub2API</a-select-option><a-select-option value="custom">Custom</a-select-option></a-select></label>
          <label><div class="muted">状态</div><a-select v-model:value="form.status" style="width:100%"><a-select-option value="active">启用</a-select-option><a-select-option value="disabled">禁用</a-select-option></a-select></label>
          <label><div class="muted">用途</div><a-select v-model:value="form.capability" style="width:100%"><a-select-option value="chat_image">对话生图</a-select-option></a-select></label>
          <label class="full"><div class="muted">Base URL</div><a-input v-model:value="form.baseUrl" /></label>
          <label class="full"><div class="muted">API Key</div><a-textarea v-model:value="form.apiKey" :rows="4" /></label>
        </div>
      </a-modal>
    </div>
  `,
}
