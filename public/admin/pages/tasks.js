import { API_BASE_URL, adminApi } from '../api.js'
import { amount, statusItem } from '../format.js'
import { CrudPage } from '../components/crud-page.js'

const { computed, onBeforeUnmount, onMounted, ref, watch } = Vue
const { message, Modal } = antd

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

function canCancelTask(row) {
  return ['queued', 'pending', 'processing'].includes(row.status)
}

function publicStatusText(row) {
  const map = {
    private: '未公开',
    pending: '待审核',
    approved: '已公开',
    rejected: '未通过',
  }
  return map[row.publicStatus] || (row.displayEnabled ? '已公开' : '未公开')
}

function publicStatusColor(row) {
  const map = {
    private: 'default',
    pending: 'orange',
    approved: 'green',
    rejected: 'red',
  }
  return map[row.publicStatus] || (row.displayEnabled ? 'green' : 'default')
}

export const TasksPage = {
  components: { CrudPage },
  props: { mode: String },
  setup(props) {
    const isImages = computed(() => props.mode === 'images')
    const taskRows = ref([])
    const taskLoading = ref(false)
    const taskPage = ref(1)
    const taskPageSize = 20
    const taskPagination = ref(null)
    const imageRows = ref([])
    const imageLoading = ref(false)
    const imagePage = ref(1)
    const imagePageSize = 12
    const imagePagination = ref(null)
    const imageDisplay = ref('all')
    const imageKeyword = ref('')
    const preview = ref(null)
    const brokenImageIds = ref(new Set())

    async function loadTasks() {
      taskLoading.value = true
      try {
        const response = await adminApi.listTasks({ page: taskPage.value, pageSize: taskPageSize })
        taskRows.value = response.data || []
        taskPagination.value = response.pagination
      } catch (error) {
        message.error(error instanceof Error ? error.message : '加载任务失败')
      } finally {
        taskLoading.value = false
      }
    }

    function cancelTask(row) {
      if (!canCancelTask(row)) return
      Modal.confirm({
        title: '取消任务',
        content: `确定取消任务「${row.id}」吗？取消后不会扣费，已完成的上游请求可能仍会返回但不会覆盖任务状态。`,
        okText: '取消任务',
        okType: 'danger',
        cancelText: '关闭',
        async onOk() {
          try {
            await adminApi.cancelTask(row.id)
            message.success('任务已取消')
            await loadTasks()
          } catch (error) {
            message.error(error instanceof Error ? error.message : '取消任务失败')
          }
        },
      })
    }

    async function loadImages() {
      imageLoading.value = true
      try {
        const response = await adminApi.listTaskImages({ page: imagePage.value, pageSize: imagePageSize, display: imageDisplay.value, keyword: imageKeyword.value })
        imageRows.value = response.data || []
        imagePagination.value = response.pagination
        brokenImageIds.value = new Set()
      } catch (error) {
        message.error(error instanceof Error ? error.message : '加载图片失败')
      } finally {
        imageLoading.value = false
      }
    }

    function imageSrc(task, original = false) {
      const path = original ? task.resultUrl || task.thumbnailUrl : task.thumbnailUrl || task.resultUrl
      return path ? API_BASE_URL + path : ''
    }

    function markImageBroken(task) {
      brokenImageIds.value = new Set([...brokenImageIds.value, task.id])
    }

    function openPreview(task) {
      if (!imageSrc(task, true) || brokenImageIds.value.has(task.id)) return
      preview.value = {
        src: imageSrc(task, true),
        prompt: task.displayNote || task.prompt || '-',
        model: modelLabel(task),
        user: task.userEmail || task.userId,
      }
    }

    async function toggle(row) {
      await adminApi.updateTaskDisplay(row.id, { displayEnabled: !row.displayEnabled, displayNote: row.displayNote || row.prompt })
      message.success('已更新展示状态')
      await loadImages()
    }

    async function reviewPublic(row, status) {
      try {
        await adminApi.reviewTaskPublic(row.id, { status, displayNote: row.displayNote || row.prompt })
        message.success(status === 'approved' ? '已通过公开审核' : '已拒绝公开申请')
        await loadImages()
      } catch (error) {
        message.error(error instanceof Error ? error.message : '审核失败')
      }
    }

    watch(imagePage, loadImages)
    watch([imageDisplay, imageKeyword], () => {
      imagePage.value = 1
      loadImages()
    })
    function handleAutoRefresh() {
      if (preview.value) return
      if (isImages.value) loadImages()
      else loadTasks()
    }

    onMounted(() => {
      if (isImages.value) loadImages()
      else loadTasks()
      window.addEventListener('admin:auto-refresh', handleAutoRefresh)
    })
    onBeforeUnmount(() => {
      window.removeEventListener('admin:auto-refresh', handleAutoRefresh)
    })

    watch(taskPage, loadTasks)
    watch(isImages, (nextIsImages) => {
      if (nextIsImages) loadImages()
      else loadTasks()
    })

    return { adminApi, isImages, taskRows, taskLoading, taskPage, taskPageSize, taskPagination, imageRows, imageLoading, imagePage, imagePageSize, imagePagination, imageDisplay, imageKeyword, preview, brokenImageIds, loadTasks, cancelTask, canCancelTask, loadImages, toggle, reviewPublic, imageSrc, markImageBroken, openPreview, API_BASE_URL, amount, statusItem, formatDuration, modelLabel, userLabel, subscriptionLabel, subscriptionStatus, errorLabel, publicStatusText, publicStatusColor }
  },
  template: `
    <div v-if="!isImages" class="page-stack">
      <a-card class="admin-view-card" :bordered="false">
        <div class="admin-card-hero">
          <div><div class="page-kicker">Task Center</div><div class="page-title">任务列表</div><div class="page-desc">查看生成任务、任务状态、扣费和取消异常任务。</div></div>
          <a-button :loading="taskLoading" @click="loadTasks">刷新</a-button>
        </div>
      </a-card>
      <a-card class="admin-view-card" :bordered="false">
        <template #title>任务列表</template>
        <template #extra><span class="page-desc">共 {{ taskPagination?.total || 0 }} 条，当前 {{ taskRows.length }} 条</span></template>
        <a-table :data-source="taskRows" :pagination="false" :loading="taskLoading" :scroll="{ x: 1780 }" row-key="id" size="small">
          <a-table-column title="用户" key="user" :width="180">
            <template #default="{ record }"><span class="cell-ellipsis">{{ userLabel(record) }}</span></template>
          </a-table-column>
          <a-table-column title="订阅" key="subscription" :width="90">
            <template #default="{ record }"><a-tag :color="statusItem('subscription', subscriptionStatus(record)).color">{{ statusItem('subscription', subscriptionStatus(record)).label }}</a-tag></template>
          </a-table-column>
          <a-table-column title="用户IP" data-index="userIp" :width="130" />
          <a-table-column title="模型" key="model" :width="190">
            <template #default="{ record }"><span class="cell-ellipsis">{{ modelLabel(record) }}</span></template>
          </a-table-column>
          <a-table-column title="规格" key="size" :width="150">
            <template #default="{ record }">{{ (record.sizeTier || '-') + ' / ' + (record.size || '-') }}</template>
          </a-table-column>
          <a-table-column title="数量" data-index="quantity" :width="70" />
          <a-table-column title="扣费" key="credits" :width="90">
            <template #default="{ record }">{{ amount(record.costCredits) }}</template>
          </a-table-column>
          <a-table-column title="耗时" key="duration" :width="100">
            <template #default="{ record }">{{ formatDuration(record.durationSeconds) }}</template>
          </a-table-column>
          <a-table-column title="状态" key="status" :width="100">
            <template #default="{ record }"><a-tag :color="statusItem('task', record.status).color">{{ statusItem('task', record.status).label }}</a-tag></template>
          </a-table-column>
          <a-table-column title="错误信息" key="error" :width="420">
            <template #default="{ record }">
              <a-tooltip :title="errorLabel(record)" overlay-class-name="long-text-tooltip">
                <span class="cell-long-text">{{ errorLabel(record) || '-' }}</span>
              </a-tooltip>
            </template>
          </a-table-column>
          <a-table-column title="创建时间" data-index="createdAt" :width="180">
            <template #default="{ record }">{{ new Date(record.createdAt).toLocaleString('zh-CN', { hour12: false }) }}</template>
          </a-table-column>
          <a-table-column title="操作" key="actions" fixed="right" :width="110">
            <template #default="{ record }">
              <a-button type="link" size="small" danger :disabled="!canCancelTask(record)" @click="cancelTask(record)">取消任务</a-button>
            </template>
          </a-table-column>
        </a-table>
        <div class="pagination-row"><a-pagination v-model:current="taskPage" size="small" :page-size="taskPageSize" :total="taskPagination?.total || 0" /></div>
      </a-card>
    </div>
    <div v-else class="page-stack">
      <a-card class="admin-view-card" :bordered="false">
        <div class="admin-card-hero">
          <div><div class="page-kicker">Gallery Review</div><div class="page-title">图片管理</div><div class="page-desc">审核公开展示图片，支持直接预览原图。</div></div>
          <a-button :loading="imageLoading" @click="loadImages">刷新</a-button>
        </div>
        <div class="filter-row">
          <a-input v-model:value="imageKeyword" allow-clear placeholder="搜索提示词 / 用户 / 模型" style="width:320px" />
          <a-select v-model:value="imageDisplay" style="width:150px"><a-select-option value="all">全部图片</a-select-option><a-select-option value="pending">待审核</a-select-option><a-select-option value="public">公开展示</a-select-option><a-select-option value="private">未公开</a-select-option><a-select-option value="rejected">未通过</a-select-option></a-select>
        </div>
      </a-card>
      <a-spin :spinning="imageLoading">
        <div class="image-grid">
          <article v-for="task in imageRows" :key="task.id" class="image-card">
            <button v-if="imageSrc(task) && !brokenImageIds.has(task.id)" class="image-card-cover" type="button" @click="openPreview(task)">
              <img :src="imageSrc(task)" alt="" loading="lazy" @error="markImageBroken(task)" />
            </button>
            <div v-else class="image-card-missing">
              <i class="ti ti-photo-off"></i>
              <strong>图片走丢咯...</strong>
              <span>{{ task.displayNote || task.prompt || '图片加载失败' }}</span>
            </div>
            <div class="image-card-body">
              <div><a-tag :color="publicStatusColor(task)">{{ publicStatusText(task) }}</a-tag></div>
              <div v-if="subscriptionLabel(task)"><a-tag color="gold">{{ subscriptionLabel(task) }}</a-tag></div>
              <div class="muted cell-ellipsis">{{ modelLabel(task) }}</div>
              <div class="image-card-prompt">{{ task.displayNote || task.prompt || '-' }}</div>
              <div class="image-card-actions">
                <a-button v-if="task.publicStatus === 'pending'" type="primary" @click="reviewPublic(task, 'approved')">通过</a-button>
                <a-button v-if="task.publicStatus === 'pending'" danger @click="reviewPublic(task, 'rejected')">拒绝</a-button>
                <a-button v-if="task.publicStatus !== 'pending'" :type="task.displayEnabled ? 'default' : 'primary'" @click="toggle(task)">{{ task.displayEnabled ? '取消公开' : '设为公开' }}</a-button>
              </div>
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
