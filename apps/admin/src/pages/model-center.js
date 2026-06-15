import { adminApi } from '../api.js'
import { AccountPoolPage } from './account-pool.js'
import { ModelsPage } from './models.js'
import { ProvidersPage } from './providers.js'

const { computed, onBeforeUnmount, onMounted, ref, watch } = Vue

const tabs = [
  { key: 'models', label: '模型管理', desc: '价格、排序、前台展示', icon: 'ti-robot', component: ModelsPage },
  { key: 'providers', label: '接口服务商', desc: '上游地址、密钥、状态', icon: 'ti-plug-connected', component: ProvidersPage },
  { key: 'mappings', label: '模型同步', desc: '读取远程模型并入库', icon: 'ti-arrows-exchange', component: ModelsPage, props: { mode: 'mappings' } },
  { key: 'account-pool', label: '号池管理', desc: '账号额度与可用性', icon: 'ti-address-book', component: AccountPoolPage },
]

export const ModelCenterPage = {
  props: {
    initialTab: { type: String, default: 'models' },
  },
  setup(props) {
    const activeTab = ref(tabs.some((tab) => tab.key === props.initialTab) ? props.initialTab : 'models')
    const providers = ref([])
    const models = ref([])
    const loading = ref(false)
    const activeMeta = computed(() => tabs.find((tab) => tab.key === activeTab.value) || tabs[0])
    const activeComponent = computed(() => activeMeta.value.component)
    const activeProps = computed(() => activeMeta.value.props || {})
    const summary = computed(() => {
      const activeProviders = providers.value.filter((item) => item.status === 'active')
      const disabled4k = models.value.filter((item) => Array.isArray(item.enabledSizeTiers) && !item.enabledSizeTiers.includes('4k'))
      const newapi = providers.value.filter((item) => item.type === 'newapi')
      return [
        { label: '服务商', value: providers.value.length, hint: `${activeProviders.length} 个启用`, tone: 'neutral' },
        { label: '模型', value: models.value.length, hint: '前台与 API 共用', tone: 'neutral' },
        { label: 'NewAPI', value: newapi.length, hint: '新版渠道类型', tone: 'neutral' },
        { label: '限制 4K', value: disabled4k.length, hint: '已关闭高清选项', tone: 'neutral' },
      ]
    })

    watch(
      () => props.initialTab,
      (value) => {
        if (tabs.some((tab) => tab.key === value)) activeTab.value = value
      },
    )

    function selectTab(key) {
      activeTab.value = key
    }

    async function loadOverview() {
      loading.value = true
      try {
        const [providerRes, modelRes] = await Promise.all([
          adminApi.listApiProviders().catch(() => ({ data: [] })),
          adminApi.listModels().catch(() => ({ data: [] })),
        ])
        providers.value = providerRes.data || []
        models.value = modelRes.data || []
      } finally {
        loading.value = false
      }
    }

    function handleAutoRefresh() {
      loadOverview()
    }

    onMounted(() => {
      loadOverview()
      window.addEventListener('admin:auto-refresh', handleAutoRefresh)
    })
    onBeforeUnmount(() => {
      window.removeEventListener('admin:auto-refresh', handleAutoRefresh)
    })

    return { tabs, activeTab, activeMeta, activeComponent, activeProps, summary, loading, selectTab, loadOverview }
  },
  template: `
    <div class="page-stack model-center-page">
      <section class="model-command">
        <div class="model-command-main">
          <div class="page-kicker">NewAPI Console</div>
          <div class="page-title">模型运营中心</div>
          <div class="page-desc">把接口、模型、同步和号池收进一个工作台，后端正逐步迁移到 Go 并保留原有功能。</div>
        </div>
        <div class="model-command-status">
          <a-tag class="neutral-status-tag">{{ loading ? '同步中' : '数据已就绪' }}</a-tag>
          <a-button size="small" @click="loadOverview">刷新概览</a-button>
        </div>
        <div class="model-metrics">
          <div v-for="item in summary" :key="item.label" class="model-metric" :class="'tone-' + item.tone">
            <span>{{ item.label }}</span>
            <strong>{{ item.value }}</strong>
            <small>{{ item.hint }}</small>
          </div>
        </div>
      </section>

      <section class="model-dock" role="tablist">
        <div class="model-dock-track">
          <button
            v-for="tab in tabs"
            :key="tab.key"
            class="model-dock-item"
            :class="{ 'is-active': activeTab === tab.key }"
            type="button"
            role="tab"
            :aria-selected="activeTab === tab.key"
            @click="selectTab(tab.key)"
          >
            <span class="model-dock-icon"><i :class="['ti', tab.icon]"></i></span>
            <span class="model-dock-copy">
              <strong>{{ tab.label }}</strong>
              <small>{{ tab.desc }}</small>
            </span>
          </button>
        </div>
      </section>
      <component :is="activeComponent" v-bind="activeProps" />
    </div>
  `,
}
