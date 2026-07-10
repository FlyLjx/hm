import { clientApi } from '../common/api.js'
import { resolveOriginalImageUrl } from '../common/format.js?v=20260710-shanghai-tz-v1'
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

export const FavoritesPage = {
  props: ['currentUser'],
  emits: ['go', 'login', 'preview'],
  setup(props, { emit }) {
    const items = ref([])
    const loading = ref(false)
    const page = ref(1)
    const pageSize = 24
    const pagination = ref(null)
    const hasItems = computed(() => items.value.length > 0)

    async function loadFavorites() {
      if (!props.currentUser?.id) {
        items.value = []
        pagination.value = null
        return
      }
      loading.value = true
      try {
        const response = await clientApi.listFavoriteTasks({ userId: props.currentUser.id, page: page.value, pageSize })
        items.value = response.data || []
        pagination.value = response.pagination || null
      } catch (error) {
        ElementPlus.ElMessage.error(error.message || '收藏加载失败')
      } finally {
        loading.value = false
      }
    }

    function previewTask(task) {
      emit('preview', { url: resolveOriginalImageUrl(task.resultUrl || task.thumbnailUrl), title: task.displayNote || task.prompt || '收藏作品' })
    }

    function editTask(task) {
      saveTransferredPrompt({
        prompt: task.prompt || '',
        title: task.displayNote || '收藏作品',
        imageUrl: task.resultUrl || task.thumbnailUrl,
      })
      emit('go', 'chat')
    }

    async function unFavorite(task) {
      if (!props.currentUser?.id) {
        emit('login')
        return
      }
      try {
        await clientApi.updateTaskFavorite(task.id, { userId: props.currentUser.id, favoriteEnabled: false })
        ElementPlus.ElMessage.success('已取消收藏')
        await loadFavorites()
      } catch (error) {
        ElementPlus.ElMessage.error(error.message || '操作失败')
      }
    }

    async function requestPublic(task) {
      if (!props.currentUser?.id) {
        emit('login')
        return
      }
      if (task.publicStatus === 'pending' || task.publicStatus === 'approved') return
      try {
        await clientApi.requestTaskPublic(task.id, { userId: props.currentUser.id, displayNote: task.displayNote || task.prompt })
        ElementPlus.ElMessage.success('已提交公开审核')
        await loadFavorites()
      } catch (error) {
        ElementPlus.ElMessage.error(error.message || '提交失败')
      }
    }

    onMounted(loadFavorites)
    watch(() => props.currentUser?.id || '', () => {
      page.value = 1
      loadFavorites()
    })

    return {
      items,
      loading,
      page,
      pageSize,
      pagination,
      hasItems,
      loadFavorites,
      previewTask,
      editTask,
      unFavorite,
      requestPublic,
      publicStatusLabel,
    }
  },
  template: `
    <div class="page-stack">
      <section v-if="!currentUser" class="auth-required-panel favorites-auth">
        <i class="ti ti-heart"></i>
        <strong>登录后查看收藏</strong>
        <p>收藏会跟随账号保存，方便你后续继续创作。</p>
        <button class="auth-required-button" type="button" @click="$emit('login')">去登录</button>
      </section>

      <template v-else>
        <section class="favorites-hero">
          <div>
            <span class="eyebrow">Collection</span>
            <h2>我的收藏</h2>
            <p>把满意的生成结果收进这里，继续改图、提交公开审核，或者回看高清原图。</p>
          </div>
          <button class="result-action primary" type="button" @click="loadFavorites">
            <i class="ti ti-refresh"></i>
            刷新
          </button>
        </section>

        <section v-loading="loading" class="favorite-board">
          <article v-for="task in items" :key="task.id" class="favorite-card">
            <button class="favorite-cover plain-btn" type="button" @click="previewTask(task)">
              <img :src="task.thumbnailUrl || task.resultUrl" :alt="task.displayNote || task.prompt || '收藏作品'" />
              <span>{{ publicStatusLabel(task.publicStatus) }}</span>
            </button>
            <div class="favorite-body">
              <strong>{{ task.displayNote || '收藏作品' }}</strong>
              <p>{{ task.prompt }}</p>
              <div class="favorite-meta">
                <span>{{ task.modelDisplayName || task.modelName || '模型' }}</span>
                <span>{{ task.size || task.sizeTier }}</span>
              </div>
            </div>
            <div class="favorite-actions">
              <button class="result-action" type="button" @click="previewTask(task)"><i class="ti ti-maximize"></i>预览</button>
              <button class="result-action primary" type="button" @click="editTask(task)"><i class="ti ti-wand"></i>继续改</button>
              <button class="result-action" type="button" :disabled="task.publicStatus === 'pending' || task.publicStatus === 'approved'" @click="requestPublic(task)">
                <i class="ti ti-world-upload"></i>{{ task.publicStatus === 'pending' ? '审核中' : task.publicStatus === 'approved' ? '已公开' : '公开' }}
              </button>
              <button class="result-action danger-soft" type="button" @click="unFavorite(task)"><i class="ti ti-heart-off"></i>移除</button>
            </div>
          </article>
          <div v-if="!hasItems && !loading" class="favorites-empty">
            <i class="ti ti-folder-heart"></i>
            <strong>还没有收藏作品</strong>
            <p>在生图结果上点击收藏后，会显示在这里。</p>
          </div>
        </section>
      </template>

      <div v-if="currentUser && pagination && pagination.total > pageSize" class="favorites-pagination">
        <el-pagination v-model:current-page="page" :page-size="pageSize" :total="pagination.total" layout="prev, pager, next" @current-change="loadFavorites" />
      </div>
    </div>
  `,
}
