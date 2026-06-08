import { clientApi } from '../common/api.js'

const { computed, onMounted, reactive, ref, watch } = Vue

function stringifyJson(value) {
  return JSON.stringify(value, null, 2)
}

function readImageUrl(item) {
  if (!item || typeof item !== 'object') return ''
  if (typeof item.url === 'string') return item.url
  if (typeof item.b64_json === 'string') return `data:image/png;base64,${item.b64_json}`
  return ''
}

function uniqueModels(models) {
  const seen = new Set()
  return (models || []).filter((model) => {
    const key = String(model?.id || '').trim().toLowerCase()
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

async function openaiRequest(path, apiKey, body) {
  const response = await fetch(path, {
    method: path.endsWith('/models') ? 'GET' : 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...(path.endsWith('/models') ? {} : { 'Content-Type': 'application/json' }),
    },
    body: path.endsWith('/models') ? undefined : JSON.stringify(body),
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(payload?.error?.message || payload?.message || `HTTP ${response.status}`)
  }
  return payload
}

export const ApiTestPage = {
  props: ['currentUser'],
  emits: ['login', 'go'],
  setup(props, { emit }) {
    const apiKey = ref('')
    const keys = ref([])
    const models = ref([])
    const loading = ref(false)
    const responseText = ref('')
    const errorText = ref('')
    const imageResults = ref([])
    const newKey = ref(null)
    const keyForm = reactive({ name: 'API 测试 Key' })
    const form = reactive({
      endpoint: '/v1/images/generations',
      model: '',
      prompt: '一张绿色霓虹风格的未来城市海报',
      size: '1024x1024',
      n: 1,
      responseFormat: 'url',
      imageUrl: '',
      chatPrompt: '请用一句话描述 AI 生图接口的用途。',
    })

    const selectedEndpointLabel = computed(() => ({
      '/v1/models': '模型列表',
      '/v1/images/generations': '图片生成',
      '/v1/images/edits': '图片编辑',
      '/v1/chat/completions': '聊天接口',
      '/v1/responses': 'Responses',
    }[form.endpoint] || '接口测试'))
    const canRun = computed(() => apiKey.value.trim() && (form.endpoint === '/v1/models' || form.model))
    const curlText = computed(() => {
      const key = apiKey.value.trim() || 'sk-aipi-你的Key'
      if (form.endpoint === '/v1/models') {
        return `curl ${location.origin}/v1/models \\\n  -H "Authorization: Bearer ${key}"`
      }
      return `curl ${location.origin}${form.endpoint} \\\n  -H "Authorization: Bearer ${key}" \\\n  -H "Content-Type: application/json" \\\n  -d '${stringifyJson(buildBody()).replace(/'/g, "'\\''")}'`
    })

    function buildBody() {
      if (form.endpoint === '/v1/images/generations') {
        return {
          model: form.model,
          prompt: form.prompt,
          size: form.size,
          n: Number(form.n) || 1,
          response_format: form.responseFormat,
        }
      }
      if (form.endpoint === '/v1/images/edits') {
        return {
          model: form.model,
          prompt: form.prompt,
          image_url: form.imageUrl ? [form.imageUrl] : [],
          size: form.size,
          n: Number(form.n) || 1,
          response_format: form.responseFormat,
        }
      }
      if (form.endpoint === '/v1/responses') {
        return {
          model: form.model,
          input: form.chatPrompt,
        }
      }
      return {
        model: form.model,
        messages: [
          { role: 'user', content: form.chatPrompt },
        ],
      }
    }

    async function loadKeys() {
      if (!props.currentUser?.id) {
        keys.value = []
        return
      }
      const response = await clientApi.listApiKeys(props.currentUser.id)
      keys.value = response.data || []
    }

    async function createKey() {
      if (!props.currentUser?.id) {
        emit('login')
        return
      }
      loading.value = true
      try {
        const response = await clientApi.createApiKey(props.currentUser.id, { name: keyForm.name || 'API 测试 Key' })
        newKey.value = response.data
        apiKey.value = response.data?.key || ''
        await loadKeys()
        ElementPlus.ElMessage.success('Key 已生成并填入测试框')
      } catch (error) {
        ElementPlus.ElMessage.error(error.message || '生成 Key 失败')
      } finally {
        loading.value = false
      }
    }

    async function copyText(value) {
      await navigator.clipboard?.writeText(value)
      ElementPlus.ElMessage.success('已复制')
    }

    async function loadModels() {
      if (!apiKey.value.trim()) {
        ElementPlus.ElMessage.warning('请先填写 API Key')
        return
      }
      loading.value = true
      errorText.value = ''
      try {
        const payload = await openaiRequest('/v1/models', apiKey.value.trim())
        models.value = uniqueModels(payload.data)
        responseText.value = stringifyJson(payload)
        if (!form.model && models.value[0]?.id) form.model = models.value[0].id
      } catch (error) {
        errorText.value = error.message || '模型读取失败'
      } finally {
        loading.value = false
      }
    }

    async function runTest() {
      if (!apiKey.value.trim()) {
        ElementPlus.ElMessage.warning('请先填写 API Key')
        return
      }
      loading.value = true
      errorText.value = ''
      responseText.value = ''
      imageResults.value = []
      try {
        const payload = await openaiRequest(form.endpoint, apiKey.value.trim(), buildBody())
        responseText.value = stringifyJson(payload)
        imageResults.value = Array.isArray(payload.data) ? payload.data.map(readImageUrl).filter(Boolean) : []
        if (form.endpoint === '/v1/models') {
          models.value = uniqueModels(payload.data)
          if (!form.model && models.value[0]?.id) form.model = models.value[0].id
        }
      } catch (error) {
        errorText.value = error.message || '接口调用失败'
      } finally {
        loading.value = false
      }
    }

    onMounted(() => {
      loadKeys().catch(() => {})
    })
    watch(() => props.currentUser?.id || '', () => loadKeys().catch(() => {}))

    return {
      apiKey,
      keys,
      models,
      loading,
      responseText,
      errorText,
      imageResults,
      newKey,
      keyForm,
      form,
      selectedEndpointLabel,
      canRun,
      curlText,
      buildBody,
      createKey,
      copyText,
      loadModels,
      runTest,
    }
  },
  template: `
    <section class="api-test-page page-stack">
      <section class="api-test-hero">
        <div>
          <span class="eyebrow"><i class="ti ti-api"></i> OpenAI Compatible API</span>
          <h2>API 测试</h2>
          <p>生成用户 Key 后，可以在这里直接测试模型列表、图片生成、图片编辑和聊天接口。</p>
        </div>
        <div class="api-price-note">
          <span>价格来源</span>
          <strong>后台模型管理</strong>
          <small>图片按模型 1K/2K/4K 价格和 n 数量扣费；聊天按该模型 1K 档价格按次扣费。</small>
        </div>
      </section>

      <section v-if="!currentUser" class="profile-empty">
        <i class="ti ti-user-circle"></i>
        <strong>登录后才能生成和测试 Key</strong>
        <p>API 调用会绑定到当前用户，并从当前账户余额扣费。</p>
        <button class="result-action primary" type="button" @click="$emit('login')">去登录</button>
      </section>

      <template v-else>
        <section class="api-test-grid">
          <article class="api-test-panel">
            <header class="api-test-panel-head">
              <div>
                <span>Key Manager</span>
                <h3>Key 管理与生成</h3>
              </div>
              <button class="result-action" type="button" @click="$emit('go', 'profile')">
                <i class="ti ti-user-circle"></i>
                用户中心
              </button>
            </header>
            <p>Key 在前台用户中心生成和管理；后台用户明细可查看 Key 前缀、状态和最近使用时间。完整 Key 只会在生成时显示一次。</p>
            <div class="api-test-key-create">
              <el-input v-model="keyForm.name" placeholder="Key 名称" />
              <button class="result-action primary" type="button" :disabled="loading" @click="createKey">
                <i class="ti ti-key"></i>
                生成测试 Key
              </button>
            </div>
            <div v-if="newKey?.key" class="api-test-secret">
              <code>{{ newKey.key }}</code>
              <button class="result-action primary" type="button" @click="copyText(newKey.key)">
                <i class="ti ti-copy"></i>
                复制
              </button>
            </div>
            <div class="api-test-key-list">
              <article v-for="key in keys" :key="key.id">
                <strong>{{ key.name }}</strong>
                <span>{{ key.keyPrefix }}******** · {{ key.status === 'active' ? '启用' : '停用' }}</span>
              </article>
              <div v-if="!keys.length" class="profile-mini-empty">还没有 API Key</div>
            </div>
          </article>

          <article class="api-test-panel">
            <header class="api-test-panel-head">
              <div>
                <span>Request</span>
                <h3>{{ selectedEndpointLabel }}</h3>
              </div>
              <button class="result-action" type="button" :disabled="loading" @click="loadModels">
                <i class="ti ti-database-search"></i>
                读取模型
              </button>
            </header>
            <div class="api-test-form">
              <label class="full">
                <span>API Key</span>
                <el-input v-model="apiKey" type="password" show-password placeholder="sk-aipi-..." />
              </label>
              <label>
                <span>接口</span>
                <el-select v-model="form.endpoint" style="width:100%">
                  <el-option label="GET /v1/models" value="/v1/models" />
                  <el-option label="POST /v1/images/generations" value="/v1/images/generations" />
                  <el-option label="POST /v1/images/edits" value="/v1/images/edits" />
                  <el-option label="POST /v1/chat/completions" value="/v1/chat/completions" />
                  <el-option label="POST /v1/responses" value="/v1/responses" />
                </el-select>
              </label>
              <label v-if="form.endpoint !== '/v1/models'">
                <span>模型</span>
                <el-select v-model="form.model" allow-create filterable placeholder="先读取模型或手动输入" style="width:100%">
                  <el-option v-for="model in models" :key="model.id" :label="model.id" :value="model.id" />
                </el-select>
              </label>
              <label v-if="form.endpoint.includes('/images/')">
                <span>尺寸</span>
                <el-input v-model="form.size" />
              </label>
              <label v-if="form.endpoint.includes('/images/')">
                <span>数量 n</span>
                <el-input-number v-model="form.n" :min="1" :max="8" style="width:100%" />
              </label>
              <label v-if="form.endpoint.includes('/images/')">
                <span>返回格式</span>
                <el-select v-model="form.responseFormat" style="width:100%">
                  <el-option label="url" value="url" />
                  <el-option label="b64_json" value="b64_json" />
                </el-select>
              </label>
              <label v-if="form.endpoint === '/v1/images/edits'" class="full">
                <span>编辑图片 URL / data:image</span>
                <el-input v-model="form.imageUrl" placeholder="支持任务图片 URL 或 data:image base64" />
              </label>
              <label v-if="form.endpoint.includes('/images/')" class="full">
                <span>提示词</span>
                <el-input v-model="form.prompt" type="textarea" :rows="4" />
              </label>
              <label v-if="form.endpoint.includes('/chat/') || form.endpoint === '/v1/responses'" class="full">
                <span>聊天内容</span>
                <el-input v-model="form.chatPrompt" type="textarea" :rows="4" />
              </label>
            </div>
            <button class="api-test-run" type="button" :disabled="!canRun || loading" @click="runTest">
              <i :class="['ti', loading ? 'ti-loader-2' : 'ti-player-play']"></i>
              {{ loading ? '调用中' : '开始测试' }}
            </button>
          </article>
        </section>

        <section class="api-test-output">
          <article class="api-test-panel">
            <header class="api-test-panel-head">
              <div>
                <span>Curl</span>
                <h3>请求示例</h3>
              </div>
              <button class="result-action" type="button" @click="copyText(curlText)">
                <i class="ti ti-copy"></i>
                复制
              </button>
            </header>
            <pre>{{ curlText }}</pre>
          </article>

          <article class="api-test-panel">
            <header class="api-test-panel-head">
              <div>
                <span>Response</span>
                <h3>响应结果</h3>
              </div>
            </header>
            <div v-if="errorText" class="api-test-error">{{ errorText }}</div>
            <div v-if="imageResults.length" class="api-test-images">
              <img v-for="url in imageResults" :key="url" :src="url" alt="API result" />
            </div>
            <pre>{{ responseText || '等待调用结果...' }}</pre>
          </article>
        </section>
      </template>
    </section>
  `,
}
