import { adminApi } from '../api.js'

const { computed, onMounted, reactive, ref } = Vue
const { message } = antd

const mailTemplates = [
  {
    key: 'activity',
    name: '活动拉新',
    subject: '全站生图活动进行中，邀请好友一起解锁优惠',
    content: `你好呀，

平台正在进行全站生图活动，今日生成数量越高，所有用户都能一起解锁更高优惠。

如果你身边有朋友、客户或同事也需要做海报、产品图、宣传图，可以把你的邀请链接发给他们。好友注册后，你可以获得邀请奖励，大家也能一起把活动档位冲上去。

点击下方按钮访问平台，复制你的专属邀请链接，一起把今天的优惠冲满吧。`,
    actionText: '进入平台邀请好友',
  },
  {
    key: 'notice',
    name: '功能公告',
    subject: '平台功能更新通知',
    content: `你好，

平台近期完成了一次体验优化，重点提升了生图流程、任务展示和账户相关功能。

你可以点击下方按钮访问平台，查看最新功能。如果使用中遇到问题，欢迎通过客服入口联系管理员，我们会尽快处理。

感谢你一直使用我们的 AI 生图服务。`,
    actionText: '查看最新功能',
  },
  {
    key: 'maintenance',
    name: '维护通知',
    subject: '系统维护通知',
    content: `你好，

为了提升服务稳定性，平台将进行短时维护。维护期间可能出现页面短暂无法访问、任务状态同步延迟等情况。

维护完成后服务会自动恢复，你的账户数据和积分不会受到影响。

感谢理解与支持。`,
    actionText: '访问平台',
  },
  {
    key: 'warm',
    name: '温馨召回',
    subject: '你的 AI 创作工作台已准备好',
    content: `你好，

好久不见。你的 AI 生图工作台已经准备好继续创作，可以用来生成活动海报、产品展示图、门店宣传图和社媒配图。

如果你还没有想法，可以从一句简单需求开始，让 AI 帮你扩展成完整画面。

期待看到你的新作品。`,
    actionText: '继续创作',
  },
]

export const MailBroadcastPage = {
  setup() {
    const users = ref([])
    const settings = ref({})
    const loadingUsers = ref(false)
    const sending = ref(false)
    const previewOpen = ref(false)
    const result = ref(null)
    const form = reactive({
      targetType: 'all',
      userIds: [],
      templateKey: 'activity',
      subject: '',
      content: '',
      actionText: '立即查看',
      actionUrl: '',
    })

    const userOptions = computed(() => users.value.map((user) => ({
      label: user.email || '未设置邮箱',
      value: user.id,
      searchText: `${user.email || ''} ${user.id}`,
    })))
    const selectedCount = computed(() => {
      if (form.targetType === 'specific') return form.userIds.length
      if (form.targetType === 'active') return users.value.filter((user) => user.status === 'active' && user.email).length
      return users.value.filter((user) => user.email).length
    })
    const targetLabel = computed(() => {
      if (form.targetType === 'specific') return '指定用户'
      if (form.targetType === 'active') return '启用用户'
      return '全部用户'
    })

    async function loadUsers() {
      loadingUsers.value = true
      try {
        settings.value = (await adminApi.getSettings()).data || {}
        if (form.targetType === 'specific') {
          const usersResponse = await adminApi.listUsers()
          users.value = usersResponse.data || []
        }
      } catch (error) {
        message.error(error instanceof Error ? error.message : '加载用户失败')
      } finally {
        loadingUsers.value = false
      }
    }

    function openPreview() {
      previewOpen.value = true
    }

    function defaultEntryUrl() {
      return settings.value?.frontendUrl || settings.value?.backendUrl || window.location.origin
    }

    function applyTemplate(key) {
      const template = mailTemplates.find((item) => item.key === key)
      if (!template) return
      form.templateKey = key
      form.subject = template.subject
      form.content = template.content
      form.actionText = template.actionText || '立即访问'
      form.actionUrl = form.actionUrl || defaultEntryUrl()
      message.success(`已套用「${template.name}」模板`)
    }

    async function ensureUsersLoaded() {
      if (users.value.length || loadingUsers.value) return
      try {
        const usersResponse = await adminApi.listUsers()
        users.value = usersResponse.data || []
      } catch (error) {
        message.error(error instanceof Error ? error.message : '加载用户失败')
      }
    }

    async function copyActionUrl() {
      const url = String(form.actionUrl || '').trim()
      if (!url) {
        message.warning('请先填写按钮链接')
        return
      }
      try {
        await navigator.clipboard.writeText(url)
        message.success('访问链接已复制')
      } catch {
        message.error('复制失败，请手动复制链接')
      }
    }

    async function submit() {
      if (!form.subject.trim()) {
        message.warning('请输入邮件标题')
        return
      }
      if (!form.content.trim()) {
        message.warning('请输入邮件内容')
        return
      }
      if (form.targetType === 'specific' && form.userIds.length === 0) {
        message.warning('请选择收件用户')
        return
      }

      sending.value = true
      result.value = null
      try {
        const response = await adminApi.sendMailBroadcast({
          targetType: form.targetType,
          userIds: form.targetType === 'specific' ? form.userIds : [],
          subject: form.subject,
          content: form.content,
          actionText: form.actionText,
          actionUrl: form.actionUrl,
        })
        result.value = response.data
        message.success(`发送完成：成功 ${response.data.success} 封，失败 ${response.data.failed} 封`)
      } catch (error) {
        message.error(error instanceof Error ? error.message : '群发失败')
      } finally {
        sending.value = false
      }
    }

    onMounted(loadUsers)

    Vue.watch(() => form.targetType, (value) => {
      if (value === 'specific') void ensureUsersLoaded()
    })

    return {
      users,
      loadingUsers,
      sending,
      previewOpen,
      result,
      settings,
      form,
      userOptions,
      selectedCount,
      targetLabel,
      mailTemplates,
      loadUsers,
      openPreview,
      applyTemplate,
      ensureUsersLoaded,
      copyActionUrl,
      submit,
    }
  },
  template: `
    <div class="page-stack">
      <a-card class="admin-view-card" :bordered="false">
        <div class="admin-card-hero">
          <div>
            <div class="page-kicker">Mail Broadcast</div>
            <div class="page-title">邮件群发</div>
            <div class="page-desc">向全部用户、启用用户或指定用户发送邮件通知。</div>
          </div>
          <div class="toolbar">
            <a-button :loading="loadingUsers" @click="loadUsers">刷新用户</a-button>
            <a-button @click="openPreview">预览邮件</a-button>
            <a-button type="primary" :loading="sending" @click="submit">发送邮件</a-button>
          </div>
        </div>
        <div class="summary-grid">
          <div class="summary-card"><span>用户总数</span><b>{{ users.length }}</b></div>
          <div class="summary-card"><span>预计收件</span><b>{{ selectedCount }}</b></div>
          <div class="summary-card"><span>发送状态</span><b style="font-size:18px">{{ sending ? '发送中' : '待发送' }}</b></div>
        </div>
      </a-card>

      <a-card class="admin-view-card" :bordered="false">
        <template #title>邮件内容</template>
        <div class="mail-template-grid">
          <button v-for="template in mailTemplates" :key="template.key" :class="{ active: form.templateKey === template.key }" type="button" @click="applyTemplate(template.key)">
            <span>{{ template.name }}</span>
            <small>{{ template.subject }}</small>
          </button>
        </div>
        <div class="form-grid">
          <label>
            <div class="muted" style="margin-bottom:6px">收件范围</div>
            <a-select v-model:value="form.targetType" style="width:100%">
              <a-select-option value="all">全部用户</a-select-option>
              <a-select-option value="active">启用用户</a-select-option>
              <a-select-option value="specific">指定用户</a-select-option>
            </a-select>
          </label>
          <label>
            <div class="muted" style="margin-bottom:6px">邮件标题</div>
            <a-input v-model:value="form.subject" placeholder="请输入邮件标题" />
          </label>
          <label>
            <div class="muted" style="margin-bottom:6px">按钮文字</div>
            <a-input v-model:value="form.actionText" placeholder="例如：立即查看" />
          </label>
          <label>
            <div class="muted" style="margin-bottom:6px">按钮链接</div>
            <a-input v-model:value="form.actionUrl" placeholder="默认使用系统设置里的前台地址" />
          </label>
          <label v-if="form.targetType === 'specific'" class="full">
            <div class="muted" style="margin-bottom:6px">指定用户</div>
            <a-select v-model:value="form.userIds" mode="multiple" show-search allow-clear option-filter-prop="searchText" placeholder="搜索邮箱或用户ID，可多选" style="width:100%">
              <a-select-option v-for="option in userOptions" :key="option.value" :value="option.value" :label="option.label" :search-text="option.searchText">{{ option.label }}</a-select-option>
            </a-select>
          </label>
          <label class="full">
            <div class="muted" style="margin-bottom:6px">邮件正文</div>
            <a-textarea v-model:value="form.content" :rows="10" placeholder="请输入邮件正文，换行会在邮件中保留" />
          </label>
        </div>
      </a-card>

      <a-card v-if="result" class="admin-view-card" :bordered="false">
        <template #title>发送结果</template>
        <div class="summary-grid" style="padding:0 0 16px">
          <div class="summary-card"><span>总数</span><b>{{ result.total }}</b></div>
          <div class="summary-card"><span>成功</span><b>{{ result.success }}</b></div>
          <div class="summary-card"><span>失败</span><b>{{ result.failed }}</b></div>
        </div>
        <div v-if="result.failures?.length" class="data-table-wrap">
          <table class="data-table">
            <thead><tr><th>邮箱</th><th>失败原因</th></tr></thead>
            <tbody><tr v-for="item in result.failures" :key="item.email"><td>{{ item.email }}</td><td>{{ item.message }}</td></tr></tbody>
          </table>
        </div>
      </a-card>

      <a-modal v-model:open="previewOpen" title="邮件预览" width="760px" :footer="null">
        <div class="mail-preview-shell">
          <div class="mail-preview-meta">
            <div>
              <span>收件范围</span>
              <b>{{ targetLabel }}</b>
            </div>
            <div>
              <span>预计收件</span>
              <b>{{ selectedCount }} 人</b>
            </div>
          </div>
          <article class="mail-preview-card">
            <div class="mail-preview-brand">AIπ 通知</div>
            <div class="mail-preview-subject">{{ form.subject || '未填写邮件标题' }}</div>
            <div class="mail-preview-content">{{ form.content || '未填写邮件正文' }}</div>
            <a v-if="form.actionUrl" class="mail-preview-button" :href="form.actionUrl" target="_blank">{{ form.actionText || '立即查看' }}</a>
            <div v-if="form.actionUrl" class="mail-preview-copy-link">
              <span>如果按钮无法打开，请复制以下链接访问：</span>
              <button type="button" @click="copyActionUrl">{{ form.actionUrl }}</button>
            </div>
            <div class="mail-preview-footer">这是一封来自平台的服务通知邮件，请勿直接回复。</div>
          </article>
        </div>
      </a-modal>
    </div>
  `,
}
