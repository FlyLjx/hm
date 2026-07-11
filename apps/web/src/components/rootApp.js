import { clientApi } from '../common/api.js?v=20260711-api-key-concurrency-title-v1'
import { localReceipts, receiptKey, saveReceipt } from '../common/announcementReceipts.js'
import { formatCurrency, formatDate } from '../common/format.js?v=20260711-api-key-concurrency-title-v1'
import { renderMarkdown } from '../common/markdown.js'
import { pageFromHash } from '../common/navigation.js?v=20260711-api-key-concurrency-title-v1'
import { notifyError, notifySuccess } from '../common/notify.js'
import { createQRCodeDataUrl } from '../common/qrCode.js'
import { disconnectGenerationTaskSocket } from '../common/taskSocket.js'
import { clearCurrentUser, getCurrentUser, saveCurrentUser } from '../common/user.js'
import { disconnectCurrentUserSocket, subscribeCurrentUser } from '../common/userSocket.js'

const { computed, defineAsyncComponent, markRaw, onBeforeUnmount, onMounted, reactive, ref, watch } = Vue
const WEB_ASSET_VERSION = '20260711-api-key-concurrency-title-v1'

const PageLoading = markRaw({
  template: `
    <section class="hero-card shell-page-state">
      <div class="hero-copy">
        <span class="eyebrow">Loading</span>
        <h2>页面加载中</h2>
        <p>正在按需加载当前页面内容，请稍候。</p>
      </div>
    </section>
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

const HomePage = lazyPage(() => import(`../pages/home.js?v=${WEB_ASSET_VERSION}`), 'HomePage')
const AnnouncementsPage = lazyPage(() => import(`../pages/announcements.js?v=${WEB_ASSET_VERSION}`), 'AnnouncementsPage')
const PlazaPage = lazyPage(() => import(`../pages/plaza.js?v=${WEB_ASSET_VERSION}`), 'PlazaPage')
const ChatPage = lazyPage(() => import(`../pages/chat.js?v=${WEB_ASSET_VERSION}`), 'ChatPage')
const HistoryPage = lazyPage(() => import(`../pages/history.js?v=${WEB_ASSET_VERSION}`), 'HistoryPage')
const ProfilePage = lazyPage(() => import(`../pages/profile.js?v=${WEB_ASSET_VERSION}`), 'ProfilePage')
const InvitePage = lazyPage(() => import(`../pages/invite.js?v=${WEB_ASSET_VERSION}`), 'InvitePage')
const LotteryPage = lazyPage(() => import(`../pages/lottery.js?v=${WEB_ASSET_VERSION}`), 'LotteryPage')
const ApiAccessPage = lazyPage(() => import(`../pages/api-access.js?v=${WEB_ASSET_VERSION}`), 'ApiAccessPage')

function displayBrandName(value, fallback = 'AI-PAI') {
  const text = String(value || fallback).trim() || fallback
  return text
    .replace(/AIπ/g, 'AI-PAI')
    .replace(/\bAI\s+PAI\b/gi, 'AI-PAI')
    .replace(/\bai-pai\b/gi, 'AI-PAI')
}

export const RootApp = {
  components: {
    HomePage,
    AnnouncementsPage,
    PlazaPage,
    ChatPage,
    HistoryPage,
    ProfilePage,
    InvitePage,
    LotteryPage,
    ApiAccessPage,
  },
  setup() {
    const activePage = ref(pageFromHash())
    const brandIconUrl = `/favicon.svg?v=${WEB_ASSET_VERSION}`
    const cachedUser = getCurrentUser()
    const currentUser = ref(cachedUser ? { ...cachedUser } : null)
    const settings = ref(null)
    const siteName = ref('AI-PAI')
    const logoText = ref('AI-PAI')
    const loginOpen = ref(false)
    const authMode = ref('login')
    const subscriptionOpen = ref(false)
    const subscriptionPaymentOpen = ref(false)
    const supportOpen = ref(false)
    const previewImage = ref(null)
    const announcements = ref([])
    const subscriptionPlans = ref([])
    const announcementSigning = ref(false)
    const userRefreshing = ref(false)
    const userSynced = ref(!currentUser.value?.id)
    const accountMenuOpen = ref(false)
    const mobileMenuOpen = ref(false)
    const oauthClient = ref(null)
    const oauthLoading = ref(false)
    const oauthError = ref('')

    const authForm = reactive({ email: '', password: '', newPassword: '', token: '' })
    const rechargeState = reactive({ customAmount: '', order: null, qrImage: '', qrLoading: false, loading: false, syncing: false })
    const subscriptionState = reactive({ plans: [], current: null, selectedPlanId: '', loading: false })
    let rechargePollingTimer = null
    let paidRechargeNoticeOrderId = ''

    const navItems = [
      { id: 'home', label: '首页', icon: 'ti-home' },
      { id: 'announcements', label: '公告列表', icon: 'ti-speakerphone' },
      { id: 'chat', label: '对话生图', icon: 'ti-message-2' },
      { id: 'plaza', label: '提示词广场', icon: 'ti-layout-grid' },
      { id: 'history', label: '作品库', icon: 'ti-photo-heart' },
      { id: 'api-access', label: 'API 管理', icon: 'ti-key' },
      { id: 'lottery', label: '抽订阅', icon: 'ti-gift' },
      { id: 'invite', label: '邀请好友', icon: 'ti-user-plus' },
      { id: 'profile', label: '用户中心', icon: 'ti-user-circle' },
    ]

    const popupAnnouncements = computed(() => announcements.value.filter((item) => (item.displayMode || 'popup') === 'popup'))
    const homeAnnouncements = computed(() => announcements.value.filter((item) => item.displayMode === 'home'))
    const topbarAnnouncements = computed(() => announcements.value.filter((item) => item.displayMode === 'topbar'))
    const activeAnnouncement = computed(() => popupAnnouncements.value[0] || null)
    const activeTopbarAnnouncement = computed(() => topbarAnnouncements.value[0] || null)
    const unreadAnnouncementCount = computed(() => {
      const keys = announcements.value.map((item) => receiptKey(item)).filter(Boolean)
      return keys.length ? new Set(keys).size : announcements.value.length
    })
    const activeNav = computed(() => navItems.find((item) => item.id === activePage.value) || navItems[0])
    const primaryNavItems = computed(() => navItems.filter((item) => ['home', 'announcements', 'chat', 'plaza', 'history', 'api-access', 'lottery', 'invite', 'profile'].includes(item.id)))
    const bottomNavItems = computed(() => navItems.filter((item) => ['home', 'chat', 'history', 'profile'].includes(item.id)))
    const selectedSubscriptionPlan = computed(() => subscriptionState.plans.find((plan) => plan.id === subscriptionState.selectedPlanId) || null)
    const topAccountSubscription = computed(() => currentUser.value?.subscription || null)
    const topAccountIsVip = computed(() => isPaidSubscription(topAccountSubscription.value))
    const topAccountPlanText = computed(() => {
      const subscription = topAccountSubscription.value || {}
      return subscription.planName || subscription.plan?.name || subscription.name || ''
    })
    const topAccountStatusText = computed(() => {
      if (!topAccountIsVip.value) {
        const remaining = effectiveQuotaRemaining(topAccountSubscription.value)
        return `免费版 · 可用 ${remaining} 张`
      }
      return topAccountPlanText.value ? `${topAccountPlanText.value} · 已开通` : '会员已开通'
    })
    const supportItems = computed(() => {
      const config = settings.value || {}
      const supportGroupNumber = String(config.supportGroupNumber || '').trim()
      const supportGroupUrl = String(config.supportGroupUrl || '').trim()
      const supportGroupValue = supportGroupNumber || (supportGroupUrl ? '点击加入群聊' : '')
      return [
        { key: 'wechat', label: '微信客服', value: config.supportWechat, icon: 'ti-brand-wechat', copy: true },
        { key: 'qq', label: 'QQ 客服', value: config.supportQq, icon: 'ti-brand-qq', copy: true },
        { key: 'group', label: '群聊群号', value: supportGroupValue, icon: 'ti-users-group', href: supportGroupUrl, copy: !supportGroupUrl },
        { key: 'email', label: '客服邮箱', value: config.supportEmail, icon: 'ti-mail', href: config.supportEmail ? `mailto:${config.supportEmail}` : '', copy: true },
        { key: 'url', label: '在线客服', value: config.supportUrl, icon: 'ti-headset', href: config.supportUrl },
      ].filter((item) => item.value)
    })
    const supportVisible = computed(() => isFeatureEnabled(settings.value?.supportEnabled))
    const authMeta = computed(() => {
      const metaMap = {
        login: {
          eyebrow: 'Welcome back',
          title: '登录账号',
          subtitle: `登录后继续使用 ${siteName.value} 创作高清图片`,
          icon: 'ti-login-2',
          submit: '立即登录',
        },
        register: {
          eyebrow: 'Create account',
          title: '注册账号',
          subtitle: '创建账号即可保存作品、管理订阅和创作会话',
          icon: 'ti-user-plus',
          submit: '立即注册',
        },
        forgot: {
          eyebrow: 'Account help',
          title: '找回密码',
          subtitle: '输入邮箱后，我们会发送密码重置邮件',
          icon: 'ti-mail-forward',
          submit: '发送邮件',
        },
        reset: {
          eyebrow: 'Reset password',
          title: '重置密码',
          subtitle: '请设置一个新的登录密码',
          icon: 'ti-lock-check',
          submit: '确认重置',
        },
      }
      return metaMap[authMode.value] || metaMap.login
    })
    const shortSiteName = computed(() => {
      const name = displayBrandName(siteName.value)
      return name.split(/[·]/)[0]?.trim() || name
    })
    const oauthParams = computed(() => {
      const params = new URLSearchParams(window.location.search)
      if (params.get('oauth') !== '1') return null
      return {
        client_id: params.get('client_id') || '',
        redirect_uri: params.get('redirect_uri') || '',
        response_type: params.get('response_type') || 'code',
        state: params.get('state') || '',
      }
    })
    const isOAuthPage = computed(() => Boolean(oauthParams.value))

    function isFeatureEnabled(value) {
      return value === true || value === 'true' || value === 1 || value === '1'
    }

    function isPaidSubscription(subscription) {
      return Boolean(subscription?.isPaid || subscription?.tier === 'paid' || (subscription?.status === 'active' && subscription?.planId))
    }

    function positiveNumber(value, fallback = 0) {
      const number = Number(value)
      return Number.isFinite(number) && number > 0 ? number : fallback
    }

    function freeQuotaLimit(scope = 'month') {
      const keyMap = {
        hour: 'freeHourlyGenerationQuota',
        day: 'freeDailyGenerationQuota',
        month: 'freeGenerationQuota',
      }
      const fallbackMap = { hour: 2, day: 5, month: 10 }
      const key = keyMap[scope] || keyMap.month
      const number = Number(settings.value?.[key])
      return Number.isFinite(number) && number >= 0 ? number : (fallbackMap[scope] || fallbackMap.month)
    }

    function freeQuotaWindow(scope, label) {
      const limit = freeQuotaLimit(scope)
      return {
        key: scope,
        label,
        quotaLimit: limit,
        quotaUsed: 0,
        quotaRemaining: limit,
      }
    }

    function fallbackFreeQuotaWindows() {
      return [
        freeQuotaWindow('hour', '小时'),
        freeQuotaWindow('day', '今日'),
        freeQuotaWindow('month', '本月'),
      ]
    }

    function fallbackFreeSubscription() {
      const limit = freeQuotaLimit('month')
      const quotaWindows = fallbackFreeQuotaWindows()
      return {
        status: 'free',
        tier: 'free',
        isPaid: false,
        planName: '免费版',
        quotaImages: limit,
        quotaLimit: limit,
        quotaUsed: 0,
        quotaRemaining: limit,
        effectiveQuotaRemaining: Math.min(...quotaWindows.map((item) => item.quotaRemaining)),
        quotaWindows,
      }
    }

    function inferredPlanQuota(plan) {
      const explicit = positiveNumber(plan?.quotaImages, 0)
      if (explicit > 0) return explicit
      const days = Number(plan?.durationDays || 0)
      if (days <= 1) return 20
      if (days <= 31) return 300
      if (days <= 92) return 1000
      return 100
    }

    function planForSubscription(subscription) {
      const id = subscription?.planId || subscription?.plan?.id || ''
      return subscriptionState.plans.find((plan) => plan.id === id) || null
    }

    function quotaLimit(subscription) {
      if (!subscription) return freeQuotaLimit('month')
      if (isPaidSubscription(subscription)) {
        const explicit = positiveNumber(subscription.quotaLimit || subscription.quotaImages, 0)
        return explicit || inferredPlanQuota(planForSubscription(subscription))
      }
      return positiveNumber(subscription.quotaLimit || subscription.quotaImages, freeQuotaLimit('month'))
    }

    function quotaRemaining(subscription) {
      if (!subscription) return freeQuotaLimit('month')
      const fallback = quotaLimit(subscription)
      const value = Number(subscription.quotaRemaining)
      return Number.isFinite(value) && value >= 0 ? value : fallback
    }

    function freeQuotaWindows(subscription) {
      const windows = Array.isArray(subscription?.quotaWindows) ? subscription.quotaWindows : []
      if (windows.length) return windows
      return fallbackFreeQuotaWindows()
    }

    function effectiveQuotaRemaining(subscription) {
      const explicit = Number(subscription?.effectiveQuotaRemaining)
      if (Number.isFinite(explicit) && explicit >= 0) return explicit
      if (subscription && !isPaidSubscription(subscription)) {
        const values = freeQuotaWindows(subscription).map((item) => Number(item.quotaRemaining)).filter((value) => Number.isFinite(value) && value >= 0)
        if (values.length) return Math.min(...values)
      }
      return quotaRemaining(subscription)
    }

    function subscriptionQuotaText(subscription) {
      return `${quotaRemaining(subscription)} / ${quotaLimit(subscription)} 张`
    }

    function freeQuotaSummary(subscription) {
      return freeQuotaWindows(subscription).map((item) => {
        const label = item.label || ({ hour: '小时', day: '今日', month: '本月' }[item.key] || '周期')
        const remaining = Number.isFinite(Number(item.quotaRemaining)) ? Number(item.quotaRemaining) : Number(item.quotaLimit || 0)
        const limit = Number.isFinite(Number(item.quotaLimit)) ? Number(item.quotaLimit) : 0
        return `${label} ${remaining}/${limit} 张`
      }).join(' · ')
    }

    function planQuotaText(plan) {
      return `${inferredPlanQuota(plan)} 张/周期`
    }

    function planDescription(plan) {
      const text = String(plan?.description || '').trim()
      if (!text || /无限|不限/.test(text)) {
        const days = Number(plan?.durationDays || 0)
        return `${days || ''}天内可生成 ${inferredPlanQuota(plan)} 张图片`.trim()
      }
      return text
    }

    function setPage(page) {
      activePage.value = page
      window.location.hash = `/${page}`
      mobileMenuOpen.value = false
    }

    function requireLogin(callback) {
      if (!currentUser.value) {
        loginOpen.value = true
        return false
      }
      callback?.()
      return true
    }

    function logout() {
      clearCurrentUser()
      currentUser.value = null
      userSynced.value = true
      accountMenuOpen.value = false
      mobileMenuOpen.value = false
      disconnectGenerationTaskSocket()
      disconnectCurrentUserSocket()
      notifySuccess('已退出登录')
    }

    function expireUserSession() {
      clearCurrentUser()
      currentUser.value = null
      userSynced.value = true
      accountMenuOpen.value = false
      mobileMenuOpen.value = false
      disconnectGenerationTaskSocket()
      disconnectCurrentUserSocket()
      loginOpen.value = true
      notifyError(new Error('登录已失效，请重新登录'))
    }

    function closeNavMenus() {
      accountMenuOpen.value = false
      mobileMenuOpen.value = false
    }

    function runNavAction(action) {
      closeNavMenus()
      action?.()
    }

    function closeFloatingMenusOnOutsideClick(event) {
      const target = event.target
      if (!target?.closest?.('.account-menu-wrap')) accountMenuOpen.value = false
    }

    async function refreshUser() {
      if (!currentUser.value?.id) return
      userRefreshing.value = true
      try {
        const response = await clientApi.getCurrentUser(currentUser.value.id)
        updateCurrentUser(response.data)
      } catch {
        logout()
      } finally {
        userSynced.value = true
        userRefreshing.value = false
      }
    }

    async function manualRefreshUser() {
      if (!currentUser.value?.id || userRefreshing.value) return
      await refreshUser()
      notifySuccess('账号状态已刷新')
    }

    function refreshUserQuietly() {
      if (!currentUser.value?.id || userRefreshing.value) return
      refreshUser().catch(() => {})
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') refreshUserQuietly()
    }

    function handleHashChange() {
      activePage.value = pageFromHash()
      closeNavMenus()
    }

    function updateCurrentUser(user) {
      currentUser.value = saveCurrentUser(user)
      userSynced.value = true
    }

    async function loadOAuthClient() {
      if (!oauthParams.value) return
      oauthError.value = ''
      try {
        const response = await clientApi.getOAuthClient(oauthParams.value)
        oauthClient.value = response.data
      } catch (error) {
        oauthError.value = error.message || 'OAuth 应用信息加载失败'
      }
    }

    async function approveOAuth() {
      if (!oauthParams.value) return
      if (!currentUser.value?.token) {
        loginOpen.value = true
        return
      }
      try {
        oauthLoading.value = true
        const response = await clientApi.authorizeOAuth({
          ...oauthParams.value,
          userToken: currentUser.value.token,
        })
        window.location.href = response.data.redirectUrl
      } catch (error) {
        oauthError.value = error.message || '授权失败'
      } finally {
        oauthLoading.value = false
      }
    }

    function leaveOAuthPage() {
      window.location.href = `${window.location.origin}/`
    }

    function closePaidRecharge(order) {
      const paidOrder = order || rechargeState.order
      const orderId = paidOrder?.id || ''
      const shouldNotify = orderId ? paidRechargeNoticeOrderId !== orderId : subscriptionOpen.value
      rechargeState.order = paidOrder
      stopRechargePolling()
      subscriptionPaymentOpen.value = false
      rechargeState.qrImage = ''
      if (shouldNotify) {
        paidRechargeNoticeOrderId = orderId || 'unknown'
        notifySuccess('订阅已开通')
      }
    }

    function handleUserSocketUpdate(user) {
      if (!currentUser.value?.id || user?.id !== currentUser.value.id) return
      updateCurrentUser(user)
      if ((subscriptionOpen.value || subscriptionPaymentOpen.value) && rechargeState.order?.status === 'pending') {
        syncRechargeOrder(false)
      }
    }

    async function renderRechargeQrCode(order) {
      rechargeState.qrImage = ''
      const code = order?.payUrl || order?.qrCode || ''
      if (!code) return
      try {
        rechargeState.qrLoading = true
        rechargeState.qrImage = await createQRCodeDataUrl(code)
      } catch (error) {
        notifyError(error, '二维码生成失败')
      } finally {
        rechargeState.qrLoading = false
      }
    }

    function rechargeStatusText(status) {
      const statusMap = {
        pending: '待支付',
        paid: '已支付',
        closed: '已关闭',
        failed: '支付失败',
      }
      return statusMap[status] || status || '-'
    }

    function stopRechargePolling() {
      if (rechargePollingTimer) {
        clearInterval(rechargePollingTimer)
        rechargePollingTimer = null
      }
    }

    function startRechargePolling() {
      stopRechargePolling()
      rechargePollingTimer = setInterval(() => {
        if ((!subscriptionOpen.value && !subscriptionPaymentOpen.value) || rechargeState.order?.status !== 'pending') {
          stopRechargePolling()
          return
        }
        syncRechargeOrder(false)
      }, 3000)
    }

    function applyBootstrapData(data = {}) {
      settings.value = data.settings || settings.value
      siteName.value = displayBrandName(settings.value?.siteName || siteName.value)
      logoText.value = displayBrandName(settings.value?.logoText || logoText.value || siteName.value)
      announcements.value = (data.announcements || [])
        .filter((item) => item.status === 'active')
        .filter((item) => !localReceipts().has(receiptKey(item)))
      subscriptionPlans.value = data.subscriptionPlans || []
      document.title = `${displayBrandName(siteName.value)} 生图工作台`
    }

    async function loadBaseData() {
      try {
        const response = await clientApi.getHomeBootstrap(currentUser.value?.id)
        applyBootstrapData(response.data || {})
      } catch {}

      if (!settings.value) {
        try {
          const response = await clientApi.getSettings()
          settings.value = response.data
          siteName.value = displayBrandName(response.data.siteName)
          logoText.value = displayBrandName(response.data.logoText || siteName.value)
          document.title = `${displayBrandName(siteName.value)} 生图工作台`
        } catch {}
      }
    }

    async function loadAnnouncements() {
      try {
        const response = await clientApi.listAnnouncements(currentUser.value?.id)
        const receipts = localReceipts()
        announcements.value = (response.data || [])
          .filter((item) => item.status === 'active')
          .filter((item) => !receipts.has(receiptKey(item)))
      } catch {
        announcements.value = []
      }
    }

    async function signAnnouncement() {
      const item = activeAnnouncement.value
      await closeAnnouncement(item)
    }

    async function closeAnnouncement(item) {
      if (!item) return
      try {
        announcementSigning.value = true
        if (currentUser.value && (item.displayMode || 'popup') === 'popup') {
          await clientApi.signAnnouncement(item.id, currentUser.value.id)
        }
        saveReceipt(item)
        announcements.value = announcements.value.filter((announcement) => announcement.id !== item.id)
      } catch (error) {
        notifyError(error, '公告签收失败')
      } finally {
        announcementSigning.value = false
      }
    }

    function announcementHtml(item) {
      return renderMarkdown(item?.content || '')
    }

    function showVerificationRequired(data = {}) {
      const message = data.message || '注册成功，请前往邮箱完成验证后再登录。'
      antd.Modal.info({
        title: '需要邮箱验证',
        okText: '知道了',
        content: message,
      })
    }

    function getInviteIdFromUrl() {
      const inviteValue = new URLSearchParams(location.search).get('invite')?.trim() || ''
      const inviteCode = inviteValue.toUpperCase()
      if (/^[A-HJ-NP-Z2-9]{6,16}$/.test(inviteCode)) {
        return inviteCode
      }
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(inviteValue)
        ? inviteValue
        : null
    }

    async function submitAuth() {
      try {
        if ((authMode.value === 'register' || authMode.value === 'reset') && authForm.password.length < 6) {
          ElementPlus.ElMessage.warning('密码至少需要 6 个字符')
          return
        }
        if (authMode.value === 'forgot') {
          await clientApi.forgotPassword(authForm.email)
          notifySuccess('如果邮箱存在，重置邮件已发送')
          authMode.value = 'login'
          return
        }
        if (authMode.value === 'reset') {
          if (authForm.password !== authForm.newPassword) {
            ElementPlus.ElMessage.warning('两次输入的新密码不一致')
            return
          }
          await clientApi.resetPassword({ token: authForm.token, password: authForm.password })
          notifySuccess('密码已重置，请登录')
          authMode.value = 'login'
          return
        }
        const action = authMode.value === 'register'
          ? clientApi.register({ email: authForm.email, password: authForm.password, inviterId: getInviteIdFromUrl() })
          : clientApi.login({ email: authForm.email, password: authForm.password })
        const response = await action
        if (authMode.value === 'register' && response.data?.verificationRequired) {
          showVerificationRequired(response.data)
          authMode.value = 'login'
          authForm.password = ''
          return
        }
        updateCurrentUser(response.data)
        loginOpen.value = false
        notifySuccess(authMode.value === 'register' ? '注册成功' : '登录成功')
        await loadBaseData()
        if (isOAuthPage.value) {
          await approveOAuth()
        }
      } catch (error) {
        notifyError(error, '登录失败')
      }
    }

    async function openRecharge() {
      await openSubscription()
    }

    async function loadSubscriptionData() {
      if (!currentUser.value?.id) return
      try {
        subscriptionState.loading = true
        const [plansResponse, currentResponse] = await Promise.all([
          clientApi.listSubscriptionPlans(),
          clientApi.getCurrentSubscription(currentUser.value.id).catch(() => ({ data: null })),
        ])
        subscriptionState.plans = plansResponse.data || []
        subscriptionState.current = currentResponse.data || fallbackFreeSubscription()
        subscriptionState.selectedPlanId = subscriptionState.plans[0]?.id || ''
      } catch (error) {
        notifyError(error, '加载订阅套餐失败')
      } finally {
        subscriptionState.loading = false
      }
    }

    async function openSubscription() {
      if (!requireLogin()) return
      subscriptionOpen.value = true
      subscriptionPaymentOpen.value = false
      rechargeState.order = null
      rechargeState.qrImage = ''
      stopRechargePolling()
      paidRechargeNoticeOrderId = ''
      await loadSubscriptionData()
    }

    async function createRechargeOrder() {
      if (!currentUser.value) return
      if (!subscriptionState.selectedPlanId) {
        ElementPlus.ElMessage.warning('请选择订阅套餐')
        return
      }
      try {
        rechargeState.loading = true
        const payload = {
          userId: currentUser.value.id,
          subscriptionPlanId: subscriptionState.selectedPlanId,
        }
        const response = await clientApi.createRechargeOrder(payload)
        rechargeState.order = response.data
        paidRechargeNoticeOrderId = ''
        await renderRechargeQrCode(response.data)
        if (response.data?.status === 'pending') {
          subscriptionPaymentOpen.value = true
        }
        if (response.data?.status === 'pending') startRechargePolling()
      } catch (error) {
        notifyError(error, '创建订单失败')
      } finally {
        rechargeState.loading = false
      }
    }

    async function syncRechargeOrder(showMessage = true) {
      if (!currentUser.value || !rechargeState.order) return
      if (rechargeState.syncing) return
      try {
        rechargeState.syncing = true
        const response = await clientApi.syncRechargeOrder(rechargeState.order.id, currentUser.value.id)
        rechargeState.order = response.data
        await renderRechargeQrCode(response.data)
        if (response.data.status === 'paid') {
          await refreshUser()
          if (response.data.orderType === 'subscription') {
            const currentResponse = await clientApi.getCurrentSubscription(currentUser.value.id).catch(() => ({ data: null }))
            subscriptionState.current = currentResponse.data || fallbackFreeSubscription()
          }
          closePaidRecharge(response.data)
          subscriptionOpen.value = false
          subscriptionPaymentOpen.value = false
        } else {
          if (showMessage) notifySuccess('订单状态已刷新')
        }
      } catch (error) {
        if (showMessage) notifyError(error, '同步订单失败')
      } finally {
        rechargeState.syncing = false
      }
    }

    function openInvite() {
      if (!requireLogin()) return
      setPage('invite')
    }

    function openSupport() {
      closeNavMenus()
      supportOpen.value = true
    }

    async function copySupportValue(value) {
      if (!value) return
      await navigator.clipboard.writeText(value)
      notifySuccess('已复制联系方式')
    }

    onMounted(() => {
      window.addEventListener('hashchange', handleHashChange)
      window.addEventListener('focus', refreshUserQuietly)
      document.addEventListener('pointerdown', closeFloatingMenusOnOutsideClick)
      document.addEventListener('visibilitychange', handleVisibilityChange)
      loadOAuthClient()
      const params = new URLSearchParams(location.search)
      const resetToken = params.get('resetPasswordToken')
      if (resetToken) {
        authMode.value = 'reset'
        authForm.token = resetToken
        loginOpen.value = true
      }
      const verifyToken = params.get('verifyEmailToken')
      if (verifyToken) {
        clientApi.verifyEmail(verifyToken).then(() => {
          const url = new URL(window.location.href)
          url.searchParams.delete('verifyEmailToken')
          window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
          notifySuccess('邮箱验证成功，请登录')
          authMode.value = 'login'
          loginOpen.value = true
        }).catch((error) => notifyError(error, '邮箱验证失败'))
      }
      loadBaseData()
      if (currentUser.value?.id) refreshUser()
    })

    watch(() => activePage.value, (page) => {
      document.body.classList.toggle('chat-page-active', page === 'chat')
      document.body.classList.toggle('home-page-active', page === 'home')
    }, { immediate: true })
    watch(() => currentUser.value?.id || '', (userId, previousUserId) => {
      if (userId === previousUserId) return
      if (!userId) {
        announcements.value = []
        void loadBaseData()
        return
      }
      void loadBaseData()
    })
    watch(subscriptionOpen, (open) => {
      if (!open && !subscriptionPaymentOpen.value) stopRechargePolling()
    })
    watch(subscriptionPaymentOpen, (open) => {
      if (!open && !subscriptionOpen.value) stopRechargePolling()
    })
    watch(() => currentUser.value?.id || '', (userId) => {
      if (userId) subscribeCurrentUser(userId, handleUserSocketUpdate)
      else disconnectCurrentUserSocket()
    }, { immediate: true })
    onBeforeUnmount(() => {
      window.removeEventListener('hashchange', handleHashChange)
      window.removeEventListener('focus', refreshUserQuietly)
      document.removeEventListener('pointerdown', closeFloatingMenusOnOutsideClick)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      stopRechargePolling()
      disconnectCurrentUserSocket()
      document.body.classList.remove('chat-page-active')
    })

    return {
      activePage,
      brandIconUrl,
      currentUser,
      settings,
      siteName,
      logoText,
      loginOpen,
      authMode,
      authForm,
      subscriptionOpen,
      subscriptionPaymentOpen,
      rechargeState,
      subscriptionState,
      selectedSubscriptionPlan,
      supportOpen,
      supportItems,
      supportVisible,
      previewImage,
      activeAnnouncement,
      activeTopbarAnnouncement,
      unreadAnnouncementCount,
      activeNav,
      authMeta,
      shortSiteName,
      topAccountIsVip,
      topAccountStatusText,
      isPaidSubscription,
      subscriptionQuotaText,
      freeQuotaSummary,
      effectiveQuotaRemaining,
      planQuotaText,
      planDescription,
      oauthClient,
      oauthLoading,
      oauthError,
      isOAuthPage,
      announcementSigning,
      userRefreshing,
      userSynced,
      accountMenuOpen,
      mobileMenuOpen,
      subscriptionPlans,
      navItems,
      primaryNavItems,
      bottomNavItems,
      setPage,
      requireLogin,
      logout,
      expireUserSession,
      closeNavMenus,
      runNavAction,
      openRecharge,
      openSubscription,
      openSupport,
      createRechargeOrder,
      syncRechargeOrder,
      openInvite,
      copySupportValue,
      rechargeStatusText,
      submitAuth,
      signAnnouncement,
      closeAnnouncement,
      announcementHtml,
      updateCurrentUser,
      approveOAuth,
      leaveOAuthPage,
      manualRefreshUser,
      formatCurrency,
      formatDate,
    }
  },
  template: `
    <main class="app-shell">
      <section class="web-main">
        <div v-if="activeTopbarAnnouncement" class="web-announcement-topbar">
          <i class="ti ti-speakerphone"></i>
          <strong>{{ activeTopbarAnnouncement.title }}</strong>
          <span>{{ activeTopbarAnnouncement.content }}</span>
          <button type="button" @click="closeAnnouncement(activeTopbarAnnouncement)">
            <i class="ti ti-x"></i>
          </button>
        </div>
        <header class="web-topbar">
          <div class="web-nav-left">
            <button class="web-mobile-brand plain-btn" type="button" @click="setPage('home')">
              <img :src="brandIconUrl" alt="" />
              <span>
                <strong>AI PAI</strong>
                <small>创作工作台</small>
              </span>
            </button>
            <nav class="web-primary-nav" aria-label="用户端导航">
              <button v-for="item in primaryNavItems" :key="item.id" :class="{ active: activePage === item.id }" type="button" @click="setPage(item.id)">
                <i :class="['ti', item.icon]"></i>
                <span class="web-nav-label">{{ item.label }}</span>
                <span v-if="item.id === 'announcements' && unreadAnnouncementCount > 0" class="web-nav-badge" :title="unreadAnnouncementCount + ' 条未读公告'">
                  {{ unreadAnnouncementCount > 9 ? '9+' : unreadAnnouncementCount }}
                </span>
              </button>
            </nav>
          </div>
          <div class="web-top-actions">
            <el-button v-if="supportVisible" class="support-top-action" @click="openSupport">
              <i class="ti ti-headset"></i>
              <span>客服</span>
            </el-button>
            <template v-if="currentUser">
              <el-button class="user-action primary-action nav-recharge-action" type="primary" @click="openSubscription">
                <i class="ti ti-crown"></i>
                <span>订阅</span>
              </el-button>
              <div class="account-menu-wrap">
                <button :class="['account-trigger', { active: accountMenuOpen, vip: topAccountIsVip }]" type="button" @click="accountMenuOpen = !accountMenuOpen; mobileMenuOpen = false">
                  <span class="account-avatar">{{ currentUser.email?.slice(0, 1)?.toUpperCase() || 'U' }}</span>
                  <span class="account-trigger-copy">
                    <strong>{{ currentUser.email }}</strong>
                    <small :class="['account-member-line', { vip: topAccountIsVip }]">
                      <i v-if="topAccountIsVip" class="ti ti-crown"></i>
                      <span>{{ topAccountStatusText }}</span>
                    </small>
                  </span>
                  <i class="ti ti-chevron-down"></i>
                </button>
                <div v-if="accountMenuOpen" class="account-menu">
                  <div class="account-menu-head">
                    <span class="account-avatar large">{{ currentUser.email?.slice(0, 1)?.toUpperCase() || 'U' }}</span>
                    <div>
                      <strong>{{ currentUser.email }}</strong>
                      <small :class="['account-menu-member', { vip: topAccountIsVip }]">
                        <i v-if="topAccountIsVip" class="ti ti-crown"></i>
                        <span>{{ topAccountStatusText }}</span>
                      </small>
                    </div>
                  </div>
                  <button type="button" @click="runNavAction(openSubscription)">
                    <i class="ti ti-crown"></i>
                    <span>订阅会员</span>
                    <em>权益</em>
                  </button>
                  <button type="button" @click="runNavAction(() => setPage('profile'))">
                    <i class="ti ti-user-circle"></i>
                    <span>用户中心</span>
                  </button>
                  <button type="button" @click="runNavAction(() => setPage('history'))">
                    <i class="ti ti-photo-heart"></i>
                    <span>作品库</span>
                  </button>
                  <button type="button" @click="runNavAction(() => setPage('api-access'))">
                    <i class="ti ti-key"></i>
                    <span>API 管理</span>
                  </button>
                  <button type="button" @click="runNavAction(() => setPage('lottery'))">
                    <i class="ti ti-gift"></i>
                    <span>抽订阅</span>
                  </button>
                  <button type="button" @click="runNavAction(openInvite)">
                    <i class="ti ti-user-plus"></i>
                    <span>邀请好友</span>
                  </button>
                  <button v-if="supportVisible" type="button" @click="runNavAction(openSupport)">
                    <i class="ti ti-headset"></i>
                    <span>联系客服</span>
                  </button>
                  <button class="danger" type="button" @click="logout">
                    <i class="ti ti-logout"></i>
                    <span>退出登录</span>
                  </button>
                </div>
              </div>
              <button :class="['mobile-menu-trigger', { active: mobileMenuOpen }]" type="button" @click="mobileMenuOpen = !mobileMenuOpen; accountMenuOpen = false">
                <i class="ti ti-menu-2"></i>
              </button>
            </template>
            <el-button v-else type="primary" class="login-button" aria-label="登录 / 注册" @click="loginOpen = true"></el-button>
          </div>
          <div v-if="mobileMenuOpen && currentUser" class="mobile-account-panel">
            <div class="mobile-account-summary">
              <span class="account-avatar large">{{ currentUser.email?.slice(0, 1)?.toUpperCase() || 'U' }}</span>
              <div>
                <strong>{{ currentUser.email }}</strong>
                <small :class="['account-menu-member', { vip: topAccountIsVip }]">
                  <i v-if="topAccountIsVip" class="ti ti-crown"></i>
                  <span>{{ topAccountStatusText }}</span>
                </small>
              </div>
            </div>
            <div class="mobile-account-actions">
              <button type="button" @click="runNavAction(openSubscription)"><i class="ti ti-crown"></i><span>订阅会员</span></button>
              <button type="button" @click="runNavAction(() => setPage('profile'))"><i class="ti ti-user-circle"></i><span>用户中心</span></button>
              <button type="button" @click="runNavAction(() => setPage('history'))"><i class="ti ti-photo-heart"></i><span>作品库</span></button>
              <button type="button" @click="runNavAction(() => setPage('api-access'))"><i class="ti ti-key"></i><span>API</span></button>
              <button type="button" @click="runNavAction(() => setPage('lottery'))"><i class="ti ti-gift"></i><span>抽订阅</span></button>
              <button type="button" @click="runNavAction(openInvite)"><i class="ti ti-user-plus"></i><span>邀请</span></button>
              <button v-if="supportVisible" type="button" @click="runNavAction(openSupport)"><i class="ti ti-headset"></i><span>客服</span></button>
              <button type="button" @click="logout"><i class="ti ti-logout"></i><span>退出</span></button>
            </div>
          </div>
        </header>

        <main v-if="isOAuthPage" class="web-content oauth-content">
          <section class="oauth-panel">
            <div class="oauth-mark"><i class="ti ti-plug-connected"></i></div>
            <span class="eyebrow">OAuth 授权</span>
            <h2>{{ oauthClient?.name || '第三方应用' }} 请求连接 {{ shortSiteName }}</h2>
            <p>授权后，画布应用可以读取你的账号信息，并同步创作能力。</p>
            <div v-if="oauthError" class="oauth-error">{{ oauthError }}</div>
            <div v-if="currentUser" class="oauth-user-card">
              <span class="account-avatar large">{{ currentUser.email?.slice(0, 1)?.toUpperCase() || 'U' }}</span>
              <div>
                <strong>{{ currentUser.email }}</strong>
                <small>{{ topAccountStatusText }}</small>
              </div>
            </div>
            <div class="oauth-actions">
              <el-button v-if="!currentUser" type="primary" @click="loginOpen = true">登录后授权</el-button>
              <el-button v-else type="primary" :loading="oauthLoading" @click="approveOAuth">确认授权</el-button>
              <el-button @click="leaveOAuthPage">返回首页</el-button>
            </div>
          </section>
        </main>
        <main v-else :class="['web-content', { 'chat-content': activePage === 'chat' }]">
          <home-page v-if="activePage === 'home'" :announcements="homeAnnouncements" :current-user="currentUser" :settings="settings" :site-name="siteName" :subscription-plans="subscriptionPlans" @announcement-close="closeAnnouncement" @go="setPage" @invite="openInvite" @login="loginOpen = true" @recharge="openRecharge" @subscribe="openSubscription" />
          <announcements-page v-if="activePage === 'announcements'" :current-user="currentUser" />
          <chat-page v-if="activePage === 'chat'" :current-user="currentUser" :settings="settings" :site-name="siteName" @login="loginOpen = true" @preview="previewImage = $event" @user-updated="updateCurrentUser" />
          <plaza-page v-if="activePage === 'plaza'" @go="setPage" @preview="previewImage = $event" />
          <history-page v-if="activePage === 'history'" :current-user="currentUser" @go="setPage" @login="loginOpen = true" @preview="previewImage = $event" />
          <api-access-page v-if="activePage === 'api-access'" :current-user="currentUser" @go="setPage" @login="loginOpen = true" @auth-expired="expireUserSession" />
          <lottery-page v-if="activePage === 'lottery'" :current-user="currentUser" @go="setPage" @login="loginOpen = true" @user-updated="updateCurrentUser" />
          <invite-page v-if="activePage === 'invite'" :current-user="currentUser" :site-name="siteName" @go="setPage" @login="loginOpen = true" />
          <profile-page v-if="activePage === 'profile'" :current-user="currentUser" @go="setPage" @login="loginOpen = true" @subscribe="openSubscription" @user-updated="updateCurrentUser" />
        </main>
        <nav v-if="!isOAuthPage" class="web-bottom-nav" aria-label="移动端主导航">
          <button v-for="item in bottomNavItems" :key="item.id" :class="{ active: activePage === item.id }" type="button" @click="setPage(item.id)">
            <i :class="['ti', item.icon]"></i>
            <span>{{ item.label.replace('提示词', '') }}</span>
          </button>
        </nav>
      </section>

      <button v-if="supportVisible" :class="['support-float', { 'chat-support-float': activePage === 'chat' }]" type="button" @click="openSupport">
        <i class="ti ti-headset"></i>
        <span>联系客服</span>
      </button>

      <el-dialog v-model="loginOpen" width="760px" class="auth-dialog" custom-class="auth-dialog-panel">
        <div class="auth-shell">
          <aside class="auth-brand-panel">
            <div class="auth-brand-row">
              <div class="auth-mark"><i :class="['ti', authMeta.icon]"></i></div>
              <div>
                <span>{{ shortSiteName }}</span>
                <strong>创作中心</strong>
              </div>
            </div>
            <div class="auth-brand-copy">
              <span class="auth-eyebrow">{{ authMeta.eyebrow }}</span>
              <h2>{{ authMeta.title }}</h2>
              <p>{{ authMeta.subtitle }}</p>
            </div>
            <div class="auth-benefits">
              <span><i class="ti ti-cloud-check"></i> 保存创作记录</span>
              <span><i class="ti ti-crown"></i> 管理订阅权益</span>
              <span><i class="ti ti-sparkles"></i> 解锁高清生成</span>
            </div>
          </aside>

          <section class="auth-main-panel">
            <div v-if="authMode === 'login' || authMode === 'register'" class="auth-mode-tabs">
              <button :class="{ active: authMode === 'login' }" type="button" @click="authMode = 'login'">登录</button>
              <button :class="{ active: authMode === 'register' }" type="button" @click="authMode = 'register'">注册</button>
            </div>
            <button v-else class="auth-back" type="button" @click="authMode = 'login'">
              <i class="ti ti-arrow-left"></i>
              返回登录
            </button>

            <div class="auth-form-title">
              <strong>{{ authMeta.submit }}</strong>
              <span v-if="authMode === 'forgot'">重置邮件会发送到你的注册邮箱</span>
              <span v-else-if="authMode === 'reset'">设置完成后即可使用新密码登录</span>
              <span v-else>{{ authMode === 'login' ? '欢迎回来，继续你的创作' : '创建账号，开始保存作品' }}</span>
            </div>

            <el-form class="auth-form" label-position="top" @submit.prevent>
              <div class="auth-field-stack">
                <el-form-item v-if="authMode !== 'reset'" label="邮箱">
                  <el-input v-model="authForm.email" placeholder="请输入邮箱地址">
                    <template #prefix><i class="ti ti-mail"></i></template>
                  </el-input>
                </el-form-item>
                <el-form-item v-if="authMode !== 'forgot'" :label="authMode === 'reset' ? '新密码' : '密码'">
                  <el-input v-model="authForm.password" type="password" show-password placeholder="请输入密码">
                    <template #prefix><i class="ti ti-lock"></i></template>
                  </el-input>
                </el-form-item>
                <el-form-item v-if="authMode === 'reset'" label="确认新密码">
                  <el-input v-model="authForm.newPassword" type="password" show-password placeholder="请再次输入新密码">
                    <template #prefix><i class="ti ti-shield-check"></i></template>
                  </el-input>
                </el-form-item>
              </div>
            </el-form>

            <el-button class="auth-submit" type="primary" @click="submitAuth">{{ authMeta.submit }}</el-button>

            <div class="auth-links">
              <el-button v-if="authMode === 'login'" link @click="authMode = 'register'">没有账号，去注册</el-button>
              <span v-if="authMode === 'login'" class="auth-link-dot"></span>
              <el-button v-if="authMode === 'login'" link @click="authMode = 'forgot'">忘记密码</el-button>
              <el-button v-else-if="authMode === 'register'" link @click="authMode = 'login'">已有账号，去登录</el-button>
              <el-button v-else link @click="authMode = 'login'">返回账号登录</el-button>
            </div>
          </section>
        </div>
      </el-dialog>

      <el-dialog v-model="subscriptionOpen" width="900px" class="subscription-dialog" custom-class="subscription-dialog-panel">
        <template #header>
          <div class="subscription-head">
            <div>
              <span>Membership</span>
              <strong>会员订阅</strong>
              <p>开通后即可使用订阅范围内的模型权益。</p>
            </div>
            <i class="ti ti-crown"></i>
          </div>
        </template>
        <div v-loading="subscriptionState.loading" class="subscription-body">
          <div class="subscription-status">
            <div>
              <span>当前权益</span>
              <strong>{{ subscriptionState.current?.planName || '免费版' }}</strong>
              <p v-if="isPaidSubscription(subscriptionState.current)">有效期至 {{ formatDate(subscriptionState.current.expiresAt) }} · 剩余额度 {{ subscriptionQuotaText(subscriptionState.current) }}</p>
              <p v-else>免费版当前可用 {{ effectiveQuotaRemaining(subscriptionState.current) }} 张 · {{ freeQuotaSummary(subscriptionState.current) }}</p>
            </div>
            <i :class="['ti', isPaidSubscription(subscriptionState.current) ? 'ti-shield-check' : 'ti-shield-plus']"></i>
          </div>
          <div class="subscription-plans">
            <button v-for="plan in subscriptionState.plans" :key="plan.id" :class="{ active: subscriptionState.selectedPlanId === plan.id }" class="subscription-plan" type="button" @click="subscriptionState.selectedPlanId = plan.id">
              <span v-if="plan.badge" class="subscription-badge">{{ plan.badge }}</span>
              <strong>{{ plan.name }}</strong>
              <p>{{ planDescription(plan) }}</p>
              <div class="subscription-price">¥{{ formatCurrency(plan.amount) }}</div>
              <div class="subscription-benefits">
                <span><i class="ti ti-calendar"></i>{{ plan.durationDays }} 天有效期</span>
                <span><i class="ti ti-photo-spark"></i>{{ planQuotaText(plan) }}</span>
                <span v-if="plan.discountPercent"><i class="ti ti-discount"></i>模型 {{ plan.discountPercent }}% 折扣</span>
              </div>
            </button>
          </div>
        </div>
        <template #footer>
          <el-button @click="subscriptionOpen = false">取消</el-button>
          <el-button v-if="rechargeState.order?.orderType === 'subscription'" @click="subscriptionPaymentOpen = true">
            查看支付二维码
          </el-button>
          <el-button type="primary" :loading="rechargeState.loading" :disabled="!selectedSubscriptionPlan" @click="createRechargeOrder">
            {{ rechargeState.order ? '重新创建订单' : '开通订阅' }}
          </el-button>
        </template>
      </el-dialog>

      <el-dialog v-model="subscriptionPaymentOpen" width="430px" class="subscription-payment-dialog" custom-class="subscription-payment-panel" append-to-body :close-on-click-modal="false">
        <template #header>
          <div class="subscription-payment-head">
            <span><i class="ti ti-brand-alipay"></i> 支付宝扫码支付</span>
            <strong>{{ rechargeState.order?.orderType === 'subscription' ? '订阅订单' : '支付订单' }}</strong>
            <p v-if="rechargeState.order">支付 ¥{{ formatCurrency(rechargeState.order.amount) }}，完成后自动开通会员权益。</p>
          </div>
        </template>
        <div class="subscription-payment-body">
          <div class="subscription-payment-status">
            <span>订单状态</span>
            <strong>{{ rechargeStatusText(rechargeState.order?.status) }}</strong>
          </div>
          <div class="subscription-payment-qr">
            <div v-if="rechargeState.qrLoading" class="recharge-qr-loading"><i class="ti ti-loader-2"></i></div>
            <img v-else-if="rechargeState.qrImage" :src="rechargeState.qrImage" alt="支付宝支付二维码" />
            <div v-else class="subscription-payment-empty">
              <i class="ti ti-qrcode-off"></i>
              <span>二维码生成中</span>
            </div>
          </div>
          <p class="subscription-payment-tip">
            <i class="ti ti-shield-check"></i>
            仅开放支付宝支付，支付成功后请点击刷新状态。
          </p>
        </div>
        <template #footer>
          <el-button @click="subscriptionPaymentOpen = false">稍后支付</el-button>
          <el-button type="primary" :loading="rechargeState.syncing" @click="syncRechargeOrder(true)">
            已支付，刷新状态
          </el-button>
        </template>
      </el-dialog>

      <el-dialog v-model="supportOpen" width="430px" class="support-dialog" custom-class="support-dialog-panel">
        <template #header>
          <div class="support-head">
            <div>
              <span>Support</span>
              <strong>{{ settings?.supportTitle || '联系客服' }}</strong>
              <p>{{ settings?.supportDescription || '遇到问题可以联系管理员处理。' }}</p>
            </div>
            <i class="ti ti-headset"></i>
          </div>
        </template>
        <div class="support-body">
          <img v-if="settings?.supportQrCodeUrl" class="support-qrcode" :src="settings.supportQrCodeUrl" alt="客服二维码" />
          <div v-if="supportItems.length" class="support-list">
            <div v-for="item in supportItems" :key="item.key" class="support-item">
              <i :class="['ti', item.icon]"></i>
              <div>
                <span>{{ item.label }}</span>
                <strong>{{ item.value }}</strong>
              </div>
              <a v-if="item.href" class="support-action" :href="item.href" target="_blank" rel="noreferrer">打开</a>
              <button v-else-if="item.copy" class="support-action" type="button" @click="copySupportValue(item.value)">复制</button>
            </div>
          </div>
          <div v-else class="support-empty">
            <i class="ti ti-info-circle"></i>
            <span>后台还没有配置客服联系方式。</span>
          </div>
        </div>
      </el-dialog>

      <el-dialog :model-value="Boolean(activeAnnouncement)" width="520px" title="系统公告" :close-on-click-modal="false" :show-close="false">
        <template v-if="activeAnnouncement">
          <h3>{{ activeAnnouncement.title }}</h3>
          <div class="announcement-content markdown-body" v-html="announcementHtml(activeAnnouncement)"></div>
        </template>
        <template #footer>
          <el-button type="primary" :loading="announcementSigning" @click="signAnnouncement">确认签收</el-button>
        </template>
      </el-dialog>

      <div v-if="previewImage" class="image-lightbox" @click="previewImage = null">
        <img :src="previewImage.url" :alt="previewImage.title || '预览图'" @click.stop />
      </div>
    </main>
  `,
}
