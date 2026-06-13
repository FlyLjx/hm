import { adminApi, clearAdminToken, getAdminToken, setAdminToken } from './api.js'
import { DashboardPage } from './pages/dashboard.js'
import { UsersPage } from './pages/users.js'
import { ModelCenterPage } from './pages/model-center.js'
import { TasksPage } from './pages/tasks.js'
import { ApiKeysPage } from './pages/api-keys.js'
import { ApiLogsPage } from './pages/api-logs.js'
import { CreditCenterPage } from './pages/credit-center.js'
import { FinancePage } from './pages/finance.js'
import { OperationsPage } from './pages/operations.js'
import { SettingsPage } from './pages/settings.js'
import { MailBroadcastPage } from './pages/mail-broadcast.js'
import { SystemLogsPage } from './pages/system-logs.js'

const { computed, onBeforeUnmount, onMounted, reactive, ref } = Vue
const { message } = antd
const adminAutoRefreshEvent = 'admin:auto-refresh'
const adminAutoRefreshIntervalMs = 10000

const menuGroups = [
  { title: '数据总览', items: [{ id: 'console', label: '控制台中心', desc: '订单与任务概览', icon: 'ti-layout-dashboard', component: DashboardPage }] },
  { title: '基础配置', items: [
    { id: 'users', label: '用户管理', desc: '账号与权限', icon: 'ti-users', component: UsersPage },
    { id: 'model-center', label: '模型与接口', desc: '模型、接口、号池', icon: 'ti-robot', component: ModelCenterPage },
  ] },
  { title: '创作内容', items: [
    { id: 'tasks', label: '任务列表', desc: '生成记录', icon: 'ti-list-check', component: TasksPage },
    { id: 'api-keys', label: 'Key 管理', desc: '用户接口 Key', icon: 'ti-key', component: ApiKeysPage },
    { id: 'api-logs', label: 'API 日志', desc: '上游耗时', icon: 'ti-activity-heartbeat', component: ApiLogsPage },
    { id: 'images', label: '图片管理', desc: '公开展示', icon: 'ti-photo', component: TasksPage, props: { mode: 'images' } },
    { id: 'announcements', label: '公告管理', desc: '弹层签收', icon: 'ti-speakerphone', component: OperationsPage, props: { mode: 'announcements' } },
    { id: 'promotions', label: '促销管理', desc: '活动广告', icon: 'ti-discount-2', component: OperationsPage, props: { mode: 'promotions' } },
  ] },
  { title: '运营财务', items: [
    { id: 'credit-center', label: '积分与统计', desc: '收入、成本、流水', icon: 'ti-chart-bar', component: CreditCenterPage },
    { id: 'orders', label: '订单列表', desc: '支付订单', icon: 'ti-receipt', component: FinancePage, props: { mode: 'orders' } },
    { id: 'redeem-codes', label: '卡密兑换', desc: '兑换码', icon: 'ti-ticket', component: FinancePage, props: { mode: 'redeem' } },
    { id: 'subscriptions', label: '订阅套餐', desc: '会员权益', icon: 'ti-crown', component: FinancePage, props: { mode: 'subscriptions' } },
    { id: 'checkins', label: '签到管理', desc: '签到记录', icon: 'ti-calendar-check', component: OperationsPage, props: { mode: 'checkins' } },
    { id: 'invites', label: '邀请管理', desc: '邀请奖励', icon: 'ti-user-plus', component: OperationsPage, props: { mode: 'invites' } },
    { id: 'shop', label: '商品管理', desc: '充值套餐', icon: 'ti-shopping-bag', component: FinancePage, props: { mode: 'shop' } },
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
  ['cost-stats', { id: 'cost-stats', label: '成本统计', component: CreditCenterPage, props: { initialTab: 'stats' }, menuId: 'credit-center' }],
  ['credit-logs', { id: 'credit-logs', label: '积分流水', component: CreditCenterPage, props: { initialTab: 'logs' }, menuId: 'credit-center' }],
])
const routes = new Map([...visibleRoutes, ...legacyRoutes])

function getRouteId() {
  const id = window.location.hash.replace(/^#\/?/, '')
  return routes.has(id) ? id : 'console'
}

const App = {
  setup() {
    const settings = ref({ logoText: 'AIπ', creditName: '积分' })
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
    let autoRefreshTimer = null

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

    function dispatchAutoRefresh() {
      if (!authed.value || document.hidden) return
      if (activeId.value !== 'settings') refreshSettings()
      window.dispatchEvent(new CustomEvent(adminAutoRefreshEvent, { detail: { routeId: activeId.value } }))
    }

    function startAutoRefresh() {
      stopAutoRefresh()
      autoRefreshTimer = window.setInterval(dispatchAutoRefresh, adminAutoRefreshIntervalMs)
    }

    function stopAutoRefresh() {
      if (!autoRefreshTimer) return
      clearInterval(autoRefreshTimer)
      autoRefreshTimer = null
    }

    function handleVisibilityChange() {
      if (!document.hidden) dispatchAutoRefresh()
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
        startAutoRefresh()
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
      stopAutoRefresh()
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
        stopAutoRefresh()
      })
      document.addEventListener('visibilitychange', handleVisibilityChange)
      if (authed.value) startAutoRefresh()
    })

    onBeforeUnmount(() => {
      stopAutoRefresh()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    })

    return { menuGroups, settings, authed, authChecking, loginLoading, loginForm, activeId, activeMenuId, mobileMenuOpen, activeRoute, activeGroup, activeComponent, activeProps, navigate, toggleMobileMenu, closeMobileMenu, login, logout, refreshSettings }
  },
  template: `
    <div v-if="authChecking" class="admin-login-page"><div class="admin-login-card"><div class="admin-login-title">正在验证后台登录</div></div></div>
    <div v-else-if="!authed" class="admin-login-page">
      <form class="admin-login-card" @submit.prevent="login">
        <div class="admin-login-logo">AIπ</div>
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
        <a class="admin-brand" href="#/console"><span class="admin-brand-mark">AIπ</span><span>{{ settings.logoText || 'AIπ' }} Admin</span></a>
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
            <a-tag color="blue">数据自动刷新 10s</a-tag>
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
