import { AccountPoolPage } from './account-pool.js'
import { ModelsPage } from './models.js'
import { ProvidersPage } from './providers.js'

const { computed, ref, watch } = Vue

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
    const activeMeta = computed(() => tabs.find((tab) => tab.key === activeTab.value) || tabs[0])
    const activeComponent = computed(() => activeMeta.value.component)
    const activeProps = computed(() => activeMeta.value.props || {})

    watch(
      () => props.initialTab,
      (value) => {
        if (tabs.some((tab) => tab.key === value)) activeTab.value = value
      },
    )

    function selectTab(key) {
      activeTab.value = key
    }

    return { tabs, activeTab, activeMeta, activeComponent, activeProps, selectTab }
  },
  template: `
    <div class="page-stack model-center-page">
      <a-card class="admin-view-card model-center-card" :bordered="false">
        <div class="admin-card-hero compact">
          <div>
            <div class="page-kicker">Model Center</div>
            <div class="page-title">模型与接口</div>
            <div class="page-desc">集中维护上游接口、模型价格、远程同步和号池账号。</div>
          </div>
          <a-tag color="green">{{ activeMeta.label }}</a-tag>
        </div>
        <div class="model-center-tabs" role="tablist">
          <button
            v-for="tab in tabs"
            :key="tab.key"
            class="model-center-tab"
            :class="{ 'is-active': activeTab === tab.key }"
            type="button"
            role="tab"
            :aria-selected="activeTab === tab.key"
            @click="selectTab(tab.key)"
          >
            <span class="model-center-tab-icon"><i :class="['ti', tab.icon]"></i></span>
            <span class="model-center-tab-copy">
              <strong>{{ tab.label }}</strong>
              <small>{{ tab.desc }}</small>
            </span>
          </button>
        </div>
      </a-card>
      <component :is="activeComponent" v-bind="activeProps" />
    </div>
  `,
}
