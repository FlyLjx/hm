import { CostStatsPage } from './cost-stats.js?v=20260614-05'
import { CreditLogsPage } from './credit-logs.js'

const { computed, ref, watch } = Vue

const tabs = [
  { key: 'stats', label: '统计概览', desc: '收入、成本、毛利', icon: 'ti-chart-bar', component: CostStatsPage },
  { key: 'logs', label: '积分流水', desc: '充值、扣减、余额变化', icon: 'ti-coins', component: CreditLogsPage },
]

export const CreditCenterPage = {
  props: {
    initialTab: { type: String, default: 'stats' },
    settings: Object,
  },
  setup(props) {
    const activeTab = ref(tabs.some((tab) => tab.key === props.initialTab) ? props.initialTab : 'stats')
    const activeMeta = computed(() => tabs.find((tab) => tab.key === activeTab.value) || tabs[0])
    const activeComponent = computed(() => activeMeta.value.component)

    watch(
      () => props.initialTab,
      (value) => {
        if (tabs.some((tab) => tab.key === value)) activeTab.value = value
      },
    )

    function selectTab(key) {
      activeTab.value = key
    }

    return { tabs, activeTab, activeMeta, activeComponent, selectTab }
  },
  template: `
    <div class="page-stack credit-center-page">
      <a-card class="admin-view-card credit-center-card" :bordered="false">
        <div class="admin-card-hero compact">
          <div>
            <div class="page-kicker">Credit Center</div>
            <div class="page-title">积分与统计</div>
            <div class="page-desc">集中查看收入成本、生成毛利，以及用户积分充值和扣减流水。</div>
          </div>
          <a-tag color="green">{{ activeMeta.label }}</a-tag>
        </div>
        <div class="credit-center-tabs" role="tablist">
          <button
            v-for="tab in tabs"
            :key="tab.key"
            class="credit-center-tab"
            :class="{ 'is-active': activeTab === tab.key }"
            type="button"
            role="tab"
            :aria-selected="activeTab === tab.key"
            @click="selectTab(tab.key)"
          >
            <span class="credit-center-tab-icon"><i :class="['ti', tab.icon]"></i></span>
            <span class="credit-center-tab-copy">
              <strong>{{ tab.label }}</strong>
              <small>{{ tab.desc }}</small>
            </span>
          </button>
        </div>
      </a-card>
      <component :is="activeComponent" :settings="settings" />
    </div>
  `,
}
