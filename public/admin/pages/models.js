import { adminApi } from '../api.js'
import { amount, formatDate, statusItem, text, toNumber } from '../format.js?v=20260710-shanghai-tz-v1'
import { CrudPage } from '../components/crud-page.js?v=20260710-shanghai-tz-v1'

const { computed, onMounted, reactive, ref } = Vue
const { message } = antd
const modelSizeTierOptions = [
  { label: '1K', value: '1k' },
  { label: '2K', value: '2k' },
  { label: '4K', value: '4k' },
]
const modelCapabilityOptions = [
  { label: '对话生图', value: 'chat_image' },
]

function formatEnabledSizeTiers(value) {
  const tiers = Array.isArray(value) && value.length ? value : ['1k', '2k', '4k']
  return tiers.map((item) => String(item).toUpperCase()).join(' / ')
}

const modelFields = [
  { key: 'modelName', label: '模型名', required: true },
  { key: 'displayName', label: '展示名称', required: true },
  { key: 'capability', label: '用途', type: 'select', defaultValue: 'chat_image', options: modelCapabilityOptions },
  { key: 'cost1k', label: '1K成本', type: 'number', number: true, defaultValue: 0 },
  { key: 'cost2k', label: '2K成本', type: 'number', number: true, defaultValue: 0 },
  { key: 'cost4k', label: '4K成本', type: 'number', number: true, defaultValue: 0 },
  { key: 'markupPercent', label: '加价百分比', type: 'number', number: true, defaultValue: 0 },
  { key: 'price1k', label: '1K售价', type: 'number', number: true, defaultValue: 0 },
  { key: 'price2k', label: '2K售价', type: 'number', number: true, defaultValue: 0 },
  { key: 'price4k', label: '4K售价', type: 'number', number: true, defaultValue: 0 },
  { key: 'appendSizeToPrompt', label: '前台尺寸带入提示词', boolean: true, defaultValue: false },
  { key: 'enabledSizeTiers', label: '可用清晰度', type: 'multiple-select', defaultValue: ['1k', '2k', '4k'], options: modelSizeTierOptions },
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
    const sortVisible = ref(false)
    const sortSaving = ref(false)
    const sortRows = ref([])
    const sortReload = ref(null)
    const isMappings = computed(() => props.mode === 'mappings')
    const providerOptions = computed(() => providers.value.map((provider) => ({
      label: `${provider.name || provider.id} · ${provider.type || 'custom'}`,
      value: provider.id,
      searchText: `${provider.name || ''} ${provider.type || ''} ${provider.baseUrl || ''} ${provider.id || ''}`,
    })))
    const modelDialogFields = computed(() => [
      {
        key: 'providerId',
        label: '接口服务商',
        type: 'select',
        required: true,
        showSearch: true,
        placeholder: '请选择接口服务商',
        options: providerOptions.value,
      },
      ...modelFields,
    ])
    const modelSortActions = computed(() => [
      { key: 'sort', label: '排序', icon: 'ti-arrows-sort', onClick: openSort },
    ])

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
      return { providerId: providerId.value, modelName: model.name, displayName, capability: providers.value.find((item) => item.id === providerId.value)?.capability || 'chat_image', cost1k, cost2k, cost4k, markupPercent: toNumber(markupPercent.value, 0), priceChangePercent: 0, price1k: 0, price2k: 0, price4k: 0, appendSizeToPrompt: false, enabledSizeTiers: ['1k', '2k', '4k'], sortOrder: 100, status: 'active' }
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

    function groupedSortRows(source = models.value) {
      const groups = new Map()
      source.forEach((model) => {
        const displayName = model.displayName || model.modelName
        const key = [model.providerId, model.capability, displayName.trim().toLowerCase()].join(':')
        const existing = groups.get(key)
        if (!existing) {
          groups.set(key, reactive({
            key,
            providerId: model.providerId,
            providerName: model.providerName || model.providerId,
            displayName,
            modelNames: [model.modelName],
            ids: [model.id],
            sortOrder: Number(model.sortOrder ?? 100),
          }))
          return
        }
        existing.ids.push(model.id)
        existing.modelNames.push(model.modelName)
        existing.sortOrder = Math.min(Number(existing.sortOrder ?? 100), Number(model.sortOrder ?? 100))
      })
      return [...groups.values()].sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0) || a.displayName.localeCompare(b.displayName, 'zh-CN'))
    }

    async function openSort(context) {
      sortReload.value = context?.load || null
      await loadBase()
      sortRows.value = groupedSortRows()
      sortVisible.value = true
    }

    async function saveSortOrders() {
      const items = sortRows.value.flatMap((row) => row.ids.map((id) => ({
        id,
        sortOrder: toNumber(row.sortOrder, 100),
      })))
      if (!items.length) return
      sortSaving.value = true
      try {
        await adminApi.updateModelSortOrders({ items })
        message.success('排序已保存')
        sortVisible.value = false
        await loadBase()
        await sortReload.value?.()
      } catch (error) {
        message.error(error instanceof Error ? error.message : '保存排序失败')
      } finally {
        sortSaving.value = false
      }
    }

    onMounted(() => {
      loadBase()
    })
    return { modelFields, modelDialogFields, adminApi, isMappings, providers, models, providerId, keyword, markupPercent, remoteSource, remote, selected, loading, sortVisible, sortSaving, sortRows, modelSortActions, fetchRemote, filterRemote, saveSelected, toggleSelected, openSort, saveSortOrders, formatEnabledSizeTiers, amount, statusItem, text, formatDate }
  },
  template: `
    <div>
      <template v-if="!isMappings">
        <CrudPage
          title="模型管理"
          singular="模型"
          description="维护模型名称、展示名称、成本和售价。已有历史任务的模型删除时会自动改为禁用。"
          search
          :list="adminApi.listModels"
          :create="adminApi.createModel"
          :update="adminApi.updateModel"
          :delete="adminApi.deleteModel"
          :fields="modelDialogFields"
          :actions="modelSortActions"
          :columns="[
            { label: '展示名称', key: 'displayName' },
            { label: '模型名', key: 'modelName' },
            { label: '服务商', render: row => row.providerName || row.providerId },
            { label: '1K售价', key: 'price1k', format: 'amount' },
            { label: '2K售价', key: 'price2k', format: 'amount' },
            { label: '4K售价', key: 'price4k', format: 'amount' },
            { label: '可用清晰度', render: row => formatEnabledSizeTiers(row.enabledSizeTiers) },
            { label: '价格浮动', key: 'priceChangePercent', format: 'price-change' },
            { label: '尺寸提示词', render: row => row.appendSizeToPrompt ? '开启' : '关闭' },
            { label: '状态', key: 'status', format: 'status' },
            { label: '更新时间', key: 'updatedAt', format: 'date' },
          ]"
        />
        <a-drawer
          v-model:open="sortVisible"
          title="模型排序"
          width="min(92vw, 820px)"
          class="admin-edit-drawer"
          destroy-on-close
        >
          <div class="page-desc" style="margin-bottom:12px">仅显示去重后的模型。数值越小越靠前，保存后会同步到该展示名下的所有模型变体。</div>
          <div class="data-table-wrap">
            <table class="data-table">
              <thead><tr><th>展示模型</th><th>服务商</th><th>变体</th><th style="width:150px">排序值</th></tr></thead>
              <tbody>
                <tr v-for="row in sortRows" :key="row.key">
                  <td><strong>{{ row.displayName }}</strong><div class="muted">{{ row.modelNames.slice(0, 2).join(' / ') }}{{ row.modelNames.length > 2 ? ' ...' : '' }}</div></td>
                  <td>{{ row.providerName }}</td>
                  <td>{{ row.ids.length }} 个</td>
                  <td><a-input-number v-model:value="row.sortOrder" :min="0" :max="999999" style="width:120px" /></td>
                </tr>
              </tbody>
            </table>
            <a-empty v-if="!sortRows.length" description="暂无模型" />
          </div>
          <template #footer>
            <div class="drawer-footer-actions">
              <a-button @click="sortVisible = false">取消</a-button>
              <a-button type="primary" :loading="sortSaving" @click="saveSortOrders">保存</a-button>
            </div>
          </template>
        </a-drawer>
      </template>
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
    </div>
  `,
}
