import { adminApi } from '../api.js?v=20260710-shanghai-tz-v1'
import { amount, formatDate, statusItem, text } from '../format.js?v=20260710-shanghai-tz-v1'

const { computed, onMounted, reactive, ref, watch } = Vue
const { message, Modal } = antd

export const UsersPage = {
  setup() {
    const rows = ref([])
    const loading = ref(false)
    const query = ref('')
    const role = ref('all')
    const status = ref('all')
    const page = ref(1)
    const pageSize = 12
    const editVisible = ref(false)
    const editing = ref(null)
    const form = reactive({ email: '', password: '', role: 'user', status: 'active' })
    const detailVisible = ref(false)
    const detailUser = ref(null)
    const detailLoading = ref(false)
    const detailData = ref(null)
    const activityRanking = ref([])
    const activityLoading = ref(false)
    const activityDays = ref(7)
    const subscriptionPlans = ref([])
    const subscriptionVisible = ref(false)
    const subscriptionUser = ref(null)
    const subscriptionSaving = ref(false)
    const subscriptionForm = reactive({ planId: '' })

    async function load() {
      loading.value = true
      try {
        const response = await adminApi.listUsers()
        rows.value = response.data || []
      } catch (error) {
        message.error(error instanceof Error ? error.message : '加载用户失败')
      } finally {
        loading.value = false
      }
    }

    async function loadActivityRanking() {
      activityLoading.value = true
      try {
        const response = await adminApi.listUserActivityRanking({ days: activityDays.value, limit: 10 })
        activityRanking.value = response.data || []
      } catch (error) {
        message.error(error instanceof Error ? error.message : '加载活跃排名失败')
      } finally {
        activityLoading.value = false
      }
    }

    async function loadSubscriptionPlans() {
      try {
        const response = await adminApi.listSubscriptionPlans()
        subscriptionPlans.value = (response.data || []).filter((plan) => plan.status === 'active')
      } catch (error) {
        subscriptionPlans.value = []
        message.error(error instanceof Error ? error.message : '加载订阅套餐失败')
      }
    }

    const filteredRows = computed(() => {
      const keyword = query.value.trim().toLowerCase()
      return rows.value.filter((row) => {
        const matchesKeyword = !keyword || String(row.email || '').toLowerCase().includes(keyword)
        const matchesRole = role.value === 'all' || row.role === role.value
        const matchesStatus = status.value === 'all' || row.status === status.value
        return matchesKeyword && matchesRole && matchesStatus
      })
    })
    const visibleRows = computed(() => filteredRows.value.slice((page.value - 1) * pageSize, page.value * pageSize))
    const summary = computed(() => ({
      total: rows.value.length,
      active: rows.value.filter((row) => row.status === 'active').length,
      disabled: rows.value.filter((row) => row.status === 'disabled').length,
      admins: rows.value.filter((row) => row.role === 'admin').length,
      subscribed: rows.value.filter((row) => row.subscription?.status === 'active').length,
    }))
    const activitySummary = computed(() => ({
      users: activityRanking.value.length,
      tasks: activityRanking.value.reduce((sum, row) => sum + Number(row.taskCount || 0), 0),
      successTasks: activityRanking.value.reduce((sum, row) => sum + Number(row.successTasks || 0), 0),
      images: activityRanking.value.reduce((sum, row) => sum + Number(row.successImages || 0), 0),
    }))
    const subscriptionPlanOptions = computed(() => subscriptionPlans.value.map((plan) => ({
      label: `${plan.name} / ${plan.durationDays} 天 / ${amount(plan.quotaImages || 0)} 张`,
      value: plan.id,
      searchText: `${plan.name || ''} ${plan.description || ''}`,
    })))

    watch([query, role, status], () => { page.value = 1 })
    watch(activityDays, loadActivityRanking)

    function resetFilters() {
      query.value = ''
      role.value = 'all'
      status.value = 'all'
    }

    function openCreate() {
      editing.value = null
      Object.assign(form, { email: '', password: '', role: 'user', status: 'active' })
      editVisible.value = true
    }

    function openEdit(row) {
      editing.value = row
      Object.assign(form, { email: row.email || '', password: '', role: row.role || 'user', status: row.status || 'active' })
      editVisible.value = true
    }

    async function saveUser() {
      try {
        const input = { email: form.email, role: form.role, status: form.status }
        if (form.password) input.password = form.password
        if (editing.value) await adminApi.updateUser(editing.value.id, input)
        else await adminApi.createUser(input)
        message.success('保存成功')
        editVisible.value = false
        await load()
      } catch (error) {
        message.error(error instanceof Error ? error.message : '保存失败')
      }
    }

    function deleteUser(row) {
      Modal.confirm({
        title: '删除用户',
        content: `确定删除 ${row.email} 吗？`,
        okText: '删除',
        okType: 'danger',
        cancelText: '取消',
        async onOk() {
          await adminApi.deleteUser(row.id)
          message.success('删除成功')
          await load()
        },
      })
    }

    async function openDetails(row) {
      detailUser.value = row
      detailData.value = null
      detailVisible.value = true
      detailLoading.value = true
      try {
        const response = await adminApi.getUserDetails(row.id)
        detailData.value = response.data || {}
      } catch (error) {
        message.error(error instanceof Error ? error.message : '加载明细失败')
      } finally {
        detailLoading.value = false
      }
    }

    async function openGrantSubscription(row) {
      subscriptionUser.value = row
      subscriptionForm.planId = subscriptionPlans.value[0]?.id || ''
      subscriptionVisible.value = true
      if (!subscriptionPlans.value.length) {
        await loadSubscriptionPlans()
        subscriptionForm.planId = subscriptionPlans.value[0]?.id || ''
      }
    }

    async function saveSubscription() {
      if (!subscriptionUser.value?.id) {
        message.warning('请选择用户')
        return
      }
      if (!subscriptionForm.planId) {
        message.warning('请选择订阅套餐')
        return
      }
      subscriptionSaving.value = true
      try {
        await adminApi.grantUserSubscription(subscriptionUser.value.id, { planId: subscriptionForm.planId })
        message.success('订阅已开通')
        subscriptionVisible.value = false
        await load()
        if (detailVisible.value && detailUser.value?.id === subscriptionUser.value.id) {
          await openDetails(subscriptionUser.value)
        }
      } catch (error) {
        message.error(error instanceof Error ? error.message : '开通订阅失败')
      } finally {
        subscriptionSaving.value = false
      }
    }

    function subscriptionLabel(row) {
      const subscription = row?.subscription
      if (!subscription || subscription.status !== 'active') return '未订阅'
      return subscription.planName || '会员'
    }

    function subscriptionColor(row) {
      return row?.subscription?.status === 'active' ? 'gold' : 'default'
    }

    function subscriptionExpireText(row) {
      const subscription = row?.subscription
      if (!subscription || subscription.status !== 'active') return '-'
      return formatDate(subscription.expiresAt)
    }

    onMounted(() => {
      load()
      loadActivityRanking()
      loadSubscriptionPlans()
    })
    return {
      rows, loading, query, role, status, page, pageSize, editVisible, editing, form,
      detailVisible, detailUser, detailLoading, detailData, activityRanking, activityLoading, activityDays, activitySummary, subscriptionPlans, subscriptionVisible, subscriptionUser, subscriptionSaving, subscriptionForm, subscriptionPlanOptions, filteredRows, visibleRows, summary, load, loadActivityRanking, loadSubscriptionPlans, resetFilters, openCreate,
      openEdit, saveUser, deleteUser, openDetails, openGrantSubscription, saveSubscription, subscriptionLabel, subscriptionColor, subscriptionExpireText,
      amount, formatDate, statusItem, text,
    }
  },
  template: `
    <div class="page-stack">
      <a-card class="admin-view-card" :bordered="false">
        <div class="admin-card-hero">
          <div>
            <div class="page-kicker">User Center</div>
            <div class="page-title">用户管理</div>
            <div class="page-desc">统一维护账户、权限、状态和订阅。</div>
          </div>
          <div class="toolbar">
            <a-button :loading="loading" @click="load">刷新</a-button>
            <a-button type="primary" @click="openCreate">新增用户</a-button>
          </div>
        </div>
        <div class="summary-grid">
          <div class="summary-card"><span>用户总数</span><b>{{ summary.total }}</b><div class="muted">管理员 {{ summary.admins }} 人</div></div>
          <div class="summary-card"><span>启用账号</span><b>{{ summary.active }}</b><div class="muted">可正常使用前台</div></div>
          <div class="summary-card"><span>禁用账号</span><b>{{ summary.disabled }}</b><div class="muted">已限制登录使用</div></div>
          <div class="summary-card"><span>订阅用户</span><b>{{ summary.subscribed }}</b><div class="muted">当前有效会员</div></div>
        </div>
        <div class="page-panel user-activity-panel">
          <div class="user-activity-header">
            <div class="user-activity-title">
              <div class="page-title" style="font-size:16px">用户活跃排名</div>
              <div class="page-desc">按最近生图活跃度排序，综合任务数、成功产出和最近活跃时间。</div>
            </div>
            <div class="user-activity-actions">
              <a-segmented v-model:value="activityDays" :options="[{ label: '近 7 天', value: 7 }, { label: '近 30 天', value: 30 }]" />
              <a-button :loading="activityLoading" @click="loadActivityRanking">刷新排名</a-button>
            </div>
          </div>
          <div class="user-activity-metrics">
            <div class="activity-metric activity-metric-main">
              <span>上榜用户</span>
              <strong>{{ activitySummary.users }}</strong>
              <small>窗口内有生图行为</small>
            </div>
            <div class="activity-metric">
              <span>任务总数</span>
              <strong>{{ amount(activitySummary.tasks) }}</strong>
              <small>最近窗口内</small>
            </div>
            <div class="activity-metric">
              <span>成功任务</span>
              <strong>{{ amount(activitySummary.successTasks) }}</strong>
              <small>生成成功任务数</small>
            </div>
            <div class="activity-metric">
              <span>成功图片</span>
              <strong>{{ amount(activitySummary.images) }}</strong>
              <small>实际产出图片数</small>
            </div>
          </div>
          <div class="user-activity-table-wrap">
            <table class="data-table user-activity-table">
              <thead><tr><th>排名</th><th>用户</th><th>状态</th><th>任务</th><th>成功任务</th><th>成功图数</th><th>最近活跃</th></tr></thead>
              <tbody>
                <tr v-for="row in activityRanking" :key="row.userId">
                  <td><strong>#{{ row.rank }}</strong></td>
                  <td>{{ text(row.userEmail) }}</td>
                  <td><a-tag :color="statusItem('user', row.userStatus).color">{{ statusItem('user', row.userStatus).label }}</a-tag></td>
                  <td>{{ amount(row.taskCount) }}</td>
                  <td>{{ amount(row.successTasks) }}</td>
                  <td>{{ amount(row.successImages) }}</td>
                  <td>{{ row.lastActiveAt ? formatDate(row.lastActiveAt) : '-' }}</td>
                </tr>
                <tr v-if="!activityLoading && !activityRanking.length"><td colspan="7" class="muted" style="text-align:center;padding:24px">暂无活跃数据</td></tr>
              </tbody>
            </table>
          </div>
        </div>
        <div class="filter-row">
          <a-input v-model:value="query" allow-clear placeholder="搜索邮箱" style="width: 260px" />
          <a-select v-model:value="role" style="width: 130px">
            <a-select-option value="all">全部角色</a-select-option>
            <a-select-option value="user">用户</a-select-option>
            <a-select-option value="admin">管理员</a-select-option>
          </a-select>
          <a-select v-model:value="status" style="width: 130px">
            <a-select-option value="all">全部状态</a-select-option>
            <a-select-option value="active">启用</a-select-option>
            <a-select-option value="disabled">禁用</a-select-option>
          </a-select>
          <a-button @click="resetFilters">重置</a-button>
          <a-tag class="filter-count-tag" color="blue">筛选 {{ filteredRows.length }} 条</a-tag>
        </div>
      </a-card>

      <a-card class="admin-view-card" :bordered="false">
        <template #title>用户列表</template>
        <a-spin :spinning="loading">
          <div class="data-table-wrap">
            <table class="data-table">
              <thead><tr><th>用户</th><th>角色</th><th>状态</th><th>订阅</th><th>邮箱验证</th><th>创建时间</th><th>操作</th></tr></thead>
              <tbody>
                <tr v-for="row in visibleRows" :key="row.id">
                  <td>{{ text(row.email) }}</td>
                  <td><a-tag :color="statusItem('role', row.role).color">{{ statusItem('role', row.role).label }}</a-tag></td>
                  <td><a-tag :color="statusItem('user', row.status).color">{{ statusItem('user', row.status).label }}</a-tag></td>
                  <td>
                    <a-tooltip :title="subscriptionExpireText(row)">
                      <a-tag :color="subscriptionColor(row)">{{ subscriptionLabel(row) }}</a-tag>
                    </a-tooltip>
                  </td>
                  <td><a-tag :color="row.emailVerifiedAt ? 'green' : 'red'">{{ row.emailVerifiedAt ? '已验证' : '未验证' }}</a-tag></td>
                  <td>{{ formatDate(row.createdAt) }}</td>
                  <td>
                    <div class="table-actions">
                      <a-button type="link" size="small" @click="openEdit(row)">编辑</a-button>
                      <a-button type="link" size="small" @click="openDetails(row)">明细</a-button>
                      <a-button type="link" size="small" @click="openGrantSubscription(row)">订阅</a-button>
                      <a-button type="link" size="small" danger @click="deleteUser(row)">删除</a-button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </a-spin>
        <div class="pagination-row"><a-pagination v-model:current="page" size="small" :page-size="pageSize" :total="filteredRows.length" /></div>
      </a-card>

      <a-drawer
        v-model:open="editVisible"
        :title="editing ? '编辑用户' : '新增用户'"
        width="min(92vw, 720px)"
        class="admin-edit-drawer"
        destroy-on-close
      >
        <div class="form-grid drawer-form-grid">
          <label><div class="muted">邮箱</div><a-input v-model:value="form.email" /></label>
          <label><div class="muted">{{ editing ? '新密码' : '密码' }}</div><a-input-password v-model:value="form.password" /></label>
          <label><div class="muted">角色</div><a-select v-model:value="form.role" style="width:100%"><a-select-option value="user">用户</a-select-option><a-select-option value="admin">管理员</a-select-option></a-select></label>
          <label><div class="muted">状态</div><a-select v-model:value="form.status" style="width:100%"><a-select-option value="active">启用</a-select-option><a-select-option value="disabled">禁用</a-select-option></a-select></label>
        </div>
        <template #footer>
          <div class="drawer-footer-actions">
            <a-button @click="editVisible = false">取消</a-button>
            <a-button type="primary" @click="saveUser">保存</a-button>
          </div>
        </template>
      </a-drawer>

      <a-drawer
        v-model:open="subscriptionVisible"
        :title="'开通订阅 - ' + (subscriptionUser?.email || '')"
        width="min(92vw, 560px)"
        class="admin-edit-drawer"
        destroy-on-close
      >
        <div class="form-grid drawer-form-grid">
          <label>
            <div class="muted">当前订阅</div>
            <a-input :value="subscriptionLabel(subscriptionUser)" disabled />
          </label>
          <label>
            <div class="muted">当前到期时间</div>
            <a-input :value="subscriptionExpireText(subscriptionUser)" disabled />
          </label>
          <label style="grid-column: 1 / -1">
            <div class="muted">选择订阅套餐</div>
            <a-select
              v-model:value="subscriptionForm.planId"
              show-search
              allow-clear
              option-filter-prop="searchText"
              placeholder="请选择要开通或追加的订阅套餐"
              style="width:100%"
            >
              <a-select-option v-for="plan in subscriptionPlanOptions" :key="plan.value" :value="plan.value" :label="plan.label" :search-text="plan.searchText">{{ plan.label }}</a-select-option>
            </a-select>
          </label>
        </div>
        <div class="page-desc" style="margin-top:14px">
          保存后会按套餐有效期追加订阅；如果用户当前订阅未过期，会从现有到期时间继续延长。
        </div>
        <template #footer>
          <div class="drawer-footer-actions">
            <a-button @click="subscriptionVisible = false">取消</a-button>
            <a-button type="primary" :loading="subscriptionSaving" @click="saveSubscription">开通订阅</a-button>
          </div>
        </template>
      </a-drawer>

      <a-drawer v-model:open="detailVisible" :title="(detailUser?.email || '') + ' 明细'" width="min(96vw, 1080px)">
        <a-spin :spinning="detailLoading">
          <section class="page-panel" style="margin-bottom:16px">
            <div class="page-hero">
              <div><div class="page-title" style="font-size:16px">订阅状态</div></div>
              <a-button type="primary" @click="openGrantSubscription(detailData?.user || detailUser)">开通订阅</a-button>
            </div>
            <div class="summary-grid" style="padding:16px">
              <div class="summary-card"><span>当前套餐</span><b style="font-size:18px">{{ subscriptionLabel(detailData?.user || detailUser) }}</b></div>
              <div class="summary-card"><span>到期时间</span><b style="font-size:18px">{{ subscriptionExpireText(detailData?.user || detailUser) }}</b></div>
            </div>
          </section>
          <section class="page-panel">
            <div class="page-hero"><div><div class="page-title" style="font-size:16px">最近任务</div></div></div>
            <div class="data-table-wrap">
              <table class="data-table">
                <thead><tr><th>模型</th><th>状态</th><th>数量</th><th>时间</th></tr></thead>
                <tbody><tr v-for="row in (detailData?.tasks || []).slice(0, 20)" :key="row.id"><td>{{ row.modelDisplayName || row.modelName || row.modelId }}</td><td><a-tag :color="statusItem('task', row.status).color">{{ statusItem('task', row.status).label }}</a-tag></td><td>{{ row.quantity || 1 }}</td><td>{{ formatDate(row.createdAt) }}</td></tr></tbody>
              </table>
            </div>
          </section>
        </a-spin>
      </a-drawer>
    </div>
  `,
}
