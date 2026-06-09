import { adminApi } from '../api.js'
import { creditLogTypeItem, formatAmount, formatDate, toNumber } from '../format.js'

const { computed, onBeforeUnmount, onMounted, reactive, ref, watch } = Vue
const { message, Modal } = antd

function signedAmount(row) {
  const amount = formatAmount(row.amount)
  return row.type === 'deduct' ? `-${amount}` : `+${amount}`
}

function amountClass(row) {
  return row.type === 'deduct' ? 'amount-negative' : 'amount-positive'
}

export const CreditLogsPage = {
  props: { settings: Object },
  setup() {
    const rows = ref([])
    const stats = ref(null)
    const loading = ref(false)
    const page = ref(1)
    const pageSize = 30
    const pagination = ref(null)
    const days = ref(30)
    const type = ref('all')
    const keyword = ref('')
    const users = ref([])
    const createVisible = ref(false)
    const createForm = reactive({ userId: '', amount: '', remark: '后台积分调整' })

    const creditName = computed(() => '积分')
    const userOptions = computed(() => users.value.map((user) => ({
      label: `${user.email} / ${formatAmount(user.credits)}`,
      value: user.id,
    })))
    const summary = computed(() => stats.value || {
      total: 0,
      rechargeTotal: 0,
      deductTotal: 0,
      rechargeCount: 0,
      deductCount: 0,
    })

    async function load() {
      loading.value = true
      try {
        const params = { page: page.value, pageSize, days: days.value, type: type.value, keyword: keyword.value }
        const [listResponse, statsResponse] = await Promise.all([
          adminApi.listCreditLogs(params),
          adminApi.getCreditLogStats({ days: days.value }),
        ])
        rows.value = listResponse.data || []
        pagination.value = listResponse.pagination
        stats.value = statsResponse.data
      } catch (error) {
        message.error(error instanceof Error ? error.message : '加载积分流水失败')
      } finally {
        loading.value = false
      }
    }

    async function loadUsers() {
      try {
        const response = await adminApi.listUsers()
        users.value = response.data || []
      } catch {}
    }

    function openCreate() {
      Object.assign(createForm, { userId: '', amount: '', remark: '后台积分调整' })
      createVisible.value = true
      if (!users.value.length) loadUsers()
    }

    async function submitCreate() {
      if (!createForm.userId) {
        message.warning('请选择用户')
        return
      }
      const amount = toNumber(createForm.amount)
      if (!amount) {
        message.warning('调整积分不能为 0')
        return
      }
      try {
        await adminApi.rechargeUser(createForm.userId, { amount, remark: createForm.remark })
        message.success('积分流水已新增')
        createVisible.value = false
        await Promise.all([load(), loadUsers()])
      } catch (error) {
        message.error(error instanceof Error ? error.message : '新增积分流水失败')
      }
    }

    function deleteLog(row) {
      Modal.confirm({
        title: '删除积分流水',
        content: '删除只移除这条流水记录，不会反向修改用户当前余额。确定继续吗？',
        okText: '删除',
        okType: 'danger',
        cancelText: '取消',
        async onOk() {
          await adminApi.deleteCreditLog(row.id)
          message.success('积分流水已删除')
          await load()
        },
      })
    }

    function typeItem(value) {
      return creditLogTypeItem(value)
    }

    function handleAutoRefresh() {
      load()
    }

    watch(page, load)
    watch([days, type], () => {
      page.value = 1
      load()
    })
    watch(keyword, () => {
      page.value = 1
      load()
    })

    onMounted(() => {
      load()
      loadUsers()
      window.addEventListener('admin:auto-refresh', handleAutoRefresh)
    })
    onBeforeUnmount(() => {
      window.removeEventListener('admin:auto-refresh', handleAutoRefresh)
    })

    return { rows, summary, loading, page, pageSize, pagination, days, type, keyword, creditName, users, userOptions, createVisible, createForm, load, openCreate, submitCreate, deleteLog, typeItem, signedAmount, amountClass, formatAmount, formatDate }
  },
  template: `
    <div class="page-stack">
      <a-card class="admin-view-card" :bordered="false">
        <div class="admin-card-hero">
          <div>
            <div class="page-kicker">Credit Ledger</div>
            <div class="page-title">积分流水</div>
            <div class="page-desc">查看并维护全站用户积分充值、扣减、余额变化和来源备注。</div>
          </div>
          <div class="toolbar">
            <a-button :loading="loading" @click="load">刷新</a-button>
            <a-button type="primary" @click="openCreate">新增流水</a-button>
          </div>
        </div>
        <div class="summary-grid">
          <div class="summary-card"><span>流水总数</span><b>{{ summary.total }}</b></div>
          <div class="summary-card"><span>充值合计</span><b class="amount-positive">+{{ formatAmount(summary.rechargeTotal) }}</b></div>
          <div class="summary-card"><span>扣费合计</span><b class="amount-negative">-{{ formatAmount(summary.deductTotal) }}</b></div>
          <div class="summary-card"><span>充值笔数</span><b>{{ summary.rechargeCount }}</b></div>
          <div class="summary-card"><span>扣费笔数</span><b>{{ summary.deductCount }}</b></div>
        </div>
        <div class="filter-row">
          <a-select v-model:value="days" style="width:140px">
            <a-select-option :value="1">最近 1 天</a-select-option>
            <a-select-option :value="7">最近 7 天</a-select-option>
            <a-select-option :value="30">最近 30 天</a-select-option>
            <a-select-option :value="90">最近 90 天</a-select-option>
            <a-select-option :value="365">最近 365 天</a-select-option>
          </a-select>
          <a-select v-model:value="type" style="width:130px">
            <a-select-option value="all">全部类型</a-select-option>
            <a-select-option value="recharge">充值</a-select-option>
            <a-select-option value="deduct">扣减</a-select-option>
          </a-select>
          <a-input v-model:value="keyword" allow-clear placeholder="搜索用户邮箱 / 用户ID / 备注 / 流水ID" style="width:360px" />
        </div>
      </a-card>

      <a-card class="admin-view-card" :bordered="false">
        <a-spin :spinning="loading">
          <div class="data-table-wrap">
            <table class="data-table">
              <thead>
                <tr><th>时间</th><th>用户</th><th>类型</th><th>变动</th><th>余额</th><th>备注</th><th>流水ID</th><th>操作</th></tr>
              </thead>
              <tbody>
                <tr v-for="row in rows" :key="row.id">
                  <td>{{ formatDate(row.createdAt) }}</td>
                  <td>
                    <div class="cell-stack">
                      <strong>{{ row.userEmail || '-' }}</strong>
                      <small class="cell-mono">{{ row.userId }}</small>
                    </div>
                  </td>
                  <td><a-tag :color="typeItem(row.type).color">{{ typeItem(row.type).label }}</a-tag></td>
                  <td><strong :class="amountClass(row)">{{ signedAmount(row) }}</strong></td>
                  <td>{{ formatAmount(row.balanceAfter) }}</td>
                  <td class="cell-ellipsis" :title="row.remark || ''">{{ row.remark || '-' }}</td>
                  <td class="cell-mono cell-ellipsis" :title="row.id">{{ row.id }}</td>
                  <td><a-button type="link" size="small" danger @click="deleteLog(row)">删除</a-button></td>
                </tr>
              </tbody>
            </table>
          </div>
          <a-empty v-if="!rows.length && !loading" description="暂无积分流水" />
        </a-spin>
        <div class="pagination-row"><a-pagination v-model:current="page" size="small" :page-size="pageSize" :total="pagination?.total || 0" /></div>
      </a-card>

      <a-modal v-model:open="createVisible" title="新增积分流水" width="720px" @ok="submitCreate">
        <div class="form-grid">
          <label class="full">
            <div class="muted">用户</div>
            <a-select v-model:value="createForm.userId" show-search :options="userOptions" option-filter-prop="label" placeholder="选择用户" style="width:100%" />
          </label>
          <label>
            <div class="muted">调整积分</div>
            <a-input v-model:value="createForm.amount" type="number" placeholder="正数增加，负数扣减" />
          </label>
          <label>
            <div class="muted">备注</div>
            <a-input v-model:value="createForm.remark" />
          </label>
        </div>
        <a-alert style="margin-top:14px" type="info" show-icon message="新增会同步调整用户当前余额，并自动写入充值或扣减流水。" />
      </a-modal>
    </div>
  `,
}
