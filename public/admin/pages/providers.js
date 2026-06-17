import { adminApi } from '../api.js'
import { formatDate, statusItem, text } from '../format.js'

const { computed, onMounted, reactive, ref, watch } = Vue
const { message, Modal } = antd
const providerTypeOptions = [
  { label: 'Sub2API', value: 'sub2api' },
  { label: 'Custom', value: 'custom' },
  { label: 'New API', value: 'newapi' },
]
const providerCapabilityOptions = [
  { label: '对话生图', value: 'chat_image' },
]

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
    const testingId = ref('')
    const form = reactive({ name: '', type: 'sub2api', capability: 'chat_image', status: 'active', baseUrl: '', apiKey: '' })

    const summary = computed(() => ({
      total: rows.value.length,
      active: rows.value.filter((row) => row.status === 'active').length,
      disabled: rows.value.filter((row) => row.status === 'disabled').length,
      sub2api: rows.value.filter((row) => row.type === 'sub2api').length,
      newapi: rows.value.filter((row) => row.type === 'newapi').length,
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

    async function testProvider(row) {
      testingId.value = row.id
      try {
        const response = await adminApi.testApiProvider(row.id)
        const result = response.data
        const content = [
          `状态：${result.status === 'success' ? '成功' : '失败'}`,
          `HTTP：${result.statusCode || '-'}`,
          `耗时：${result.durationMs}ms`,
          `模型：${result.modelCount}`,
          `地址：${result.endpoint}`,
          `消息：${result.message}`,
        ].join('\n')
        Modal[result.ok ? 'success' : 'error']({
          title: `接口测试${result.ok ? '成功' : '失败'}`,
          content: Vue.h('pre', { style: 'white-space:pre-wrap;margin:0;font-family:Consolas,monospace;font-size:12px;line-height:1.7' }, content),
          okText: '关闭',
        })
      } catch (error) {
        message.error(error instanceof Error ? error.message : '接口测试失败')
      } finally {
        testingId.value = ''
      }
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

    onMounted(() => {
      load()
    })
    return { rows, loading, keyword, typeFilter, statusFilter, page, pageSize, dialogVisible, editing, testingId, form, summary, filteredRows, visibleRows, providerTypeOptions, providerCapabilityOptions, load, openCreate, openEdit, saveProvider, removeProvider, testProvider, resetFilters, maskKey, statusItem, text, formatDate }
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
          <div class="summary-card"><span>New API</span><b>{{ summary.newapi }}</b></div>
        </div>
        <div class="filter-row">
          <a-input v-model:value="keyword" allow-clear placeholder="搜索名称 / 地址 / 类型" style="width:300px" />
          <a-select v-model:value="typeFilter" style="width:140px"><a-select-option value="all">全部类型</a-select-option><a-select-option v-for="item in providerTypeOptions" :key="item.value" :value="item.value">{{ item.label }}</a-select-option></a-select>
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
                  <td><div class="table-actions"><a-button type="link" size="small" :loading="testingId === row.id" @click="testProvider(row)">测试</a-button><a-button type="link" size="small" @click="openEdit(row)">编辑</a-button><a-button type="link" size="small" danger @click="removeProvider(row)">删除</a-button></div></td>
                </tr>
              </tbody>
            </table>
          </div>
        </a-spin>
        <div class="pagination-row"><a-pagination v-model:current="page" size="small" :page-size="pageSize" :total="filteredRows.length" /></div>
      </a-card>
      <a-drawer
        v-model:open="dialogVisible"
        :title="editing ? '编辑接口' : '新增接口'"
        width="min(92vw, 760px)"
        class="admin-edit-drawer"
        destroy-on-close
      >
        <div class="form-grid drawer-form-grid">
          <label><div class="muted">接口名称</div><a-input v-model:value="form.name" /></label>
          <label><div class="muted">接口类型</div><a-select v-model:value="form.type" style="width:100%"><a-select-option v-for="item in providerTypeOptions" :key="item.value" :value="item.value">{{ item.label }}</a-select-option></a-select></label>
          <label><div class="muted">状态</div><a-select v-model:value="form.status" style="width:100%"><a-select-option value="active">启用</a-select-option><a-select-option value="disabled">禁用</a-select-option></a-select></label>
          <label><div class="muted">用途</div><a-select v-model:value="form.capability" style="width:100%"><a-select-option v-for="item in providerCapabilityOptions" :key="item.value" :value="item.value">{{ item.label }}</a-select-option></a-select></label>
          <label class="full"><div class="muted">Base URL</div><a-input v-model:value="form.baseUrl" /></label>
          <label class="full"><div class="muted">API Key</div><a-textarea v-model:value="form.apiKey" :rows="4" /></label>
        </div>
        <template #footer>
          <div class="drawer-footer-actions">
            <a-button @click="dialogVisible = false">取消</a-button>
            <a-button type="primary" @click="saveProvider">保存</a-button>
          </div>
        </template>
      </a-drawer>
    </div>
  `,
}
