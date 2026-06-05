import { API_BASE_URL, adminApi } from '../api.js'
import { amount, statusItem } from '../format.js'
import { CrudPage } from '../components/crud-page.js'

const { computed, onBeforeUnmount, onMounted, ref, watch } = Vue
const { message } = antd

function formatDuration(value) {
  const seconds = Math.max(0, Math.round(Number(value || 0)))
  if (!seconds) return '-'
  if (seconds < 60) return `${seconds}秒`
  const minutes = Math.floor(seconds / 60)
  const restSeconds = seconds % 60
  return restSeconds ? `${minutes}分${String(restSeconds).padStart(2, '0')}秒` : `${minutes}分`
}

function modelLabel(row) {
  return row.modelDisplayName || row.modelName || row.modelId || '-'
}

function userLabel(row) {
  return row.userEmail || row.userId || '-'
}

function subscriptionLabel(row) {
  return row.userSubscriptionPlanName || ''
}

function subscriptionStatus(row) {
  return row.userSubscriptionPlanName ? 'active' : 'none'
}

function errorLabel(row) {
  return row.errorMessage || (row.status === 'failed' ? '任务失败，暂无错误详情' : '')
}

export const TasksPage = {
  components: { CrudPage },
  props: { mode: String },
  setup(props) {
    const isImages = computed(() => props.mode === 'images')
    const imageRows = ref([])
    const imageLoading = ref(false)
    const imagePage = ref(1)
    const imagePageSize = 12
    const imagePagination = ref(null)
    const imageDisplay = ref('all')
    const imageKeyword = ref('')
    const preview = ref(null)

    async function loadImages() {
      imageLoading.value = true
      try {
        const response = await adminApi.listTaskImages({ page: imagePage.value, pageSize: imagePageSize, display: imageDisplay.value, keyword: imageKeyword.value })
        imageRows.value = response.data || []
        imagePagination.value = response.pagination
      } catch (error) {
        message.error(error instanceof Error ? error.message : '加载图片失败')
      } finally {
        imageLoading.value = false
      }
    }

    async function toggle(row) {
      await adminApi.updateTaskDisplay(row.id, { displayEnabled: !row.displayEnabled, displayNote: row.displayNote || row.prompt })
      message.success('已更新展示状态')
      await loadImages()
    }

    watch(imagePage, loadImages)
    watch([imageDisplay, imageKeyword], () => {
      imagePage.value = 1
      loadImages()
    })
    function handleAutoRefresh() {
      if (preview.value || !isImages.value) return
      loadImages()
    }

    onMounted(() => {
      if (isImages.value) loadImages()
      window.addEventListener('admin:auto-refresh', handleAutoRefresh)
    })
    onBeforeUnmount(() => {
      window.removeEventListener('admin:auto-refresh', handleAutoRefresh)
    })

    return { adminApi, isImages, imageRows, imageLoading, imagePage, imagePageSize, imagePagination, imageDisplay, imageKeyword, preview, loadImages, toggle, API_BASE_URL, amount, statusItem, formatDuration, modelLabel, userLabel, subscriptionLabel, subscriptionStatus, errorLabel }
  },
  template: `
    <CrudPage v-if="!isImages" title="任务列表" description="查看生成任务、任务状态、扣费和取消异常任务。" paginated :page-size="20" :list="adminApi.listTasks" readonly
      :columns="[
        { label: '用户', render: row => userLabel(row) },
        { label: '订阅', render: row => subscriptionStatus(row), format: 'status', map: 'subscription' },
        { label: '用户IP', key: 'userIp' },
        { label: '模型', render: row => modelLabel(row) },
        { label: '规格', render: row => (row.sizeTier || '-') + ' / ' + (row.size || '-') },
        { label: '数量', key: 'quantity' },
        { label: '扣费', key: 'costCredits', format: 'amount' },
        { label: '耗时', render: row => formatDuration(row.durationSeconds) },
        { label: '状态', key: 'status', format: 'status', map: 'task' },
        { label: '错误信息', render: row => errorLabel(row), width: 420, longText: true },
        { label: '创建时间', key: 'createdAt', format: 'date' },
      ]"
    />
    <div v-else class="page-stack">
      <a-card class="admin-view-card" :bordered="false">
        <div class="admin-card-hero">
          <div><div class="page-kicker">Gallery Review</div><div class="page-title">图片管理</div><div class="page-desc">审核公开展示图片，支持直接预览原图。</div></div>
          <a-button :loading="imageLoading" @click="loadImages">刷新</a-button>
        </div>
        <div class="filter-row">
          <a-input v-model:value="imageKeyword" allow-clear placeholder="搜索提示词 / 用户 / 模型" style="width:320px" />
          <a-select v-model:value="imageDisplay" style="width:150px"><a-select-option value="all">全部图片</a-select-option><a-select-option value="public">公开展示</a-select-option><a-select-option value="private">未公开</a-select-option></a-select>
        </div>
      </a-card>
      <a-spin :spinning="imageLoading">
        <div class="image-grid">
          <article v-for="task in imageRows" :key="task.id" class="image-card">
            <img v-if="task.thumbnailUrl || task.resultUrl" :src="API_BASE_URL + (task.thumbnailUrl || task.resultUrl)" :alt="task.prompt || ''" @click="preview = { src: API_BASE_URL + (task.resultUrl || task.thumbnailUrl), prompt: task.displayNote || task.prompt || '-', model: modelLabel(task), user: task.userEmail || task.userId }" />
            <div class="image-card-body">
              <div><a-tag :color="task.displayEnabled ? 'green' : 'default'">{{ task.displayEnabled ? '公开展示' : '未公开' }}</a-tag></div>
              <div v-if="subscriptionLabel(task)"><a-tag color="gold">{{ subscriptionLabel(task) }}</a-tag></div>
              <div class="muted cell-ellipsis">{{ modelLabel(task) }}</div>
              <div class="image-card-prompt">{{ task.displayNote || task.prompt || '-' }}</div>
              <a-button :type="task.displayEnabled ? 'default' : 'primary'" @click="toggle(task)">{{ task.displayEnabled ? '取消公开' : '设为公开' }}</a-button>
            </div>
          </article>
        </div>
        <a-empty v-if="!imageRows.length && !imageLoading" description="暂无图片" />
      </a-spin>
      <div class="pagination-row"><a-pagination v-model:current="imagePage" size="small" :page-size="imagePageSize" :total="imagePagination?.total || 0" /></div>
      <a-modal :open="Boolean(preview)" title="图片预览" width="920px" @cancel="preview = null" @ok="preview = null">
        <div v-if="preview" class="page-stack">
          <img :src="preview.src" style="width:100%;max-height:58vh;object-fit:contain;background:#f5f7fb;border-radius:8px" />
          <div class="summary-grid" style="padding:0"><div class="summary-card"><span>模型</span><b style="font-size:16px">{{ preview.model || '-' }}</b></div><div class="summary-card"><span>用户</span><b style="font-size:16px">{{ preview.user || '-' }}</b></div></div>
          <p>{{ preview.prompt }}</p>
        </div>
      </a-modal>
    </div>
  `,
}
