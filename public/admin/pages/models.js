import { adminApi } from '../api.js'
import { amount, formatDate, statusItem, text, toNumber } from '../format.js'
import { CrudPage } from '../components/crud-page.js'

const { computed, onBeforeUnmount, onMounted, ref } = Vue
const { message } = antd

const modelFields = [
  { key: 'providerId', label: '服务商ID', required: true },
  { key: 'modelName', label: '模型名', required: true },
  { key: 'displayName', label: '展示名称', required: true },
  { key: 'capability', label: '用途', type: 'select', defaultValue: 'chat_image', options: [{ label: '对话生图', value: 'chat_image' }] },
  { key: 'cost1k', label: '1K成本', type: 'number', number: true, defaultValue: 0 },
  { key: 'cost2k', label: '2K成本', type: 'number', number: true, defaultValue: 0 },
  { key: 'cost4k', label: '4K成本', type: 'number', number: true, defaultValue: 0 },
  { key: 'markupPercent', label: '加价百分比', type: 'number', number: true, defaultValue: 0 },
  { key: 'price1k', label: '1K售价', type: 'number', number: true, defaultValue: 0 },
  { key: 'price2k', label: '2K售价', type: 'number', number: true, defaultValue: 0 },
  { key: 'price4k', label: '4K售价', type: 'number', number: true, defaultValue: 0 },
  { key: 'appendSizeToPrompt', label: '前台尺寸带入提示词', boolean: true, defaultValue: false },
  { key: 'status', label: '状态', type: 'select', defaultValue: 'active', options: [{ label: '启用', value: 'active' }, { label: '禁用', value: 'disabled' }] },
]

export const ModelsPage = {
  components: { CrudPage },
  props: { mode: String },
  setup(props) {
    const providers = ref([])
    const models = ref([])
    const providerId = ref('')
    const keyword = ref('')
    const markupPercent = ref('0')
    const remoteSource = ref([])
    const remote = ref([])
    const selected = ref([])
    const loading = ref(false)
    const isMappings = computed(() => props.mode === 'mappings')

    async function loadBase() {
      const [providerRes, modelRes] = await Promise.all([
        adminApi.listApiProviders().catch(() => ({ data: [] })),
        adminApi.listModels().catch(() => ({ data: [] })),
      ])
      providers.value = providerRes.data || []
      models.value = modelRes.data || []
      providerId.value = providerId.value || providers.value[0]?.id || ''
    }

    function filterRemote(source = remoteSource.value, nextKeyword = keyword.value) {
      const normalized = nextKeyword.trim().toLowerCase()
      return normalized ? source.filter((model) => model.name.toLowerCase().includes(normalized)) : source
    }

    async function fetchRemote() {
      const provider = providers.value.find((item) => item.id === providerId.value)
      if (!provider) return message.error('请选择接口服务商')
      loading.value = true
      try {
        const response = await adminApi.fetchApiProviderModelDetails({ type: provider.type, capability: provider.capability, baseUrl: provider.baseUrl, apiKey: provider.apiKey })
        const existingByName = new Map(
          models.value
            .filter((model) => model.providerId === providerId.value)
            .map((model) => [model.modelName, model]),
        )
        const source = (response.data || []).map((model) => {
          const existingModel = existingByName.get(model.name)
          return {
            ...model,
            displayName: existingModel?.displayName || model.name,
            existed: Boolean(existingModel),
          }
        })
        remoteSource.value = source
        remote.value = filterRemote(source, keyword.value)
        selected.value = remote.value.filter((model) => !model.existed).map((model) => model.name)
        message.success(`读取完成：${remote.value.length} 个模型`)
      } catch (error) {
        message.error(error instanceof Error ? error.message : '读取模型失败')
      } finally {
        loading.value = false
      }
    }

    function toCreateInput(model) {
      const cost1k = toNumber(model.cost1k, 0)
      const cost2k = toNumber(model.cost2k, cost1k)
      const cost4k = toNumber(model.cost4k, cost2k)
      const displayName = String(model.displayName || model.name).trim() || model.name
      return { providerId: providerId.value, modelName: model.name, displayName, capability: 'chat_image', cost1k, cost2k, cost4k, markupPercent: toNumber(markupPercent.value, 0), price1k: 0, price2k: 0, price4k: 0, appendSizeToPrompt: false, status: 'active' }
    }

    async function saveSelected() {
      const selectedModels = remote.value.filter((model) => selected.value.includes(model.name) && !model.existed)
      if (!selectedModels.length) return
      await Promise.all(selectedModels.map((model) => adminApi.createModel(toCreateInput(model))))
      message.success(`已保存 ${selectedModels.length} 个模型`)
      remote.value = []
      remoteSource.value = []
      selected.value = []
      await loadBase()
    }

    function toggleSelected(name, checked) {
      selected.value = checked ? [...new Set([...selected.value, name])] : selected.value.filter((item) => item !== name)
    }

    function handleAutoRefresh() {
      if (loading.value) return
      loadBase()
    }

    onMounted(() => {
      loadBase()
      window.addEventListener('admin:auto-refresh', handleAutoRefresh)
    })
    onBeforeUnmount(() => {
      window.removeEventListener('admin:auto-refresh', handleAutoRefresh)
    })
    return { modelFields, adminApi, isMappings, providers, models, providerId, keyword, markupPercent, remoteSource, remote, selected, loading, fetchRemote, filterRemote, saveSelected, toggleSelected, amount, statusItem, text, formatDate }
  },
  template: `
    <CrudPage
      v-if="!isMappings"
      title="模型管理"
      singular="模型"
      description="维护模型名称、展示名称、成本和售价。"
      search
      :list="adminApi.listModels"
      :create="adminApi.createModel"
      :update="adminApi.updateModel"
      :delete="adminApi.deleteModel"
      :fields="modelFields"
      :columns="[
        { label: '展示名称', key: 'displayName' },
        { label: '模型名', key: 'modelName' },
        { label: '服务商', render: row => row.providerName || row.providerId },
        { label: '1K售价', key: 'price1k', format: 'amount' },
        { label: '2K售价', key: 'price2k', format: 'amount' },
        { label: '4K售价', key: 'price4k', format: 'amount' },
        { label: '尺寸提示词', render: row => row.appendSizeToPrompt ? '开启' : '关闭' },
        { label: '状态', key: 'status', format: 'status' },
        { label: '更新时间', key: 'updatedAt', format: 'date' },
      ]"
    />
    <div v-else class="page-stack">
      <a-card class="admin-view-card" :bordered="false">
        <div class="admin-card-hero">
          <div><div class="page-kicker">Model Mapping</div><div class="page-title">模型同步</div><div class="page-desc">从接口服务商读取远程模型，筛选后保存到本地模型库。</div></div>
          <div class="toolbar"><a-button type="primary" :loading="loading" @click="fetchRemote">读取模型</a-button><a-button @click="remote = filterRemote()">筛选列表</a-button></div>
        </div>
        <div class="filter-row">
          <a-select v-model:value="providerId" style="width:360px"><a-select-option v-for="provider in providers" :key="provider.id" :value="provider.id">{{ provider.name }} - {{ provider.type }}</a-select-option></a-select>
          <a-input v-model:value="keyword" placeholder="模型名称筛选" style="width:260px" />
          <a-input v-model:value="markupPercent" type="number" placeholder="加价百分比" style="width:160px" />
          <a-tag color="blue">已选 {{ selected.length }} 个</a-tag>
        </div>
      </a-card>
      <a-card class="admin-view-card" :bordered="false">
        <template #title>远程模型列表</template>
        <template #extra><a-button type="primary" :disabled="!selected.length" @click="saveSelected">保存选中</a-button></template>
        <div class="page-desc" style="margin-bottom:12px">远程 {{ remoteSource.length }} 个，当前 {{ remote.length }} 个。</div>
        <div class="data-table-wrap">
          <table class="data-table">
            <thead><tr><th>选择</th><th>远程模型名</th><th>别名 / 展示名称</th><th>状态</th><th>1K成本</th><th>2K成本</th><th>4K成本</th></tr></thead>
            <tbody><tr v-for="row in remote" :key="row.name"><td><a-checkbox :checked="selected.includes(row.name)" :disabled="row.existed" @change="toggleSelected(row.name, $event.target.checked)" /></td><td>{{ row.name }}</td><td><a-input v-model:value="row.displayName" :disabled="row.existed" placeholder="请输入前台显示别名" style="min-width:220px" /></td><td><a-tag :color="row.existed ? 'default' : 'green'">{{ row.existed ? '当前接口已存在' : '可保存' }}</a-tag></td><td>{{ amount(row.cost1k) }}</td><td>{{ amount(row.cost2k) }}</td><td>{{ amount(row.cost4k) }}</td></tr></tbody>
          </table>
        </div>
      </a-card>
    </div>
  `,
}
