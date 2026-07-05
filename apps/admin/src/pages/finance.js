import { adminApi } from '../api.js'
import { CrudPage } from '../components/crud-page.js'

const { computed, onMounted, ref, watch } = Vue

export const FinancePage = {
  components: { CrudPage },
  props: { mode: String },
  setup(props) {
    const providers = ref([])
    const models = ref([])
    const providerOptions = computed(() => providers.value.map((provider) => ({
      label: provider.name,
      value: provider.id,
      searchText: `${provider.name} ${provider.type} ${provider.baseUrl || ''}`,
    })))
    const modelOptions = computed(() => models.value.map((model) => ({
      label: `${model.displayName || model.modelName} / ${model.providerName || model.providerId}`,
      value: model.id,
      searchText: `${model.displayName || ''} ${model.modelName || ''} ${model.providerName || ''}`,
    })))
    const needsModelOptions = computed(() => props.mode === 'subscriptions')
    async function loadOptions() {
      const [providerRes, modelRes] = await Promise.all([
        adminApi.listApiProviders().catch(() => ({ data: [] })),
        needsModelOptions.value ? adminApi.listModels().catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
      ])
      providers.value = providerRes.data || []
      models.value = modelRes.data || []
    }
    onMounted(() => {
      loadOptions()
    })
    watch(() => props.mode, () => {
      loadOptions()
    })
    function subscriptionFields() {
      return [
        { key: 'name', label: '套餐名称', required: true },
        { key: 'description', label: '套餐说明', nullable: true, full: true },
        { key: 'amount', label: '售价', type: 'number', number: true, required: true },
        { key: 'durationDays', label: '有效天数', type: 'number', number: true, defaultValue: 30, required: true },
        { key: 'quotaImages', label: '周期生图额度（张）', type: 'number', number: true, defaultValue: 100, required: true },
        { key: 'discountPercent', label: '模型折扣%', type: 'number', number: true, defaultValue: 0 },
        { key: 'allowedProviderIds', label: '允许使用接口（留空不限）', type: 'multiple-select', options: providerOptions.value, full: true },
        { key: 'allowedModelIds', label: '允许使用模型（留空不限）', type: 'multiple-select', options: modelOptions.value, full: true },
        { key: 'badge', label: '标签', nullable: true },
        { key: 'sortOrder', label: '排序', type: 'number', number: true, defaultValue: 0 },
        { key: 'status', label: '状态', type: 'select', defaultValue: 'active', options: [{ label: '启用', value: 'active' }, { label: '禁用', value: 'disabled' }] },
      ]
    }
    function planQuotaText(row) {
      const explicit = Number(row?.quotaImages || 0)
      if (explicit > 0) return `${explicit} 张`
      const days = Number(row?.durationDays || 0)
      if (days <= 1) return '20 张'
      if (days <= 31) return '300 张'
      if (days <= 92) return '1000 张'
      return '100 张'
    }
    return { adminApi, planQuotaText, subscriptionFields }
  },
  template: `
    <CrudPage v-if="mode === 'orders'" title="订阅订单" description="查看订阅支付订单状态和金额。" paginated search readonly
        :default-filters="{ status: 'all' }"
        :filters="[{ key: 'status', options: [{ label: '全部订单', value: 'all' }, { label: '待支付', value: 'pending' }, { label: '已支付', value: 'paid' }, { label: '已关闭', value: 'closed' }, { label: '失败', value: 'failed' }] }]"
        :list="adminApi.listRechargeOrders"
        :columns="[
          { label: '用户', render: row => row.userEmail || row.userId },
          { label: '类型', key: 'orderType', format: 'status', map: 'orderType' },
          { label: '订单号', key: 'outTradeNo' },
          { label: '金额', key: 'amount', format: 'money' },
          { label: '状态', key: 'status', format: 'status', map: 'order' },
          { label: '支付时间', key: 'paidAt', format: 'date' },
          { label: '创建时间', key: 'createdAt', format: 'date' },
        ]"
      />
    <CrudPage v-else-if="mode === 'subscriptions'" title="订阅套餐" singular="订阅套餐" description="维护前台会员订阅套餐，支持周期额度、模型范围和订阅折扣。"
      :list="adminApi.listSubscriptionPlans" :create="adminApi.createSubscriptionPlan" :update="adminApi.updateSubscriptionPlan" :delete="adminApi.deleteSubscriptionPlan" :fields="subscriptionFields"
      :columns="[
        { label: '名称', key: 'name' },
        { label: '售价', key: 'amount', format: 'money' },
        { label: '有效天数', key: 'durationDays' },
        { label: '周期额度', render: planQuotaText },
        { label: '模型折扣%', key: 'discountPercent' },
        { label: '接口限制', render: row => row.allowedProviderIds?.length ? row.allowedProviderIds.length + ' 个' : '不限' },
        { label: '模型限制', render: row => row.allowedModelIds?.length ? row.allowedModelIds.length + ' 个' : '不限' },
        { label: '标签', key: 'badge' },
        { label: '排序', key: 'sortOrder' },
        { label: '状态', key: 'status', format: 'status' },
      ]"
    />
    <a-empty v-else description="该模块已移除" />
  `,
}
