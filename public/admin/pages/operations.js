import { adminApi } from '../api.js?v=20260706-subscription-lottery-v7'
import { formatDate, text } from '../format.js'
import { CrudPage } from '../components/crud-page.js'

const { computed, onMounted, reactive, ref, watch } = Vue
const { message } = antd

export const OperationsPage = {
  components: { CrudPage },
  props: { mode: String },
  setup(props) {
    const mode = computed(() => props.mode || 'announcements')
    const userOptions = ref([])
    const subscriptionPlans = ref([])
    const settingsLoading = ref(false)
    const settingsSaving = ref(false)
    const inviteSettingsVisible = ref(false)
    const operationSettings = reactive({
      inviteEnabled: true,
      inviteRewardPlanId: '',
    })
    const subscriptionPlanOptions = computed(() => subscriptionPlans.value.map((plan) => ({
      label: `${plan.name} / ${plan.durationDays} 天`,
      value: plan.id,
      searchText: `${plan.name} ${plan.description || ''}`,
    })))
    const announcementFields = computed(() => [
      { key: 'title', label: '标题', required: true },
      { key: 'content', label: '内容（Markdown）', type: 'textarea', rows: 12, preview: 'markdown', required: true, full: true },
      { key: 'displayMode', label: '展示方式', type: 'select', defaultValue: 'popup', options: [{ label: '弹窗公告', value: 'popup' }, { label: '首页横幅', value: 'home' }, { label: '顶部通知条', value: 'topbar' }] },
      { key: 'targetType', label: '展示范围', type: 'select', defaultValue: 'all', options: [{ label: '全部用户', value: 'all' }, { label: '指定用户', value: 'specific' }] },
      { key: 'userIds', label: '指定用户', type: 'multiple-select', options: userOptions.value, placeholder: '搜索邮箱或用户ID，可多选', full: true },
      { key: 'status', label: '状态', type: 'select', defaultValue: 'active', options: [{ label: '启用', value: 'active' }, { label: '禁用', value: 'disabled' }] },
      { key: 'sortOrder', label: '排序', type: 'number', number: true, defaultValue: 0 },
    ])
    const lotteryPrizeFields = computed(() => [
      { key: 'name', label: '奖品名称', required: true, defaultValue: '订阅奖励' },
      { key: 'planId', label: '订阅套餐', type: 'select', options: subscriptionPlanOptions.value },
      { key: 'monthlyStock', label: '月中奖上限（0 为不限）', type: 'number', number: true, defaultValue: 7 },
      { key: 'sortOrder', label: '排序', type: 'number', number: true, defaultValue: 0 },
      { key: 'status', label: '状态', type: 'select', defaultValue: 'active', options: [{ label: '启用', value: 'active' }, { label: '禁用', value: 'disabled' }] },
    ])
    function normalizeAnnouncement(input) {
      const userIds = Array.isArray(input.userIds)
        ? input.userIds.filter(Boolean)
        : String(input.userIds || '').split(',').map((item) => item.trim()).filter(Boolean)
      return { ...input, userIds }
    }
    async function loadUsers() {
      const response = await adminApi.listUsers()
      userOptions.value = (response.data || []).map((user) => ({
        label: user.email || '未设置邮箱',
        searchText: `${user.email || ''} ${user.id}`,
        value: user.id,
      }))
    }
    async function loadSubscriptionPlans() {
      if (mode.value !== 'invites' && mode.value !== 'lottery') return
      try {
        const response = await adminApi.listSubscriptionPlans()
        subscriptionPlans.value = (response.data || []).filter((plan) => plan.status === 'active')
      } catch {
        subscriptionPlans.value = []
      }
    }
    async function loadFeatureSettings() {
      if (mode.value !== 'invites') return
      settingsLoading.value = true
      try {
        const response = await adminApi.getSettings()
        const data = response.data || {}
        operationSettings.inviteEnabled = data.inviteEnabled !== false
        operationSettings.inviteRewardPlanId = data.inviteRewardPlanId || ''
      } catch (error) {
        message.error(error instanceof Error ? error.message : '运营配置加载失败')
      } finally {
        settingsLoading.value = false
      }
    }
    async function saveInviteSettings() {
      if (!operationSettings.inviteRewardPlanId) {
        message.warning('请选择要赠送的订阅套餐')
        return
      }
      settingsSaving.value = true
      try {
        await adminApi.updateSettings({
          inviteEnabled: operationSettings.inviteEnabled === true,
          inviteRewardType: 'subscription',
          inviteRewardPlanId: operationSettings.inviteRewardPlanId || '',
        })
        message.success('邀请配置已保存')
        inviteSettingsVisible.value = false
      } catch (error) {
        message.error(error instanceof Error ? error.message : '邀请配置保存失败')
      } finally {
        settingsSaving.value = false
      }
    }
    function openInviteSettings() {
      inviteSettingsVisible.value = true
    }
    function closeInviteSettings() {
      inviteSettingsVisible.value = false
    }
    const inviteActions = computed(() => [
      { key: 'invite-settings', label: '邀请配置', icon: 'ti-settings', onClick: openInviteSettings },
    ])
    function normalizeLotteryPrize(input) {
      return {
        ...input,
        prizeType: 'subscription',
        name: String(input.name || '').trim(),
        planId: String(input.planId || '').trim(),
        weight: 1,
        dailyStock: 0,
      }
    }
    function isThanksPrize(row) {
      return row?.prizeType === 'thanks'
    }
    function lotteryPrizeNameLabel(row) {
      return isThanksPrize(row) ? '谢谢惠顾' : (row?.name || '-')
    }
    function lotteryRecordResultLabel(row) {
      return isThanksPrize(row) ? '未中奖' : '中奖'
    }
    function lotteryPlanLabel(row) {
      if (isThanksPrize(row)) return '-'
      return row?.planName || row?.planId || '-'
    }
    function lotteryDurationLabel(row) {
      if (isThanksPrize(row)) return '-'
      return `${row?.durationDays || 0} 天`
    }
    function lotteryQuotaLabel(row) {
      if (isThanksPrize(row)) return '-'
      return `${row?.quotaImages || 0} 张`
    }
    onMounted(() => {
      loadUsers()
      loadSubscriptionPlans()
      loadFeatureSettings()
    })
    watch(() => props.mode, () => {
      loadUsers()
      loadSubscriptionPlans()
      loadFeatureSettings()
    })
    return { mode, adminApi, announcementFields, closeInviteSettings, inviteActions, inviteSettingsVisible, lotteryPrizeFields, lotteryDurationLabel, lotteryPlanLabel, lotteryPrizeNameLabel, lotteryQuotaLabel, lotteryRecordResultLabel, normalizeAnnouncement, normalizeLotteryPrize, operationSettings, formatDate, saveInviteSettings, settingsLoading, settingsSaving, subscriptionPlanOptions, text }
  },
  template: `
    <CrudPage v-if="mode === 'announcements'" title="公告管理" singular="公告" description="管理前台弹窗公告。"
      :list="adminApi.listAnnouncements" :create="input => adminApi.createAnnouncement(normalizeAnnouncement(input))" :update="(id, input) => adminApi.updateAnnouncement(id, normalizeAnnouncement(input))" :delete="adminApi.deleteAnnouncement" :fields="announcementFields"
      :columns="[
        { label: '标题', key: 'title' },
        { label: '内容', key: 'content' },
        { label: '展示方式', render: row => ({ popup: '弹窗', home: '首页横幅', topbar: '顶部通知条' }[row.displayMode] || '弹窗'), width: 120 },
        { label: '范围', render: row => row.targetType === 'all' ? '全部用户' : '指定 ' + (row.userIds?.length || 0) + ' 人' },
        { label: '已读统计', key: 'readRate', format: 'read-stats', width: 180 },
        { label: '排序', key: 'sortOrder' },
        { label: '状态', key: 'status', format: 'status' },
        { label: '更新时间', key: 'updatedAt', format: 'date' },
      ]"
    />
    <div v-else-if="mode === 'invites'" class="feature-page-stack">
      <CrudPage title="邀请管理" description="查看邀请奖励、邀请人、被邀请人和来源 IP。" paginated search :list="adminApi.listInvites" :delete="adminApi.deleteInvite"
        :actions="inviteActions"
        :columns="[
          { label: '邀请人', render: row => text(row.inviterEmail || row.inviterId) },
          { label: '被邀请人', render: row => text(row.inviteeEmail || row.inviteeId) },
          { label: '奖励', render: row => '订阅：' + (row.rewardLabel || '-') },
          { label: '被邀请IP', key: 'inviteeIp' },
          { label: '创建时间', key: 'createdAt', format: 'date' },
        ]"
      />
      <a-drawer
        :open="inviteSettingsVisible"
        title="邀请配置"
        width="min(92vw, 520px)"
        class="admin-edit-drawer invite-settings-drawer"
        destroy-on-close
        @close="closeInviteSettings"
      >
        <div class="invite-settings-drawer-body">
          <div class="invite-drawer-summary">
            <div>
              <span>当前状态</span>
              <strong>{{ operationSettings.inviteEnabled ? '邀请入口已开启' : '邀请入口已关闭' }}</strong>
            </div>
            <a-switch v-model:checked="operationSettings.inviteEnabled" checked-children="开" un-checked-children="关" />
          </div>

          <label class="invite-drawer-field">
            <span>赠送套餐</span>
            <a-select v-model:value="operationSettings.inviteRewardPlanId" show-search allow-clear option-filter-prop="searchText" placeholder="选择要赠送的订阅套餐" style="width:100%">
              <a-select-option v-for="plan in subscriptionPlanOptions" :key="plan.value" :value="plan.value" :label="plan.label" :search-text="plan.searchText">{{ plan.label }}</a-select-option>
            </a-select>
          </label>

          <div class="invite-settings-note">
            <i class="ti ti-info-circle"></i>
            <span>好友通过邀请链接注册并完成邮箱验证后，邀请人会获得所选订阅套餐。</span>
          </div>
        </div>
        <template #footer>
          <div class="drawer-footer-actions">
            <a-button @click="closeInviteSettings">取消</a-button>
            <a-button type="primary" :loading="settingsSaving" :disabled="settingsLoading" @click="saveInviteSettings">保存配置</a-button>
          </div>
        </template>
      </a-drawer>
    </div>
    <div v-else-if="mode === 'lottery'" class="feature-page-stack">
      <CrudPage title="抽奖奖池" singular="奖品" description="只配置可中奖订阅和月中奖上限，未命中由系统自动返回谢谢惠顾。"
        :list="adminApi.listLotteryPrizes"
        :create="input => adminApi.createLotteryPrize(normalizeLotteryPrize(input))"
        :update="(id, input) => adminApi.updateLotteryPrize(id, normalizeLotteryPrize(input))"
        :delete="adminApi.deleteLotteryPrize"
        :fields="lotteryPrizeFields"
        :columns="[
          { label: '奖品', render: lotteryPrizeNameLabel, width: 180 },
          { label: '订阅套餐', render: lotteryPlanLabel, width: 180 },
          { label: '有效期', render: lotteryDurationLabel, width: 100 },
          { label: '额度', render: lotteryQuotaLabel, width: 100 },
          { label: '本月剩余', render: row => row.monthlyText || '本月不限', width: 120 },
          { label: '排序', key: 'sortOrder', width: 90 },
          { label: '状态', key: 'status', format: 'status', width: 90 },
          { label: '更新时间', key: 'updatedAt', format: 'date', width: 180 },
        ]"
      />
      <CrudPage title="开奖记录" description="查看用户每日抽订阅结果。" paginated search readonly :page-size="10"
        :list="adminApi.listLotteryRecords"
        :columns="[
          { label: '用户', render: row => text(row.userEmail || row.userId), width: 220, copy: true },
          { label: '结果', render: lotteryRecordResultLabel, width: 110 },
          { label: '奖品', render: row => row.prizeName || '-', width: 160 },
          { label: '套餐', render: lotteryPlanLabel, width: 180 },
          { label: '有效期', render: lotteryDurationLabel, width: 100 },
          { label: '抽奖日期', key: 'drawDate', width: 120 },
          { label: 'IP', key: 'userIp', width: 150 },
          { label: '创建时间', key: 'createdAt', format: 'date', width: 180 },
        ]"
      />
    </div>
    <a-empty v-else description="该模块已移除" />
  `,
}
