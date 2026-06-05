import { adminApi } from '../api.js'
import { CrudPage } from '../components/crud-page.js'

const { computed, onMounted, ref } = Vue

export const FinancePage = {
  components: { CrudPage },
  props: { mode: String },
  setup() {
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
    async function loadOptions() {
      const [providerRes, modelRes] = await Promise.all([
        adminApi.listApiProviders().catch(() => ({ data: [] })),
        adminApi.listModels().catch(() => ({ data: [] })),
      ])
      providers.value = providerRes.data || []
      models.value = modelRes.data || []
    }
    onMounted(loadOptions)
    const redeemFields = (row) => row
      ? [
          { key: 'credits', label: '额度', type: 'number', number: true, required: true },
          { key: 'status', label: '状态', type: 'select', defaultValue: 'active', options: [{ label: '可用', value: 'active' }, { label: '禁用', value: 'disabled' }] },
          { key: 'remark', label: '备注', nullable: true },
          { key: 'expiresAt', label: '过期时间 ISO', nullable: true },
        ]
      : [
          { key: 'code', label: '指定卡密（留空自动生成）', nullable: true },
          { key: 'count', label: '数量', type: 'number', number: true, defaultValue: 1, required: true },
          { key: 'credits', label: '额度', type: 'number', number: true, required: true },
          { key: 'remark', label: '备注', nullable: true },
          { key: 'expiresAt', label: '过期时间 ISO', nullable: true },
        ]
    const shopFields = [
      { key: 'name', label: '商品名称', required: true },
      { key: 'amount', label: '金额', type: 'number', number: true, required: true },
      { key: 'credits', label: '到账额度', type: 'number', number: true, required: true },
      { key: 'badge', label: '标签', nullable: true },
      { key: 'sortOrder', label: '排序', type: 'number', number: true, defaultValue: 0 },
      { key: 'status', label: '状态', type: 'select', defaultValue: 'active', options: [{ label: '启用', value: 'active' }, { label: '禁用', value: 'disabled' }] },
    ]
    function subscriptionFields() {
      return [
        { key: 'name', label: '套餐名称', required: true },
        { key: 'description', label: '套餐说明', nullable: true, full: true },
        { key: 'amount', label: '售价', type: 'number', number: true, required: true },
        { key: 'durationDays', label: '有效天数', type: 'number', number: true, defaultValue: 30, required: true },
        { key: 'bonusCredits', label: '赠送额度', type: 'number', number: true, defaultValue: 0 },
        { key: 'discountPercent', label: '模型折扣%', type: 'number', number: true, defaultValue: 0 },
        { key: 'allowedProviderIds', label: '允许使用接口（留空不限）', type: 'multiple-select', options: providerOptions.value, full: true },
        { key: 'allowedModelIds', label: '允许使用模型（留空不限）', type: 'multiple-select', options: modelOptions.value, full: true },
        { key: 'badge', label: '标签', nullable: true },
        { key: 'sortOrder', label: '排序', type: 'number', number: true, defaultValue: 0 },
        { key: 'status', label: '状态', type: 'select', defaultValue: 'active', options: [{ label: '启用', value: 'active' }, { label: '禁用', value: 'disabled' }] },
      ]
    }
    return { adminApi, redeemFields, shopFields, subscriptionFields }
  },
  template: `
    <CrudPage v-if="mode === 'orders'" title="订单列表" description="查看充值订单状态、金额和到账额度。" paginated search readonly
      :default-filters="{ status: 'all' }"
      :filters="[{ key: 'status', options: [{ label: '全部订单', value: 'all' }, { label: '待支付', value: 'pending' }, { label: '已支付', value: 'paid' }, { label: '已关闭', value: 'closed' }, { label: '失败', value: 'failed' }] }]"
      :list="adminApi.listRechargeOrders"
      :columns="[
        { label: '用户', render: row => row.userEmail || row.userId },
        { label: '类型', key: 'orderType', format: 'status', map: 'orderType' },
        { label: '订单号', key: 'outTradeNo' },
        { label: '金额', key: 'amount', format: 'money' },
        { label: '额度', key: 'credits', format: 'amount' },
        { label: '状态', key: 'status', format: 'status', map: 'order' },
        { label: '支付时间', key: 'paidAt', format: 'date' },
        { label: '创建时间', key: 'createdAt', format: 'date' },
      ]"
    />
    <CrudPage v-else-if="mode === 'redeem'" title="卡密兑换" singular="卡密" description="生成、禁用、删除兑换卡密。" paginated search
      :default-filters="{ status: 'all' }"
      :filters="[{ key: 'status', options: [{ label: '全部卡密', value: 'all' }, { label: '可用', value: 'active' }, { label: '已兑换', value: 'used' }, { label: '禁用', value: 'disabled' }] }]"
      :list="adminApi.listRedeemCodes" :create="adminApi.createRedeemCodes" :update="adminApi.updateRedeemCode" :delete="adminApi.deleteRedeemCode" :fields="redeemFields"
      :columns="[
        { label: '卡密', key: 'code', copy: true, width: 220 },
        { label: '额度', key: 'credits', format: 'amount' },
        { label: '状态', key: 'status', format: 'status', map: 'redeem' },
        { label: '使用用户', render: row => row.userEmail || row.userId },
        { label: '备注', key: 'remark' },
        { label: '过期时间', key: 'expiresAt', format: 'date' },
      ]"
    />
    <CrudPage v-else-if="mode === 'subscriptions'" title="订阅套餐" singular="订阅套餐" description="维护前台会员订阅套餐，支持周期、赠送额度和模型折扣。"
      :list="adminApi.listSubscriptionPlans" :create="adminApi.createSubscriptionPlan" :update="adminApi.updateSubscriptionPlan" :delete="adminApi.deleteSubscriptionPlan" :fields="subscriptionFields"
      :columns="[
        { label: '名称', key: 'name' },
        { label: '售价', key: 'amount', format: 'money' },
        { label: '有效天数', key: 'durationDays' },
        { label: '赠送额度', key: 'bonusCredits', format: 'amount' },
        { label: '模型折扣%', key: 'discountPercent' },
        { label: '接口限制', render: row => row.allowedProviderIds?.length ? row.allowedProviderIds.length + ' 个' : '不限' },
        { label: '模型限制', render: row => row.allowedModelIds?.length ? row.allowedModelIds.length + ' 个' : '不限' },
        { label: '标签', key: 'badge' },
        { label: '排序', key: 'sortOrder' },
        { label: '状态', key: 'status', format: 'status' },
      ]"
    />
    <CrudPage v-else title="商品管理" singular="充值商品" description="维护前台充值套餐。"
      :list="adminApi.listRechargeProducts" :create="adminApi.createRechargeProduct" :update="adminApi.updateRechargeProduct" :delete="adminApi.deleteRechargeProduct" :fields="shopFields"
      :columns="[
        { label: '名称', key: 'name' },
        { label: '金额', key: 'amount', format: 'money' },
        { label: '额度', key: 'credits', format: 'amount' },
        { label: '标签', key: 'badge' },
        { label: '排序', key: 'sortOrder' },
        { label: '状态', key: 'status', format: 'status' },
      ]"
    />
  `,
}
