import { clientApi } from '../common/api.js'
import { formatAmount, formatDate } from '../common/format.js'

const { computed, onMounted, reactive, ref, watch } = Vue

function creditLogLabel(type) {
  const labels = {
    recharge: '收入',
    deduct: '支出',
  }
  return labels[type] || type || '-'
}

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
  props: ['currentUser', 'creditName'],
  emits: ['login', 'user-updated', 'go'],
  setup(props, { emit }) {
    const loading = ref(false)
    const details = ref(null)
    const passwordLoading = ref(false)
    const apiKeys = ref([])
    const apiKeyLoading = ref(false)
    const newApiKey = ref(null)
    const apiKeyForm = reactive({ name: 'API Key' })
    const creditPage = ref(1)
    const taskPage = ref(1)
    const creditPageSize = 10
    const taskPageSize = 10
    const passwordForm = reactive({
      oldPassword: '',
      password: '',
      confirmPassword: '',
    })

    const user = computed(() => details.value?.user || props.currentUser || null)
    const creditLogs = computed(() => details.value?.creditLogs || [])
    const tasks = computed(() => details.value?.tasks || [])
    const creditLogsPagination = computed(() => details.value?.creditLogsPagination || null)
    const tasksPagination = computed(() => details.value?.tasksPagination || null)
    const successfulTasks = computed(() => tasks.value.filter((task) => task.status === 'success').length)
    const spentCredits = computed(() => tasks.value.reduce((total, task) => total + Number(task.costCredits || 0), 0))
    const subscription = computed(() => user.value?.subscription || null)
    const hasApiKey = computed(() => apiKeys.value.length > 0)

    async function loadApiKeys() {
      if (!props.currentUser?.id) {
        apiKeys.value = []
        return
      }
      apiKeyLoading.value = true
      try {
        const response = await clientApi.listApiKeys(props.currentUser.id)
        apiKeys.value = response.data || []
      } catch (error) {
        ElementPlus.ElMessage.error(error.message || 'API Key 加载失败')
      } finally {
        apiKeyLoading.value = false
      }
    }

    async function loadDetails() {
      if (!props.currentUser?.id) {
        details.value = null
        return
      }
      loading.value = true
      try {
        const response = await clientApi.getUserDetails(props.currentUser.id, {
          creditPage: creditPage.value,
          creditPageSize,
          taskPage: taskPage.value,
          taskPageSize,
        })
        details.value = response.data || null
        if (response.data?.user) emit('user-updated', response.data.user)
        await loadApiKeys()
      } catch (error) {
        ElementPlus.ElMessage.error(error.message || '账户明细加载失败')
      } finally {
        loading.value = false
      }
    }

    async function createApiKey() {
      if (!props.currentUser?.id) {
        emit('login')
        return
      }
      if (hasApiKey.value) {
        ElementPlus.ElMessage.warning('每个用户只允许生成一个 API Key')
        return
      }
      try {
        apiKeyLoading.value = true
        const response = await clientApi.createApiKey(props.currentUser.id, { name: apiKeyForm.name || 'API Key' })
        newApiKey.value = response.data
        apiKeyForm.name = 'API Key'
        await loadApiKeys()
        ElementPlus.ElMessage.success('API Key 已生成，请及时复制保存')
      } catch (error) {
        ElementPlus.ElMessage.error(error.message || 'API Key 创建失败')
      } finally {
        apiKeyLoading.value = false
      }
    }

    async function toggleApiKey(key) {
      if (!props.currentUser?.id) return
      try {
        const nextStatus = key.status === 'active' ? 'disabled' : 'active'
        await clientApi.updateApiKeyStatus(props.currentUser.id, key.id, { status: nextStatus })
        await loadApiKeys()
      } catch (error) {
        ElementPlus.ElMessage.error(error.message || 'API Key 更新失败')
      }
    }

    async function deleteApiKey(key) {
      if (!props.currentUser?.id) return
      try {
        await clientApi.deleteApiKey(props.currentUser.id, key.id)
        await loadApiKeys()
        ElementPlus.ElMessage.success('API Key 已删除')
      } catch (error) {
        if (/不存在|已删除|404/i.test(error.message || '')) {
          await loadApiKeys()
          ElementPlus.ElMessage.warning('API Key 已不存在，列表已刷新')
          return
        }
        ElementPlus.ElMessage.error(error.message || 'API Key 删除失败')
      }
    }

    async function copyText(value) {
      await navigator.clipboard?.writeText(value)
      ElementPlus.ElMessage.success('已复制')
    }

    function apiKeyValue(key) {
      return key?.keyPlain || `${key?.keyPrefix || ''}********（历史 Key 无法查看完整值，请重新生成）`
    }

    async function changeCreditPage(page) {
      creditPage.value = page
      await loadDetails()
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

    function changeCreditPageBy(delta) {
      const nextPage = Math.min(pageCount(creditLogsPagination.value, creditPageSize), Math.max(1, creditPage.value + delta))
      if (nextPage === creditPage.value) return
      changeCreditPage(nextPage)
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

    function scrollToApiKeys() {
      document.getElementById('profile-api-keys')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }

    onMounted(loadDetails)
    watch(() => props.currentUser?.id || '', () => {
      creditPage.value = 1
      taskPage.value = 1
      loadDetails()
    })

    return {
      loading,
      user,
      creditLogs,
      tasks,
      creditLogsPagination,
      tasksPagination,
      successfulTasks,
      spentCredits,
      subscription,
      apiKeys,
      hasApiKey,
      apiKeyLoading,
      newApiKey,
      apiKeyForm,
      creditPage,
      taskPage,
      creditPageSize,
      taskPageSize,
      passwordForm,
      passwordLoading,
      loadDetails,
      changeCreditPage,
      changeTaskPage,
      changeCreditPageBy,
      changeTaskPageBy,
      pageCount,
      paginationText,
      canPrev,
      canNext,
      submitPassword,
      resetPasswordForm,
      loadApiKeys,
      createApiKey,
      toggleApiKey,
      deleteApiKey,
      copyText,
      apiKeyValue,
      goChat,
      scrollToApiKeys,
      formatAmount,
      formatDate,
      creditLogLabel,
      taskStatusLabel,
      taskStatusClass,
    }
  },
  template: `
    <div class="page-stack profile-page">
      <section class="profile-hero">
        <div>
          <span class="eyebrow">Account</span>
          <h2>用户中心</h2>
          <p>查看账户余额、额度明细、最近生成记录，并维护登录密码。</p>
        </div>
        <div class="profile-hero-actions">
          <button class="result-action" type="button" @click="loadDetails">
            <i class="ti ti-refresh"></i>
            刷新
          </button>
          <button class="result-action" type="button" @click="scrollToApiKeys">
            <i class="ti ti-key"></i>
            接口 Key
          </button>
          <button class="result-action primary" type="button" @click="goChat">
            <i class="ti ti-wand"></i>
            去创作
          </button>
        </div>
      </section>

      <section v-if="!currentUser" class="profile-empty">
        <i class="ti ti-user-circle"></i>
        <strong>登录后进入用户中心</strong>
        <p>账户明细、余额和密码设置会跟随你的账号保存。</p>
        <button class="result-action primary" type="button" @click="$emit('login')">去登录</button>
      </section>

      <template v-else>
        <section v-loading="loading" class="profile-overview">
          <article class="profile-account-card">
            <div class="profile-avatar">{{ user?.email?.slice(0, 1)?.toUpperCase() || 'U' }}</div>
            <div class="profile-account-copy">
              <span>当前账号</span>
              <strong>{{ user?.email }}</strong>
              <small>{{ user?.emailVerifiedAt ? '邮箱已验证' : '邮箱未验证' }} · {{ user?.status === 'active' ? '账号正常' : '账号已停用' }}</small>
            </div>
          </article>
          <article class="profile-stat-card primary">
            <span>{{ creditName || '积分' }}余额</span>
            <strong>{{ formatAmount(user?.credits) }}</strong>
            <small>可用于图片生成与编辑</small>
          </article>
          <article class="profile-stat-card">
            <span>最近成功</span>
            <strong>{{ successfulTasks }}</strong>
            <small>最近记录中的成功任务</small>
          </article>
          <article class="profile-stat-card">
            <span>最近消耗</span>
            <strong>{{ formatAmount(spentCredits) }}</strong>
            <small>{{ creditName || '积分' }}扣费汇总</small>
          </article>
        </section>

        <section id="profile-api-keys" class="profile-grid profile-api-grid">
          <article class="profile-panel profile-api-keys">
            <header class="profile-panel-head">
              <div>
                <span>API Keys</span>
                <h3>接口 Key</h3>
              </div>
              <button class="result-action" type="button" :disabled="apiKeyLoading" @click="loadApiKeys">
                <i class="ti ti-refresh"></i>
                刷新
              </button>
            </header>
            <p class="profile-panel-desc">用于调用 /v1 图片生成、图片编辑和聊天接口，消耗当前账号{{ creditName || '积分' }}。每个用户只允许生成一个 Key。</p>
            <div class="api-key-endpoints">
              <span><i class="ti ti-database-search"></i> GET /v1/models</span>
              <span><i class="ti ti-photo-plus"></i> POST /v1/images/generations</span>
              <span><i class="ti ti-photo-edit"></i> POST /v1/images/edits</span>
              <span><i class="ti ti-message-2"></i> POST /v1/chat/completions</span>
            </div>
            <div v-if="newApiKey?.key" class="api-key-secret">
              <span>新 Key 只显示一次</span>
              <code>{{ newApiKey.key }}</code>
              <button class="result-action primary" type="button" @click="copyText(newApiKey.key)">
                <i class="ti ti-copy"></i>
                复制
              </button>
            </div>
            <div v-if="!hasApiKey" class="api-key-create">
              <el-input v-model="apiKeyForm.name" placeholder="Key 名称" />
              <button class="result-action primary" type="button" :disabled="apiKeyLoading" @click="createApiKey">
                <i class="ti ti-plus"></i>
                生成 Key
              </button>
            </div>
            <div v-else class="api-key-limit-note">
              <i class="ti ti-info-circle"></i>
              当前账号已生成 API Key，如需更换请先删除旧 Key。
            </div>
            <div v-loading="apiKeyLoading" class="api-key-list">
              <div v-if="!apiKeys.length" class="profile-mini-empty">暂无 API Key</div>
              <article v-for="key in apiKeys" :key="key.id" class="api-key-row">
                <div>
                  <strong>{{ key.name }}</strong>
                  <span :class="['api-key-status', key.status === 'active' ? 'active' : 'disabled']">{{ key.status === 'active' ? '启用' : '停用' }}</span>
                  <code :class="['api-key-full-value', { muted: !key.keyPlain }]">{{ apiKeyValue(key) }}</code>
                  <small>创建 {{ formatDate(key.createdAt) }} · 最近使用 {{ key.lastUsedAt ? formatDate(key.lastUsedAt) : '暂无' }}</small>
                </div>
                <div class="api-key-actions">
                  <button v-if="key.keyPlain" class="result-action" type="button" @click="copyText(key.keyPlain)">
                    <i class="ti ti-copy"></i>
                    复制
                  </button>
                  <button class="result-action" type="button" @click="toggleApiKey(key)">{{ key.status === 'active' ? '停用' : '启用' }}</button>
                  <button class="result-action danger" type="button" @click="deleteApiKey(key)">删除</button>
                </div>
              </article>
            </div>
          </article>
        </section>

        <section class="profile-grid">
          <article class="profile-panel profile-security">
            <header class="profile-panel-head">
              <div>
                <span>Security</span>
                <h3>修改密码</h3>
              </div>
              <i class="ti ti-shield-lock"></i>
            </header>
            <el-form class="profile-password-form" label-position="top" @submit.prevent>
              <el-form-item label="当前密码">
                <el-input v-model="passwordForm.oldPassword" type="password" show-password placeholder="请输入当前密码">
                  <template #prefix><i class="ti ti-lock"></i></template>
                </el-input>
              </el-form-item>
              <el-form-item label="新密码">
                <el-input v-model="passwordForm.password" type="password" show-password placeholder="至少 6 个字符">
                  <template #prefix><i class="ti ti-key"></i></template>
                </el-input>
              </el-form-item>
              <el-form-item label="确认新密码">
                <el-input v-model="passwordForm.confirmPassword" type="password" show-password placeholder="请再次输入新密码">
                  <template #prefix><i class="ti ti-shield-check"></i></template>
                </el-input>
              </el-form-item>
            </el-form>
            <div class="profile-form-actions">
              <button class="result-action" type="button" @click="resetPasswordForm">清空</button>
              <el-button class="profile-submit-btn" type="primary" :loading="passwordLoading" @click="submitPassword">
                <i class="ti ti-device-floppy"></i>
                保存密码
              </el-button>
            </div>
          </article>

          <article class="profile-panel profile-membership">
            <header class="profile-panel-head">
              <div>
                <span>Membership</span>
                <h3>会员信息</h3>
              </div>
              <i class="ti ti-crown"></i>
            </header>
            <div class="profile-membership-body">
              <div :class="['profile-membership-badge', { active: subscription?.status === 'active' }]">
                <i :class="['ti', subscription?.status === 'active' ? 'ti-shield-check' : 'ti-shield-plus']"></i>
                <div>
                  <span>{{ subscription?.status === 'active' ? '会员已开通' : '普通用户' }}</span>
                  <strong>{{ subscription?.planName || '暂无订阅套餐' }}</strong>
                </div>
              </div>
              <dl>
                <div>
                  <dt>折扣</dt>
                  <dd>{{ subscription?.discountPercent ? subscription.discountPercent + '%' : '-' }}</dd>
                </div>
                <div>
                  <dt>到期时间</dt>
                  <dd>{{ formatDate(subscription?.expiresAt) }}</dd>
                </div>
                <div>
                  <dt>注册时间</dt>
                  <dd>{{ formatDate(user?.createdAt) }}</dd>
                </div>
              </dl>
            </div>
          </article>
        </section>

        <section class="profile-grid profile-detail-grid">
          <article class="profile-panel">
            <header class="profile-panel-head">
              <div>
                <span>Credits</span>
                <h3>{{ creditName || '积分' }}明细</h3>
              </div>
              <i class="ti ti-coins"></i>
            </header>
            <div v-if="creditLogs.length" class="profile-log-list">
              <div v-for="log in creditLogs" :key="log.id" class="profile-log-row">
                <span :class="['profile-log-type', log.type]">{{ creditLogLabel(log.type) }}</span>
                <div>
                  <strong>{{ log.remark || creditLogLabel(log.type) }}</strong>
                  <small>{{ formatDate(log.createdAt) }}</small>
                </div>
                <em :class="log.type === 'deduct' ? 'negative' : 'positive'">
                  {{ log.type === 'deduct' ? '-' : '+' }}{{ formatAmount(log.amount) }}
                </em>
                <small class="profile-log-balance">余额 {{ formatAmount(log.balanceAfter) }}</small>
              </div>
            </div>
            <div v-else class="profile-mini-empty">暂无{{ creditName || '积分' }}明细</div>
            <div v-if="creditLogsPagination" class="profile-pagination">
              <span>{{ paginationText(creditLogsPagination, creditPage, creditPageSize) }}</span>
              <div>
                <button class="result-action" type="button" :disabled="!canPrev(creditPage)" @click="changeCreditPageBy(-1)">
                  <i class="ti ti-chevron-left"></i>
                  上一页
                </button>
                <strong>{{ creditPage }} / {{ pageCount(creditLogsPagination, creditPageSize) }}</strong>
                <button class="result-action" type="button" :disabled="!canNext(creditLogsPagination, creditPage, creditPageSize)" @click="changeCreditPageBy(1)">
                  下一页
                  <i class="ti ti-chevron-right"></i>
                </button>
              </div>
            </div>
          </article>

          <article class="profile-panel">
            <header class="profile-panel-head">
              <div>
                <span>Tasks</span>
                <h3>最近生成</h3>
              </div>
              <i class="ti ti-photo-spark"></i>
            </header>
            <div v-if="tasks.length" class="profile-task-list">
              <div v-for="task in tasks" :key="task.id" class="profile-task-row">
                <span :class="['profile-task-status', taskStatusClass(task.status)]">{{ taskStatusLabel(task.status) }}</span>
                <div>
                  <strong>{{ task.prompt || '图片生成任务' }}</strong>
                  <small>{{ task.modelDisplayName || task.modelName || '模型' }} · {{ formatDate(task.createdAt) }}</small>
                </div>
                <em>{{ formatAmount(task.costCredits) }} {{ creditName || '积分' }}</em>
              </div>
            </div>
            <div v-else class="profile-mini-empty">暂无生成记录</div>
            <div v-if="tasksPagination" class="profile-pagination">
              <span>{{ paginationText(tasksPagination, taskPage, taskPageSize) }}</span>
              <div>
                <button class="result-action" type="button" :disabled="!canPrev(taskPage)" @click="changeTaskPageBy(-1)">
                  <i class="ti ti-chevron-left"></i>
                  上一页
                </button>
                <strong>{{ taskPage }} / {{ pageCount(tasksPagination, taskPageSize) }}</strong>
                <button class="result-action" type="button" :disabled="!canNext(tasksPagination, taskPage, taskPageSize)" @click="changeTaskPageBy(1)">
                  下一页
                  <i class="ti ti-chevron-right"></i>
                </button>
              </div>
            </div>
          </article>
        </section>
      </template>
    </div>
  `,
}
