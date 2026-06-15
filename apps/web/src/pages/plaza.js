import { resolveOriginalImageUrl } from '../common/format.js'
import { saveTransferredPrompt } from '../common/promptTransfer.js'

const { computed, onMounted, ref } = Vue
const OPENNANA_API_BASE = 'https://api.opennana.com/api/prompts'
const OPENNANA_PAGE_SIZE = 24
const openNanaDetailCache = new Map()
const promptCategories = ['热门']

function promptCover(item) {
  return item.thumbnailUrl || item.resultUrl || item.imageUrl || ''
}

function promptTitle(item) {
  return item.displayNote || item.title || '在线精选提示词'
}

function promptModel(item) {
  return item.modelName || item.model || 'GPT-Image-2'
}

function normalizeOpenNanaListItem(item) {
  if (!item || item._is_sponsor || !item.slug || !item.cover_image) return null
  if (item.media_type && item.media_type !== 'image') return null
  return {
    id: `opennana-${item.id || item.slug}`,
    type: 'opennana',
    source: 'opennana',
    openNanaSlug: item.slug,
    title: item.title || '在线精选提示词',
    category: '热门',
    model: 'ChatGPT',
    prompt: '在线精选图片提示词，点击去生成时自动读取完整提示词。',
    imageUrl: item.cover_image,
    previewUrl: item.cover_image,
    sourceUrl: `https://opennana.com/awesome-prompt-gallery/${encodeURIComponent(item.slug)}`,
    tags: ['ChatGPT', '精选提示词'],
  }
}

function normalizeOpenNanaDetail(data, fallback = {}) {
  const prompts = Array.isArray(data?.prompts) ? data.prompts : []
  const zhPrompt = prompts.find((item) => item?.type === 'zh' && item.text)
  const firstPrompt = prompts.find((item) => item?.text)
  const images = Array.isArray(data?.images) ? data.images.filter(Boolean) : []
  const tags = Array.isArray(data?.tags) && data.tags.length
    ? data.tags.map((item) => String(item)).filter(Boolean).slice(0, 5)
    : [data?.model || fallback.model || 'ChatGPT', '精选提示词']
  return {
    ...fallback,
    id: `opennana-${data?.id || data?.slug || fallback.openNanaSlug || fallback.id}`,
    type: 'opennana',
    source: 'opennana',
    openNanaSlug: data?.slug || fallback.openNanaSlug,
    title: data?.title || fallback.title || '在线精选提示词',
    category: fallback.category || '热门',
    model: data?.model || fallback.model || 'ChatGPT',
    prompt: zhPrompt?.text || firstPrompt?.text || fallback.prompt || data?.title || fallback.title || '',
    imageUrl: images[0] || data?.thumbnail || fallback.imageUrl || '',
    previewUrl: images[0] || data?.thumbnail || fallback.previewUrl || fallback.imageUrl || '',
    sourceUrl: data?.slug ? `https://opennana.com/awesome-prompt-gallery/${encodeURIComponent(data.slug)}` : fallback.sourceUrl,
    tags,
  }
}

async function fetchOpenNanaJson(pathOrUrl) {
  const directUrl = pathOrUrl.startsWith('http') ? pathOrUrl : `${OPENNANA_API_BASE}${pathOrUrl}`
  const response = await fetchOpenNanaResponse(directUrl).catch(() => fetchOpenNanaProxyResponse(directUrl))
  if (!response.ok) {
    throw new Error(`在线提示词请求失败：${response.status}`)
  }
  const json = await response.json()
  if (json?.status && json.status !== 200) {
    throw new Error(json.msg || '在线提示词返回异常')
  }
  return json.data
}

function fetchOpenNanaResponse(url) {
  return fetch(url, { headers: { Accept: 'application/json' } })
}

function fetchOpenNanaProxyResponse(url) {
  const suffix = url.startsWith(OPENNANA_API_BASE) ? url.slice(OPENNANA_API_BASE.length) : url
  return fetch(`/api/prompt-library/opennana${suffix}`)
}

async function fetchOpenNanaDetail(slug, fallback = {}) {
  if (!slug) return fallback
  if (openNanaDetailCache.has(slug)) {
    return openNanaDetailCache.get(slug)
  }
  const data = await fetchOpenNanaJson(`/${encodeURIComponent(slug)}`)
  const detail = normalizeOpenNanaDetail(data, fallback)
  openNanaDetailCache.set(slug, detail)
  return detail
}

export const PlazaPage = {
  emits: ['go', 'preview'],
  setup(props, { emit }) {
    const activeCategory = ref('热门')
    const activeModel = ref('全部模型')
    const openNanaPrompts = ref([])
    const openNanaLoading = ref(false)
    const openNanaError = ref('')
    const openNanaPage = ref(1)
    const openNanaTotal = ref(0)
    const openNanaHasMore = ref(false)
    const loadingPromptId = ref('')
    const modelFilters = ['全部模型', 'ChatGPT', 'GPT-Image-2', 'GPT-4o', '通用']
    const visibleOpenNanaPrompts = computed(() => openNanaPrompts.value.filter((item) => {
      const categoryMatched = activeCategory.value === '热门'
      const modelMatched = activeModel.value === '全部模型' || item.model === activeModel.value
      return categoryMatched && modelMatched
    }))
    async function loadOpenNanaPrompts({ append = false } = {}) {
      if (openNanaLoading.value) return
      openNanaLoading.value = true
      openNanaError.value = ''
      try {
        const page = append ? openNanaPage.value + 1 : 1
        const params = new URLSearchParams({
          page: String(page),
          limit: String(OPENNANA_PAGE_SIZE),
          sort: 'reviewed_at',
          order: 'DESC',
          model: 'ChatGPT',
        })
        const data = await fetchOpenNanaJson(`${OPENNANA_API_BASE}?${params.toString()}`)
        const items = (data?.items || []).map(normalizeOpenNanaListItem).filter(Boolean)
        openNanaPrompts.value = append ? [...openNanaPrompts.value, ...items] : items
        openNanaPage.value = Number(data?.pagination?.page || page)
        openNanaTotal.value = Number(data?.pagination?.total || openNanaPrompts.value.length)
        openNanaHasMore.value = Boolean(data?.pagination?.has_more)
      } catch (error) {
        openNanaError.value = error instanceof Error ? error.message : '在线提示词加载失败'
        if (!append) openNanaPrompts.value = []
      } finally {
        openNanaLoading.value = false
      }
    }
    async function goGenerate(item) {
      let input = {
        prompt: item.prompt,
        title: promptTitle(item),
        imageUrl: item.previewUrl || promptCover(item),
      }
      if (item.type === 'opennana' && item.openNanaSlug) {
        loadingPromptId.value = item.id
        openNanaError.value = ''
        try {
          const detail = await fetchOpenNanaDetail(item.openNanaSlug, item)
          input = {
            prompt: detail.prompt || item.prompt || promptTitle(item),
            title: promptTitle(detail),
            imageUrl: detail.previewUrl || detail.imageUrl || item.previewUrl || promptCover(item),
          }
        } catch (error) {
          openNanaError.value = error instanceof Error ? error.message : '完整提示词读取失败'
          input.prompt = promptTitle(item)
        } finally {
          loadingPromptId.value = ''
        }
      }
      saveTransferredPrompt(input)
      emit('go', 'chat')
    }
    onMounted(() => {
      loadOpenNanaPrompts()
    })
    const plazaItems = computed(() => visibleOpenNanaPrompts.value)
    return {
      activeCategory,
      activeModel,
      promptCategories,
      modelFilters,
      openNanaPrompts,
      openNanaLoading,
      openNanaError,
      openNanaTotal,
      openNanaHasMore,
      loadingPromptId,
      visibleOpenNanaPrompts,
      plazaItems,
      goGenerate,
      loadOpenNanaPrompts,
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
          <p>挑一张喜欢的参考图，一键带入创作中心继续生成。</p>
          <div class="plaza-stats">
            <span><strong>{{ plazaItems.length }}</strong> 个灵感</span>
            <span><strong>{{ openNanaPrompts.length }}</strong> 条在线精选</span>
          </div>
          <p v-if="openNanaError" class="plaza-sync-error">{{ openNanaError }}</p>
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
            <span class="plaza-badge">{{ item.category }}</span>
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
            <button class="result-action primary" type="button" :disabled="loadingPromptId === item.id" @click="goGenerate(item)">
              <i class="ti ti-wand"></i>
              {{ loadingPromptId === item.id ? '读取中' : '去生成' }}
            </button>
          </div>
        </article>
      </section>
      <div v-if="openNanaHasMore || openNanaLoading" class="plaza-load-more">
        <button class="result-action" type="button" :disabled="openNanaLoading" @click="loadOpenNanaPrompts({ append: true })">
          <i :class="openNanaLoading ? 'ti ti-loader-2' : 'ti ti-plus'"></i>
          {{ openNanaLoading ? '正在加载在线精选' : '加载更多精选提示词' }}
        </button>
        <span v-if="openNanaTotal">已载入 {{ openNanaPrompts.length }} / {{ openNanaTotal }}</span>
      </div>
    </div>
  `,
}
