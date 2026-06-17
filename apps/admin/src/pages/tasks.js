import { API_BASE_URL, adminApi } from '../api.js'
import { amount, formatDate, statusItem } from '../format.js'
import { CrudPage } from '../components/crud-page.js'

const { computed, onMounted, ref, watch } = Vue
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
    onMounted(() => {
      if (isImages.value) loadImages()
      else loadTasks()
    })

    watch(taskPage, loadTasks)
    watch(isImages, (nextIsImages) => {
      if (nextIsImages) loadImages()
      else loadTasks()
    })

    return { adminApi, isImages, taskRows, taskLoading, taskPage, taskPageSize, taskPagination, imageRows, imageLoading, imagePage, imagePageSize, imagePagination, imageDisplay, imageKeyword, preview, brokenImageIds, loadTasks, cancelTask, canCancelTask, loadImages, toggle, reviewPublic, imageSrc, markImageBroken, openPreview, API_BASE_URL, amount, formatDate, statusItem, formatDuration, modelLabel, userLabel, subscriptionLabel, subscriptionStatus, errorLabel, publicStatusText, publicStatusColor }
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
    <div v-else class="page-stack image-manager-page">
      <a-card class="admin-view-card image-manager-header" :bordered="false">
        <div class="admin-card-hero">
          <div class="image-manager-heading">
            <span class="image-manager-heading-icon"><i class="ti ti-photo-shield"></i></span>
            <div>
              <div class="page-kicker">Gallery Review</div>
              <div class="page-title">图片管理</div>
              <div class="page-desc">集中审核作品公开状态，失效的上游图片会保留记录并明确标记。</div>
            </div>
          </div>
          <div class="image-manager-summary">
            <div><span>全部记录</span><strong>{{ amount(imagePagination?.total || 0) }}</strong></div>
            <div><span>当前页</span><strong>{{ amount(imageRows.length) }}</strong></div>
            <div><span>失效图片</span><strong :class="{ 'amount-negative': brokenImageIds.size }">{{ amount(brokenImageIds.size) }}</strong></div>
          </div>
        </div>
        <div class="gallery-filter-row">
          <a-input v-model:value="imageKeyword" allow-clear placeholder="搜索提示词、用户或模型">
            <template #prefix><i class="ti ti-search"></i></template>
          </a-input>
          <a-select v-model:value="imageDisplay">
            <a-select-option value="all">全部图片</a-select-option>
            <a-select-option value="pending">待审核</a-select-option>
            <a-select-option value="public">公开展示</a-select-option>
            <a-select-option value="private">未公开</a-select-option>
            <a-select-option value="rejected">未通过</a-select-option>
          </a-select>
          <span class="gallery-result-count">本页 {{ imageRows.length }} 张</span>
          <a-button :loading="imageLoading" @click="loadImages"><i class="ti ti-refresh"></i>刷新</a-button>
        </div>
      </a-card>

      <section class="gallery-panel">
        <div class="gallery-panel-head">
          <div>
            <strong>作品审核</strong>
            <span>点击图片可查看原图和完整生成信息</span>
          </div>
          <a-tag color="blue">第 {{ imagePage }} 页</a-tag>
        </div>
        <a-spin :spinning="imageLoading">
          <div class="image-grid">
            <article v-for="task in imageRows" :key="task.id" :class="['image-card', { 'is-missing': brokenImageIds.has(task.id) }]">
              <div class="image-card-media">
                <a-tag class="image-card-status" :color="publicStatusColor(task)">{{ publicStatusText(task) }}</a-tag>
                <button v-if="imageSrc(task) && !brokenImageIds.has(task.id)" class="image-card-cover" type="button" @click="openPreview(task)">
                  <img :src="imageSrc(task)" :alt="task.displayNote || task.prompt || '生成图片'" loading="lazy" @error="markImageBroken(task)" />
                  <span class="image-card-preview-hint"><i class="ti ti-maximize"></i>查看原图</span>
                </button>
                <div v-else class="image-card-missing">
                  <i class="ti ti-photo-off"></i>
                  <strong>图片跑丢了</strong>
                  <span>上游原图可能已过期或无法访问</span>
                </div>
              </div>
              <div class="image-card-body">
                <div class="image-card-meta">
                  <span :title="modelLabel(task)"><i class="ti ti-robot"></i>{{ modelLabel(task) }}</span>
                  <time>{{ formatDate(task.createdAt) }}</time>
                </div>
                <div class="image-card-prompt" :title="task.displayNote || task.prompt || '-'">{{ task.displayNote || task.prompt || '-' }}</div>
                <div class="image-card-owner">
                  <span :title="userLabel(task)"><i class="ti ti-user"></i>{{ userLabel(task) }}</span>
                  <a-tag v-if="subscriptionLabel(task)" color="gold">{{ subscriptionLabel(task) }}</a-tag>
                </div>
                <div class="image-card-actions">
                  <a-button v-if="task.publicStatus === 'pending'" type="primary" @click="reviewPublic(task, 'approved')">通过</a-button>
                  <a-button v-if="task.publicStatus === 'pending'" danger @click="reviewPublic(task, 'rejected')">拒绝</a-button>
                  <a-button v-if="task.publicStatus !== 'pending'" :type="task.displayEnabled ? 'default' : 'primary'" @click="toggle(task)">
                    <i :class="['ti', task.displayEnabled ? 'ti-eye-off' : 'ti-world']"></i>
                    {{ task.displayEnabled ? '取消公开' : '设为公开' }}
                  </a-button>
                </div>
              </div>
            </article>
          </div>
          <a-empty v-if="!imageRows.length && !imageLoading" class="gallery-empty" description="暂无符合条件的图片" />
        </a-spin>
        <div v-if="imagePagination?.total" class="gallery-pagination">
          <span>共 {{ amount(imagePagination.total) }} 条记录</span>
          <a-pagination v-model:current="imagePage" size="small" :page-size="imagePageSize" :total="imagePagination.total" :show-size-changer="false" />
        </div>
      </section>

      <a-modal :open="Boolean(preview)" title="图片预览" width="920px" @cancel="preview = null" @ok="preview = null">
        <div v-if="preview" class="image-preview-dialog">
          <img :src="preview.src" />
          <div class="image-preview-meta">
            <div><span>模型</span><strong>{{ preview.model || '-' }}</strong></div>
            <div><span>用户</span><strong>{{ preview.user || '-' }}</strong></div>
          </div>
          <p>{{ preview.prompt }}</p>
        </div>
      </a-modal>
    </div>
  `,
}
