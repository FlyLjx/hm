import { adminApi } from '../api.js'
import { amount, formatCurrency, formatDate, statusItem } from '../format.js'

const { computed, onBeforeUnmount, onMounted, ref } = Vue
const { message } = antd

export const DashboardPage = {
  props: { settings: Object },
  setup(props) {
    const loading = ref(false)
    const lastUpdated = ref('')
    const users = ref([])
    const orders = ref([])
    const tasks = ref([])
    const taskStats = ref(null)
    const dashboard = ref(null)
    const orderTotals = ref({ all: 0, paid: 0, pending: 0, closed: 0, failed: 0 })
    const creditName = computed(() => props.settings?.creditName || '积分')
    const stats = computed(() => taskStats.value || { total: 0, queued: 0, pending: 0, processing: 0, success: 0, failed: 0, canceled: 0, totalImages: 0, totalCredits: 0 })
    const paidAmount = computed(() => orders.value.filter((order) => order.status === 'paid').reduce((sum, order) => sum + Number(order.amount || 0), 0))
    const activeUsers = computed(() => users.value.filter((user) => user.status === 'active').length)
    const taskSuccessRate = computed(() => stats.value.total ? Math.round((stats.value.success / stats.value.total) * 100) : 0)
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

    async function load() {
      if (loading.value) return
      loading.value = true
      try {
        const limit = 8
        const [dashboardRes, usersRes, ordersRes, tasksRes, statsRes, paid, pending, closed, failed] = await Promise.all([
          adminApi.getDashboard().catch(() => ({ data: null })),
          adminApi.listUsers(),
          adminApi.listRechargeOrders({ page: 1, pageSize: limit, status: 'all' }),
          adminApi.listTasks({ page: 1, pageSize: limit }),
          adminApi.getTaskStats(),
          adminApi.listRechargeOrders({ page: 1, pageSize: 1, status: 'paid' }),
          adminApi.listRechargeOrders({ page: 1, pageSize: 1, status: 'pending' }),
          adminApi.listRechargeOrders({ page: 1, pageSize: 1, status: 'closed' }),
          adminApi.listRechargeOrders({ page: 1, pageSize: 1, status: 'failed' }),
        ])
        dashboard.value = dashboardRes.data
        users.value = usersRes.data || []
        orders.value = ordersRes.data || []
        tasks.value = tasksRes.data || []
        taskStats.value = statsRes.data
        orderTotals.value = {
          all: ordersRes.pagination?.total || 0,
          paid: paid.pagination?.total || 0,
          pending: pending.pagination?.total || 0,
          closed: closed.pagination?.total || 0,
          failed: failed.pagination?.total || 0,
        }
        lastUpdated.value = new Date().toISOString()
      } catch (error) {
        message.error(error instanceof Error ? error.message : '加载控制台失败')
      } finally {
        loading.value = false
      }
    }

    const todayItems = computed(() => {
      const today = dashboard.value?.today || {}
      return [
        { label: '新增用户', value: Number(today.users || 0), display: amount(today.users || 0), tone: 'blue', icon: 'ti-user-plus' },
        { label: '订单数', value: Number(today.orders || 0), display: amount(today.orders || 0), tone: 'violet', icon: 'ti-receipt' },
        { label: '支付金额', value: Number(today.paidAmount || 0), display: `¥${formatCurrency(today.paidAmount || 0)}`, tone: 'green', icon: 'ti-wallet' },
        { label: '生成任务', value: Number(today.tasks || 0), display: amount(today.tasks || 0), tone: 'cyan', icon: 'ti-sparkles' },
        { label: '失败任务', value: Number(today.failedTasks || 0), display: amount(today.failedTasks || 0), tone: today.failedTasks ? 'red' : 'slate', icon: 'ti-alert-triangle' },
      ]
    })
    onMounted(() => {
      load()
      window.addEventListener('admin:auto-refresh', load)
    })
    onBeforeUnmount(() => {
      window.removeEventListener('admin:auto-refresh', load)
    })
    return {
      loading,
      lastUpdated,
      users,
      orders,
      tasks,
      stats,
      orderTotals,
      activeUsers,
      paidAmount,
      taskSuccessRate,
      orderColumns,
      taskColumns,
      todayItems,
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
            <div class="page-title">控制台概览</div>
            <div class="page-desc">最近同步：{{ lastUpdated ? formatDate(lastUpdated) : '等待首次同步' }}</div>
          </div>
          <a-space>
            <a-button type="primary" :loading="loading" @click="load">刷新数据</a-button>
          </a-space>
        </div>
      </a-card>

      <a-row :gutter="[16, 16]" class="dashboard-stat-row">
        <a-col :xs="24" :sm="12" :xl="4">
          <a-card class="dashboard-stat-card">
            <a-statistic title="用户总数" :value="users.length" />
            <div class="dashboard-stat-note">启用 {{ activeUsers }} 人</div>
          </a-card>
        </a-col>
        <a-col :xs="24" :sm="12" :xl="5">
          <a-card class="dashboard-stat-card">
            <a-statistic title="订单总数" :value="orderTotals.all" />
            <div class="dashboard-stat-note">已支付 {{ orderTotals.paid }} 单，待支付 {{ orderTotals.pending }} 单</div>
          </a-card>
        </a-col>
        <a-col :xs="24" :sm="12" :xl="5">
          <a-card class="dashboard-stat-card">
            <a-statistic title="近期支付" :value="formatCurrency(paidAmount)" prefix="¥" />
            <div class="dashboard-stat-note">最近 {{ orders.length }} 单充值记录</div>
          </a-card>
        </a-col>
        <a-col :xs="24" :sm="12" :xl="5">
          <a-card class="dashboard-stat-card">
            <a-statistic title="任务成功率" :value="taskSuccessRate" suffix="%" />
            <a-progress :percent="taskSuccessRate" size="small" :show-info="false" />
          </a-card>
        </a-col>
        <a-col :xs="24" :sm="12" :xl="5">
          <a-card class="dashboard-stat-card">
            <a-statistic :title="'消耗' + creditName" :value="amount(stats.totalCredits)" />
            <div class="dashboard-stat-note">生成 {{ stats.totalImages }} 张图片</div>
          </a-card>
        </a-col>
      </a-row>

      <a-card class="dashboard-section-card" :bordered="false">
        <template #title>今日概览</template>
        <template #extra><a-tag color="blue">从 00:00 开始统计</a-tag></template>
        <div class="today-overview">
          <div class="today-metric-row">
            <div v-for="item in todayItems" :key="item.label" :class="['today-metric', 'tone-' + item.tone]">
              <span class="today-metric-icon"><i :class="['ti', item.icon]"></i></span>
              <span class="today-metric-label">{{ item.label }}</span>
              <strong>{{ item.display }}</strong>
            </div>
          </div>
        </div>
      </a-card>

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
