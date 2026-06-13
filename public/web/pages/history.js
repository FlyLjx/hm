import { clientApi } from '../common/api.js'
import { formatDate, resolveOriginalImageUrl } from '../common/format.js'
import { saveTransferredPrompt } from '../common/promptTransfer.js'

const { computed, onMounted, ref, watch } = Vue

function publicStatusLabel(status) {
  const labels = {
    private: '未公开',
    pending: '审核中',
    approved: '已公开',
    rejected: '未通过',
  }
  return labels[status] || '未公开'
}

function expandTaskImages(task) {
  const urls = task.resultUrls?.length ? task.resultUrls : task.resultUrl ? [task.resultUrl] : []
  const thumbnails = task.thumbnailUrls?.length ? task.thumbnailUrls : task.thumbnailUrl ? [task.thumbnailUrl] : []
  return urls.map((url, index) => ({
    id: `${task.id}-${index}`,
    task,
    index,
    url,
    thumbnailUrl: thumbnails[index] || url,
  }))
}

export const HistoryPage = {
  props: ['currentUser'],
  emits: ['go', 'login', 'preview'],
  setup(props, { emit }) {
    const items = ref([])
    const pagination = ref(null)
    const loading = ref(false)
    const page = ref(1)
    const pageSize = 24
    const viewMode = ref('all')
    const keyword = ref('')
    const searchText = ref('')
    const brokenImageIds = ref(new Set())
    const imageItems = computed(() => items.value.flatMap(expandTaskImages))
    const hasItems = computed(() => imageItems.value.length > 0)
    const totalText = computed(() => {
      const total = Number(pagination.value?.total || 0)
      if (!total) return '共 0 个任务'
      const start = (page.value - 1) * pageSize + 1
      const end = Math.min(total, page.value * pageSize)
      return `${start}-${end} / 共 ${total} 个任务`
    })
    const totalPages = computed(() => Math.max(1, Math.ceil(Number(pagination.value?.total || 0) / pageSize)))
    const emptyState = computed(() => {
      if (viewMode.value === 'favorites') {
        return {
          icon: 'ti-folder-heart',
          title: keyword.value ? '没有匹配的收藏' : '还没有收藏图片',
          text: keyword.value ? '换个关键词试试，或回到全部图片继续查找。' : '在图片上点收藏后，会统一收进这个作品库里。',
        }
      }
      return {
        icon: 'ti-photo-off',
        title: keyword.value ? '没有匹配的历史图片' : '暂无历史图片',
        text: keyword.value ? '换个关键词试试，或清空搜索条件。' : '成功生成图片后，这里会自动出现历史记录。',
      }
    })

    async function loadHistory() {
      if (!props.currentUser?.id) {
        items.value = []
        pagination.value = null
        return
      }
      loading.value = true
      try {
        const query = {
          userId: props.currentUser.id,
          page: page.value,
          pageSize,
          keyword: keyword.value.trim(),
        }
        const response = viewMode.value === 'favorites'
          ? await clientApi.listFavoriteTasks(query)
          : await clientApi.listHistoryTasks(query)
        items.value = response.data || []
        pagination.value = response.pagination || null
        brokenImageIds.value = new Set()
      } catch (error) {
        ElementPlus.ElMessage.error(error.message || '历史图片加载失败')
      } finally {
        loading.value = false
      }
    }

    function switchView(nextMode) {
      if (viewMode.value === nextMode) return
      viewMode.value = nextMode
      page.value = 1
      loadHistory()
    }

    function submitSearch() {
      keyword.value = searchText.value
      page.value = 1
      loadHistory()
    }

    function resetSearch() {
      searchText.value = ''
      keyword.value = ''
      page.value = 1
      loadHistory()
    }

    function changePage(delta) {
      const nextPage = Math.min(totalPages.value, Math.max(1, page.value + delta))
      if (nextPage === page.value) return
      page.value = nextPage
      loadHistory()
    }

    function previewImage(item) {
      emit('preview', { url: resolveOriginalImageUrl(item.url), title: item.task.displayNote || item.task.prompt || '历史图片' })
    }

    function hideBrokenImage(item) {
      brokenImageIds.value = new Set([...brokenImageIds.value, item.id])
    }

    function isBrokenImage(item) {
      return brokenImageIds.value.has(item.id)
    }

    function editImage(item) {
      saveTransferredPrompt({
        prompt: item.task.prompt || '',
        title: item.task.displayNote || '历史图片',
        imageUrl: resolveOriginalImageUrl(item.url),
      })
      emit('go', 'chat')
    }

    function createFromImage(item) {
      saveTransferredPrompt({
        prompt: `基于这张图片继续创作：${item.task.prompt || ''}`.trim(),
        title: item.task.displayNote || '历史图片',
        imageUrl: resolveOriginalImageUrl(item.url),
      })
      emit('go', 'chat')
    }

    async function toggleFavorite(item) {
      if (!props.currentUser?.id) {
        emit('login')
        return
      }
      try {
        const nextValue = !item.task.favoriteEnabled
        await clientApi.updateTaskFavorite(item.task.id, { userId: props.currentUser.id, favoriteEnabled: nextValue })
        ElementPlus.ElMessage.success(nextValue ? '已收藏' : '已取消收藏')
        await loadHistory()
      } catch (error) {
        ElementPlus.ElMessage.error(error.message || '操作失败')
      }
    }

    async function requestPublic(item) {
      if (!props.currentUser?.id) {
        emit('login')
        return
      }
      if (item.task.publicStatus === 'pending' || item.task.publicStatus === 'approved') return
      try {
        await clientApi.requestTaskPublic(item.task.id, { userId: props.currentUser.id, displayNote: item.task.displayNote || item.task.prompt })
        ElementPlus.ElMessage.success('已提交公开审核')
        await loadHistory()
      } catch (error) {
        ElementPlus.ElMessage.error(error.message || '提交失败')
      }
    }

    onMounted(loadHistory)
    watch(() => props.currentUser?.id || '', () => {
      page.value = 1
      loadHistory()
    })

    return {
      items,
      imageItems,
      pagination,
      loading,
      page,
      pageSize,
      viewMode,
      keyword,
      searchText,
      hasItems,
      totalText,
      totalPages,
      emptyState,
      loadHistory,
      switchView,
      submitSearch,
      resetSearch,
      changePage,
      previewImage,
      hideBrokenImage,
      isBrokenImage,
      editImage,
      createFromImage,
      toggleFavorite,
      requestPublic,
      publicStatusLabel,
      formatDate,
    }
  },
  template: `
    <div class="page-stack history-page">
      <section class="history-hero">
        <div>
          <span class="eyebrow">Library</span>
          <h2>作品库</h2>
          <p>历史图片和收藏统一放在这里，按全部或收藏快速筛选，再继续改图、新增图片或提交公开审核。</p>
        </div>
        <div class="history-toolbar">
          <div class="history-tabs" role="tablist" aria-label="作品库筛选">
            <button :class="{ active: viewMode === 'all' }" type="button" role="tab" @click="switchView('all')">
              <i class="ti ti-history"></i>
              全部图片
            </button>
            <button :class="{ active: viewMode === 'favorites' }" type="button" role="tab" @click="switchView('favorites')">
              <i class="ti ti-heart"></i>
              我的收藏
            </button>
          </div>
          <div class="history-search">
            <i class="ti ti-search"></i>
            <input v-model="searchText" type="search" placeholder="搜索提示词 / 模型" @keydown.enter="submitSearch" />
            <button v-if="keyword" type="button" @click="resetSearch"><i class="ti ti-x"></i></button>
          </div>
          <button class="result-action primary" type="button" @click="submitSearch">
            <i class="ti ti-filter-search"></i>
            搜索
          </button>
          <button class="result-action" type="button" @click="loadHistory">
            <i class="ti ti-refresh"></i>
            刷新
          </button>
        </div>
      </section>

      <section v-if="!currentUser" class="history-empty">
        <i class="ti ti-history"></i>
        <strong>登录后查看作品库</strong>
        <p>生成历史和收藏会跟随账号保存，方便你后续继续创作。</p>
        <button class="result-action primary" type="button" @click="$emit('login')">去登录</button>
      </section>

      <section v-else v-loading="loading" class="history-board">
        <article v-for="item in imageItems" :key="item.id" class="history-card">
          <button class="history-cover plain-btn" type="button" :disabled="isBrokenImage(item)" @click="previewImage(item)">
            <img v-if="!isBrokenImage(item)" :src="item.thumbnailUrl || item.url" :alt="item.task.displayNote || item.task.prompt || '历史图片'" @error="hideBrokenImage(item)" />
            <span v-else class="history-missing-image">
              <i class="ti ti-photo-off"></i>
              <strong>图片跑丢了</strong>
              <small>原图片链接已失效</small>
            </span>
            <span>{{ publicStatusLabel(item.task.publicStatus) }}</span>
            <small v-if="(item.task.resultUrls || []).length > 1">{{ item.index + 1 }} / {{ item.task.resultUrls.length }}</small>
          </button>
          <div class="history-body">
            <strong>{{ item.task.displayNote || '历史图片' }}</strong>
            <p>{{ item.task.prompt }}</p>
            <div class="history-meta">
              <span>{{ item.task.modelDisplayName || item.task.modelName || '模型' }}</span>
              <span>{{ item.task.size || item.task.sizeTier }}</span>
              <span>{{ formatDate(item.task.createdAt) }}</span>
            </div>
          </div>
          <div class="history-actions">
            <button class="result-action" type="button" :disabled="isBrokenImage(item)" @click="previewImage(item)"><i class="ti ti-maximize"></i>预览</button>
            <button class="result-action primary" type="button" :disabled="isBrokenImage(item)" @click="editImage(item)"><i class="ti ti-wand"></i>继续改</button>
            <button class="result-action" type="button" :disabled="isBrokenImage(item)" @click="createFromImage(item)"><i class="ti ti-photo-plus"></i>新增图片</button>
            <button class="result-action" type="button" @click="toggleFavorite(item)">
              <i :class="['ti', item.task.favoriteEnabled ? 'ti-heart-filled' : 'ti-heart']"></i>{{ item.task.favoriteEnabled ? '已收藏' : '收藏' }}
            </button>
            <button class="result-action" type="button" :disabled="item.task.publicStatus === 'pending' || item.task.publicStatus === 'approved'" @click="requestPublic(item)">
              <i class="ti ti-world-upload"></i>{{ item.task.publicStatus === 'pending' ? '审核中' : item.task.publicStatus === 'approved' ? '已公开' : '公开' }}
            </button>
          </div>
        </article>

        <div v-if="!hasItems && !loading" class="history-empty">
          <i :class="['ti', emptyState.icon]"></i>
          <strong>{{ emptyState.title }}</strong>
          <p>{{ emptyState.text }}</p>
        </div>
      </section>

      <div v-if="currentUser && pagination" class="history-pagination">
        <span>{{ totalText }}</span>
        <div>
          <button class="result-action" type="button" :disabled="page <= 1" @click="changePage(-1)">
            <i class="ti ti-chevron-left"></i>
            上一页
          </button>
          <strong>{{ page }} / {{ totalPages }}</strong>
          <button class="result-action" type="button" :disabled="page >= totalPages" @click="changePage(1)">
            下一页
            <i class="ti ti-chevron-right"></i>
          </button>
        </div>
      </div>
    </div>
  `,
}
