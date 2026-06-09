import { clientApi } from '../common/api.js'
import { localReceipts, receiptKey, saveReceipt } from '../common/announcementReceipts.js'
import { formatAmount, formatCurrency, formatDate } from '../common/format.js'
import { renderMarkdown } from '../common/markdown.js'
import { pageFromHash } from '../common/navigation.js'
import { notifyError, notifySuccess } from '../common/notify.js'
import { createQRCodeDataUrl } from '../common/qrCode.js'
import { disconnectGenerationTaskSocket } from '../common/taskSocket.js'
import { clearCurrentUser, getCurrentUser, saveCurrentUser } from '../common/user.js'
import { disconnectCurrentUserSocket, subscribeCurrentUser } from '../common/userSocket.js'
import { ChatPage } from '../pages/chat.js'
import { ApiDocsPage } from '../pages/apiDocs.js'
import { HistoryPage } from '../pages/history.js'
import { HomePage } from '../pages/home.js'
import { PlazaPage } from '../pages/plaza.js'
import { ProfilePage } from '../pages/profile.js'
import { ReversePromptPage } from '../pages/reversePrompt.js'
import { StatusPage } from '../pages/status.js'
import { TextChatPage } from '../pages/textChat.js'

const { computed, onBeforeUnmount, onMounted, reactive, ref, watch } = Vue

export const RootApp = {
  components: {
    HomePage,
    PlazaPage,
    ChatPage,
    ApiDocsPage,
    HistoryPage,
    ProfilePage,
    ReversePromptPage,
    StatusPage,
    TextChatPage,
  },
  setup() {
    const activePage = ref(pageFromHash())
    const currentUser = ref(getCurrentUser())
    const settings = ref(null)
    const siteName = ref('AIπ')
    const logoText = ref('AIπ')
    const creditName = ref('积分')
    const loginOpen = ref(false)
    const authMode = ref('login')
    const rechargeOpen = ref(false)
    const rechargePanelMode = ref('credits')
    const subscriptionOpen = ref(false)
    const redeemOpen = ref(false)
    const checkinOpen = ref(false)
    const inviteOpen = ref(false)
    const supportOpen = ref(false)
    const previewImage = ref(null)
    const announcements = ref([])
    const promotions = ref([])
    const subscriptionPlans = ref([])
    const announcementSigning = ref(false)
    const userRefreshing = ref(false)
    const accountMenuOpen = ref(false)
    const mobileMenuOpen = ref(false)

    const authForm = reactive({ email: '', password: '', newPassword: '', token: '' })
    const rechargeState = reactive({ products: [], selectedProductId: '', mode: 'product', customAmount: '', order: null, qrImage: '', qrLoading: false, loading: false, syncing: false })
    const subscriptionState = reactive({ plans: [], current: null, selectedPlanId: '', loading: false })
    const redeemForm = reactive({ code: '' })
    const checkinState = reactive({ status: null, loading: false, rolling: false, rollingIndex: -1, rewardCredits: null })
    const inviteState = reactive({ summary: null, loading: false })
    let rechargePollingTimer = null
    let paidRechargeNoticeOrderId = ''

    const navItems = [
      { id: 'home', label: '首页', icon: 'ti-home' },
      { id: 'chat', label: '对话生图', icon: 'ti-message-2' },
      { id: 'text-chat', label: '对话聊天', icon: 'ti-message-chatbot' },
      { id: 'reverse', label: '提示词反推', icon: 'ti-scan-eye' },
      { id: 'plaza', label: '提示词广场', icon: 'ti-layout-grid' },
      { id: 'history', label: '作品库', icon: 'ti-photo-heart' },
      { id: 'docs', label: '对接文档', icon: 'ti-book-2' },
      { id: 'status', label: '服务状态', icon: 'ti-activity-heartbeat' },
      { id: 'profile', label: '用户中心', icon: 'ti-user-circle' },
    ]

    const popupAnnouncements = computed(() => announcements.value.filter((item) => (item.displayMode || 'popup') === 'popup'))
    const homeAnnouncements = computed(() => announcements.value.filter((item) => item.displayMode === 'home'))
    const topbarAnnouncements = computed(() => announcements.value.filter((item) => item.displayMode === 'topbar'))
    const activeAnnouncement = computed(() => popupAnnouncements.value[0] || null)
    const activeTopbarAnnouncement = computed(() => topbarAnnouncements.value[0] || null)
    const activeNav = computed(() => navItems.find((item) => item.id === activePage.value) || navItems[0])
    const bottomNavItems = computed(() => navItems.filter((item) => ['home', 'chat', 'text-chat', 'plaza', 'history'].includes(item.id)))
    const customRechargeAmount = computed(() => Number(rechargeState.customAmount) || 0)
    const customRechargeCredits = computed(() => customRechargeAmount.value * Number(settings.value?.rechargeRate || 0))
    const selectedSubscriptionPlan = computed(() => subscriptionState.plans.find((plan) => plan.id === subscriptionState.selectedPlanId) || null)
    const supportItems = computed(() => {
      const config = settings.value || {}
      return [
        { key: 'wechat', label: '微信客服', value: config.supportWechat, icon: 'ti-brand-wechat', copy: true },
        { key: 'qq', label: 'QQ 客服', value: config.supportQq, icon: 'ti-brand-qq', copy: true },
        { key: 'email', label: '客服邮箱', value: config.supportEmail, icon: 'ti-mail', href: config.supportEmail ? `mailto:${config.supportEmail}` : '', copy: true },
        { key: 'url', label: '在线客服', value: config.supportUrl, icon: 'ti-headset', href: config.supportUrl },
      ].filter((item) => item.value)
    })
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
          subtitle: '创建账号即可保存作品、管理积分和创作会话',
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
      const name = String(siteName.value || 'AIπ').trim()
      return name.split(/[·-]/)[0]?.trim() || name
    })

    function isFeatureEnabled(value) {
      return value === true || value === 'true' || value === 1 || value === '1'
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
      accountMenuOpen.value = false
      mobileMenuOpen.value = false
      disconnectGenerationTaskSocket()
      disconnectCurrentUserSocket()
      notifySuccess('已退出登录')
    }

    function closeNavMenus() {
      accountMenuOpen.value = false
      mobileMenuOpen.value = false
    }

    function runNavAction(action) {
      closeNavMenus()
      action?.()
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
        userRefreshing.value = false
      }
    }

    async function manualRefreshUser() {
      if (!currentUser.value?.id || userRefreshing.value) return
      await refreshUser()
      notifySuccess('余额已刷新')
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
      currentUser.value = user
      saveCurrentUser(user)
    }

    function closePaidRecharge(order) {
      const paidOrder = order || rechargeState.order
      const orderId = paidOrder?.id || ''
      const shouldNotify = orderId ? paidRechargeNoticeOrderId !== orderId : rechargeOpen.value
      rechargeState.order = paidOrder
      stopRechargePolling()
      rechargeOpen.value = false
      rechargeState.qrImage = ''
      if (shouldNotify) {
        paidRechargeNoticeOrderId = orderId || 'unknown'
        notifySuccess(paidOrder?.orderType === 'subscription' ? '订阅已开通' : '充值已到账')
      }
    }

    function handleUserSocketUpdate(user) {
      if (!currentUser.value?.id || user?.id !== currentUser.value.id) return
      updateCurrentUser(user)
      if (rechargeOpen.value && rechargeState.order?.status === 'pending') {
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
        if ((!rechargeOpen.value && !subscriptionOpen.value) || rechargeState.order?.status !== 'pending') {
          stopRechargePolling()
          return
        }
        syncRechargeOrder(false)
      }, 3000)
    }

    async function loadBaseData() {
      try {
        const response = await clientApi.getSettings()
        settings.value = response.data
        siteName.value = response.data.siteName || 'AIπ'
        logoText.value = response.data.logoText || siteName.value
        creditName.value = response.data.creditName || '积分'
        document.title = `${siteName.value} 生图工作台`
      } catch {}

      clientApi.listPromotions().then((response) => {
        promotions.value = response.data || []
      }).catch(() => {
        promotions.value = []
      })

      clientApi.listSubscriptionPlans().then((response) => {
        subscriptionPlans.value = response.data || []
      }).catch(() => {
        subscriptionPlans.value = []
      })

      loadAnnouncements()
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
        if (currentUser.value) {
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

    function getInviteIdFromUrl() {
      const inviteId = new URLSearchParams(location.search).get('invite')?.trim() || ''
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(inviteId)
        ? inviteId
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
        updateCurrentUser(response.data)
        loginOpen.value = false
        notifySuccess(authMode.value === 'register' ? '注册成功' : '登录成功')
        loadAnnouncements()
      } catch (error) {
        notifyError(error, '登录失败')
      }
    }

    async function openRecharge() {
      if (!requireLogin()) return
      rechargeOpen.value = true
      subscriptionOpen.value = false
      rechargePanelMode.value = 'credits'
      rechargeState.order = null
      rechargeState.qrImage = ''
      stopRechargePolling()
      paidRechargeNoticeOrderId = ''
      rechargeState.customAmount = ''
      rechargeState.mode = 'product'
      try {
        const response = await clientApi.listRechargeProducts()
        rechargeState.products = response.data || []
        rechargeState.selectedProductId = rechargeState.products[0]?.id || ''
      } catch (error) {
        notifyError(error, '加载充值商品失败')
      }
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
        subscriptionState.current = currentResponse.data || null
        subscriptionState.selectedPlanId = subscriptionState.plans[0]?.id || ''
      } catch (error) {
        notifyError(error, '加载订阅套餐失败')
      } finally {
        subscriptionState.loading = false
      }
    }

    async function switchRechargePanel(mode) {
      if (rechargePanelMode.value === mode) return
      rechargePanelMode.value = mode
      rechargeState.order = null
      rechargeState.qrImage = ''
      stopRechargePolling()
      paidRechargeNoticeOrderId = ''
      if (mode === 'subscription') await loadSubscriptionData()
    }

    async function openSubscription() {
      if (!requireLogin()) return
      subscriptionOpen.value = true
      rechargeOpen.value = false
      rechargeState.order = null
      rechargeState.qrImage = ''
      stopRechargePolling()
      paidRechargeNoticeOrderId = ''
      await loadSubscriptionData()
    }

    async function createRechargeOrder() {
      if (!currentUser.value) return
      const isCustom = rechargeState.mode === 'custom'
      const isSubscription = subscriptionOpen.value || (rechargeOpen.value && rechargePanelMode.value === 'subscription')
      if (isCustom && customRechargeAmount.value <= 0) {
        ElementPlus.ElMessage.warning('请输入自定义充值金额')
        return
      }
      if (isSubscription && !subscriptionState.selectedPlanId) {
        ElementPlus.ElMessage.warning('请选择订阅套餐')
        return
      }
      try {
        rechargeState.loading = true
        const payload = {
          userId: currentUser.value.id,
          ...(isSubscription
            ? { subscriptionPlanId: subscriptionState.selectedPlanId }
            : isCustom
              ? { amount: customRechargeAmount.value }
              : { productId: rechargeState.selectedProductId }),
        }
        const response = await clientApi.createRechargeOrder(payload)
        rechargeState.order = response.data
        paidRechargeNoticeOrderId = ''
        await renderRechargeQrCode(response.data)
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
            subscriptionState.current = currentResponse.data || null
          }
          closePaidRecharge(response.data)
          subscriptionOpen.value = false
        } else {
          if (showMessage) notifySuccess('订单状态已刷新')
        }
      } catch (error) {
        if (showMessage) notifyError(error, '同步订单失败')
      } finally {
        rechargeState.syncing = false
      }
    }

    async function redeemCode() {
      if (!currentUser.value) return
      try {
        const response = await clientApi.redeemCode({ userId: currentUser.value.id, code: redeemForm.code })
        updateCurrentUser(response.data.user)
        redeemOpen.value = false
        redeemForm.code = ''
        notifySuccess('兑换成功')
      } catch (error) {
        notifyError(error, '兑换失败')
      }
    }

    async function openCheckin() {
      if (!requireLogin()) return
      checkinOpen.value = true
      checkinState.rolling = false
      checkinState.rollingIndex = -1
      checkinState.rewardCredits = null
      try {
        checkinState.loading = true
        const response = await clientApi.getCheckinStatus(currentUser.value.id)
        checkinState.status = response.data
      } catch (error) {
        notifyError(error, '加载签到失败')
      } finally {
        checkinState.loading = false
      }
    }

    async function doCheckin() {
      if (!currentUser.value) return
      try {
        checkinState.rolling = true
        checkinState.rollingIndex = 0
        checkinState.rewardCredits = null
        const response = await clientApi.checkin(currentUser.value.id)
        updateCurrentUser(response.data.user)
        await playCheckinRoll(response.data.rewardCredits, response.data.rewards || checkinState.status?.rewards || [])
        checkinState.rewardCredits = response.data.rewardCredits
        checkinState.status = {
          ...(checkinState.status || {}),
          checkedIn: true,
          rewards: response.data.rewards || checkinState.status?.rewards || [],
          today: response.data.checkin,
        }
        notifySuccess(`签到成功，获得 ${formatAmount(response.data.rewardCredits)} ${creditName.value}`)
      } catch (error) {
        checkinState.rolling = false
        checkinState.rollingIndex = -1
        notifyError(error, '签到失败')
      }
    }

    function playCheckinRoll(rewardCredits, rewards) {
      return new Promise((resolve) => {
        const rewardList = rewards?.length ? rewards : checkinState.status?.rewards || []
        const targetIndex = Math.max(0, rewardList.findIndex((reward) => Number(reward) === Number(rewardCredits)))
        const totalSteps = rewardList.length * 3 + targetIndex + 1
        let step = 0
        const tick = () => {
          if (!rewardList.length) {
            checkinState.rolling = false
            resolve()
            return
          }
          checkinState.rollingIndex = step % rewardList.length
          step += 1
          if (step > totalSteps) {
            checkinState.rollingIndex = targetIndex
            setTimeout(() => {
              checkinState.rolling = false
              resolve()
            }, 420)
            return
          }
          const delay = 70 + Math.min(170, Math.max(0, step - totalSteps + 8) * 24)
          setTimeout(tick, delay)
        }
        tick()
      })
    }

    async function openInvite() {
      if (!requireLogin()) return
      inviteOpen.value = true
      try {
        inviteState.loading = true
        const response = await clientApi.getInviteSummary(currentUser.value.id)
        inviteState.summary = response.data
      } catch (error) {
        notifyError(error, '加载邀请信息失败')
      } finally {
        inviteState.loading = false
      }
    }

    async function copyInviteLink() {
      const url = new URL(location.origin)
      url.searchParams.set('invite', currentUser.value.id)
      await navigator.clipboard.writeText(url.toString())
      notifySuccess('邀请链接已复制')
    }

    async function copySupportValue(value) {
      if (!value) return
      await navigator.clipboard.writeText(value)
      notifySuccess('已复制联系方式')
    }

    onMounted(() => {
      window.addEventListener('hashchange', handleHashChange)
      window.addEventListener('focus', refreshUserQuietly)
      document.addEventListener('visibilitychange', handleVisibilityChange)
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
          notifySuccess('邮箱验证成功，请登录')
          loginOpen.value = true
        }).catch((error) => notifyError(error, '邮箱验证失败'))
      }
      loadBaseData()
      if (currentUser.value?.id) refreshUser()
    })

    watch(() => activePage.value, (page) => {
      document.body.classList.toggle('chat-page-active', page === 'chat' || page === 'text-chat')
    }, { immediate: true })
    watch(() => currentUser.value?.id, loadAnnouncements)
    watch(rechargeOpen, (open) => {
      if (!open) stopRechargePolling()
    })
    watch(subscriptionOpen, (open) => {
      if (!open && !rechargeOpen.value) stopRechargePolling()
    })
    watch(() => currentUser.value?.id || '', (userId) => {
      if (userId) subscribeCurrentUser(userId, handleUserSocketUpdate)
      else disconnectCurrentUserSocket()
    }, { immediate: true })
    onBeforeUnmount(() => {
      window.removeEventListener('hashchange', handleHashChange)
      window.removeEventListener('focus', refreshUserQuietly)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      stopRechargePolling()
      disconnectCurrentUserSocket()
      document.body.classList.remove('chat-page-active')
    })

    return {
      activePage,
      currentUser,
      settings,
      siteName,
      logoText,
      creditName,
      loginOpen,
      authMode,
      authForm,
      rechargeOpen,
      rechargePanelMode,
      subscriptionOpen,
      rechargeState,
      subscriptionState,
      selectedSubscriptionPlan,
      customRechargeAmount,
      customRechargeCredits,
      redeemOpen,
      redeemForm,
      checkinOpen,
      checkinState,
      inviteOpen,
      inviteState,
      supportOpen,
      supportItems,
      previewImage,
      activeAnnouncement,
      activeTopbarAnnouncement,
      activeNav,
      authMeta,
      shortSiteName,
      announcementSigning,
      userRefreshing,
      accountMenuOpen,
      mobileMenuOpen,
      promotions,
      subscriptionPlans,
      navItems,
      bottomNavItems,
      setPage,
      requireLogin,
      logout,
      closeNavMenus,
      runNavAction,
      openRecharge,
      openSubscription,
      switchRechargePanel,
      createRechargeOrder,
      syncRechargeOrder,
      redeemCode,
      openCheckin,
      doCheckin,
      playCheckinRoll,
      openInvite,
      copyInviteLink,
      copySupportValue,
      rechargeStatusText,
      submitAuth,
      signAnnouncement,
      closeAnnouncement,
      announcementHtml,
      updateCurrentUser,
      manualRefreshUser,
      formatAmount,
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
              <img src="/favicon.svg" alt="" />
              <span>
                <strong>{{ shortSiteName }}</strong>
                <small>创作工作台</small>
              </span>
            </button>
            <nav class="web-primary-nav" aria-label="用户端导航">
              <button v-for="item in navItems" :key="item.id" :class="{ active: activePage === item.id }" type="button" @click="setPage(item.id)">
                <i :class="['ti', item.icon]"></i>
                <span>{{ item.label }}</span>
              </button>
            </nav>
          </div>
          <div class="web-top-actions">
            <template v-if="currentUser">
              <span class="user-chip">
                <span class="user-chip-label">余额</span>
                <span class="user-balance">{{ formatAmount(currentUser.credits) }} {{ creditName }}</span>
                <button class="balance-refresh" type="button" title="刷新余额" :disabled="userRefreshing" @click="manualRefreshUser">
                  <i :class="['ti', 'ti-refresh', { 'is-spinning': userRefreshing }]"></i>
                </button>
              </span>
              <el-button class="user-action primary-action nav-recharge-action" type="primary" @click="openRecharge">
                <i class="ti ti-wallet"></i>
                <span>充值</span>
              </el-button>
              <div class="account-menu-wrap">
                <button :class="['account-trigger', { active: accountMenuOpen }]" type="button" @click="accountMenuOpen = !accountMenuOpen; mobileMenuOpen = false">
                  <span class="account-avatar">{{ currentUser.email?.slice(0, 1)?.toUpperCase() || 'U' }}</span>
                  <span class="account-trigger-copy">
                    <strong>{{ currentUser.email }}</strong>
                    <small>{{ currentUser.subscription?.status === 'active' ? '会员已开通' : '普通用户' }}</small>
                  </span>
                  <i class="ti ti-chevron-down"></i>
                </button>
                <div v-if="accountMenuOpen" class="account-menu">
                  <div class="account-menu-head">
                    <span class="account-avatar large">{{ currentUser.email?.slice(0, 1)?.toUpperCase() || 'U' }}</span>
                    <div>
                      <strong>{{ currentUser.email }}</strong>
                      <small>{{ formatAmount(currentUser.credits) }} {{ creditName }}</small>
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
                  <button type="button" @click="runNavAction(() => redeemOpen = true)">
                    <i class="ti ti-ticket"></i>
                    <span>兑换码</span>
                  </button>
                  <button type="button" @click="runNavAction(openCheckin)">
                    <i class="ti ti-calendar-check"></i>
                    <span>每日签到</span>
                  </button>
                  <button type="button" @click="runNavAction(openInvite)">
                    <i class="ti ti-user-plus"></i>
                    <span>邀请好友</span>
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
                <small>{{ formatAmount(currentUser.credits) }} {{ creditName }}</small>
              </div>
            </div>
            <div class="mobile-account-actions">
              <button type="button" @click="runNavAction(openRecharge)"><i class="ti ti-wallet"></i><span>充值</span></button>
              <button type="button" @click="runNavAction(() => setPage('profile'))"><i class="ti ti-user-circle"></i><span>用户中心</span></button>
              <button type="button" @click="runNavAction(() => setPage('history'))"><i class="ti ti-photo-heart"></i><span>作品库</span></button>
              <button type="button" @click="runNavAction(() => setPage('status'))"><i class="ti ti-activity-heartbeat"></i><span>状态</span></button>
              <button type="button" @click="runNavAction(() => setPage('docs'))"><i class="ti ti-book-2"></i><span>文档</span></button>
              <button type="button" @click="runNavAction(openSubscription)"><i class="ti ti-crown"></i><span>订阅</span></button>
              <button type="button" @click="runNavAction(() => redeemOpen = true)"><i class="ti ti-ticket"></i><span>兑换</span></button>
              <button type="button" @click="runNavAction(openCheckin)"><i class="ti ti-calendar-check"></i><span>签到</span></button>
              <button type="button" @click="runNavAction(openInvite)"><i class="ti ti-user-plus"></i><span>邀请</span></button>
              <button type="button" @click="logout"><i class="ti ti-logout"></i><span>退出</span></button>
            </div>
          </div>
        </header>

        <main :class="['web-content', { 'chat-content': activePage === 'chat' || activePage === 'text-chat' }]">
          <home-page v-if="activePage === 'home'" :announcements="homeAnnouncements" :credit-name="creditName" :current-user="currentUser" :promotions="promotions" :settings="settings" :site-name="siteName" :subscription-plans="subscriptionPlans" @announcement-close="closeAnnouncement" @go="setPage" @login="loginOpen = true" @recharge="openRecharge" @subscribe="openSubscription" />
          <chat-page v-if="activePage === 'chat'" :credit-name="creditName" :current-user="currentUser" :settings="settings" :site-name="siteName" @login="loginOpen = true" @preview="previewImage = $event" @user-updated="updateCurrentUser" />
          <text-chat-page v-if="activePage === 'text-chat'" :credit-name="creditName" :current-user="currentUser" @login="loginOpen = true" @user-updated="updateCurrentUser" />
          <reverse-prompt-page v-if="activePage === 'reverse'" :current-user="currentUser" @go="setPage" @login="loginOpen = true" @preview="previewImage = $event" />
          <plaza-page v-if="activePage === 'plaza'" @go="setPage" @preview="previewImage = $event" />
          <history-page v-if="activePage === 'history'" :current-user="currentUser" @go="setPage" @login="loginOpen = true" @preview="previewImage = $event" />
          <api-docs-page v-if="activePage === 'docs'" :current-user="currentUser" @go="setPage" @login="loginOpen = true" />
          <status-page v-if="activePage === 'status'" />
          <profile-page v-if="activePage === 'profile'" :credit-name="creditName" :current-user="currentUser" @go="setPage" @login="loginOpen = true" @user-updated="updateCurrentUser" />
        </main>
        <nav class="web-bottom-nav" aria-label="移动端主导航">
          <button v-for="item in bottomNavItems" :key="item.id" :class="{ active: activePage === item.id }" type="button" @click="setPage(item.id)">
            <i :class="['ti', item.icon]"></i>
            <span>{{ item.label.replace('提示词', '') }}</span>
          </button>
        </nav>
      </section>

      <button v-if="settings?.supportEnabled" :class="['support-float', { 'chat-support-float': activePage === 'chat' || activePage === 'text-chat' }]" type="button" @click="supportOpen = true">
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
              <span><i class="ti ti-coins"></i> 管理{{ creditName }}</span>
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
              <p>开通后享受模型折扣，套餐赠送额度会在支付成功后自动到账。</p>
            </div>
            <i class="ti ti-crown"></i>
          </div>
        </template>
        <div v-loading="subscriptionState.loading" class="subscription-body">
          <div class="subscription-status">
            <div>
              <span>当前订阅</span>
              <strong>{{ subscriptionState.current?.planName || '暂未开通' }}</strong>
              <p v-if="subscriptionState.current">有效期至 {{ formatDate(subscriptionState.current.expiresAt) }}</p>
              <p v-else>选择一个套餐后即可开通会员权益。</p>
            </div>
            <i :class="['ti', subscriptionState.current ? 'ti-shield-check' : 'ti-shield-plus']"></i>
          </div>
          <div class="subscription-plans">
            <button v-for="plan in subscriptionState.plans" :key="plan.id" :class="{ active: subscriptionState.selectedPlanId === plan.id }" class="subscription-plan" type="button" @click="subscriptionState.selectedPlanId = plan.id">
              <span v-if="plan.badge" class="subscription-badge">{{ plan.badge }}</span>
              <strong>{{ plan.name }}</strong>
              <p>{{ plan.description || '会员专属生成权益' }}</p>
              <div class="subscription-price">¥{{ formatCurrency(plan.amount) }}</div>
              <div class="subscription-benefits">
                <span><i class="ti ti-calendar"></i>{{ plan.durationDays }} 天有效期</span>
                <span><i class="ti ti-coins"></i>赠送 {{ formatAmount(plan.bonusCredits) }} {{ creditName }}</span>
                <span><i class="ti ti-discount"></i>模型 {{ plan.discountPercent }}% 折扣</span>
              </div>
            </button>
          </div>
          <div v-if="rechargeState.order && subscriptionOpen" class="subscription-pay-panel">
            <div>
              <span>订阅订单</span>
              <strong>{{ rechargeStatusText(rechargeState.order.status) }}</strong>
              <p>支付 ¥{{ formatCurrency(rechargeState.order.amount) }}</p>
            </div>
            <div class="recharge-qr-wrap compact">
              <div v-if="rechargeState.qrLoading" class="recharge-qr-loading"><i class="ti ti-loader-2"></i></div>
              <img v-else-if="rechargeState.qrImage" :src="rechargeState.qrImage" alt="支付宝支付二维码" />
              <span><i class="ti ti-brand-alipay"></i> 支付宝扫码</span>
            </div>
            <el-button :loading="rechargeState.syncing" @click="syncRechargeOrder(true)">已支付，刷新状态</el-button>
          </div>
        </div>
        <template #footer>
          <el-button @click="subscriptionOpen = false">取消</el-button>
          <el-button type="primary" :loading="rechargeState.loading" :disabled="!selectedSubscriptionPlan" @click="createRechargeOrder">
            {{ rechargeState.order ? '重新创建订单' : '开通订阅' }}
          </el-button>
        </template>
      </el-dialog>

      <el-dialog v-model="rechargeOpen" width="860px" class="recharge-dialog" custom-class="recharge-dialog-panel">
        <template #header>
          <div class="recharge-head">
            <div>
              <span>{{ rechargePanelMode === 'subscription' ? 'Membership' : 'Recharge' }}</span>
              <strong>{{ rechargePanelMode === 'subscription' ? '会员订阅' : '在线充值' }}</strong>
              <p>{{ rechargePanelMode === 'subscription' ? '选择会员套餐后创建订单，支付成功会自动开通权益。' : '选择套餐后创建订单，支付完成会自动到账。' }}</p>
            </div>
            <i :class="['ti', rechargePanelMode === 'subscription' ? 'ti-crown' : 'ti-wallet']"></i>
          </div>
        </template>
        <div class="recharge-body">
          <div class="recharge-left">
            <div class="recharge-mode-tabs">
              <button :class="{ active: rechargePanelMode === 'credits' }" type="button" @click="switchRechargePanel('credits')">
                <i class="ti ti-coins"></i>
                积分充值
              </button>
              <button :class="{ active: rechargePanelMode === 'subscription' }" type="button" @click="switchRechargePanel('subscription')">
                <i class="ti ti-crown"></i>
                会员订阅
              </button>
            </div>
            <template v-if="rechargePanelMode === 'credits'">
            <div class="recharge-tabs">
              <button :class="{ active: rechargeState.mode === 'product' }" type="button" @click="rechargeState.mode = 'product'; rechargeState.selectedProductId = rechargeState.products[0]?.id || ''">
                <i class="ti ti-packages"></i>
                套餐充值
              </button>
              <button :class="{ active: rechargeState.mode === 'custom' }" type="button" @click="rechargeState.mode = 'custom'">
                <i class="ti ti-pencil-dollar"></i>
                自定义金额
              </button>
            </div>
            <div v-if="rechargeState.mode === 'product'" class="recharge-products">
              <button v-for="product in rechargeState.products" :key="product.id" :class="{ active: rechargeState.selectedProductId === product.id }" class="recharge-product" type="button" @click="rechargeState.selectedProductId = product.id">
                <span>{{ product.name }}</span>
                <strong>¥{{ formatCurrency(product.amount) }}</strong>
                <small>{{ formatAmount(product.credits) }} {{ creditName }}</small>
              </button>
            </div>
            <div v-else class="recharge-custom-panel">
              <div class="recharge-custom-card">
                <span>自由充值</span>
                <strong>按金额自动换算{{ creditName }}</strong>
                <small>当前比例 1 元 = {{ settings?.rechargeRate || 1 }} {{ creditName }}</small>
              </div>
              <div class="recharge-custom">
                <el-input v-model="rechargeState.customAmount" type="number" min="0" placeholder="请输入充值金额">
                  <template #prefix>¥</template>
                </el-input>
                <span class="recharge-credit-preview">
                  <i class="ti ti-coins"></i>
                  <em>预计到账</em>
                  <strong>{{ formatAmount(customRechargeCredits) }}</strong>
                  <b>{{ creditName }}</b>
                </span>
              </div>
            </div>
            <el-button class="recharge-submit" type="primary" :loading="rechargeState.loading" :disabled="(rechargeState.mode === 'product' && !rechargeState.selectedProductId) || (rechargeState.mode === 'custom' && customRechargeAmount <= 0)" @click="createRechargeOrder">
              创建充值订单
            </el-button>
            </template>
            <template v-else>
              <div v-loading="subscriptionState.loading" class="recharge-subscription-panel">
                <div class="subscription-status">
                  <div>
                    <span>当前订阅</span>
                    <strong>{{ subscriptionState.current?.planName || '暂未开通' }}</strong>
                    <p v-if="subscriptionState.current">有效期至 {{ formatDate(subscriptionState.current.expiresAt) }}</p>
                    <p v-else>选择一个套餐后即可开通会员权益。</p>
                  </div>
                  <i :class="['ti', subscriptionState.current ? 'ti-shield-check' : 'ti-shield-plus']"></i>
                </div>
                <div class="subscription-plans recharge-subscription-plans">
                  <button v-for="plan in subscriptionState.plans" :key="plan.id" :class="{ active: subscriptionState.selectedPlanId === plan.id }" class="subscription-plan" type="button" @click="subscriptionState.selectedPlanId = plan.id">
                    <span v-if="plan.badge" class="subscription-badge">{{ plan.badge }}</span>
                    <strong>{{ plan.name }}</strong>
                    <p>{{ plan.description || '会员专属生成权益' }}</p>
                    <div class="subscription-price">¥{{ formatCurrency(plan.amount) }}</div>
                    <div class="subscription-benefits">
                      <span><i class="ti ti-calendar"></i>{{ plan.durationDays }} 天有效期</span>
                      <span><i class="ti ti-coins"></i>赠送 {{ formatAmount(plan.bonusCredits) }} {{ creditName }}</span>
                      <span><i class="ti ti-discount"></i>模型 {{ plan.discountPercent }}% 折扣</span>
                    </div>
                  </button>
                </div>
              </div>
              <el-button class="recharge-submit" type="primary" :loading="rechargeState.loading" :disabled="!selectedSubscriptionPlan" @click="createRechargeOrder">
                {{ rechargeState.order ? '重新创建订阅订单' : '开通订阅' }}
              </el-button>
            </template>
          </div>
          <div :class="{ empty: !rechargeState.order }" class="recharge-order">
            <template v-if="rechargeState.order">
              <div class="recharge-order-info">
                <span>{{ rechargePanelMode === 'subscription' ? '订阅订单' : '订单状态' }}</span>
                <strong>{{ rechargeStatusText(rechargeState.order.status) }}</strong>
                <p>支付 ¥{{ formatCurrency(rechargeState.order.amount) }}</p>
                <p v-if="rechargePanelMode === 'credits'">到账 {{ formatAmount(rechargeState.order.credits) }} {{ creditName }}</p>
                <p v-else>支付完成后自动开通会员权益</p>
              </div>
              <div class="recharge-qr-wrap">
                <div v-if="rechargeState.qrLoading" class="recharge-qr-loading"><i class="ti ti-loader-2"></i></div>
                <img v-else-if="rechargeState.qrImage" :src="rechargeState.qrImage" alt="支付宝支付二维码" />
                <span><i class="ti ti-brand-alipay"></i> 请使用支付宝扫码支付</span>
              </div>
              <el-button :loading="rechargeState.syncing" @click="syncRechargeOrder(true)">支付宝已支付，刷新状态</el-button>
            </template>
            <template v-else>
              <div class="recharge-order-empty">
                <i class="ti ti-qrcode"></i>
                <strong>二维码将在这里显示</strong>
                <p>{{ rechargePanelMode === 'subscription' ? '选择会员套餐并创建订单后，右侧会显示支付宝支付二维码。' : '选择套餐并创建订单后，右侧会显示支付宝支付二维码。' }}</p>
              </div>
            </template>
          </div>
        </div>
      </el-dialog>

      <el-dialog v-model="redeemOpen" width="420px" title="卡密兑换">
        <el-input v-model="redeemForm.code" placeholder="请输入卡密" />
        <template #footer><el-button type="primary" @click="redeemCode">立即兑换</el-button></template>
      </el-dialog>

      <el-dialog v-model="checkinOpen" width="480px" class="checkin-dialog" custom-class="checkin-dialog-panel">
        <template #header>
          <div class="checkin-head">
            <div>
              <span>Daily reward</span>
              <strong>每日签到</strong>
              <p>每天签到一次，随机获得一份{{ creditName }}奖励。</p>
            </div>
            <i class="ti ti-award"></i>
          </div>
        </template>
        <div v-loading="checkinState.loading" class="checkin-body">
          <div v-if="checkinState.status" :class="{ done: checkinState.status.checkedIn }" class="checkin-status">
            <i :class="['ti', checkinState.status.checkedIn ? 'ti-circle-check' : 'ti-sparkles']"></i>
            <div>
              <span>今日状态</span>
              <strong>{{ checkinState.status.checkedIn ? '已签到' : '待签到' }}</strong>
            </div>
          </div>
          <div class="checkin-rewards">
            <div v-for="(reward, index) in checkinState.status?.rewards || []" :key="reward" :class="{ active: checkinState.rolling && checkinState.rollingIndex === index, won: !checkinState.rolling && checkinState.rewardCredits !== null && Number(checkinState.rewardCredits) === Number(reward) }" class="checkin-reward">
              <span>{{ reward }}</span>
              <small>{{ creditName }}</small>
            </div>
          </div>
          <el-button class="checkin-submit" type="primary" :loading="checkinState.rolling" :disabled="checkinState.status?.checkedIn || checkinState.rolling" @click="doCheckin">
            {{ checkinState.rolling ? '抽取中...' : checkinState.status?.checkedIn ? '今日已签到' : '立即签到' }}
          </el-button>
        </div>
      </el-dialog>

      <el-dialog v-model="inviteOpen" width="520px" class="invite-dialog" custom-class="invite-dialog-panel">
        <template #header>
          <div class="invite-head">
            <div>
              <span>Invite friends</span>
              <strong>邀请好友</strong>
              <p>复制专属链接给好友，好友注册后你将获得奖励。</p>
            </div>
            <i class="ti ti-share-3"></i>
          </div>
        </template>
        <div v-loading="inviteState.loading" class="invite-body">
          <div class="invite-hero">
            <span>单次邀请奖励</span>
            <strong>{{ formatAmount(inviteState.summary?.rewardCredits || 0) }}</strong>
            <small>{{ creditName }}</small>
          </div>
          <div class="invite-stats">
            <div>
              <span>已邀请</span>
              <strong>{{ inviteState.summary?.total || 0 }}</strong>
              <small>人</small>
            </div>
            <div>
              <span>累计奖励</span>
              <strong>{{ formatAmount(inviteState.summary?.totalRewardCredits || 0) }}</strong>
              <small>{{ creditName }}</small>
            </div>
          </div>
          <div class="invite-tip">
            <i class="ti ti-link"></i>
            <span>邀请链接会自动带上你的用户标识，好友注册成功后会统计到这里。</span>
          </div>
          <el-button class="invite-submit" type="primary" @click="copyInviteLink">复制邀请链接</el-button>
        </div>
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
