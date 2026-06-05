import { adminApi } from '../api.js'
import { amount, creditLogTypeItem, formatDate, statusItem, text, toNumber } from '../format.js'

const { computed, onBeforeUnmount, onMounted, reactive, ref, watch } = Vue
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
    const rechargeVisible = ref(false)
    const rechargeUser = ref(null)
    const rechargeForm = reactive({ amount: '', remark: '后台额度调整' })
    const detailVisible = ref(false)
    const detailUser = ref(null)
    const detailLoading = ref(false)
    const detailData = ref(null)

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
      credits: rows.value.reduce((sum, row) => sum + Number(row.credits || 0), 0),
    }))

    watch([query, role, status], () => { page.value = 1 })

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

    function openRecharge(row) {
      rechargeUser.value = row
      Object.assign(rechargeForm, { amount: '', remark: '后台额度调整' })
      rechargeVisible.value = true
    }

    async function submitRecharge() {
      if (!rechargeUser.value) return
      try {
        await adminApi.rechargeUser(rechargeUser.value.id, { amount: toNumber(rechargeForm.amount), remark: rechargeForm.remark })
        message.success('调整成功')
        rechargeVisible.value = false
        await load()
      } catch (error) {
        message.error(error instanceof Error ? error.message : '调整失败')
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

    function handleAutoRefresh() {
      if (editVisible.value || rechargeVisible.value || detailVisible.value) return
      load()
    }

    onMounted(() => {
      load()
      window.addEventListener('admin:auto-refresh', handleAutoRefresh)
    })
    onBeforeUnmount(() => {
      window.removeEventListener('admin:auto-refresh', handleAutoRefresh)
    })
    return {
      rows, loading, query, role, status, page, pageSize, editVisible, editing, form, rechargeVisible, rechargeUser, rechargeForm,
      detailVisible, detailUser, detailLoading, detailData, filteredRows, visibleRows, summary, load, resetFilters, openCreate,
      openEdit, saveUser, openRecharge, submitRecharge, deleteUser, openDetails, subscriptionLabel, subscriptionColor, subscriptionExpireText,
      amount, formatDate, statusItem, text, toNumber, creditLogTypeItem,
    }
  },
  template: `
    <div class="page-stack">
      <a-card class="admin-view-card" :bordered="false">
        <div class="admin-card-hero">
          <div>
            <div class="page-kicker">User Center</div>
            <div class="page-title">用户管理</div>
            <div class="page-desc">统一维护账户、权限、状态和额度。</div>
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
          <div class="summary-card"><span>余额合计</span><b>{{ amount(summary.credits) }}</b><div class="muted">全量用户统计</div></div>
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
              <thead><tr><th>用户</th><th>角色</th><th>状态</th><th>订阅</th><th>余额</th><th>邮箱验证</th><th>创建时间</th><th>操作</th></tr></thead>
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
                  <td>{{ amount(row.credits) }}</td>
                  <td><a-tag :color="row.emailVerifiedAt ? 'green' : 'red'">{{ row.emailVerifiedAt ? '已验证' : '未验证' }}</a-tag></td>
                  <td>{{ formatDate(row.createdAt) }}</td>
                  <td>
                    <div class="table-actions">
                      <a-button type="link" size="small" @click="openEdit(row)">编辑</a-button>
                      <a-button type="link" size="small" @click="openRecharge(row)">充值</a-button>
                      <a-button type="link" size="small" @click="openDetails(row)">明细</a-button>
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

      <a-modal v-model:open="editVisible" :title="editing ? '编辑用户' : '新增用户'" width="720px" @ok="saveUser">
        <div class="form-grid">
          <label><div class="muted">邮箱</div><a-input v-model:value="form.email" /></label>
          <label><div class="muted">{{ editing ? '新密码' : '密码' }}</div><a-input-password v-model:value="form.password" /></label>
          <label><div class="muted">角色</div><a-select v-model:value="form.role" style="width:100%"><a-select-option value="user">用户</a-select-option><a-select-option value="admin">管理员</a-select-option></a-select></label>
          <label><div class="muted">状态</div><a-select v-model:value="form.status" style="width:100%"><a-select-option value="active">启用</a-select-option><a-select-option value="disabled">禁用</a-select-option></a-select></label>
        </div>
      </a-modal>

      <a-modal v-model:open="rechargeVisible" title="额度调整" width="720px" @ok="submitRecharge">
        <div class="summary-grid" style="padding:0 0 16px">
          <div class="summary-card"><span>用户</span><b style="font-size:16px">{{ rechargeUser?.email || '-' }}</b></div>
          <div class="summary-card"><span>当前余额</span><b>{{ amount(rechargeUser?.credits) }}</b></div>
          <div class="summary-card"><span>调整后</span><b>{{ amount(Number(rechargeUser?.credits || 0) + toNumber(rechargeForm.amount)) }}</b></div>
        </div>
        <div class="form-grid">
          <label><div class="muted">调整额度</div><a-input v-model:value="rechargeForm.amount" type="number" /></label>
          <label><div class="muted">备注</div><a-input v-model:value="rechargeForm.remark" /></label>
        </div>
      </a-modal>

      <a-drawer v-model:open="detailVisible" :title="(detailUser?.email || '') + ' 明细'" width="min(96vw, 1080px)">
        <a-spin :spinning="detailLoading">
          <section class="page-panel" style="margin-bottom:16px">
            <div class="page-hero"><div><div class="page-title" style="font-size:16px">订阅状态</div></div></div>
            <div class="summary-grid" style="padding:16px">
              <div class="summary-card"><span>当前套餐</span><b style="font-size:18px">{{ subscriptionLabel(detailData?.user || detailUser) }}</b></div>
              <div class="summary-card"><span>到期时间</span><b style="font-size:18px">{{ subscriptionExpireText(detailData?.user || detailUser) }}</b></div>
            </div>
          </section>
          <section class="page-panel" style="margin-bottom:16px">
            <div class="page-hero"><div><div class="page-title" style="font-size:16px">额度流水</div></div></div>
            <div class="data-table-wrap">
              <table class="data-table">
                <thead><tr><th>类型</th><th>金额</th><th>余额</th><th>备注</th><th>时间</th></tr></thead>
                <tbody><tr v-for="row in (detailData?.creditLogs || []).slice(0, 20)" :key="row.id"><td><a-tag :color="creditLogTypeItem(row.type).color">{{ creditLogTypeItem(row.type).label }}</a-tag></td><td>{{ amount(row.amount) }}</td><td>{{ amount(row.balanceAfter) }}</td><td>{{ row.remark || '-' }}</td><td>{{ formatDate(row.createdAt) }}</td></tr></tbody>
              </table>
            </div>
          </section>
          <section class="page-panel">
            <div class="page-hero"><div><div class="page-title" style="font-size:16px">最近任务</div></div></div>
            <div class="data-table-wrap">
              <table class="data-table">
                <thead><tr><th>模型</th><th>状态</th><th>扣费</th><th>时间</th></tr></thead>
                <tbody><tr v-for="row in (detailData?.tasks || []).slice(0, 20)" :key="row.id"><td>{{ row.modelDisplayName || row.modelName || row.modelId }}</td><td><a-tag :color="statusItem('task', row.status).color">{{ statusItem('task', row.status).label }}</a-tag></td><td>{{ amount(row.costCredits) }}</td><td>{{ formatDate(row.createdAt) }}</td></tr></tbody>
              </table>
            </div>
          </section>
        </a-spin>
      </a-drawer>
    </div>
  `,
}
