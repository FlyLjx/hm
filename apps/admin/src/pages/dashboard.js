import { adminApi } from '../api.js'
import { amount, formatCurrency, formatDate, statusItem } from '../format.js'

const { computed, onBeforeUnmount, onMounted, ref } = Vue
const { message } = antd
const dashboardRefreshIntervalMs = 30000

export const DashboardPage = {
  props: { settings: Object },
  setup(props) {
    const loading = ref(false)
    const lastUpdated = ref('')
    const orders = ref([])
    const tasks = ref([])
    const dashboard = ref(null)
    const creditName = computed(() => props.settings?.creditName || '积分')
    const stats = computed(() => dashboard.value?.taskStats || { total: 0, queued: 0, pending: 0, processing: 0, success: 0, failed: 0, canceled: 0, totalImages: 0, totalCredits: 0 })
    const taskSuccessRate = computed(() => stats.value.total ? Math.round((stats.value.success / stats.value.total) * 100) : 0)
    const today = computed(() => dashboard.value?.today || {})
    const pending = computed(() => dashboard.value?.pending || {})
    const system = computed(() => dashboard.value?.system || {})
    const todayHealthText = computed(() => Number(today.value.failedTasks || 0) > 0 ? '今日有失败任务' : '今日运行平稳')
    const todayHealthTone = computed(() => Number(today.value.failedTasks || 0) > 0 ? 'red' : 'green')
    const attentionItems = computed(() => [
      { label: '待支付订单', value: amount(pending.value.pendingOrders || 0), note: '用户已创建未付款', tone: Number(pending.value.pendingOrders || 0) ? 'orange' : 'green', icon: 'ti-receipt' },
      { label: '运行中任务', value: amount(pending.value.runningTasks || 0), note: '队列、等待、处理中', tone: Number(pending.value.runningTasks || 0) ? 'blue' : 'slate', icon: 'ti-loader-2' },
      { label: '24h 失败', value: amount(pending.value.recentFailedTasks || 0), note: '失败或取消任务', tone: Number(pending.value.recentFailedTasks || 0) ? 'red' : 'green', icon: 'ti-alert-triangle' },
      { label: '未公开作品', value: amount(pending.value.privateImages || 0), note: '成功但未公开展示', tone: Number(pending.value.privateImages || 0) ? 'violet' : 'slate', icon: 'ti-photo-off' },
    ])
    const platformMetrics = computed(() => [
      { label: '用户总数', value: amount(dashboard.value?.users?.total || 0), note: `启用 ${dashboard.value?.users?.active || 0} 人`, icon: 'ti-users', tone: 'blue' },
      { label: '订单总数', value: amount(dashboard.value?.orders?.all || 0), note: `已支付 ${dashboard.value?.orders?.paid || 0} 单`, icon: 'ti-shopping-cart', tone: 'green' },
      { label: '任务成功率', value: `${taskSuccessRate.value}%`, note: `成功 ${stats.value.success} / 总计 ${stats.value.total}`, icon: 'ti-chart-dots', tone: taskSuccessRate.value >= 90 ? 'green' : 'orange' },
      { label: `消耗${creditName.value}`, value: amount(stats.value.totalCredits), note: `生成 ${stats.value.totalImages} 张图片`, icon: 'ti-coins', tone: 'violet' },
      { label: '接口服务商', value: amount(system.value.activeProviders || 0), note: `禁用 ${system.value.disabledProviders || 0} 个`, icon: 'ti-plug-connected', tone: Number(system.value.disabledProviders || 0) ? 'orange' : 'green' },
      { label: '生图模型', value: amount(system.value.activeModels || 0), note: `禁用 ${system.value.disabledModels || 0} 个`, icon: 'ti-robot', tone: Number(system.value.disabledModels || 0) ? 'orange' : 'blue' },
    ])
    const orderColumns = [
      { title: '用户', key: 'user', width: 180 },
      { title: '金额', key: 'amount', width: 90 },
      { title: creditName.value, key: 'credits', width: 90 },
      { title: '状态', key: 'status', width: 90 },
      { title: '时间', key: 'time', width: 150 },
    ]
    const taskColumns = [
      { title: '用户', key: 'user', width: 170 },
      { title: '模型', key: 'model', width: 160 },
      { title: '数量', key: 'quantity', width: 70 },
      { title: `扣除${creditName.value}`, key: 'cost', width: 90 },
      { title: '状态', key: 'status', width: 90 },
      { title: '时间', key: 'time', width: 150 },
    ]
    let refreshTimer = null

    async function load() {
      if (loading.value) return
      loading.value = true
      try {
        const limit = 8
        const [dashboardRes, ordersRes, tasksRes] = await Promise.all([
          adminApi.getDashboard().catch(() => ({ data: null })),
          adminApi.listRechargeOrders({ page: 1, pageSize: limit, status: 'all' }),
          adminApi.listTasks({ page: 1, pageSize: limit }),
        ])
        dashboard.value = dashboardRes.data
        orders.value = ordersRes.data || []
        tasks.value = tasksRes.data || []
        lastUpdated.value = new Date().toISOString()
      } catch (error) {
        message.error(error instanceof Error ? error.message : '加载控制台失败')
      } finally {
        loading.value = false
      }
    }

    onMounted(() => {
      load()
      refreshTimer = window.setInterval(() => {
        if (!document.hidden) load()
      }, dashboardRefreshIntervalMs)
    })
    onBeforeUnmount(() => {
      if (refreshTimer) clearInterval(refreshTimer)
    })
    return {
      loading,
      lastUpdated,
      orders,
      tasks,
      stats,
      taskSuccessRate,
      orderColumns,
      taskColumns,
      today,
      pending,
      system,
      todayHealthText,
      todayHealthTone,
      attentionItems,
      platformMetrics,
      load,
      formatDate,
      formatCurrency,
      amount,
      statusItem,
      creditName,
    }
  },
  template: `
    <div class="dashboard-page">
      <a-card class="dashboard-hero-card" :bordered="false">
        <div class="dashboard-hero-content">
          <div>
            <div class="page-kicker">Overview</div>
            <div class="page-title">经营概览</div>
            <div class="page-desc">优先展示今日收入、生成情况、失败风险和待处理事项。最近同步：{{ lastUpdated ? formatDate(lastUpdated) : '等待首次同步' }}</div>
          </div>
          <a-space>
            <a-tag :color="todayHealthTone">{{ todayHealthText }}</a-tag>
            <a-button type="primary" :loading="loading" @click="load">刷新数据</a-button>
          </a-space>
        </div>
      </a-card>

      <div class="dashboard-command-grid">
        <a-card class="dashboard-primary-card" :bordered="false">
          <div class="dashboard-primary-head">
            <div>
              <div class="page-kicker">Today</div>
              <div class="dashboard-primary-title">今日经营</div>
            </div>
            <a-tag color="blue">从 00:00 开始</a-tag>
          </div>
          <div class="dashboard-primary-value">¥{{ formatCurrency(today.paidAmount || 0) }}</div>
          <div class="dashboard-primary-note">今日支付金额，订单 {{ amount(today.orders || 0) }} 单</div>
          <div class="dashboard-today-grid">
            <div><span>新增用户</span><strong>{{ amount(today.users || 0) }}</strong></div>
            <div><span>生成任务</span><strong>{{ amount(today.tasks || 0) }}</strong></div>
            <div><span>运行中</span><strong>{{ amount(today.runningTasks || 0) }}</strong></div>
            <div><span>失败任务</span><strong :class="Number(today.failedTasks || 0) ? 'amount-negative' : ''">{{ amount(today.failedTasks || 0) }}</strong></div>
          </div>
        </a-card>

        <a-card class="dashboard-attention-card" :bordered="false">
          <div class="dashboard-panel-title">
            <div><strong>待处理事项</strong><span>需要运营留意的队列和风险</span></div>
            <a-tag color="green">实时</a-tag>
          </div>
          <div class="dashboard-attention-grid">
            <div v-for="item in attentionItems" :key="item.label" :class="['dashboard-attention-item', 'tone-' + item.tone]">
              <span class="dashboard-attention-icon"><i :class="['ti', item.icon]"></i></span>
              <div>
                <small>{{ item.label }}</small>
                <strong>{{ item.value }}</strong>
                <em>{{ item.note }}</em>
              </div>
            </div>
          </div>
        </a-card>
      </div>

      <div class="dashboard-metric-grid">
        <div v-for="item in platformMetrics" :key="item.label" :class="['dashboard-metric-card', 'tone-' + item.tone]">
          <span class="dashboard-metric-icon"><i :class="['ti', item.icon]"></i></span>
          <span class="dashboard-metric-label">{{ item.label }}</span>
          <strong>{{ item.value }}</strong>
          <small>{{ item.note }}</small>
        </div>
      </div>

      <div class="dashboard-table-grid">
        <a-card class="dashboard-section-card dashboard-table-panel" :bordered="false">
          <template #title>最近订单</template>
          <a-table :columns="orderColumns" :data-source="orders" :pagination="false" :scroll="{ x: 620 }" row-key="id" size="small">
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'user'"><span class="cell-ellipsis">{{ record.userEmail || record.userId }}</span></template>
              <template v-else-if="column.key === 'amount'">¥{{ formatCurrency(record.amount) }}</template>
              <template v-else-if="column.key === 'credits'">{{ amount(record.credits) }}</template>
              <template v-else-if="column.key === 'status'"><a-tag :color="statusItem('order', record.status).color">{{ statusItem('order', record.status).label }}</a-tag></template>
              <template v-else-if="column.key === 'time'">{{ formatDate(record.createdAt) }}</template>
            </template>
          </a-table>
        </a-card>

        <a-card class="dashboard-section-card dashboard-table-panel" :bordered="false">
          <template #title>最近任务</template>
          <a-table :columns="taskColumns" :data-source="tasks" :pagination="false" :scroll="{ x: 730 }" row-key="id" size="small">
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'user'"><span class="cell-ellipsis">{{ record.userEmail || record.userId }}</span></template>
              <template v-else-if="column.key === 'model'"><span class="cell-ellipsis">{{ record.modelDisplayName || record.modelName || record.modelId }}</span></template>
              <template v-else-if="column.key === 'quantity'">{{ record.quantity }}</template>
              <template v-else-if="column.key === 'cost'">{{ amount(record.costCredits) }}</template>
              <template v-else-if="column.key === 'status'"><a-tag :color="statusItem('task', record.status).color">{{ statusItem('task', record.status).label }}</a-tag></template>
              <template v-else-if="column.key === 'time'">{{ formatDate(record.createdAt) }}</template>
            </template>
          </a-table>
        </a-card>
      </div>
    </div>
  `,
}
