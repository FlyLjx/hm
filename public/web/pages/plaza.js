import { clientApi } from '../common/api.js'
import { resolveOriginalImageUrl } from '../common/format.js'
import { saveTransferredPrompt } from '../common/promptTransfer.js'
import { promptCategories, promptItems } from '../data/prompts.js'

const { computed, onMounted, ref } = Vue

function promptCover(item) {
  return item.thumbnailUrl || item.resultUrl || item.imageUrl || ''
}

function promptTitle(item) {
  return item.displayNote || item.title || '公开展示作品'
}

function promptModel(item) {
  return item.modelName || item.model || 'GPT-Image-2'
}

export const PlazaPage = {
  emits: ['go', 'preview'],
  setup(props, { emit }) {
    const activeCategory = ref('热门')
    const activeModel = ref('全部模型')
    const publicTasks = ref([])
    const modelFilters = ['全部模型', 'GPT-Image-2', 'GPT-4o', '通用']
    const visiblePrompts = computed(() => promptItems.filter((item) => {
      const categoryMatched = activeCategory.value === '热门' || item.category === activeCategory.value || item.category === '热门'
      const modelMatched = activeModel.value === '全部模型' || item.model === activeModel.value
      return categoryMatched && modelMatched
    }))
    function goGenerate(input) {
      saveTransferredPrompt(input)
      emit('go', 'chat')
    }
    onMounted(() => {
      clientApi.listPublicDisplayTasks().then((response) => {
        publicTasks.value = response.data || []
      }).catch(() => {
        publicTasks.value = []
      })
    })
    const plazaItems = computed(() => [
      ...publicTasks.value.map((task) => ({
        ...task,
        type: 'public',
        title: task.displayNote || '公开展示作品',
        imageUrl: task.thumbnailUrl || task.resultUrl,
        previewUrl: task.resultUrl || task.thumbnailUrl,
        tags: ['公开作品', task.modelName || '精选'],
      })),
      ...visiblePrompts.value.map((item) => ({
        ...item,
        type: 'preset',
        previewUrl: item.imageUrl,
      })),
    ])
    return {
      activeCategory,
      activeModel,
      promptCategories,
      modelFilters,
      publicTasks,
      visiblePrompts,
      plazaItems,
      goGenerate,
      promptCover,
      promptTitle,
      promptModel,
      resolveOriginalImageUrl,
    }
  },
  template: `
    <div class="page-stack">
      <section class="plaza-hero glass-card">
        <div class="plaza-hero-copy">
          <span class="eyebrow">Prompt Plaza</span>
          <h2>提示词广场</h2>
          <p>挑一张喜欢的参考图，查看高清效果，或者一键带入创作中心继续生成。</p>
          <div class="plaza-stats">
            <span><strong>{{ plazaItems.length }}</strong> 个灵感</span>
            <span><strong>{{ publicTasks.length }}</strong> 张公开作品</span>
            <span><strong>{{ visiblePrompts.length }}</strong> 条精选提示词</span>
          </div>
        </div>
        <div class="plaza-filter-panel">
          <small>场景分类</small>
          <div class="plaza-filter-row">
            <button v-for="item in promptCategories" :key="item" :class="{active: activeCategory === item}" type="button" @click="activeCategory = item">{{ item }}</button>
          </div>
          <small>模型筛选</small>
          <div class="plaza-filter-row compact">
            <button v-for="item in modelFilters" :key="item" :class="{active: activeModel === item}" type="button" @click="activeModel = item">{{ item }}</button>
          </div>
        </div>
      </section>
      <section class="plaza-board">
        <article v-for="item in plazaItems" :key="item.type + '-' + item.id" class="plaza-card">
          <button class="plaza-cover plain-btn" type="button" @click="$emit('preview', { url: resolveOriginalImageUrl(item.previewUrl || promptCover(item)), title: promptTitle(item) })">
            <img v-if="promptCover(item)" :src="promptCover(item)" :alt="promptTitle(item)" />
            <span class="plaza-badge">{{ item.type === 'public' ? '公开作品' : item.category }}</span>
          </button>
          <div class="plaza-card-body">
            <div class="plaza-card-head">
              <strong>{{ promptTitle(item) }}</strong>
              <small>{{ promptModel(item) }}</small>
            </div>
            <p>{{ item.prompt }}</p>
            <div class="tag-row">
              <span v-for="tag in item.tags" :key="tag">{{ tag }}</span>
            </div>
          </div>
          <div class="plaza-actions">
            <button class="result-action" type="button" @click="$emit('preview', { url: resolveOriginalImageUrl(item.previewUrl || promptCover(item)), title: promptTitle(item) })">
              <i class="ti ti-maximize"></i>
              高清图
            </button>
            <button class="result-action primary" type="button" @click="goGenerate({ prompt: item.prompt, title: promptTitle(item), imageUrl: item.previewUrl || promptCover(item) })">
              <i class="ti ti-wand"></i>
              去生成
            </button>
          </div>
        </article>
      </section>
    </div>
  `,
}
