import { adminApi } from '../api.js'
import { amount, formatDate, text } from '../format.js'
import { CrudPage } from '../components/crud-page.js'

const { computed, onMounted, ref } = Vue

export const OperationsPage = {
  components: { CrudPage },
  props: { mode: String },
  setup(props) {
    const mode = computed(() => props.mode || 'checkins')
    const userOptions = ref([])
    const promotionIconOptions = [
      { label: '公告', value: 'ti-speakerphone' },
      { label: '闪电', value: 'ti-bolt' },
      { label: '礼物', value: 'ti-gift' },
      { label: '折扣', value: 'ti-discount-2' },
      { label: '火热', value: 'ti-flame' },
      { label: '星光', value: 'ti-sparkles' },
      { label: '皇冠', value: 'ti-crown' },
      { label: '图片', value: 'ti-photo' },
      { label: '钱包', value: 'ti-wallet' },
      { label: '火箭', value: 'ti-rocket' },
    ]
    const announcementFields = computed(() => [
      { key: 'title', label: '标题', required: true },
      { key: 'content', label: '内容（Markdown）', type: 'textarea', rows: 12, preview: 'markdown', required: true, full: true, aiGenerate: adminApi.generateAnnouncement },
      { key: 'displayMode', label: '展示方式', type: 'select', defaultValue: 'popup', options: [{ label: '弹窗公告', value: 'popup' }, { label: '首页横幅', value: 'home' }, { label: '顶部通知条', value: 'topbar' }] },
      { key: 'targetType', label: '展示范围', type: 'select', defaultValue: 'all', options: [{ label: '全部用户', value: 'all' }, { label: '指定用户', value: 'specific' }] },
      { key: 'userIds', label: '指定用户', type: 'multiple-select', options: userOptions.value, placeholder: '搜索邮箱或用户ID，可多选', full: true },
      { key: 'status', label: '状态', type: 'select', defaultValue: 'active', options: [{ label: '启用', value: 'active' }, { label: '禁用', value: 'disabled' }] },
      { key: 'sortOrder', label: '排序', type: 'number', number: true, defaultValue: 0 },
    ])
    const promotionFields = [
      { key: 'title', label: '标题', required: true },
      { key: 'content', label: '内容', type: 'textarea', required: true, full: true },
      { key: 'badge', label: '图标', type: 'select', defaultValue: 'ti-speakerphone', options: promotionIconOptions },
      { key: 'actionText', label: '按钮文字', nullable: true },
      { key: 'actionUrl', label: '跳转地址', type: 'url', nullable: true, full: true },
      { key: 'status', label: '状态', type: 'select', defaultValue: 'active', options: [{ label: '启用', value: 'active' }, { label: '禁用', value: 'disabled' }] },
      { key: 'sortOrder', label: '排序', type: 'number', number: true, defaultValue: 0 },
    ]
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
    onMounted(loadUsers)
    return { mode, adminApi, announcementFields, promotionFields, normalizeAnnouncement, amount, formatDate, text }
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
    <CrudPage v-else-if="mode === 'promotions'" title="促销管理" singular="促销" description="维护前台运营活动。"
      :list="adminApi.listPromotions" :create="adminApi.createPromotion" :update="adminApi.updatePromotion" :delete="adminApi.deletePromotion" :fields="promotionFields"
      :columns="[
        { label: '标题', key: 'title' },
        { label: '内容', key: 'content' },
        { label: '图标', key: 'badge' },
        { label: '按钮', key: 'actionText' },
        { label: '排序', key: 'sortOrder' },
        { label: '状态', key: 'status', format: 'status' },
      ]"
    />
    <CrudPage v-else-if="mode === 'invites'" title="邀请管理" description="查看邀请奖励、邀请人、被邀请人和来源 IP，删除后会自动扣回奖励积分。" paginated search :list="adminApi.listInvites" :delete="adminApi.deleteInvite"
      :columns="[
        { label: '邀请人', render: row => text(row.inviterEmail || row.inviterId) },
        { label: '被邀请人', render: row => text(row.inviteeEmail || row.inviteeId) },
        { label: '奖励额度', render: row => '+' + amount(row.rewardCredits) },
        { label: '被邀请IP', key: 'inviteeIp' },
        { label: '创建时间', key: 'createdAt', format: 'date' },
      ]"
    />
    <CrudPage v-else title="签到管理" description="查看签到记录，删除后会按后端规则扣回奖励额度。" paginated search :list="adminApi.listCheckins" :delete="adminApi.deleteCheckin"
      :columns="[
        { label: '用户', render: row => text(row.userEmail || row.userId) },
        { label: '奖励额度', render: row => '+' + amount(row.rewardCredits) },
        { label: '签到日期', key: 'checkinDate' },
        { label: 'IP', key: 'userIp' },
        { label: '创建时间', key: 'createdAt', format: 'date' },
      ]"
    />
  `,
}
