import { adminApi } from '../api.js'
import { amount, formatCurrency, formatDate } from '../format.js'

const { computed, onMounted, ref, watch } = Vue
const { message } = antd

function money(value) {
  return `¥${formatCurrency(value)}`
}

function percent(value) {
  return `${Number(value || 0).toFixed(2)}%`
}

function metricTone(value) {
  const number = Number(value || 0)
  if (number > 0) return 'positive'
  if (number < 0) return 'negative'
  return 'neutral'
}

export const CostStatsPage = {
  setup() {
    const loading = ref(false)
    const days = ref(30)
    const stats = ref(null)

    const summary = computed(() => stats.value?.summary || {
      paidAmount: 0,
      paidOrders: 0,
      taskRevenue: 0,
      modelCost: 0,
      grossProfit: 0,
      grossProfitRate: 0,
      cashMinusModelCost: 0,
      successTasks: 0,
      images: 0,
    })
    const models = computed(() => stats.value?.models || [])
    const trends = computed(() => stats.value?.trends || [])
    const maxTrendValue = computed(() => Math.max(1, ...trends.value.flatMap((item) => [
      Number(item.taskRevenue || 0),
      Number(item.modelCost || 0),
      Number(item.paidAmount || 0),
    ])))
    const summaryCards = computed(() => [
      { label: '现金收入', value: money(summary.value.paidAmount), note: `已支付 ${summary.value.paidOrders} 单`, tone: 'blue' },
      { label: '生成收入', value: amount(summary.value.taskRevenue), note: '用户生成实际扣费', tone: 'green' },
      { label: '模型成本', value: amount(summary.value.modelCost), note: '成功任务成本快照', tone: 'orange' },
      { label: '生成毛利', value: amount(summary.value.grossProfit), note: `毛利率 ${percent(summary.value.grossProfitRate)}`, tone: metricTone(summary.value.grossProfit) },
      { label: '现金差额', value: money(summary.value.cashMinusModelCost), note: '现金收入 - 模型成本', tone: metricTone(summary.value.cashMinusModelCost) },
      { label: '成功产出', value: amount(summary.value.images), note: `成功任务 ${summary.value.successTasks} 个`, tone: 'slate' },
    ])

    async function load() {
      loading.value = true
      try {
        const response = await adminApi.getCostStats({ days: days.value })
        stats.value = response.data
      } catch (error) {
        message.error(error instanceof Error ? error.message : '加载成本统计失败')
      } finally {
        loading.value = false
      }
    }

    function trendWidth(value) {
      return `${Math.max(2, Math.round((Number(value || 0) / maxTrendValue.value) * 100))}%`
    }

    watch(days, load)
    onMounted(() => {
      load()
    })

    return {
      loading,
      days,
      summary,
      summaryCards,
      models,
      trends,
      load,
      trendWidth,
      amount,
      money,
      percent,
      metricTone,
      formatDate,
    }
  },
  template: `
    <div class="page-stack cost-stats-page">
      <a-card class="admin-view-card" :bordered="false">
        <div class="admin-card-hero">
          <div>
            <div class="page-kicker">Cost & Profit</div>
            <div class="page-title">成本统计</div>
            <div class="page-desc">统计支付收入、生成扣费、模型成本和毛利。旧任务没有成本快照时，会按当前模型成本估算。</div>
          </div>
          <div class="toolbar">
            <a-select v-model:value="days" style="width:140px">
              <a-select-option :value="1">最近 1 天</a-select-option>
              <a-select-option :value="7">最近 7 天</a-select-option>
              <a-select-option :value="30">最近 30 天</a-select-option>
              <a-select-option :value="90">最近 90 天</a-select-option>
            </a-select>
            <a-button :loading="loading" @click="load">刷新</a-button>
          </div>
        </div>
        <div class="summary-grid cost-summary-grid">
          <div v-for="item in summaryCards" :key="item.label" :class="['summary-card', 'cost-card', 'tone-' + item.tone]">
            <span>{{ item.label }}</span>
            <b>{{ item.value }}</b>
            <div class="muted">{{ item.note }}</div>
          </div>
        </div>
      </a-card>

      <a-card class="admin-view-card" :bordered="false">
        <template #title>每日趋势</template>
        <template #extra><a-tag color="blue">最近 {{ days }} 天</a-tag></template>
        <a-spin :spinning="loading">
          <div class="cost-trend-list">
            <div v-for="item in trends" :key="item.day" class="cost-trend-row">
              <div class="cost-trend-day">{{ formatDate(item.day).slice(0, 10) }}</div>
              <div class="cost-trend-bars">
                <div class="cost-trend-bar revenue"><span :style="{ width: trendWidth(item.taskRevenue) }"></span><em>生成 {{ amount(item.taskRevenue) }}</em></div>
                <div class="cost-trend-bar cost"><span :style="{ width: trendWidth(item.modelCost) }"></span><em>成本 {{ amount(item.modelCost) }}</em></div>
                <div class="cost-trend-bar cash"><span :style="{ width: trendWidth(item.paidAmount) }"></span><em>现金 {{ money(item.paidAmount) }}</em></div>
              </div>
              <div class="cost-trend-profit" :class="metricTone(item.grossProfit)">
                {{ amount(item.grossProfit) }}
                <small>{{ percent(item.grossProfitRate) }}</small>
              </div>
            </div>
          </div>
          <a-empty v-if="!trends.length && !loading" description="暂无趋势数据" />
        </a-spin>
      </a-card>

      <a-card class="admin-view-card" :bordered="false">
        <template #title>模型成本排行</template>
        <div class="data-table-wrap">
          <table class="data-table">
            <thead><tr><th>模型</th><th>成功任务</th><th>图片数</th><th>生成收入</th><th>模型成本</th><th>毛利</th><th>毛利率</th></tr></thead>
            <tbody>
              <tr v-for="row in models" :key="row.modelId || row.modelName">
                <td><span class="cell-ellipsis">{{ row.displayName || row.modelName || row.modelId || '-' }}</span></td>
                <td>{{ row.successTasks }}</td>
                <td>{{ row.images }}</td>
                <td>{{ amount(row.taskRevenue) }}</td>
                <td>{{ amount(row.modelCost) }}</td>
                <td :class="metricTone(row.grossProfit)">{{ amount(row.grossProfit) }}</td>
                <td>{{ percent(row.grossProfitRate) }}</td>
              </tr>
            </tbody>
          </table>
          <a-empty v-if="!models.length && !loading" description="暂无模型成本数据" />
        </div>
      </a-card>
    </div>
  `,
}
