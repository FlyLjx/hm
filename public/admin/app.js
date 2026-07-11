import { adminApi, clearAdminToken, getAdminToken, setAdminToken } from './api.js?v=20260711-api-key-concurrency-visible-v1'

const { computed, defineAsyncComponent, markRaw, onMounted, reactive, ref } = Vue
const { message } = antd
const ADMIN_ASSET_VERSION = '20260711-api-key-concurrency-visible-v1'

const PageLoading = markRaw({
  template: `
    <div class="page-panel">
      <div class="page-title" style="font-size:16px">页面加载中</div>
      <div class="page-desc">正在按需加载当前模块，请稍候。</div>
    </div>
  `,
})

function lazyPage(loader, exportName) {
  return markRaw(defineAsyncComponent({
    loader: async () => {
      const mod = await loader()
      return mod[exportName]
    },
    delay: 120,
    timeout: 20000,
    suspensible: false,
    loadingComponent: PageLoading,
  }))
}

const DashboardPage = lazyPage(() => import(`./pages/dashboard.js?v=${ADMIN_ASSET_VERSION}`), 'DashboardPage')
const UsersPage = lazyPage(() => import(`./pages/users.js?v=${ADMIN_ASSET_VERSION}`), 'UsersPage')
const ApiAccessPage = lazyPage(() => import(`./pages/api-access.js?v=${ADMIN_ASSET_VERSION}`), 'ApiAccessPage')
const ModelCenterPage = lazyPage(() => import(`./pages/model-center.js?v=${ADMIN_ASSET_VERSION}`), 'ModelCenterPage')
const TasksPage = lazyPage(() => import(`./pages/tasks.js?v=${ADMIN_ASSET_VERSION}`), 'TasksPage')
const FinancePage = lazyPage(() => import(`./pages/finance.js?v=${ADMIN_ASSET_VERSION}`), 'FinancePage')
const OperationsPage = lazyPage(() => import(`./pages/operations.js?v=${ADMIN_ASSET_VERSION}`), 'OperationsPage')
const SettingsPage = lazyPage(() => import(`./pages/settings.js?v=${ADMIN_ASSET_VERSION}`), 'SettingsPage')
const MailBroadcastPage = lazyPage(() => import(`./pages/mail-broadcast.js?v=${ADMIN_ASSET_VERSION}`), 'MailBroadcastPage')
const SystemLogsPage = lazyPage(() => import(`./pages/system-logs.js?v=${ADMIN_ASSET_VERSION}`), 'SystemLogsPage')

const menuGroups = [
  { title: '数据总览', items: [{ id: 'console', label: '控制台中心', desc: '订单与任务概览', icon: 'ti-layout-dashboard', component: DashboardPage }] },
  { title: '基础配置', items: [
    { id: 'users', label: '用户管理', desc: '账号与权限', icon: 'ti-users', component: UsersPage },
    { id: 'api-access', label: 'API 管理', desc: '用户 Key 与调用', icon: 'ti-key', component: ApiAccessPage },
    { id: 'model-center', label: '模型与接口', desc: '模型、接口、号池', icon: 'ti-robot', component: ModelCenterPage },
  ] },
  { title: '创作内容', items: [
    { id: 'tasks', label: '任务列表', desc: '生成记录', icon: 'ti-list-check', component: TasksPage },
    { id: 'images', label: '图片管理', desc: '公开展示', icon: 'ti-photo', component: TasksPage, props: { mode: 'images' } },
    { id: 'announcements', label: '公告管理', desc: '弹层签收', icon: 'ti-speakerphone', component: OperationsPage, props: { mode: 'announcements' } },
  ] },
  { title: '运营财务', items: [
    { id: 'orders', label: '订单列表', desc: '支付订单', icon: 'ti-receipt', component: FinancePage, props: { mode: 'orders' } },
    { id: 'subscriptions', label: '订阅套餐', desc: '会员权益', icon: 'ti-crown', component: FinancePage, props: { mode: 'subscriptions' } },
    { id: 'lottery', label: '抽奖管理', desc: '订阅抽奖', icon: 'ti-gift', component: OperationsPage, props: { mode: 'lottery' } },
    { id: 'invites', label: '邀请管理', desc: '邀请奖励', icon: 'ti-user-plus', component: OperationsPage, props: { mode: 'invites' } },
  ] },
  { title: '系统管理', items: [
    { id: 'mail-broadcast', label: '邮件群发', desc: '用户通知', icon: 'ti-mail', component: MailBroadcastPage },
    { id: 'system-logs', label: '系统日志', desc: '运行日志', icon: 'ti-file-text', component: SystemLogsPage },
    { id: 'settings', label: '系统设置', desc: '站点配置', icon: 'ti-settings', component: SettingsPage },
  ] },
]

const visibleRoutes = new Map(menuGroups.flatMap((group) => group.items.map((item) => [item.id, item])))
const legacyRoutes = new Map([
  ['apis', { id: 'apis', label: '接口管理', component: ModelCenterPage, props: { initialTab: 'providers' }, menuId: 'model-center' }],
  ['models', { id: 'models', label: '模型管理', component: ModelCenterPage, props: { initialTab: 'models' }, menuId: 'model-center' }],
  ['model-mappings', { id: 'model-mappings', label: '模型映射', component: ModelCenterPage, props: { initialTab: 'mappings' }, menuId: 'model-center' }],
  ['account-pool', { id: 'account-pool', label: '号池管理', component: ModelCenterPage, props: { initialTab: 'account-pool' }, menuId: 'model-center' }],
])
const routes = new Map([...visibleRoutes, ...legacyRoutes])

function displayBrandName(value, fallback = 'AI-PAI') {
  const text = String(value || fallback).trim() || fallback
  const normalized = text.replace(/AIπ/g, 'AI-PAI')
  return /^(ai-pai|ai\s+pai)$/i.test(normalized) ? 'AI-PAI' : normalized
}

function getRouteId() {
  const id = window.location.hash.replace(/^#\/?/, '')
  return routes.has(id) ? id : 'console'
}

const App = {
  setup() {
    const settings = ref({ logoText: 'AI-PAI' })
    const authed = ref(Boolean(getAdminToken()))
    const authChecking = ref(Boolean(getAdminToken()))
    const loginLoading = ref(false)
    const adminUser = ref(null)
    const loginForm = reactive({ email: '', password: '' })
    const activeId = ref(getRouteId())
    const mobileMenuOpen = ref(false)
    const activeRoute = computed(() => routes.get(activeId.value) || routes.get('console'))
    const activeMenuId = computed(() => activeRoute.value.menuId || activeRoute.value.id)
    const activeGroup = computed(() => menuGroups.find((group) => group.items.some((item) => item.id === activeMenuId.value)))
    const activeComponent = computed(() => activeRoute.value.component)
    const activeProps = computed(() => activeRoute.value.props || {})
    const displayLogoText = computed(() => displayBrandName(settings.value.logoText))
    function navigate(id) {
      activeId.value = id
      window.location.hash = `#/${id}`
      mobileMenuOpen.value = false
    }

    function toggleMobileMenu() {
      mobileMenuOpen.value = !mobileMenuOpen.value
    }

    function closeMobileMenu() {
      mobileMenuOpen.value = false
    }

    async function refreshSettings() {
      try {
        const response = await adminApi.getSettings()
        settings.value = { ...settings.value, ...(response.data || {}) }
      } catch {}
    }

    async function checkSession() {
      if (!getAdminToken()) {
        authChecking.value = false
        authed.value = false
        return
      }
      try {
        await adminApi.getSession()
        authed.value = true
      } catch {
        clearAdminToken()
        authed.value = false
      } finally {
        authChecking.value = false
      }
    }

    async function login() {
      loginLoading.value = true
      try {
        const response = await adminApi.login(loginForm)
        setAdminToken(response.data.token)
        adminUser.value = response.data.user
        authed.value = true
        await refreshSettings()
      } catch (error) {
        message.error(error instanceof Error ? error.message : '登录失败')
      } finally {
        loginLoading.value = false
      }
    }

    function logout() {
      clearAdminToken()
      authed.value = false
      adminUser.value = null
      mobileMenuOpen.value = false
    }

    onMounted(() => {
      checkSession()
      refreshSettings()
      window.addEventListener('hashchange', () => {
        activeId.value = getRouteId()
        mobileMenuOpen.value = false
      })
      window.addEventListener('admin:unauthorized', () => {
        authed.value = false
        adminUser.value = null
      })
    })

    return { menuGroups, settings, authed, authChecking, loginLoading, loginForm, activeId, activeMenuId, mobileMenuOpen, activeRoute, activeGroup, activeComponent, activeProps, displayLogoText, navigate, toggleMobileMenu, closeMobileMenu, login, logout, refreshSettings }
  },
  template: `
    <div v-if="authChecking" class="admin-login-page"><div class="admin-login-card"><div class="admin-login-title">正在验证后台登录</div></div></div>
    <div v-else-if="!authed" class="admin-login-page">
      <form class="admin-login-card" @submit.prevent="login">
        <div class="admin-login-logo">AI</div>
        <div class="admin-login-title">后台管理登录</div>
        <div class="admin-login-subtitle">请使用管理员账号进入控制台</div>
        <a-input v-model:value="loginForm.email" size="large" placeholder="管理员账号 / 邮箱" autocomplete="username" />
        <a-input-password v-model:value="loginForm.password" size="large" placeholder="登录密码" autocomplete="current-password" style="margin-top:12px" />
        <a-button type="primary" size="large" html-type="submit" :loading="loginLoading" block style="margin-top:18px">登录后台</a-button>
      </form>
    </div>
    <div v-else class="admin-shell">
      <div class="admin-mobile-scrim" :class="{ 'is-open': mobileMenuOpen }" @click="closeMobileMenu"></div>
      <aside class="admin-sidebar" :class="{ 'is-open': mobileMenuOpen }">
        <a class="admin-brand" href="#/console"><span class="admin-brand-mark">AI</span><span>{{ displayLogoText }} Admin</span></a>
        <div v-for="group in menuGroups" :key="group.title" class="admin-menu-group">
          <div class="admin-menu-title">{{ group.title }}</div>
          <div v-for="item in group.items" :key="item.id" class="admin-menu-item" :class="{ 'is-active': activeMenuId === item.id }" @click="navigate(item.id)">
            <i :class="['ti', item.icon]"></i>
            <span>{{ item.label }}</span>
          </div>
        </div>
      </aside>
      <section class="admin-main">
        <header class="admin-topbar">
          <div class="admin-topbar-title">
            <a-button class="admin-menu-button" @click="toggleMobileMenu"><i class="ti ti-menu-2"></i></a-button>
            <div>
              <a-breadcrumb class="admin-breadcrumb">
                <a-breadcrumb-item>后台管理</a-breadcrumb-item>
                <a-breadcrumb-item>{{ activeGroup?.title || '总览' }}</a-breadcrumb-item>
                <a-breadcrumb-item>{{ activeRoute.label }}</a-breadcrumb-item>
              </a-breadcrumb>
              <div class="admin-mobile-title">{{ activeRoute.label }}</div>
            </div>
          </div>
          <div class="toolbar">
            <a-button href="/" target="_blank">返回前台</a-button>
            <a-button @click="logout">退出登录</a-button>
          </div>
        </header>
        <main class="admin-content">
          <component :is="activeComponent" v-bind="activeProps" :settings="settings" @refresh-settings="refreshSettings" />
        </main>
      </section>
    </div>
  `,
}

Vue.createApp(App).use(antd).mount('#root')
