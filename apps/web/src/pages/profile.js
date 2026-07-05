import { clientApi } from '../common/api.js'
import { formatDate } from '../common/format.js'

const { computed, onMounted, reactive, ref, watch } = Vue

function taskStatusLabel(status) {
  const labels = {
    queued: '排队中',
    pending: '等待中',
    processing: '生成中',
    success: '成功',
    failed: '失败',
    canceled: '已取消',
  }
  return labels[status] || status || '-'
}

function taskStatusClass(status) {
  if (status === 'success') return 'success'
  if (status === 'failed' || status === 'canceled') return 'danger'
  return 'warning'
}

export const ProfilePage = {
  props: ['currentUser'],
  emits: ['login', 'user-updated', 'go', 'subscribe'],
  setup(props, { emit }) {
    const loading = ref(false)
    const details = ref(null)
    const passwordLoading = ref(false)
    const taskPage = ref(1)
    const taskPageSize = 5
    const passwordForm = reactive({
      oldPassword: '',
      password: '',
      confirmPassword: '',
    })

    const user = computed(() => details.value?.user || props.currentUser || null)
    const tasks = computed(() => details.value?.tasks || [])
    const tasksPagination = computed(() => details.value?.tasksPagination || null)
    const successfulTasks = computed(() => tasks.value.filter((task) => task.status === 'success').length)
    const subscription = computed(() => user.value?.subscription || null)
    const activeSubscription = computed(() => Boolean(subscription.value?.isPaid || subscription.value?.tier === 'paid' || (subscription.value?.status === 'active' && subscription.value?.planId)))
    const accountIdText = computed(() => {
      const id = String(user.value?.id || '').trim()
      if (!id) return '-'
      return id.length > 12 ? id.split('-')[0] || id.slice(0, 8) : id
    })
    const memberPlanText = computed(() => subscription.value?.planName || '免费版')
    const quotaLimitValue = computed(() => {
      const value = Number(subscription.value?.quotaLimit || subscription.value?.quotaImages)
      return Number.isFinite(value) && value > 0 ? value : 10
    })
    const quotaRemainingValue = computed(() => {
      const value = Number(subscription.value?.quotaRemaining)
      return Number.isFinite(value) && value >= 0 ? value : quotaLimitValue.value
    })
    const quotaWindows = computed(() => Array.isArray(subscription.value?.quotaWindows) ? subscription.value.quotaWindows : [])
    const effectiveQuotaRemainingValue = computed(() => {
      const value = Number(subscription.value?.effectiveQuotaRemaining)
      if (Number.isFinite(value) && value >= 0) return value
      const values = quotaWindows.value.map((item) => Number(item.quotaRemaining)).filter((item) => Number.isFinite(item) && item >= 0)
      return values.length ? Math.min(...values) : quotaRemainingValue.value
    })
    const quotaLimitText = computed(() => `${quotaLimitValue.value} 张`)
    const quotaUsedText = computed(() => `${Number(subscription.value?.quotaUsed || 0)} 张`)
    const quotaRemainingText = computed(() => `${quotaRemainingValue.value} 张`)
    const effectiveQuotaRemainingText = computed(() => `${effectiveQuotaRemainingValue.value} 张`)
    const quotaUsageRows = computed(() => {
      if (!activeSubscription.value && quotaWindows.value.length) {
        const rows = quotaWindows.value.map((window) => quotaUsageRow(
          window.key || window.label,
          quotaUsageLabel(window.label || window.key),
          window.quotaUsed,
          window.quotaLimit,
          window.quotaRemaining,
          window.periodEndsAt,
        ))
        return decorateFreeQuotaRows(rows, effectiveQuotaRemainingValue.value)
      }
      const limit = quotaLimitValue.value
      const remaining = quotaRemainingValue.value
      const used = Number(subscription.value?.quotaUsed)
      const fallbackUsed = Math.max(0, limit - remaining)
      return [quotaUsageRow(
        'period',
        activeSubscription.value ? '周期额度' : '免费额度',
        Number.isFinite(used) ? used : fallbackUsed,
        limit,
        remaining,
        subscription.value?.periodEndsAt || subscription.value?.expiresAt,
      )]
    })
    const nextQuotaRecoveryText = computed(() => {
      const rows = quotaUsageRows.value
        .filter((row) => row.remaining <= 0 && row.resetAt)
        .sort((left, right) => left.resetAt - right.resetAt)
      return rows[0]?.resetText || ''
    })
    const quotaSummaryHint = computed(() => {
      if (activeSubscription.value) return '订阅周期额度'
      if (effectiveQuotaRemainingValue.value <= 0 && nextQuotaRecoveryText.value) {
        return `最近恢复：${nextQuotaRecoveryText.value}`
      }
      return '受小时、今日、本月额度共同限制'
    })

    async function loadDetails() {
      if (!props.currentUser?.id) {
        details.value = null
        return
      }
      loading.value = true
      try {
        const response = await clientApi.getUserDetails(props.currentUser.id, {
          taskPage: taskPage.value,
          taskPageSize,
        })
        details.value = response.data || null
        if (response.data?.user) emit('user-updated', response.data.user)
      } catch (error) {
        ElementPlus.ElMessage.error(error.message || '账户明细加载失败')
      } finally {
        loading.value = false
      }
    }

    async function changeTaskPage(page) {
      taskPage.value = page
      await loadDetails()
    }

    function pageCount(pagination, pageSize) {
      return Math.max(1, Math.ceil(Number(pagination?.total || 0) / pageSize))
    }

    function paginationText(pagination, page, pageSize) {
      const total = Number(pagination?.total || 0)
      if (!total) return '共 0 条'
      const start = (page - 1) * pageSize + 1
      const end = Math.min(total, page * pageSize)
      return `${start}-${end} / 共 ${total} 条`
    }

    function changeTaskPageBy(delta) {
      const nextPage = Math.min(pageCount(tasksPagination.value, taskPageSize), Math.max(1, taskPage.value + delta))
      if (nextPage === taskPage.value) return
      changeTaskPage(nextPage)
    }

    function canPrev(page) {
      return page > 1
    }

    function canNext(pagination, page, pageSize) {
      return page < pageCount(pagination, pageSize)
    }

    function resetPasswordForm() {
      passwordForm.oldPassword = ''
      passwordForm.password = ''
      passwordForm.confirmPassword = ''
    }

    async function submitPassword() {
      if (!props.currentUser?.id) {
        emit('login')
        return
      }
      if (!passwordForm.oldPassword) {
        ElementPlus.ElMessage.warning('请输入当前密码')
        return
      }
      if (passwordForm.password.length < 6) {
        ElementPlus.ElMessage.warning('新密码至少需要 6 个字符')
        return
      }
      if (passwordForm.password !== passwordForm.confirmPassword) {
        ElementPlus.ElMessage.warning('两次输入的新密码不一致')
        return
      }
      try {
        passwordLoading.value = true
        const response = await clientApi.changePassword(props.currentUser.id, {
          oldPassword: passwordForm.oldPassword,
          password: passwordForm.password,
        })
        emit('user-updated', response.data)
        resetPasswordForm()
        ElementPlus.ElMessage.success('密码已修改')
      } catch (error) {
        ElementPlus.ElMessage.error(error.message || '密码修改失败')
      } finally {
        passwordLoading.value = false
      }
    }

    function goChat() {
      emit('go', 'chat')
    }

    function goHistory() {
      emit('go', 'history')
    }

    function openSubscribe() {
      emit('subscribe')
    }

    function quotaUsageRow(key, label, used, limit, remaining, periodEndsAt = '') {
      const safeLimit = Math.max(0, Number(limit) || 0)
      const usedValue = Number(used)
      const remainingValue = Number(remaining)
      const resetAt = parseTime(periodEndsAt)
      const safeRemaining = Number.isFinite(remainingValue)
        ? Math.min(safeLimit || remainingValue, Math.max(0, remainingValue))
        : Math.max(0, safeLimit - (Number.isFinite(usedValue) ? Math.max(0, usedValue) : 0))
      const safeUsed = Number.isFinite(usedValue)
        ? Math.min(safeLimit || usedValue, Math.max(0, usedValue))
        : Math.max(0, safeLimit - safeRemaining)
      const usedPercent = safeLimit > 0 ? Math.min(100, Math.round((safeUsed / safeLimit) * 100)) : 0
      const remainingPercent = safeLimit > 0 ? Math.min(100, Math.round((safeRemaining / safeLimit) * 100)) : 0
      return {
        key: key || label,
        label,
        used: safeUsed,
        limit: safeLimit,
        remaining: safeRemaining,
        displayRemaining: safeRemaining,
        percent: usedPercent,
        percentLabel: safeLimit > 0 ? `${usedPercent}%` : '未设置',
        resetAt,
        resetText: resetAt ? formatRecoveryTime(resetAt) : '',
        limitNote: '',
        remainingNote: '',
        status: safeRemaining <= 0 ? 'danger' : remainingPercent <= 20 ? 'warning' : 'normal',
      }
    }

    function decorateFreeQuotaRows(rows, effectiveRemaining) {
      const effectiveValue = Math.max(0, Number(effectiveRemaining) || 0)
      const limitingRow = quotaLimitingRow(rows, effectiveValue)
      return rows.map((row) => {
        const displayRemaining = Math.min(row.remaining, effectiveValue)
        const limitedByOtherWindow = limitingRow && limitingRow.key !== row.key && displayRemaining < row.remaining
        return {
          ...row,
          displayRemaining,
          limitNote: limitedByOtherWindow ? `受${limitingRow.label.replace(/额度$/, '')}限制` : '',
          remainingNote: limitedByOtherWindow ? `周期剩余 ${row.remaining} 张` : '',
          status: displayRemaining <= 0 ? 'danger' : limitedByOtherWindow ? 'warning' : row.status,
        }
      })
    }

    function quotaLimitingRow(rows, effectiveRemaining) {
      if (!rows.length) return null
      const order = { hour: 1, day: 2, month: 3 }
      const candidates = rows
        .filter((row) => row.remaining === effectiveRemaining)
        .sort((left, right) => (order[left.key] || 99) - (order[right.key] || 99))
      if (candidates.length) return candidates[0]
      return [...rows].sort((left, right) => left.remaining - right.remaining)[0]
    }

    function parseTime(value) {
      if (!value) return null
      const date = new Date(value)
      if (Number.isNaN(date.getTime())) return null
      return date
    }

    function startOfDay(date) {
      return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
    }

    function padTime(value) {
      return String(value).padStart(2, '0')
    }

    function formatTimeOnly(date) {
      return `${padTime(date.getHours())}:${padTime(date.getMinutes())}`
    }

    function formatRecoveryTime(date) {
      const now = new Date()
      const today = startOfDay(now)
      const target = startOfDay(date)
      const time = formatTimeOnly(date)
      if (target === today) return `今天 ${time}`
      if (target === today + 24 * 60 * 60 * 1000) return `明天 ${time}`
      const monthDay = `${date.getMonth() + 1}/${date.getDate()} ${time}`
      if (date.getFullYear() === now.getFullYear()) return monthDay
      return `${date.getFullYear()}/${monthDay}`
    }

    function quotaUsageLabel(value) {
      const label = String(value || '').trim()
      if (!label) return '周期额度'
      if (label.includes('额度')) return label
      return `${label}额度`
    }

    onMounted(loadDetails)
    watch(() => props.currentUser?.id || '', () => {
      taskPage.value = 1
      loadDetails()
    })

    return {
      loading,
      user,
      tasks,
      tasksPagination,
      successfulTasks,
      subscription,
      activeSubscription,
      accountIdText,
      memberPlanText,
      quotaLimitText,
      quotaUsedText,
      quotaRemainingText,
      effectiveQuotaRemainingText,
      quotaWindows,
      quotaUsageRows,
      quotaSummaryHint,
      taskPage,
      taskPageSize,
      passwordForm,
      passwordLoading,
      loadDetails,
      changeTaskPage,
      changeTaskPageBy,
      pageCount,
      paginationText,
      canPrev,
      canNext,
      submitPassword,
      resetPasswordForm,
      goChat,
      goHistory,
      openSubscribe,
      formatDate,
      taskStatusLabel,
      taskStatusClass,
    }
  },
  template: `
    <div class="profile-v2-page">
      <section v-if="!currentUser" class="auth-required-panel profile-v2-empty">
        <i class="ti ti-user-circle"></i>
        <strong>登录后进入用户中心</strong>
        <p>账户信息、会员状态和生成记录会跟随你的账号保存。</p>
        <button class="auth-required-button" type="button" @click="$emit('login')">去登录</button>
      </section>

      <template v-else>
        <main class="profile-v2-main">
          <header class="profile-v2-header">
            <div>
              <h2>账户总览</h2>
              <p>查看账户信息，管理设置，追踪你的创作活动。</p>
            </div>
            <button class="result-action" type="button" :disabled="loading" @click="loadDetails">
              <i :class="['ti', 'ti-refresh', { 'is-spinning': loading }]"></i>
              刷新
            </button>
          </header>

          <section id="profile-account-summary" v-loading="loading" class="profile-v2-summary">
            <article class="profile-v2-card profile-v2-identity">
              <span class="profile-v2-avatar">{{ user?.email?.slice(0, 1)?.toUpperCase() || 'U' }}</span>
              <div class="profile-v2-identity-copy">
                <div>
                  <strong>{{ user?.email }}</strong>
                </div>
                <p>ID：{{ accountIdText }}</p>
                <p>注册时间：{{ formatDate(user?.createdAt) }}</p>
              </div>
            </article>

            <article class="profile-v2-card profile-v2-metrics">
              <div class="profile-v2-metric">
                <span><i class="ti ti-crown"></i></span>
                <div>
                  <strong>{{ activeSubscription ? '已开通' : '免费版' }}</strong>
                  <small>{{ activeSubscription ? memberPlanText : '当前订阅状态' }}</small>
                </div>
              </div>
              <div class="profile-v2-metric">
                <span class="blue"><i class="ti ti-edit"></i></span>
                <div>
                  <strong>{{ successfulTasks }}</strong>
                  <small>最近记录中的成功任务</small>
                </div>
              </div>
              <div class="profile-v2-metric">
                <span class="blue"><i class="ti ti-clock"></i></span>
                <div>
                  <strong>{{ tasks.length }}</strong>
                  <small>最近记录中的生成任务</small>
                </div>
              </div>
            </article>
          </section>

          <section class="profile-v2-grid profile-v2-security-row">
            <article id="profile-security" class="profile-v2-card profile-v2-panel profile-v2-security profile-v2-security-wide">
              <header class="profile-v2-panel-head">
                <h3><i class="ti ti-shield-check"></i>安全设置</h3>
              </header>
              <el-form class="profile-v2-password-form" @submit.prevent>
                <div class="profile-v2-password-field">
                  <span class="profile-v2-password-label">当前密码</span>
                  <el-input v-model="passwordForm.oldPassword" type="password" show-password placeholder="请输入当前密码" aria-label="当前密码" />
                </div>
                <div class="profile-v2-password-field">
                  <span class="profile-v2-password-label">新密码</span>
                  <el-input v-model="passwordForm.password" type="password" show-password placeholder="至少 6 个字符" aria-label="新密码" />
                </div>
                <div class="profile-v2-password-field">
                  <span class="profile-v2-password-label">确认密码</span>
                  <el-input v-model="passwordForm.confirmPassword" type="password" show-password placeholder="再次输入新密码" aria-label="确认密码" />
                </div>
              </el-form>
              <div class="profile-v2-password-foot">
                <ul>
                  <li><i class="ti ti-circle-check-filled"></i>至少 6 个字符</li>
                  <li><i class="ti ti-circle-check-filled"></i>包含字母和数字</li>
                  <li><i class="ti ti-circle-check-filled"></i>区分大小写</li>
                </ul>
                <div>
                  <button class="result-action" type="button" @click="resetPasswordForm">清空</button>
                  <el-button class="profile-submit-btn" type="primary" :loading="passwordLoading" @click="submitPassword">更新密码</el-button>
                </div>
              </div>
            </article>

          </section>

          <section class="profile-v2-grid profile-v2-work-grid">
            <article id="profile-membership" :class="['profile-v2-card', 'profile-v2-panel', 'profile-v2-membership', { active: activeSubscription }]">
              <header class="profile-v2-panel-head">
                <h3><i class="ti ti-crown"></i>会员信息</h3>
                <span v-if="activeSubscription" class="profile-v2-member-badge">
                  <i class="ti ti-sparkles"></i>
                  订阅已生效
                </span>
              </header>
              <div :class="['profile-v2-plan-card', { active: activeSubscription }]">
                <div>
                  <span>{{ activeSubscription ? '当前订阅' : '当前套餐' }}</span>
                  <strong>{{ memberPlanText }}</strong>
                  <em v-if="activeSubscription" class="profile-v2-plan-status">
                    <i class="ti ti-crown"></i>
                    会员权益已启用
                  </em>
                  <em v-else class="profile-v2-plan-status">
                    <i class="ti ti-sparkles"></i>
                    免费额度可用
                  </em>
                </div>
                <button class="result-action profile-v2-subscribe-btn" type="button" @click="openSubscribe">{{ activeSubscription ? '续费会员' : '升级订阅' }}</button>
              </div>
              <div class="profile-v2-quota-card">
                <div class="profile-v2-quota-summary">
                  <div>
                    <span>{{ activeSubscription ? '本周期剩余' : '当前可用' }}</span>
                    <strong>{{ activeSubscription ? quotaRemainingText : effectiveQuotaRemainingText }}</strong>
                  </div>
                  <em>{{ quotaSummaryHint }}</em>
                </div>
                <div class="profile-v2-quota-bars">
                  <div v-for="row in quotaUsageRows" :key="row.key" :class="['profile-v2-quota-row', row.status]">
                    <div class="profile-v2-quota-row-head">
                      <span class="profile-v2-quota-row-title">
                        <span>{{ row.label }}</span>
                        <b v-if="row.limitNote">{{ row.limitNote }}</b>
                      </span>
                      <strong>{{ row.displayRemaining }} / {{ row.limit }} 张</strong>
                    </div>
                    <div class="profile-v2-quota-track">
                      <span :style="{ width: row.percent + '%' }"></span>
                    </div>
                    <div class="profile-v2-quota-row-foot">
                      <small>已用 {{ row.used }} 张<span v-if="row.remainingNote"> · {{ row.remainingNote }}</span></small>
                      <span v-if="row.resetText" class="profile-v2-quota-reset">
                        <i class="ti ti-clock"></i>
                        {{ activeSubscription ? '周期结束' : '恢复' }}：{{ row.resetText }}
                      </span>
                      <em>已用 {{ row.percentLabel }}</em>
                    </div>
                  </div>
                </div>
                <div class="profile-v2-quota-end">
                  <span>{{ activeSubscription ? '订阅到期' : '月度周期' }}</span>
                  <strong>{{ formatDate(subscription?.periodEndsAt || subscription?.expiresAt) }}</strong>
                </div>
              </div>
            </article>

            <article id="profile-tasks" class="profile-v2-card profile-v2-panel profile-v2-recent">
              <header class="profile-v2-panel-head">
                <h3><i class="ti ti-photo-spark"></i>最近生成</h3>
                <button class="profile-v2-link" type="button" @click="goHistory">查看全部</button>
              </header>
              <div v-if="tasks.length" class="profile-v2-task-list">
                <div v-for="task in tasks" :key="task.id" class="profile-v2-task-row">
                  <span :class="['profile-v2-task-status', taskStatusClass(task.status)]">{{ taskStatusLabel(task.status) }}</span>
                  <div>
                    <strong>{{ task.prompt || '图片生成任务' }}</strong>
                    <small>{{ task.modelDisplayName || task.modelName || '模型' }} · {{ formatDate(task.createdAt) }}</small>
                  </div>
                  <em>{{ task.quantity || 1 }} 张</em>
                </div>
              </div>
              <div v-else class="profile-v2-empty-box compact">
                <i class="ti ti-photo-off"></i>
                <span>暂无生成记录</span>
              </div>
              <div v-if="tasksPagination" class="profile-v2-pagination compact">
                <span>{{ paginationText(tasksPagination, taskPage, taskPageSize) }}</span>
                <div>
                  <button class="result-action" type="button" :disabled="!canPrev(taskPage)" @click="changeTaskPageBy(-1)">上一页</button>
                  <strong>{{ taskPage }} / {{ pageCount(tasksPagination, taskPageSize) }}</strong>
                  <button class="result-action" type="button" :disabled="!canNext(tasksPagination, taskPage, taskPageSize)" @click="changeTaskPageBy(1)">下一页</button>
                </div>
              </div>
            </article>
          </section>
        </main>
      </template>
    </div>
  `,
}
