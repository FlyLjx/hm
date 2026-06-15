import { adminApi } from '../api.js'

const { computed, onMounted, reactive, ref } = Vue
const { message } = antd

export const MailBroadcastPage = {
  setup() {
    const users = ref([])
    const loadingUsers = ref(false)
    const sending = ref(false)
    const previewOpen = ref(false)
    const result = ref(null)
    const form = reactive({
      targetType: 'all',
      userIds: [],
      subject: '',
      content: '',
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
        const response = await adminApi.listUsers()
        users.value = response.data || []
      } catch (error) {
        message.error(error instanceof Error ? error.message : '加载用户失败')
      } finally {
        loadingUsers.value = false
      }
    }

    function openPreview() {
      previewOpen.value = true
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

    return {
      users,
      loadingUsers,
      sending,
      previewOpen,
      result,
      form,
      userOptions,
      selectedCount,
      targetLabel,
      loadUsers,
      openPreview,
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
            <div class="mail-preview-subject">{{ form.subject || '未填写邮件标题' }}</div>
            <div class="mail-preview-content">{{ form.content || '未填写邮件正文' }}</div>
          </article>
        </div>
      </a-modal>
    </div>
  `,
}
