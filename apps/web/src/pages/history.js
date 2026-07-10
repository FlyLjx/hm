import { clientApi } from '../common/api.js'
import { formatDate, resolveOriginalImageUrl } from '../common/format.js?v=20260710-shanghai-tz-v1'
import { saveTransferredPrompt } from '../common/promptTransfer.js'

const { computed, onMounted, ref, watch } = Vue

const CATEGORY_RULES = [
  { name: '人物', pattern: /人物|人像|女孩|少女|男孩|写真|头像|角色|portrait|girl|woman|man|people/i },
  { name: '风景', pattern: /风景|山|海|湖|森林|日落|天空|星空|自然|landscape|sunset|mountain|sea/i },
  { name: '插画', pattern: /插画|手绘|漫画|二次元|动漫|绘本|illustration|anime|comic/i },
  { name: '科幻', pattern: /科幻|未来|赛博|机甲|机器人|奥特曼|宇宙|星际|cyber|sci-fi|robot/i },
  { name: '建筑', pattern: /建筑|城市|室内|空间|门店|街道|楼宇|architecture|city|interior/i },
  { name: '其他', pattern: null },
]

const TAG_RULES = [
  { name: '奥特曼', pattern: /奥特曼|ultraman/i },
  { name: '女孩', pattern: /女孩|少女|女生|girl|woman/i },
  { name: '城市', pattern: /城市|都市|街道|city|urban/i },
  { name: '科幻', pattern: /科幻|赛博|未来|机甲|sci-fi|cyber/i },
  { name: '插画', pattern: /插画|手绘|动漫|illustration|anime/i },
  { name: '写实', pattern: /写实|摄影|照片|真实|photo|realistic/i },
]

function publicStatusLabel(status) {
  const labels = {
    private: '仅我',
    pending: '审核中',
    approved: '公开',
    rejected: '未通过',
  }
  return labels[status] || '仅我'
}

function publicStatusClass(status) {
  if (status === 'approved') return 'is-public'
  if (status === 'pending') return 'is-pending'
  if (status === 'rejected') return 'is-rejected'
  return 'is-private'
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

function taskText(task) {
  return [
    task.displayNote,
    task.prompt,
    task.modelDisplayName,
    task.modelName,
    task.categoryName,
    task.category,
  ].filter(Boolean).join(' ')
}

function inferCategory(task) {
  const explicit = String(task.categoryName || task.category || '').trim()
  if (explicit) return explicit
  const text = taskText(task)
  const matched = CATEGORY_RULES.find((rule) => rule.pattern?.test(text))
  return matched?.name || '其他'
}

function getTaskTitle(task) {
  return String(task.displayNote || task.prompt || '未命名作品').trim()
}

function getModelName(task) {
  return String(task.modelDisplayName || task.modelName || '默认模型').trim()
}

function getImageCount(task) {
  if (Array.isArray(task.resultUrls) && task.resultUrls.length) return task.resultUrls.length
  return task.resultUrl ? 1 : 0
}

function isCurrentMonth(value) {
  if (!value) return false
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return false
  const now = new Date()
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()
}

function formatShortDate(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  return `${year}/${month}/${day} ${hour}:${minute}`
}

function formatCount(value) {
  return Number(value || 0).toLocaleString('zh-CN')
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
    const activeCategory = ref('全部分类')
    const activeTag = ref('')
    const sortMode = ref('latest')
    const layoutMode = ref('grid')
    const brokenImageIds = ref(new Set())

    const rawImageItems = computed(() => items.value.flatMap(expandTaskImages))
    const enrichedImageItems = computed(() => rawImageItems.value.map((item) => {
      const category = inferCategory(item.task)
      const title = getTaskTitle(item.task)
      const text = `${taskText(item.task)} ${category}`.toLowerCase()
      return {
        ...item,
        title,
        category,
        modelName: getModelName(item.task),
        sizeText: item.task.size || item.task.sizeTier || '',
        searchableText: text,
      }
    }))
    const filteredImageItems = computed(() => {
      let list = enrichedImageItems.value
      if (activeCategory.value && activeCategory.value !== '全部分类') {
        list = list.filter((item) => item.category === activeCategory.value)
      }
      if (activeTag.value) {
        const rule = TAG_RULES.find((item) => item.name === activeTag.value)
        list = list.filter((item) => rule?.pattern ? rule.pattern.test(taskText(item.task)) : item.searchableText.includes(activeTag.value.toLowerCase()))
      }
      return [...list].sort((a, b) => {
        const aTime = new Date(a.task.createdAt || 0).getTime()
        const bTime = new Date(b.task.createdAt || 0).getTime()
        return sortMode.value === 'oldest' ? aTime - bTime : bTime - aTime
      })
    })
    const hasItems = computed(() => filteredImageItems.value.length > 0)
    const backendTotal = computed(() => Number(pagination.value?.total || rawImageItems.value.length || 0))
    const totalText = computed(() => {
      const total = Number(pagination.value?.total || 0)
      if (!total) return activeCategory.value === '全部分类' && !activeTag.value ? '共 0 个任务' : `当前筛选 ${filteredImageItems.value.length} 张`
      const start = (page.value - 1) * pageSize + 1
      const end = Math.min(total, page.value * pageSize)
      const baseText = `${start}-${end} / 共 ${total} 个任务`
      if (activeCategory.value !== '全部分类' || activeTag.value) return `当前筛选 ${filteredImageItems.value.length} 张 · ${baseText}`
      return baseText
    })
    const totalPages = computed(() => Math.max(1, Math.ceil(Number(pagination.value?.total || 0) / pageSize)))
    const summaryStats = computed(() => [
      { label: '全部作品', value: formatCount(backendTotal.value), icon: 'ti-folders', hint: '后端记录' },
      { label: '公开作品', value: formatCount(enrichedImageItems.value.filter((item) => item.task.publicStatus === 'approved').length), icon: 'ti-world', hint: '当前页' },
      { label: '收藏作品', value: formatCount(enrichedImageItems.value.filter((item) => item.task.favoriteEnabled).length), icon: 'ti-heart-filled', hint: '当前页' },
      { label: '本月新增', value: formatCount(enrichedImageItems.value.filter((item) => isCurrentMonth(item.task.createdAt)).length), icon: 'ti-calendar-plus', hint: '当前页' },
    ])
    const categoryOptions = computed(() => {
      const counts = new Map()
      enrichedImageItems.value.forEach((item) => counts.set(item.category, (counts.get(item.category) || 0) + 1))
      return [
        { name: '全部分类', count: backendTotal.value },
        ...CATEGORY_RULES.map((rule) => ({ name: rule.name, count: counts.get(rule.name) || 0 })),
      ]
    })
    const tagOptions = computed(() => {
      const tags = TAG_RULES.map((rule) => ({
        name: rule.name,
        count: enrichedImageItems.value.filter((item) => rule.pattern.test(taskText(item.task))).length,
      })).filter((item) => item.count > 0)
      return tags.slice(0, 6)
    })
    const sidebarItems = computed(() => [
      { key: 'all', label: '全部作品', icon: 'ti-layout-grid', count: backendTotal.value },
      { key: 'favorites', label: '我的收藏', icon: 'ti-heart', count: viewMode.value === 'favorites' ? backendTotal.value : enrichedImageItems.value.filter((item) => item.task.favoriteEnabled).length },
      { key: 'preview', label: '预览记录', icon: 'ti-clock-hour-3', disabled: true },
      { key: 'trash', label: '回收站', icon: 'ti-trash', disabled: true },
    ])
    const emptyState = computed(() => {
      if (viewMode.value === 'favorites') {
        return {
          icon: 'ti-folder-heart',
          title: keyword.value || activeTag.value || activeCategory.value !== '全部分类' ? '没有匹配的收藏' : '还没有收藏图片',
          text: keyword.value || activeTag.value || activeCategory.value !== '全部分类' ? '换个关键词、分类或标签试试。' : '在图片上点收藏后，会统一收进这个作品库里。',
        }
      }
      return {
        icon: 'ti-photo-off',
        title: keyword.value || activeTag.value || activeCategory.value !== '全部分类' ? '没有匹配的历史图片' : '暂无历史图片',
        text: keyword.value || activeTag.value || activeCategory.value !== '全部分类' ? '换个关键词、分类或标签试试。' : '成功生成图片后，这里会自动出现历史记录。',
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
      if (nextMode !== 'all' && nextMode !== 'favorites') return
      if (viewMode.value === nextMode) return
      viewMode.value = nextMode
      activeCategory.value = '全部分类'
      activeTag.value = ''
      page.value = 1
      loadHistory()
    }

    function selectCategory(nextCategory) {
      activeCategory.value = nextCategory
      activeTag.value = ''
    }

    function toggleTag(nextTag) {
      activeTag.value = activeTag.value === nextTag ? '' : nextTag
      activeCategory.value = '全部分类'
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
      if (isBrokenImage(item)) return
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

    function goCreate() {
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
    watch(enrichedImageItems, () => {
      if (activeCategory.value !== '全部分类' && !categoryOptions.value.some((item) => item.name === activeCategory.value)) {
        activeCategory.value = '全部分类'
      }
      if (activeTag.value && !tagOptions.value.some((item) => item.name === activeTag.value)) {
        activeTag.value = ''
      }
    })

    return {
      items,
      imageItems: filteredImageItems,
      rawImageItems,
      pagination,
      loading,
      page,
      pageSize,
      viewMode,
      keyword,
      searchText,
      activeCategory,
      activeTag,
      sortMode,
      layoutMode,
      hasItems,
      totalText,
      totalPages,
      summaryStats,
      categoryOptions,
      tagOptions,
      sidebarItems,
      emptyState,
      loadHistory,
      switchView,
      selectCategory,
      toggleTag,
      submitSearch,
      resetSearch,
      changePage,
      previewImage,
      hideBrokenImage,
      isBrokenImage,
      editImage,
      createFromImage,
      goCreate,
      toggleFavorite,
      requestPublic,
      publicStatusLabel,
      publicStatusClass,
      formatDate,
      formatShortDate,
      getImageCount,
    }
  },
  template: `
    <div class="history-v2-page">
      <section v-if="!currentUser" class="auth-required-panel history-v2-auth">
        <i class="ti ti-photo-heart"></i>
        <strong>登录后查看作品库</strong>
        <p>生成历史和收藏会跟随账号保存，方便你后续继续创作。</p>
        <button class="auth-required-button" type="button" @click="$emit('login')">去登录</button>
      </section>

      <template v-else>
        <aside class="history-v2-sidebar">
          <nav class="history-v2-nav" aria-label="作品库导航">
            <button
              v-for="item in sidebarItems"
              :key="item.key"
              :class="{ active: viewMode === item.key, disabled: item.disabled }"
              type="button"
              :disabled="item.disabled"
              @click="switchView(item.key)"
            >
              <span><i :class="['ti', item.icon]"></i>{{ item.label }}</span>
              <em v-if="!item.disabled">{{ item.count }}</em>
            </button>
          </nav>

          <div class="history-v2-side-section">
            <div class="history-v2-side-title">
              <span>分类</span>
              <i class="ti ti-plus"></i>
            </div>
            <button
              v-for="category in categoryOptions"
              :key="category.name"
              :class="{ active: activeCategory === category.name }"
              class="history-v2-category"
              type="button"
              @click="selectCategory(category.name)"
            >
              <span>{{ category.name }}</span>
              <em>{{ category.count }}</em>
            </button>
          </div>

          <div class="history-v2-side-section">
            <div class="history-v2-side-title">
              <span>标签</span>
            </div>
            <div v-if="tagOptions.length" class="history-v2-tags">
              <button
                v-for="tag in tagOptions"
                :key="tag.name"
                :class="{ active: activeTag === tag.name }"
                type="button"
                @click="toggleTag(tag.name)"
              >
                {{ tag.name }}
              </button>
            </div>
            <p v-else class="history-v2-muted">暂无可用标签</p>
          </div>
        </aside>

        <main v-loading="loading" class="history-v2-main">
          <header class="history-v2-head">
            <div class="history-v2-title">
              <h2>
                作品库
                <button type="button" title="刷新作品库" aria-label="刷新作品库" @click="loadHistory">
                  <i class="ti ti-refresh"></i>
                </button>
              </h2>
              <p>历史图片和收藏统一管理，支持预览、续发和再次创作，让灵感持续生长。</p>
            </div>
            <form class="history-v2-search" @submit.prevent="submitSearch">
              <i class="ti ti-search"></i>
              <input v-model="searchText" type="search" placeholder="搜索提示词 / 模型 / 标签" />
              <button v-if="keyword" type="button" title="清除搜索" aria-label="清除搜索" @click="resetSearch">
                <i class="ti ti-x"></i>
              </button>
            </form>
            <button class="history-v2-primary" type="button" @click="goCreate">
              <i class="ti ti-upload"></i>
              上传图片
            </button>
          </header>

          <section class="history-v2-stats" aria-label="作品库统计">
            <article v-for="stat in summaryStats" :key="stat.label">
              <span><i :class="['ti', stat.icon]"></i></span>
              <strong>{{ stat.value }}</strong>
              <small>{{ stat.label }}</small>
              <em>{{ stat.hint }}</em>
            </article>
          </section>

          <section class="history-v2-toolbar" aria-label="作品筛选">
            <button :class="{ active: viewMode === 'all' }" type="button" @click="switchView('all')">
              <i class="ti ti-photo"></i>
              全部图片
            </button>
            <label>
              <i class="ti ti-category"></i>
              <select v-model="activeCategory" @change="activeTag = ''">
                <option v-for="category in categoryOptions" :key="category.name" :value="category.name">{{ category.name }}</option>
              </select>
            </label>
            <label>
              <i class="ti ti-arrows-sort"></i>
              <select v-model="sortMode">
                <option value="latest">最新创建</option>
                <option value="oldest">最早创建</option>
              </select>
            </label>
            <div class="history-v2-view-toggle" role="group" aria-label="布局切换">
              <button :class="{ active: layoutMode === 'grid' }" type="button" title="网格视图" aria-label="网格视图" @click="layoutMode = 'grid'">
                <i class="ti ti-layout-grid"></i>
              </button>
              <button :class="{ active: layoutMode === 'list' }" type="button" title="列表视图" aria-label="列表视图" @click="layoutMode = 'list'">
                <i class="ti ti-list"></i>
              </button>
            </div>
          </section>

          <section :class="['history-v2-gallery', layoutMode === 'list' ? 'is-list' : 'is-grid']">
            <article v-for="item in imageItems" :key="item.id" class="history-v2-card">
              <button class="history-v2-cover" type="button" :disabled="isBrokenImage(item)" @click="previewImage(item)">
                <img v-if="!isBrokenImage(item)" :src="item.thumbnailUrl || item.url" :alt="item.title" loading="lazy" decoding="async" @error="hideBrokenImage(item)" />
                <span v-else class="history-v2-missing-image">
                  <i class="ti ti-photo-off"></i>
                  <strong>图片已被清理</strong>
                  <small>上游图片地址已失效，请以本地下载为准</small>
                </span>
                <em :class="['history-v2-badge', publicStatusClass(item.task.publicStatus)]">{{ publicStatusLabel(item.task.publicStatus) }}</em>
                <small v-if="getImageCount(item.task) > 1">{{ item.index + 1 }} / {{ getImageCount(item.task) }}</small>
              </button>
              <button
                :class="['history-v2-fav', { active: item.task.favoriteEnabled }]"
                type="button"
                :title="item.task.favoriteEnabled ? '取消收藏' : '收藏'"
                :aria-label="item.task.favoriteEnabled ? '取消收藏' : '收藏'"
                @click="toggleFavorite(item)"
              >
                <i :class="['ti', item.task.favoriteEnabled ? 'ti-heart-filled' : 'ti-heart']"></i>
              </button>
              <div class="history-v2-card-body">
                <strong :title="item.title">{{ item.title }}</strong>
                <p>{{ item.category }} · {{ item.sizeText || '默认尺寸' }}</p>
                <span>{{ item.modelName }}</span>
                <small>{{ formatShortDate(item.task.createdAt) }}</small>
              </div>
              <div class="history-v2-actions">
                <button type="button" title="站内预览" aria-label="站内预览" :disabled="isBrokenImage(item)" @click="previewImage(item)">
                  <i class="ti ti-eye"></i>
                </button>
                <button type="button" title="带入参考图" aria-label="带入参考图" :disabled="isBrokenImage(item)" @click="createFromImage(item)">
                  <i class="ti ti-photo-plus"></i>
                </button>
                <button type="button" title="编辑蒙版" aria-label="编辑蒙版" :disabled="isBrokenImage(item)" @click="editImage(item)">
                  <i class="ti ti-wand"></i>
                </button>
                <button
                  type="button"
                  :title="item.task.publicStatus === 'pending' ? '审核中' : item.task.publicStatus === 'approved' ? '已公开' : '提交公开'"
                  :aria-label="item.task.publicStatus === 'pending' ? '审核中' : item.task.publicStatus === 'approved' ? '已公开' : '提交公开'"
                  :disabled="item.task.publicStatus === 'pending' || item.task.publicStatus === 'approved'"
                  @click="requestPublic(item)"
                >
                  <i class="ti ti-world-upload"></i>
                </button>
              </div>
            </article>

            <div v-if="!hasItems && !loading" class="history-v2-empty">
              <i :class="['ti', emptyState.icon]"></i>
              <strong>{{ emptyState.title }}</strong>
              <p>{{ emptyState.text }}</p>
              <button class="history-v2-primary" type="button" @click="goCreate">去生图</button>
            </div>
          </section>

          <footer v-if="pagination" class="history-v2-pagination">
            <span>{{ totalText }}</span>
            <div>
              <button type="button" :disabled="page <= 1" @click="changePage(-1)">
                <i class="ti ti-chevron-left"></i>
                上一页
              </button>
              <strong>{{ page }} / {{ totalPages }}</strong>
              <button type="button" :disabled="page >= totalPages" @click="changePage(1)">
                下一页
                <i class="ti ti-chevron-right"></i>
              </button>
            </div>
          </footer>
        </main>
      </template>
    </div>
  `,
}
