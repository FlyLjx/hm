import { clientApi } from '../common/api.js'
import { formatDate } from '../common/format.js'
import { renderMarkdown } from '../common/markdown.js'

const { computed, onMounted, ref, watch } = Vue

const displayModeOptions = [
  { value: 'all', label: '全部' },
  { value: 'popup', label: '弹窗公告' },
  { value: 'home', label: '首页横幅' },
  { value: 'topbar', label: '顶部通知' },
]

function displayModeLabel(value) {
  const labels = {
    popup: '弹窗公告',
    home: '首页横幅',
    topbar: '顶部通知',
  }
  return labels[value] || '公告'
}

function targetLabel(item) {
  return item?.targetType === 'specific' ? '定向用户' : '全部用户'
}

export const AnnouncementsPage = {
  props: ['currentUser'],
  setup(props) {
    const loading = ref(false)
    const error = ref('')
    const announcements = ref([])
    const activeMode = ref('all')

    const visibleAnnouncements = computed(() => {
      if (activeMode.value === 'all') return announcements.value
      return announcements.value.filter((item) => (item.displayMode || 'popup') === activeMode.value)
    })

    const modeCounts = computed(() => {
      const counts = { all: announcements.value.length, popup: 0, home: 0, topbar: 0 }
      announcements.value.forEach((item) => {
        const key = item.displayMode || 'popup'
        if (key in counts) counts[key] += 1
      })
      return counts
    })

    async function loadAnnouncements() {
      loading.value = true
      error.value = ''
      try {
        const response = await clientApi.listAnnouncements(props.currentUser?.id, { includeSigned: 1 })
        announcements.value = response.data || []
      } catch (err) {
        error.value = err.message || '公告加载失败'
      } finally {
        loading.value = false
      }
    }

    function announcementHtml(item) {
      return renderMarkdown(item?.content || '') || '<p class="announcement-list-muted">暂无公告内容</p>'
    }

    onMounted(loadAnnouncements)
    watch(() => props.currentUser?.id || '', loadAnnouncements)

    return {
      loading,
      error,
      announcements,
      activeMode,
      visibleAnnouncements,
      modeCounts,
      displayModeOptions,
      displayModeLabel,
      targetLabel,
      loadAnnouncements,
      announcementHtml,
      formatDate,
    }
  },
  template: `
    <div class="announcement-list-page">
      <section class="announcement-list-hero">
        <div>
          <span>NOTICE CENTER</span>
          <h2>公告列表</h2>
          <p>查看平台公告、功能更新、维护通知和运营提醒。</p>
        </div>
        <button type="button" :disabled="loading" @click="loadAnnouncements">
          <i :class="['ti', 'ti-refresh', { 'is-spinning': loading }]"></i>
          刷新
        </button>
      </section>

      <section class="announcement-list-tabs" aria-label="公告筛选">
        <button
          v-for="item in displayModeOptions"
          :key="item.value"
          :class="{ active: activeMode === item.value }"
          type="button"
          @click="activeMode = item.value"
        >
          <span>{{ item.label }}</span>
          <em>{{ modeCounts[item.value] || 0 }}</em>
        </button>
      </section>

      <section class="announcement-list-board" :class="{ loading }">
        <div v-if="error" class="announcement-list-empty">
          <i class="ti ti-alert-circle"></i>
          <strong>公告加载失败</strong>
          <p>{{ error }}</p>
          <button type="button" @click="loadAnnouncements">重新加载</button>
        </div>

        <template v-else-if="visibleAnnouncements.length">
          <article v-for="item in visibleAnnouncements" :key="item.id" class="announcement-list-item">
            <header>
              <div>
                <span>{{ displayModeLabel(item.displayMode) }}</span>
                <h3>{{ item.title }}</h3>
              </div>
              <time>{{ formatDate(item.updatedAt || item.createdAt) }}</time>
            </header>
            <div class="announcement-list-content" v-html="announcementHtml(item)"></div>
            <footer>
              <span><i class="ti ti-users"></i>{{ targetLabel(item) }}</span>
              <span><i class="ti ti-clock"></i>{{ formatDate(item.createdAt) }}</span>
            </footer>
          </article>
        </template>

        <div v-else class="announcement-list-empty">
          <i class="ti ti-speakerphone"></i>
          <strong>暂无公告</strong>
          <p>当前没有可查看的公告，后续更新会显示在这里。</p>
        </div>
      </section>
    </div>
  `,
}
