const { computed } = Vue

function jsonText(value) {
  return JSON.stringify(value, null, 2)
}

export const ApiDocsPage = {
  props: ['currentUser'],
  emits: ['go', 'login'],
  setup(props, { emit }) {
    const baseUrl = computed(() => (typeof location === 'undefined' ? '' : location.origin))
    const sampleKey = computed(() => props.currentUser ? 'sk-aipi-你的完整Key' : '登录后在用户中心生成 API Key')
    const endpoints = [
      { method: 'GET', path: '/v1/models', label: '模型列表', desc: '返回可用模型，模型名称来自系统上游模型配置。' },
      { method: 'GET', path: '/v1/balance', label: '余额查询', desc: '返回当前 API Key 绑定账号的积分余额。' },
      { method: 'POST', path: '/v1/images/generations', label: '图片生成', desc: '文生图接口，支持 n 返回多张图片。' },
      { method: 'POST', path: '/v1/images/edits', label: '图片编辑', desc: '图生图/编辑接口，支持传入图片 URL 或图片数组。' },
      { method: 'POST', path: '/v1/chat/completions', label: '聊天接口', desc: '兼容 OpenAI 聊天格式，可用于图片场景的上游模型。' },
      { method: 'POST', path: '/v1/responses', label: 'Responses', desc: '兼容 Responses 调用格式。' },
    ]
    const generationBody = {
      model: 'gpt-image-2',
      prompt: '一张绿色霓虹风格的未来城市海报',
      size: '1024x1024',
      n: 1,
      response_format: 'url',
    }
    const editBody = {
      model: 'gpt-image-2',
      prompt: '把图片改成赛博朋克风格，保留主体构图',
      image_url: ['https://example.com/image.png'],
      size: '1024x1024',
      n: 1,
      response_format: 'url',
    }
    const chatBody = {
      model: 'gpt-5',
      messages: [
        { role: 'user', content: '请用一句话描述这张图片适合生成什么提示词。' },
      ],
    }

    function curl(path, body) {
      const key = sampleKey.value
      if (!body) {
        return `curl ${baseUrl.value}${path} \\\n  -H "Authorization: Bearer ${key}"`
      }
      return `curl ${baseUrl.value}${path} \\\n  -H "Authorization: Bearer ${key}" \\\n  -H "Content-Type: application/json" \\\n  -d '${jsonText(body).replace(/'/g, "'\\''")}'`
    }

    async function copyText(value) {
      await navigator.clipboard?.writeText(value)
      ElementPlus.ElMessage.success('已复制')
    }

    function goProfile() {
      if (!props.currentUser) {
        emit('login')
        return
      }
      emit('go', 'profile')
    }

    return {
      baseUrl,
      sampleKey,
      endpoints,
      generationBody,
      editBody,
      chatBody,
      curl,
      copyText,
      goProfile,
      jsonText,
    }
  },
  template: `
    <section class="api-docs-page">
      <div class="api-docs-hero">
        <div>
          <span class="eyebrow"><i class="ti ti-book-2"></i> Developer Docs</span>
          <h2>接口对接文档</h2>
          <p>使用用户中心生成的 API Key 调用本站封装的 /v1 接口，图片生成、图片编辑和聊天接口都会走当前账号扣费。</p>
        </div>
        <div class="api-docs-base">
          <span>Base URL</span>
          <code>{{ baseUrl }}</code>
          <button class="result-action" type="button" @click="copyText(baseUrl)">
            <i class="ti ti-copy"></i>
            复制
          </button>
        </div>
      </div>

      <div class="api-docs-grid">
        <article class="api-docs-panel">
          <header class="api-docs-panel-head">
            <div>
              <span>Authentication</span>
              <h3>鉴权方式</h3>
            </div>
            <button class="result-action primary" type="button" @click="goProfile">
              <i class="ti ti-key"></i>
              获取 Key
            </button>
          </header>
          <p>请求头统一携带 Bearer Key。每个用户只允许拥有一个 Key，前台删除后后台仍保留记录和调用日志。</p>
          <pre>Authorization: Bearer {{ sampleKey }}</pre>
        </article>

        <article class="api-docs-panel">
          <header class="api-docs-panel-head">
            <div>
              <span>Billing</span>
              <h3>计费规则</h3>
            </div>
            <i class="ti ti-coins"></i>
          </header>
          <p>通过 Key 调用接口会消耗当前账号积分。模型价格读取后台模型管理配置；图片接口支持 n 参数返回多张图片，并按系统计费规则扣费。</p>
          <div class="api-docs-note">
            <i class="ti ti-info-circle"></i>
            <span>请勿在浏览器公开页面或客户端应用中暴露完整 Key。</span>
          </div>
        </article>
      </div>

      <article class="api-docs-panel">
        <header class="api-docs-panel-head">
          <div>
            <span>Endpoints</span>
            <h3>支持接口</h3>
          </div>
        </header>
        <div class="api-docs-endpoints">
          <div v-for="item in endpoints" :key="item.path" class="api-docs-endpoint">
            <strong>{{ item.method }}</strong>
            <code>{{ item.path }}</code>
            <span>{{ item.label }}</span>
            <p>{{ item.desc }}</p>
          </div>
        </div>
      </article>

      <div class="api-docs-examples">
        <article class="api-docs-panel">
          <header class="api-docs-panel-head">
            <div><span>Example</span><h3>获取模型</h3></div>
            <button class="result-action" type="button" @click="copyText(curl('/v1/models'))"><i class="ti ti-copy"></i>复制</button>
          </header>
          <pre>{{ curl('/v1/models') }}</pre>
        </article>

        <article class="api-docs-panel">
          <header class="api-docs-panel-head">
            <div><span>Example</span><h3>查询余额</h3></div>
            <button class="result-action" type="button" @click="copyText(curl('/v1/balance'))"><i class="ti ti-copy"></i>复制</button>
          </header>
          <pre>{{ curl('/v1/balance') }}</pre>
        </article>

        <article class="api-docs-panel">
          <header class="api-docs-panel-head">
            <div><span>Example</span><h3>图片生成</h3></div>
            <button class="result-action" type="button" @click="copyText(curl('/v1/images/generations', generationBody))"><i class="ti ti-copy"></i>复制</button>
          </header>
          <pre>{{ curl('/v1/images/generations', generationBody) }}</pre>
        </article>

        <article class="api-docs-panel">
          <header class="api-docs-panel-head">
            <div><span>Example</span><h3>图片编辑</h3></div>
            <button class="result-action" type="button" @click="copyText(curl('/v1/images/edits', editBody))"><i class="ti ti-copy"></i>复制</button>
          </header>
          <pre>{{ curl('/v1/images/edits', editBody) }}</pre>
        </article>

        <article class="api-docs-panel">
          <header class="api-docs-panel-head">
            <div><span>Example</span><h3>聊天接口</h3></div>
            <button class="result-action" type="button" @click="copyText(curl('/v1/chat/completions', chatBody))"><i class="ti ti-copy"></i>复制</button>
          </header>
          <pre>{{ curl('/v1/chat/completions', chatBody) }}</pre>
        </article>
      </div>

      <article class="api-docs-panel">
        <header class="api-docs-panel-head">
          <div>
            <span>Response</span>
            <h3>返回格式</h3>
          </div>
        </header>
        <div class="api-docs-response-grid">
          <div>
            <strong>图片接口</strong>
            <p>返回 OpenAI 兼容的 data 数组，元素可能包含 url 或 b64_json，取决于 response_format。</p>
          </div>
          <div>
            <strong>错误响应</strong>
            <p>Key 无效、余额不足、模型不可用或上游失败时，会返回 error/message 信息，请按 HTTP 状态码处理。</p>
          </div>
        </div>
      </article>
    </section>
  `,
}
