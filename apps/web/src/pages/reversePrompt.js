import { clientApi } from '../common/api.js'
import { saveTransferredPrompt } from '../common/promptTransfer.js'
import { getActiveModelsByCapability, getModelLabel } from '../common/options.js'

const { computed, onMounted, ref } = Vue
const maxImageBytes = 5 * 1024 * 1024
const reverseProviderName = 'AI-PAI'

function dataUrlBytes(dataUrl) {
  const base64 = String(dataUrl || '').split(',')[1] || ''
  return Math.ceil(base64.length * 0.75)
}

function loadImageElement(url) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('图片读取失败'))
    image.src = url
  })
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('图片读取失败'))
    reader.readAsDataURL(file)
  })
}

async function compressImageFile(file) {
  const initialUrl = await fileToDataUrl(file)
  if (dataUrlBytes(initialUrl) <= maxImageBytes) {
    return { url: initialUrl, compressed: false }
  }

  const image = await loadImageElement(initialUrl)
  let width = image.naturalWidth || image.width
  let height = image.naturalHeight || image.height
  let quality = 0.86
  let output = initialUrl

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(width))
    canvas.height = Math.max(1, Math.round(height))
    const context = canvas.getContext('2d')
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    output = canvas.toDataURL('image/jpeg', quality)
    if (dataUrlBytes(output) <= maxImageBytes) {
      return { url: output, compressed: true }
    }
    if (quality > 0.55) quality -= 0.12
    else {
      width *= 0.82
      height *= 0.82
    }
  }

  if (dataUrlBytes(output) > maxImageBytes) {
    throw new Error(`${file.name} 压缩后仍超过 5MB，请换一张更小的图片`)
  }
  return { url: output, compressed: true }
}

export const ReversePromptPage = {
  props: ['currentUser'],
  emits: ['go', 'login', 'preview'],
  setup(props, { emit }) {
    const models = ref([])
    const modelId = ref('')
    const fileInput = ref(null)
    const image = ref(null)
    const prompt = ref('')
    const language = ref('zh')
    const loading = ref(false)
    const loadingModels = ref(false)
    const imageMeta = ref(null)

    function isReverseModel(model) {
      const text = [
        model?.modelName,
        model?.displayName,
        model?.providerName,
      ].join(' ').toLowerCase()
      return model?.providerName === reverseProviderName && !text.includes('nano')
    }

    const chatModels = computed(() => getActiveModelsByCapability(models.value).filter(isReverseModel))
    const selectedModel = computed(() => chatModels.value.find((item) => item.id === modelId.value))
    const canSubmit = computed(() => Boolean(props.currentUser && modelId.value && image.value && !loading.value))

    async function loadModels() {
      loadingModels.value = true
      try {
        const response = await clientApi.listModels()
        models.value = response.data || []
        modelId.value = chatModels.value[0]?.id || ''
      } catch (error) {
        ElementPlus.ElMessage.error(error.message || '模型加载失败')
      } finally {
        loadingModels.value = false
      }
    }

    async function handleFile(event) {
      const file = Array.from(event.target.files || []).find((item) => item.type.startsWith('image/'))
      if (!file) return
      try {
        const compressed = await compressImageFile(file)
        image.value = {
          url: compressed.url,
          name: file.name,
          compressed: compressed.compressed,
        }
        imageMeta.value = {
          size: dataUrlBytes(compressed.url),
          originalSize: file.size,
        }
        prompt.value = ''
        if (compressed.compressed) ElementPlus.ElMessage.success('图片已自动压缩到 5MB 以内')
      } catch (error) {
        ElementPlus.ElMessage.error(error.message || '图片处理失败')
      }
      event.target.value = ''
    }

    function removeImage() {
      image.value = null
      imageMeta.value = null
      prompt.value = ''
    }

    async function reversePrompt() {
      if (!props.currentUser) {
        emit('login')
        return
      }
      if (!image.value) {
        ElementPlus.ElMessage.warning('请先上传一张图片')
        return
      }
      if (!modelId.value) {
        ElementPlus.ElMessage.warning(`请选择 ${reverseProviderName} 反推接口`)
        return
      }
      loading.value = true
      try {
        const response = await clientApi.reversePrompt({
          userId: props.currentUser.id,
          modelId: modelId.value,
          imageUrl: image.value.url,
          language: language.value,
        })
        prompt.value = response.data?.prompt || ''
        ElementPlus.ElMessage.success('提示词反推完成')
      } catch (error) {
        ElementPlus.ElMessage.error(error.message || '提示词反推失败')
      } finally {
        loading.value = false
      }
    }

    async function copyPrompt() {
      if (!prompt.value.trim()) return
      await navigator.clipboard.writeText(prompt.value)
      ElementPlus.ElMessage.success('提示词已复制')
    }

    function usePrompt() {
      const text = prompt.value.trim()
      if (!text) return
      saveTransferredPrompt({
        prompt: text,
        title: image.value?.name || '反推提示词',
      })
      emit('go', 'chat')
    }

    function formatFileSize(bytes) {
      const value = Number(bytes) || 0
      if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(2)} MB`
      return `${Math.max(1, Math.round(value / 1024))} KB`
    }

    onMounted(loadModels)

    return {
      models,
      modelId,
      fileInput,
      image,
      prompt,
      language,
      loading,
      loadingModels,
      imageMeta,
      chatModels,
      selectedModel,
      canSubmit,
      getModelLabel,
      handleFile,
      removeImage,
      reversePrompt,
      copyPrompt,
      usePrompt,
      formatFileSize,
    }
  },
  template: `
    <section class="reverse-page">
      <div class="reverse-hero glass-card">
        <div class="reverse-hero-copy">
          <span class="eyebrow"><i class="ti ti-scan-eye"></i> Prompt Reverse</span>
          <h2>提示词反推</h2>
          <p>上传一张图片，自动分析画面主体、构图、光线、风格和细节，生成可直接用于生图的提示词。</p>
          <div class="reverse-hero-actions">
            <el-button type="primary" @click="fileInput.click()">
              <i class="ti ti-photo-up"></i>
              上传图片
            </el-button>
            <el-button @click="$emit('go', 'chat')">
              <i class="ti ti-message-2"></i>
              创作中心
            </el-button>
          </div>
        </div>
        <div class="reverse-hero-note">
          <i class="ti ti-info-circle"></i>
          <div>
            <strong>独立反推工作流</strong>
            <span>结果可以复制，也可以一键带入创作中心继续生成。</span>
          </div>
        </div>
      </div>

      <div class="reverse-workspace">
        <section class="reverse-upload-panel glass-card">
          <input ref="fileInput" type="file" accept="image/*" hidden @change="handleFile" />
          <button v-if="!image" class="reverse-dropzone" type="button" @click="fileInput.click()">
            <i class="ti ti-photo-plus"></i>
            <strong>选择要反推的图片</strong>
            <span>支持 JPG、PNG、WEBP，图片会自动压缩到 5MB 以内</span>
          </button>
          <div v-else class="reverse-image-card">
            <button class="reverse-image-preview plain-btn" type="button" @click="$emit('preview', { url: image.url, title: image.name })">
              <img :src="image.url" alt="反推图片" />
            </button>
            <div class="reverse-image-meta">
              <div>
                <strong :title="image.name">{{ image.name }}</strong>
                <span>{{ formatFileSize(imageMeta?.size) }}{{ image.compressed ? ' · 已压缩' : '' }}</span>
              </div>
              <button type="button" @click="removeImage"><i class="ti ti-trash"></i></button>
            </div>
          </div>
        </section>

        <section class="reverse-control-panel glass-card">
          <div class="section-head reverse-section-head">
            <div>
              <span>Reverse Settings</span>
              <h2>反推设置</h2>
              <p>提示词反推仅支持后台接口名称为 AI-PAI 的视觉模型。</p>
            </div>
          </div>
          <div class="reverse-form">
            <label>
              <span>反推接口</span>
              <el-select v-model="modelId" :loading="loadingModels" placeholder="请选择 AI-PAI 反推接口">
                <template #label>
                  <span class="reverse-model-selected">
                    <i class="ti ti-robot"></i>
                    {{ getModelLabel(selectedModel) }}
                  </span>
                </template>
                <el-option v-for="model in chatModels" :key="model.id" :label="getModelLabel(model)" :value="model.id">
                  <span class="reverse-model-option">
                    <i class="ti ti-robot"></i>
                    <span>{{ getModelLabel(model) }}</span>
                  </span>
                </el-option>
              </el-select>
            </label>
            <label>
              <span>输出语言</span>
              <div class="reverse-language-tabs" role="radiogroup" aria-label="输出语言">
                <button :class="{ active: language === 'zh' }" type="button" role="radio" :aria-checked="language === 'zh'" @click="language = 'zh'">
                  中文
                </button>
                <button :class="{ active: language === 'en' }" type="button" role="radio" :aria-checked="language === 'en'" @click="language = 'en'">
                  英文
                </button>
              </div>
            </label>
          </div>
          <el-button class="reverse-submit" type="primary" :loading="loading" :disabled="!canSubmit" @click="reversePrompt">
            <i class="ti ti-wand"></i>
            {{ loading ? '正在反推' : '开始反推提示词' }}
          </el-button>
          <div v-if="!currentUser" class="reverse-login-tip">
            <i class="ti ti-lock"></i>
            <span>登录后才能使用提示词反推功能。</span>
            <button type="button" @click="$emit('login')">去登录</button>
          </div>
        </section>
      </div>

      <section class="reverse-result-panel glass-card">
        <div class="reverse-result-head">
          <div>
            <span>Result Prompt</span>
            <h2>反推结果</h2>
          </div>
          <div class="reverse-result-actions">
            <el-button :disabled="!prompt.trim()" @click="copyPrompt">
              <i class="ti ti-copy"></i>
              复制
            </el-button>
            <el-button type="primary" :disabled="!prompt.trim()" @click="usePrompt">
              <i class="ti ti-arrow-right"></i>
              去生成
            </el-button>
          </div>
        </div>
        <el-input v-model="prompt" type="textarea" :rows="10" placeholder="反推完成后，提示词会显示在这里，也可以手动修改后复制或去生成。" />
      </section>
    </section>
  `,
}
