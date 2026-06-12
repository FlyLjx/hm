import { clientApi } from '../common/api.js'
import { taskImages } from '../common/chatSession.js'
import {
  getActiveModelsByCapability,
  getAvailableRatioOptions,
  getAvailableSizeTierOptions,
  getModelLabel,
  getSizeForRatio,
} from '../common/options.js'

const { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } = Vue

const canvasStorageKey = 'aipi-canvas-projects-v1'
const workflowStorageKey = 'aipi-canvas-workflow-v3'
const workflowConnectionStorageKey = 'aipi-canvas-workflow-connections-v1'
const workflowViewStorageKey = 'aipi-canvas-workflow-view-v1'
const terminalTaskStatuses = ['success', 'failed', 'canceled']

const sizePresets = [
  { id: 'poster', name: '竖版海报', detail: '1080 x 1920 px', width: 1080, height: 1920, dpi: 144 },
  { id: 'square', name: '方形广告', detail: '1080 x 1080 px', width: 1080, height: 1080, dpi: 144 },
  { id: 'banner', name: '横幅展板', detail: '1920 x 760 px', width: 1920, height: 760, dpi: 144 },
  { id: 'rollup', name: '易拉宝', detail: '800 x 2000 mm / 300DPI', width: 945, height: 2362, dpi: 300 },
  { id: 'storefront', name: '门头招牌', detail: '3000 x 900 mm', width: 2400, height: 720, dpi: 150 },
  { id: 'a4', name: 'A4 宣传单', detail: '2480 x 3508 px / 300DPI', width: 1240, height: 1754, dpi: 300 },
]

const starterTemplates = [
  {
    id: 'enroll',
    name: '招生海报',
    subtitle: '适合培训班、体验课、寒暑假',
    presetId: 'poster',
    title: '暑期美术班招生',
    kicker: '限时优惠',
    body: '零基础可学 | 小班教学 | 作品带回家',
    accent: '#15a05f',
  },
  {
    id: 'shop',
    name: '门店促销',
    subtitle: '适合开业、活动、会员日',
    presetId: 'square',
    title: '开业大酬宾',
    kicker: '全场低至 5 折',
    body: '到店即送精美礼品，数量有限先到先得',
    accent: '#f59e0b',
  },
  {
    id: 'recruit',
    name: '招聘广告',
    subtitle: '适合门店招聘、兼职招募',
    presetId: 'poster',
    title: '诚聘店员',
    kicker: '待遇从优',
    body: '包教会 | 月休四天 | 有经验优先',
    accent: '#0ea5e9',
  },
]

const workflowLibrary = [
  {
    title: '输入节点',
    items: [
      { type: 'prompt', label: '输入提示词', icon: 'ti-message-2', color: '#3b82f6' },
      { type: 'reference', label: '输入参考图', icon: 'ti-photo-plus', color: '#22d3ee' },
    ],
  },
  {
    title: '基础控件',
    items: [
      { type: 'chat', label: '智能对话', icon: 'ti-message-bolt', color: '#6366f1' },
      { type: 'polish', label: '美化提示词', icon: 'ti-wand', color: '#ec4899' },
      { type: 'reverse', label: '反推提示词', icon: 'ti-refresh', color: '#a855f7' },
    ],
  },
  {
    title: 'AI 图像生成',
    items: [
      { type: 'generate', label: '图片生成', icon: 'ti-sparkles', color: '#6675ff' },
    ],
  },
  {
    title: '图像处理',
    items: [
      { type: 'caption', label: '文本备注', icon: 'ti-notes', color: '#10b981' },
      { type: 'light', label: '色彩与光影', icon: 'ti-brightness-up', color: '#f43f5e' },
      { type: 'transform', label: '图像变换', icon: 'ti-transform', color: '#f59e0b' },
      { type: 'merge', label: '长图合成', icon: 'ti-layout-list', color: '#d946ef' },
      { type: 'vector', label: '图转矢量', icon: 'ti-vector', color: '#14b8a6' },
    ],
  },
]

const workflowBackgroundModes = [
  { id: 'dots', label: '点阵', icon: 'ti-grid-dots' },
  { id: 'grid', label: '网格', icon: 'ti-border-all' },
  { id: 'plain', label: '空白', icon: 'ti-square' },
]

const workflowNodeMeta = workflowLibrary
  .flatMap((group) => group.items)
  .reduce((map, item) => ({ ...map, [item.type]: item }), {})

function createWorkflowNode(type, options = {}) {
  const meta = workflowNodeMeta[type] || { label: '处理节点', icon: 'ti-box', color: '#22c55e' }
  return {
    id: createId(`node-${type}`),
    type,
    title: options.title || meta.label,
    icon: options.icon || meta.icon,
    color: options.color || meta.color,
    x: Number(options.x ?? 360),
    y: Number(options.y ?? 220),
    width: Number(options.width || (type === 'reference' || type === 'generate' ? 320 : 250)),
    prompt: options.prompt || '',
    body: options.body || '',
    image: options.image || '',
    status: options.status || 'idle',
    taskId: options.taskId || '',
    errorMessage: options.errorMessage || '',
    outputs: options.outputs || [],
  }
}

function createDefaultWorkflowNodes() {
  return [
    {
      ...createWorkflowNode('prompt', {
        x: 240,
        y: 230,
        title: '提示词输入',
        prompt: '设计一张广告店常用的端午节活动海报，画面清爽，有商品展示区、优惠信息和联系方式',
        body: '给图片生成节点提供主画面需求',
      }),
      id: 'node-prompt-default',
    },
    {
      ...createWorkflowNode('reference', {
        x: 510,
        y: 130,
        title: '输入参考图',
        body: '上传客户素材、门店照片、商品图或已有海报',
        width: 350,
      }),
      id: 'node-reference-default',
    },
    {
      ...createWorkflowNode('polish', {
        x: 790,
        y: 230,
        title: '提示词美化',
        body: '自动补充版式、光影、印刷感和清晰度描述',
      }),
      id: 'node-polish-default',
    },
    {
      ...createWorkflowNode('generate', {
        x: 1015,
        y: 145,
        title: '图片生成',
        body: '根据提示词与参考素材生成广告画面',
        width: 360,
      }),
      id: 'node-generate-default',
    },
    {
      ...createWorkflowNode('caption', {
        x: 1015,
        y: 475,
        title: '文本备注',
        body: '客户要求、交付尺寸、印刷材质、修改意见都可以放在这里',
        width: 330,
      }),
      id: 'node-caption-default',
    },
  ]
}

function createWorkflowConnection(from, to) {
  return {
    id: createId('workflow-link'),
    from,
    to,
  }
}

function createDefaultWorkflowConnections() {
  return [
    createWorkflowConnection('node-prompt-default', 'node-polish-default'),
    createWorkflowConnection('node-reference-default', 'node-generate-default'),
    createWorkflowConnection('node-polish-default', 'node-generate-default'),
    createWorkflowConnection('node-generate-default', 'node-caption-default'),
  ]
}

function loadStoredWorkflowNodes() {
  try {
    const raw = localStorage.getItem(workflowStorageKey)
    const items = raw ? JSON.parse(raw) : null
    return Array.isArray(items) && items.length ? items : createDefaultWorkflowNodes()
  } catch {
    return createDefaultWorkflowNodes()
  }
}

function saveStoredWorkflowNodes(nodes) {
  localStorage.setItem(workflowStorageKey, JSON.stringify(nodes))
}

function loadStoredWorkflowConnections() {
  try {
    const raw = localStorage.getItem(workflowConnectionStorageKey)
    const items = raw ? JSON.parse(raw) : null
    return Array.isArray(items) && items.length ? items : createDefaultWorkflowConnections()
  } catch {
    return createDefaultWorkflowConnections()
  }
}

function saveStoredWorkflowConnections(connections) {
  localStorage.setItem(workflowConnectionStorageKey, JSON.stringify(connections))
}

function loadStoredWorkflowView() {
  try {
    const raw = localStorage.getItem(workflowViewStorageKey)
    const value = raw ? JSON.parse(raw) : null
    return {
      backgroundMode: workflowBackgroundModes.some((item) => item.id === value?.backgroundMode) ? value.backgroundMode : 'dots',
      miniMapOpen: value?.miniMapOpen !== false,
    }
  } catch {
    return { backgroundMode: 'dots', miniMapOpen: true }
  }
}

function saveStoredWorkflowView(view) {
  localStorage.setItem(workflowViewStorageKey, JSON.stringify(view))
}

function createId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function loadStoredProjects() {
  try {
    const raw = localStorage.getItem(canvasStorageKey)
    const items = raw ? JSON.parse(raw) : null
    return Array.isArray(items) && items.length ? items : [createProject()]
  } catch {
    return [createProject()]
  }
}

function saveStoredProjects(projects) {
  localStorage.setItem(canvasStorageKey, JSON.stringify(projects))
}

function createProject() {
  const now = Date.now()
  const artboard = createArtboard(sizePresets[0], { x: 0, y: 0 })
  return {
    id: createId('canvas'),
    name: '广告画布项目',
    createdAt: now,
    updatedAt: now,
    artboards: [artboard],
    elements: [
      createTextElement('双击修改主标题', { x: artboard.x + 120, y: artboard.y + 180, width: 540, fontSize: 64, fontWeight: 800, fill: '#101828' }),
      createTextElement('上传客户素材，或使用 AI 生图后拖入画布', { x: artboard.x + 120, y: artboard.y + 280, width: 560, fontSize: 28, fill: '#475467' }),
    ],
  }
}

function createArtboard(preset, offset = {}) {
  return {
    id: createId('artboard'),
    name: preset.name,
    presetId: preset.id,
    width: preset.width,
    height: preset.height,
    dpi: preset.dpi,
    x: Number(offset.x || 0),
    y: Number(offset.y || 0),
    background: '#ffffff',
  }
}

function createTextElement(text, options = {}) {
  return {
    id: createId('text'),
    type: 'text',
    name: options.name || '文字',
    text,
    x: Number(options.x || 0),
    y: Number(options.y || 0),
    width: Number(options.width || 360),
    height: Number(options.height || 80),
    fontSize: Number(options.fontSize || 36),
    fontWeight: Number(options.fontWeight || 700),
    fill: options.fill || '#101828',
  }
}

function createImageElement(source, options = {}) {
  return {
    id: createId('image'),
    type: 'image',
    name: options.name || '图片素材',
    src: source,
    status: options.status || 'ready',
    taskId: options.taskId || '',
    prompt: options.prompt || '',
    errorMessage: options.errorMessage || '',
    x: Number(options.x || 0),
    y: Number(options.y || 0),
    width: Number(options.width || 360),
    height: Number(options.height || 260),
  }
}

function createRectElement(options = {}) {
  return {
    id: createId('rect'),
    type: 'rect',
    name: options.name || '色块',
    x: Number(options.x || 0),
    y: Number(options.y || 0),
    width: Number(options.width || 360),
    height: Number(options.height || 160),
    fill: options.fill || '#e8f8ef',
    radius: Number(options.radius || 24),
  }
}

function rectsIntersect(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

export const CanvasPage = {
  props: {
    currentUser: Object,
    siteName: String,
  },
  emits: ['login', 'go'],
  setup(props, { emit }) {
    const projects = ref(loadStoredProjects())
    const activeProjectId = ref(projects.value[0]?.id || '')
    const selectedId = ref('')
    const selectedType = ref('')
    const activeTool = ref('select')
    const activePresetId = ref('poster')
    const stageRef = ref(null)
    const fileInputRef = ref(null)
    const zoom = ref(0.34)
    const pan = reactive({ x: 420, y: 110 })
    const dragState = reactive({ mode: '', id: '', startX: 0, startY: 0, baseX: 0, baseY: 0 })
    const aiPrompt = ref('')
    const modelId = ref('')
    const chatModels = ref([])
    const ratio = ref('1:1')
    const sizeTier = ref('1k')
    const aiGenerating = ref(false)
    const aiError = ref('')
    const saveNotice = ref('')
    const taskPollTimers = new Set()
    const workflowStageRef = ref(null)
    const selectedWorkflowNodeId = ref('node-generate-default')
    const selectedWorkflowNodeIds = ref(['node-generate-default'])
    const workflowPan = reactive({ x: 0, y: 0 })
    const workflowZoom = ref(0.84)
    const workflowDragState = reactive({ mode: '', id: '', startX: 0, startY: 0, baseX: 0, baseY: 0, baseNodes: [] })
    const workflowNodes = ref(loadStoredWorkflowNodes())
    const workflowConnections = ref(loadStoredWorkflowConnections())
    const workflowView = loadStoredWorkflowView()
    const workflowBackgroundMode = ref(workflowView.backgroundMode)
    const workflowMiniMapOpen = ref(workflowView.miniMapOpen)
    const workflowImportInputRef = ref(null)
    const workflowSelectionBox = reactive({ active: false, startX: 0, startY: 0, x: 0, y: 0 })
    const workflowHistory = reactive({ undo: [], redo: [], applying: false })
    const workflowClipboard = ref(null)
    const workflowLinkDraft = reactive({ active: false, from: '', x: 0, y: 0 })
    const selectedWorkflowConnectionId = ref('')
    const workflowNodePicker = reactive({ visible: false, from: '', x: 0, y: 0, stageX: 0, stageY: 0, groupTitle: 'AI 图像生成' })

    const activeProject = computed(() => projects.value.find((project) => project.id === activeProjectId.value) || projects.value[0])
    const selectedElement = computed(() => activeProject.value?.elements.find((item) => item.id === selectedId.value) || null)
    const selectedArtboard = computed(() => activeProject.value?.artboards.find((item) => item.id === selectedId.value) || activeProject.value?.artboards[0] || null)
    const activePreset = computed(() => sizePresets.find((item) => item.id === activePresetId.value) || sizePresets[0])
    const selectedModel = computed(() => chatModels.value.find((model) => model.id === modelId.value) || null)
    const availableRatios = computed(() => getAvailableRatioOptions(selectedModel.value))
    const availableSizeTiers = computed(() => getAvailableSizeTierOptions(selectedModel.value, ratio.value))
    const outputSize = computed(() => getSizeForRatio(ratio.value, sizeTier.value))
    const zoomText = computed(() => `${Math.round(zoom.value * 100)}%`)
    const workflowZoomText = computed(() => `${Math.round(workflowZoom.value * 100)}%`)
    const activeProjectUpdated = computed(() => {
      const value = activeProject.value?.updatedAt
      return value ? dayjs(value).format('MM-DD HH:mm') : '未保存'
    })
    const selectedWorkflowNode = computed(() => workflowNodes.value.find((node) => node.id === selectedWorkflowNodeId.value) || null)
    const selectedWorkflowConnection = computed(() => workflowConnections.value.find((connection) => connection.id === selectedWorkflowConnectionId.value) || null)
    const workflowPickerGroup = computed(() => workflowLibrary.find((group) => group.title === workflowNodePicker.groupTitle) || workflowLibrary[0])
    const workflowCanvasClass = computed(() => `workflow-bg-${workflowBackgroundMode.value}`)
    const workflowSelectedCount = computed(() => selectedWorkflowNodeIds.value.length + (selectedWorkflowConnectionId.value ? 1 : 0))
    const workflowPromptNode = computed(() => workflowNodes.value.find((node) => node.type === 'prompt') || null)
    const workflowGenerateNode = computed(() => workflowNodes.value.find((node) => node.type === 'generate') || null)
    const workflowPromptText = computed(() => workflowPromptNode.value?.prompt?.trim() || aiPrompt.value.trim())
    const workflowLinks = computed(() => {
      return workflowConnections.value
        .map((connection) => {
          const from = workflowNodes.value.find((node) => node.id === connection.from)
          const to = workflowNodes.value.find((node) => node.id === connection.to)
          if (!from || !to) return null
          return {
            id: connection.id,
            from: connection.from,
            to: connection.to,
            selected: selectedWorkflowConnectionId.value === connection.id,
            path: workflowLinkPath(workflowOutputPoint(from), workflowInputPoint(to)),
          }
        })
        .filter(Boolean)
    })
    const workflowDraftLink = computed(() => {
      if (!workflowLinkDraft.active) return null
      const from = workflowNodes.value.find((node) => node.id === workflowLinkDraft.from)
      if (!from) return null
      return workflowLinkPath(workflowOutputPoint(from), { x: workflowLinkDraft.x, y: workflowLinkDraft.y })
    })
    const workflowSelectionStyle = computed(() => {
      if (!workflowSelectionBox.active) return {}
      const left = Math.min(workflowSelectionBox.startX, workflowSelectionBox.x)
      const top = Math.min(workflowSelectionBox.startY, workflowSelectionBox.y)
      const width = Math.abs(workflowSelectionBox.x - workflowSelectionBox.startX)
      const height = Math.abs(workflowSelectionBox.y - workflowSelectionBox.startY)
      return { left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px` }
    })
    const workflowBounds = computed(() => {
      const nodes = workflowNodes.value
      if (!nodes.length) return { minX: -200, minY: -160, width: 1200, height: 760, scale: 0.12 }
      const minX = Math.min(...nodes.map((node) => node.x)) - 160
      const minY = Math.min(...nodes.map((node) => node.y)) - 160
      const maxX = Math.max(...nodes.map((node) => node.x + node.width)) + 160
      const maxY = Math.max(...nodes.map((node) => node.y + 260)) + 160
      const width = Math.max(720, maxX - minX)
      const height = Math.max(420, maxY - minY)
      return { minX, minY, width, height, scale: Math.min(180 / width, 112 / height) }
    })
    const workflowMiniMapNodes = computed(() => workflowNodes.value.map((node) => ({
      id: node.id,
      selected: selectedWorkflowNodeIds.value.includes(node.id),
      style: {
        left: `${(node.x - workflowBounds.value.minX) * workflowBounds.value.scale}px`,
        top: `${(node.y - workflowBounds.value.minY) * workflowBounds.value.scale}px`,
        width: `${Math.max(10, node.width * workflowBounds.value.scale)}px`,
        height: `${Math.max(8, 72 * workflowBounds.value.scale)}px`,
      },
    })))
    const workflowMiniMapViewport = computed(() => {
      const width = workflowStageRef.value?.clientWidth || 1200
      const height = workflowStageRef.value?.clientHeight || 720
      const view = {
        x: -workflowPan.x / workflowZoom.value,
        y: -workflowPan.y / workflowZoom.value,
        width: width / workflowZoom.value,
        height: height / workflowZoom.value,
      }
      return {
        left: `${(view.x - workflowBounds.value.minX) * workflowBounds.value.scale}px`,
        top: `${(view.y - workflowBounds.value.minY) * workflowBounds.value.scale}px`,
        width: `${Math.max(16, view.width * workflowBounds.value.scale)}px`,
        height: `${Math.max(12, view.height * workflowBounds.value.scale)}px`,
      }
    })

    const viewBox = computed(() => {
      const width = stageRef.value?.clientWidth || 1200
      const height = stageRef.value?.clientHeight || 800
      return `${-pan.x / zoom.value} ${-pan.y / zoom.value} ${width / zoom.value} ${height / zoom.value}`
    })

    const sortedElements = computed(() => activeProject.value?.elements || [])
    const selectedBounds = computed(() => {
      if (selectedElement.value) return selectedElement.value
      if (selectedType.value === 'artboard') return selectedArtboard.value
      return null
    })

    function persist() {
      const project = activeProject.value
      if (project) project.updatedAt = Date.now()
      saveStoredProjects(projects.value)
    }

    async function loadModels() {
      try {
        const response = await clientApi.listModels()
        chatModels.value = getActiveModelsByCapability(response.data || [], 'chat_image')
        if (!modelId.value && chatModels.value[0]) modelId.value = chatModels.value[0].id
      } catch (error) {
        aiError.value = error.message || '模型加载失败'
      }
    }

    function setTool(tool) {
      activeTool.value = tool
    }

    function selectItem(id, type) {
      selectedId.value = id
      selectedType.value = type
    }

    function clearSelection() {
      selectedId.value = ''
      selectedType.value = ''
    }

    function stagePoint(event) {
      const rect = stageRef.value?.getBoundingClientRect()
      return {
        x: (event.clientX - (rect?.left || 0) - pan.x) / zoom.value,
        y: (event.clientY - (rect?.top || 0) - pan.y) / zoom.value,
      }
    }

    function addArtboard(preset = activePreset.value) {
      const project = activeProject.value
      if (!project) return
      const last = project.artboards[project.artboards.length - 1]
      const x = last ? last.x + last.width + 160 : 0
      const y = last ? last.y : 0
      const artboard = createArtboard(preset, { x, y })
      project.artboards.push(artboard)
      selectItem(artboard.id, 'artboard')
      persist()
    }

    function addTextAt(point) {
      const project = activeProject.value
      if (!project) return
      const element = createTextElement('输入广告文案', { x: point.x, y: point.y, width: 420, fontSize: 42 })
      project.elements.push(element)
      selectItem(element.id, 'element')
      persist()
    }

    function addRectAt(point, options = {}) {
      const project = activeProject.value
      if (!project) return
      const element = createRectElement({ x: point.x, y: point.y, ...options })
      project.elements.push(element)
      selectItem(element.id, 'element')
      persist()
    }

    function triggerUpload() {
      fileInputRef.value?.click()
    }

    function handleImageUpload(event) {
      const file = event.target.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => {
        if (workflowStageRef.value) {
          const width = workflowStageRef.value.clientWidth || 1200
          const height = workflowStageRef.value.clientHeight || 720
          createWorkflowImageNode(String(reader.result || ''), {
            x: (width / 2 - workflowPan.x) / workflowZoom.value - 160,
            y: (height / 2 - workflowPan.y) / workflowZoom.value - 100,
          }, file.name || '图片素材')
          return
        }
        const artboard = selectedArtboard.value || activeProject.value?.artboards[0]
        const element = createImageElement(String(reader.result || ''), {
          name: file.name || '图片素材',
          x: (artboard?.x || 0) + 90,
          y: (artboard?.y || 0) + 120,
          width: Math.min(520, (artboard?.width || 700) * 0.55),
          height: Math.min(390, (artboard?.height || 700) * 0.36),
        })
        activeProject.value.elements.push(element)
        selectItem(element.id, 'element')
        persist()
      }
      reader.readAsDataURL(file)
      event.target.value = ''
    }

    function applyTemplate(template) {
      const project = activeProject.value
      if (!project) return
      const preset = sizePresets.find((item) => item.id === template.presetId) || sizePresets[0]
      const last = project.artboards[project.artboards.length - 1]
      const artboard = createArtboard(preset, { x: last ? last.x + last.width + 160 : 0, y: last ? last.y : 0 })
      project.artboards.push(artboard)
      project.elements.push(
        createRectElement({ name: '背景色块', x: artboard.x + 70, y: artboard.y + 80, width: artboard.width - 140, height: artboard.height - 160, fill: '#f7fbf8', radius: 36 }),
        createTextElement(template.kicker, { name: '活动标签', x: artboard.x + 120, y: artboard.y + 170, width: 380, fontSize: 34, fill: template.accent }),
        createTextElement(template.title, { name: '主标题', x: artboard.x + 120, y: artboard.y + 250, width: artboard.width - 240, fontSize: 76, fontWeight: 900, fill: '#101828' }),
        createTextElement(template.body, { name: '活动说明', x: artboard.x + 120, y: artboard.y + 380, width: artboard.width - 240, fontSize: 32, fill: '#475467' }),
      )
      selectItem(artboard.id, 'artboard')
      persist()
    }

    function onStagePointerDown(event) {
      if (event.target.closest?.('.canvas-floating-controls')) return
      const point = stagePoint(event)
      if (activeTool.value === 'text') {
        addTextAt(point)
        activeTool.value = 'select'
        return
      }
      if (activeTool.value === 'rect') {
        addRectAt(point)
        activeTool.value = 'select'
        return
      }
      if (activeTool.value === 'hand' || event.button === 1 || event.altKey) {
        dragState.mode = 'pan'
        dragState.startX = event.clientX
        dragState.startY = event.clientY
        dragState.baseX = pan.x
        dragState.baseY = pan.y
        return
      }
      clearSelection()
    }

    function onElementPointerDown(event, element) {
      event.stopPropagation()
      selectItem(element.id, 'element')
      dragState.mode = 'move-element'
      dragState.id = element.id
      dragState.startX = event.clientX
      dragState.startY = event.clientY
      dragState.baseX = element.x
      dragState.baseY = element.y
    }

    function onArtboardPointerDown(event, artboard) {
      event.stopPropagation()
      selectItem(artboard.id, 'artboard')
      dragState.mode = 'move-artboard'
      dragState.id = artboard.id
      dragState.startX = event.clientX
      dragState.startY = event.clientY
      dragState.baseX = artboard.x
      dragState.baseY = artboard.y
    }

    function onPointerMove(event) {
      if (!dragState.mode) return
      if (dragState.mode === 'pan') {
        pan.x = dragState.baseX + event.clientX - dragState.startX
        pan.y = dragState.baseY + event.clientY - dragState.startY
        return
      }
      const dx = (event.clientX - dragState.startX) / zoom.value
      const dy = (event.clientY - dragState.startY) / zoom.value
      if (dragState.mode === 'move-element') {
        const element = activeProject.value?.elements.find((item) => item.id === dragState.id)
        if (!element) return
        element.x = Math.round(dragState.baseX + dx)
        element.y = Math.round(dragState.baseY + dy)
      }
      if (dragState.mode === 'move-artboard') {
        const artboard = activeProject.value?.artboards.find((item) => item.id === dragState.id)
        if (!artboard) return
        const startX = artboard.x
        const startY = artboard.y
        artboard.x = Math.round(dragState.baseX + dx)
        artboard.y = Math.round(dragState.baseY + dy)
        const deltaX = artboard.x - startX
        const deltaY = artboard.y - startY
        activeProject.value.elements.forEach((element) => {
          if (rectsIntersect(element, { x: startX, y: startY, width: artboard.width, height: artboard.height })) {
            element.x += deltaX
            element.y += deltaY
          }
        })
      }
    }

    function onPointerUp() {
      if (dragState.mode === 'move-element' || dragState.mode === 'move-artboard') persist()
      dragState.mode = ''
      dragState.id = ''
    }

    function onWheel(event) {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      const next = Math.min(1.6, Math.max(0.12, zoom.value - event.deltaY * 0.001))
      zoom.value = Number(next.toFixed(2))
    }

    function zoomIn() {
      zoom.value = Math.min(1.6, Number((zoom.value + 0.08).toFixed(2)))
    }

    function zoomOut() {
      zoom.value = Math.max(0.12, Number((zoom.value - 0.08).toFixed(2)))
    }

    function fitView() {
      const artboard = selectedArtboard.value || activeProject.value?.artboards[0]
      const width = stageRef.value?.clientWidth || 1200
      const height = stageRef.value?.clientHeight || 760
      if (!artboard) return
      const nextZoom = Math.min(0.9, Math.max(0.12, Math.min((width - 180) / artboard.width, (height - 120) / artboard.height)))
      zoom.value = Number(nextZoom.toFixed(2))
      pan.x = Math.round(width / 2 - (artboard.x + artboard.width / 2) * zoom.value)
      pan.y = Math.round(height / 2 - (artboard.y + artboard.height / 2) * zoom.value)
    }

    function updateSelected(key, value) {
      const target = selectedElement.value || (selectedType.value === 'artboard' ? selectedArtboard.value : null)
      if (!target) return
      const numericKeys = ['x', 'y', 'width', 'height', 'fontSize', 'dpi']
      target[key] = numericKeys.includes(key) ? Number(value) || 0 : value
      persist()
    }

    function duplicateSelected() {
      const project = activeProject.value
      if (!project || !selectedElement.value) return
      const next = clone(selectedElement.value)
      next.id = createId(next.type)
      next.name = `${next.name || '元素'} 副本`
      next.x += 36
      next.y += 36
      project.elements.push(next)
      selectItem(next.id, 'element')
      persist()
    }

    function deleteSelected() {
      const project = activeProject.value
      if (!project || !selectedId.value) return
      if (selectedType.value === 'element') {
        project.elements = project.elements.filter((item) => item.id !== selectedId.value)
      } else if (selectedType.value === 'artboard' && project.artboards.length > 1) {
        project.artboards = project.artboards.filter((item) => item.id !== selectedId.value)
      }
      clearSelection()
      persist()
    }

    function createNewProject() {
      const project = createProject()
      projects.value.unshift(project)
      activeProjectId.value = project.id
      selectedId.value = project.artboards[0].id
      selectedType.value = 'artboard'
      persist()
      nextTick(fitView)
    }

    function markSaved() {
      persist()
      saveNotice.value = '已保存到本地'
      window.setTimeout(() => {
        saveNotice.value = ''
      }, 1600)
    }

    function workflowSnapshot() {
      return {
        nodes: clone(workflowNodes.value),
        connections: clone(workflowConnections.value),
        pan: { x: workflowPan.x, y: workflowPan.y },
        zoom: workflowZoom.value,
        backgroundMode: workflowBackgroundMode.value,
        miniMapOpen: workflowMiniMapOpen.value,
      }
    }

    let lastWorkflowSnapshotText = JSON.stringify(workflowSnapshot())

    function restoreWorkflowSnapshot(snapshot) {
      workflowHistory.applying = true
      workflowNodes.value = clone(snapshot.nodes || [])
      workflowConnections.value = clone(snapshot.connections || [])
      workflowPan.x = Number(snapshot.pan?.x || 0)
      workflowPan.y = Number(snapshot.pan?.y || 0)
      workflowZoom.value = Number(snapshot.zoom || 0.84)
      workflowBackgroundMode.value = snapshot.backgroundMode || 'dots'
      workflowMiniMapOpen.value = snapshot.miniMapOpen !== false
      selectedWorkflowNodeId.value = ''
      selectedWorkflowNodeIds.value = []
      selectedWorkflowConnectionId.value = ''
      hideWorkflowNodePicker()
      workflowHistory.applying = false
    }

    function commitWorkflowChange() {
      if (workflowHistory.applying) return
      const next = JSON.stringify(workflowSnapshot())
      if (next !== lastWorkflowSnapshotText) {
        workflowHistory.undo.push(lastWorkflowSnapshotText)
        if (workflowHistory.undo.length > 60) workflowHistory.undo.shift()
        workflowHistory.redo = []
        lastWorkflowSnapshotText = next
      }
      markSaved()
    }

    function undoWorkflow() {
      if (!workflowHistory.undo.length) return
      const current = JSON.stringify(workflowSnapshot())
      const previous = workflowHistory.undo.pop()
      workflowHistory.redo.push(current)
      restoreWorkflowSnapshot(JSON.parse(previous))
      lastWorkflowSnapshotText = previous
      markSaved()
    }

    function redoWorkflow() {
      if (!workflowHistory.redo.length) return
      const current = JSON.stringify(workflowSnapshot())
      const next = workflowHistory.redo.pop()
      workflowHistory.undo.push(current)
      restoreWorkflowSnapshot(JSON.parse(next))
      lastWorkflowSnapshotText = next
      markSaved()
    }

    function updateProjectName(value) {
      if (!activeProject.value) return
      activeProject.value.name = value || '广告画布项目'
      markSaved()
    }

    function workflowInputPoint(node) {
      return { x: node.x, y: node.y + 52 }
    }

    function workflowOutputPoint(node) {
      return { x: node.x + node.width, y: node.y + 52 }
    }

    function workflowLinkPath(start, end) {
      const distance = Math.max(96, Math.abs(end.x - start.x) * 0.45)
      return `M ${start.x} ${start.y} C ${start.x + distance} ${start.y}, ${end.x - distance} ${end.y}, ${end.x} ${end.y}`
    }

    function workflowStagePoint(event) {
      const rect = workflowStageRef.value?.getBoundingClientRect()
      return {
        x: (event.clientX - (rect?.left || 0) - workflowPan.x) / workflowZoom.value,
        y: (event.clientY - (rect?.top || 0) - workflowPan.y) / workflowZoom.value,
      }
    }

    function addWorkflowNode(item, options = {}) {
      const offset = workflowNodes.value.length * 24
      const node = createWorkflowNode(item.type, {
        x: options.x ?? 330 + offset,
        y: options.y ?? 150 + offset,
        title: item.label,
        body: workflowDefaultBody(item.type),
      })
      workflowNodes.value.push(node)
      selectedWorkflowNodeId.value = node.id
      selectedWorkflowNodeIds.value = [node.id]
      selectedWorkflowConnectionId.value = ''
      if (options.connectFrom) {
        workflowConnections.value.push(createWorkflowConnection(options.connectFrom, node.id))
      }
      workflowNodePicker.visible = false
      workflowNodePicker.from = ''
      commitWorkflowChange()
    }

    function addWorkflowNodeFromPicker(item) {
      addWorkflowNode(item, {
        x: Math.round(workflowNodePicker.stageX + 36),
        y: Math.round(workflowNodePicker.stageY - 52),
        connectFrom: workflowNodePicker.from,
      })
    }

    function setWorkflowPickerGroup(title) {
      workflowNodePicker.groupTitle = title
    }

    function workflowDefaultBody(type) {
      const copy = {
        prompt: '输入广告画面的主题、文案、风格、尺寸需求',
        reference: '上传客户素材、商品图、店铺门头或旧海报',
        chat: '把客户需求整理成可执行的创作建议',
        polish: '补充排版、材质、摄影、灯光和印刷细节',
        reverse: '从参考图反推出可复用的提示词',
        generate: '调用生图模型，生成可继续处理的广告画面',
        caption: '记录客户要求、材质、尺寸、价格与交付备注',
        light: '统一图片色彩、明暗、锐度和商业质感',
        transform: '调整尺寸、比例、留白、裁切与构图',
        merge: '把多张图合成长图、套餐图或详情页',
        vector: '把简单标志、文字边缘和图形转成矢量方向',
      }
      return copy[type] || '处理当前工作流中的图片或文字信息'
    }

    function selectWorkflowNode(node) {
      const id = node?.id || ''
      selectedWorkflowNodeId.value = id
      selectedWorkflowNodeIds.value = id ? [id] : []
      selectedWorkflowConnectionId.value = ''
      workflowNodePicker.visible = false
    }

    function toggleWorkflowNodeSelection(node) {
      if (!node) return
      selectedWorkflowConnectionId.value = ''
      workflowNodePicker.visible = false
      if (selectedWorkflowNodeIds.value.includes(node.id)) {
        selectedWorkflowNodeIds.value = selectedWorkflowNodeIds.value.filter((id) => id !== node.id)
        selectedWorkflowNodeId.value = selectedWorkflowNodeIds.value[0] || ''
      } else {
        selectedWorkflowNodeIds.value = [...selectedWorkflowNodeIds.value, node.id]
        selectedWorkflowNodeId.value = node.id
      }
    }

    function selectWorkflowConnection(id) {
      selectedWorkflowConnectionId.value = id || ''
      selectedWorkflowNodeId.value = ''
      selectedWorkflowNodeIds.value = []
      workflowNodePicker.visible = false
    }

    function hideWorkflowNodePicker() {
      workflowNodePicker.visible = false
      workflowNodePicker.from = ''
      workflowNodePicker.groupTitle = 'AI 图像生成'
    }

    function onWorkflowNodePointerDown(event, node) {
      if (event.target.closest?.('.workflow-port, .workflow-node textarea, .workflow-node select, .workflow-node button')) return
      event.stopPropagation()
      if (event.shiftKey || event.ctrlKey || event.metaKey) {
        toggleWorkflowNodeSelection(node)
      } else if (!selectedWorkflowNodeIds.value.includes(node.id)) {
        selectWorkflowNode(node)
      } else {
        selectedWorkflowNodeId.value = node.id
      }
      workflowDragState.mode = 'node'
      workflowDragState.id = node.id
      workflowDragState.startX = event.clientX
      workflowDragState.startY = event.clientY
      workflowDragState.baseX = node.x
      workflowDragState.baseY = node.y
      workflowDragState.baseNodes = workflowNodes.value
        .filter((item) => selectedWorkflowNodeIds.value.includes(item.id))
        .map((item) => ({ id: item.id, x: item.x, y: item.y }))
    }

    function onWorkflowPortPointerDown(event, node) {
      event.stopPropagation()
      selectWorkflowNode(node)
      const point = workflowStagePoint(event)
      workflowLinkDraft.active = true
      workflowLinkDraft.from = node.id
      workflowLinkDraft.x = point.x
      workflowLinkDraft.y = point.y
      workflowDragState.mode = 'connect'
      workflowDragState.id = node.id
    }

    function onWorkflowResizePointerDown(event, node) {
      event.stopPropagation()
      selectWorkflowNode(node)
      workflowDragState.mode = 'resize-node'
      workflowDragState.id = node.id
      workflowDragState.startX = event.clientX
      workflowDragState.startY = event.clientY
      workflowDragState.baseX = node.width
      workflowDragState.baseY = 0
    }

    function onWorkflowPortPointerUp(event, node) {
      event.stopPropagation()
      if (!workflowLinkDraft.active || !workflowLinkDraft.from || workflowLinkDraft.from === node.id) return
      const exists = workflowConnections.value.some((item) => item.from === workflowLinkDraft.from && item.to === node.id)
      if (!exists) {
        workflowConnections.value.push(createWorkflowConnection(workflowLinkDraft.from, node.id))
        selectedWorkflowConnectionId.value = workflowConnections.value[workflowConnections.value.length - 1]?.id || ''
        selectedWorkflowNodeId.value = ''
        selectedWorkflowNodeIds.value = []
        commitWorkflowChange()
      }
      workflowLinkDraft.active = false
      workflowLinkDraft.from = ''
      hideWorkflowNodePicker()
      workflowDragState.mode = ''
      workflowDragState.id = ''
    }

    function onWorkflowStagePointerDown(event) {
      if (event.target.closest?.('.workflow-node, .workflow-runbar, .workflow-library, .workflow-top-actions, .workflow-stage-tools, .workflow-minimap, .workflow-add-menu')) return
      selectedWorkflowNodeId.value = ''
      selectedWorkflowConnectionId.value = ''
      selectedWorkflowNodeIds.value = []
      hideWorkflowNodePicker()
      if (event.ctrlKey || event.metaKey) {
        const point = workflowStagePoint(event)
        workflowSelectionBox.active = true
        workflowSelectionBox.startX = point.x
        workflowSelectionBox.startY = point.y
        workflowSelectionBox.x = point.x
        workflowSelectionBox.y = point.y
        workflowDragState.mode = 'select'
        return
      }
      workflowDragState.mode = 'pan'
      workflowDragState.startX = event.clientX
      workflowDragState.startY = event.clientY
      workflowDragState.baseX = workflowPan.x
      workflowDragState.baseY = workflowPan.y
    }

    function onWorkflowPointerMove(event) {
      if (!workflowDragState.mode) return
      if (workflowDragState.mode === 'select') {
        const point = workflowStagePoint(event)
        workflowSelectionBox.x = point.x
        workflowSelectionBox.y = point.y
        return
      }
      if (workflowDragState.mode === 'connect') {
        const point = workflowStagePoint(event)
        workflowLinkDraft.x = point.x
        workflowLinkDraft.y = point.y
        return
      }
      if (workflowDragState.mode === 'pan') {
        workflowPan.x = Math.round(workflowDragState.baseX + event.clientX - workflowDragState.startX)
        workflowPan.y = Math.round(workflowDragState.baseY + event.clientY - workflowDragState.startY)
        return
      }
      if (workflowDragState.mode === 'node') {
        const dx = (event.clientX - workflowDragState.startX) / workflowZoom.value
        const dy = (event.clientY - workflowDragState.startY) / workflowZoom.value
        workflowDragState.baseNodes.forEach((base) => {
          const item = workflowNodes.value.find((node) => node.id === base.id)
          if (!item) return
          item.x = Math.round(base.x + dx)
          item.y = Math.round(base.y + dy)
        })
      }
      if (workflowDragState.mode === 'resize-node') {
        const node = workflowNodes.value.find((item) => item.id === workflowDragState.id)
        if (!node) return
        const dx = (event.clientX - workflowDragState.startX) / workflowZoom.value
        node.width = Math.round(Math.max(220, Math.min(620, workflowDragState.baseX + dx)))
      }
    }

    function onWorkflowPointerUp(event) {
      if (workflowDragState.mode === 'select') {
        const left = Math.min(workflowSelectionBox.startX, workflowSelectionBox.x)
        const top = Math.min(workflowSelectionBox.startY, workflowSelectionBox.y)
        const width = Math.abs(workflowSelectionBox.x - workflowSelectionBox.startX)
        const height = Math.abs(workflowSelectionBox.y - workflowSelectionBox.startY)
        selectedWorkflowNodeIds.value = workflowNodes.value
          .filter((node) => node.x < left + width && node.x + node.width > left && node.y < top + height && node.y + 120 > top)
          .map((node) => node.id)
        selectedWorkflowNodeId.value = selectedWorkflowNodeIds.value[0] || ''
        selectedWorkflowConnectionId.value = ''
        workflowSelectionBox.active = false
      }
      if (workflowDragState.mode && workflowDragState.mode !== 'connect') commitWorkflowChange()
      if (workflowDragState.mode === 'connect') {
        if (workflowLinkDraft.active && workflowLinkDraft.from && event) {
          const point = workflowStagePoint(event)
          const rect = workflowStageRef.value?.getBoundingClientRect()
          workflowNodePicker.visible = true
          workflowNodePicker.from = workflowLinkDraft.from
          workflowNodePicker.stageX = point.x
          workflowNodePicker.stageY = point.y
          workflowNodePicker.groupTitle = 'AI 图像生成'
          workflowNodePicker.x = Math.max(12, Math.min((rect?.width || 600) - 430, event.clientX - (rect?.left || 0) + 12))
          workflowNodePicker.y = Math.max(12, Math.min((rect?.height || 500) - 230, event.clientY - (rect?.top || 0) + 12))
        }
        workflowLinkDraft.active = false
        workflowLinkDraft.from = ''
      }
      workflowDragState.mode = ''
      workflowDragState.id = ''
    }

    function onWorkflowWheel(event) {
      event.preventDefault()
      const rect = workflowStageRef.value?.getBoundingClientRect()
      const pointerX = event.clientX - (rect?.left || 0)
      const pointerY = event.clientY - (rect?.top || 0)
      const before = {
        x: (pointerX - workflowPan.x) / workflowZoom.value,
        y: (pointerY - workflowPan.y) / workflowZoom.value,
      }
      const direction = event.deltaY > 0 ? -1 : 1
      const next = Math.min(1.4, Math.max(0.3, workflowZoom.value + direction * 0.06))
      workflowZoom.value = Number(next.toFixed(2))
      workflowPan.x = Math.round(pointerX - before.x * workflowZoom.value)
      workflowPan.y = Math.round(pointerY - before.y * workflowZoom.value)
    }

    function workflowZoomIn() {
      workflowZoom.value = Math.min(1.4, Number((workflowZoom.value + 0.08).toFixed(2)))
    }

    function workflowZoomOut() {
      workflowZoom.value = Math.max(0.3, Number((workflowZoom.value - 0.08).toFixed(2)))
    }

    function workflowFitView() {
      workflowPan.x = 0
      workflowPan.y = 0
      workflowZoom.value = 0.84
      commitWorkflowChange()
    }

    function setWorkflowBackground(mode) {
      if (!workflowBackgroundModes.some((item) => item.id === mode)) return
      workflowBackgroundMode.value = mode
      commitWorkflowChange()
    }

    function toggleWorkflowMiniMap() {
      workflowMiniMapOpen.value = !workflowMiniMapOpen.value
      commitWorkflowChange()
    }

    function selectAllWorkflowNodes() {
      selectedWorkflowNodeIds.value = workflowNodes.value.map((node) => node.id)
      selectedWorkflowNodeId.value = selectedWorkflowNodeIds.value[0] || ''
      selectedWorkflowConnectionId.value = ''
      hideWorkflowNodePicker()
    }

    function copySelectedWorkflowNodes() {
      if (!selectedWorkflowNodeIds.value.length) return
      const ids = new Set(selectedWorkflowNodeIds.value)
      workflowClipboard.value = {
        nodes: clone(workflowNodes.value.filter((node) => ids.has(node.id))),
        connections: clone(workflowConnections.value.filter((connection) => ids.has(connection.from) && ids.has(connection.to))),
      }
    }

    function pasteWorkflowNodes() {
      if (!workflowClipboard.value?.nodes?.length) return
      const idMap = new Map()
      const pasted = workflowClipboard.value.nodes.map((node) => {
        const id = createId(node.type || 'node')
        idMap.set(node.id, id)
        return { ...clone(node), id, x: Number(node.x || 0) + 44, y: Number(node.y || 0) + 44 }
      })
      const pastedConnections = (workflowClipboard.value.connections || [])
        .map((connection) => {
          const from = idMap.get(connection.from)
          const to = idMap.get(connection.to)
          return from && to ? createWorkflowConnection(from, to) : null
        })
        .filter(Boolean)
      workflowNodes.value.push(...pasted)
      workflowConnections.value.push(...pastedConnections)
      selectedWorkflowNodeIds.value = pasted.map((node) => node.id)
      selectedWorkflowNodeId.value = selectedWorkflowNodeIds.value[0] || ''
      selectedWorkflowConnectionId.value = ''
      commitWorkflowChange()
    }

    function exportWorkflowJson() {
      const data = {
        version: 1,
        exportedAt: new Date().toISOString(),
        projectName: activeProject.value?.name || '广告画布项目',
        workflow: workflowSnapshot(),
      }
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${activeProject.value?.name || 'workflow'}-${dayjs().format('YYYYMMDD-HHmmss')}.json`
      link.click()
      URL.revokeObjectURL(url)
    }

    function triggerWorkflowImport() {
      workflowImportInputRef.value?.click()
    }

    function importWorkflowJson(event) {
      const file = event.target.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => {
        try {
          const value = JSON.parse(String(reader.result || '{}'))
          const workflow = value.workflow || value
          if (!Array.isArray(workflow.nodes) || !Array.isArray(workflow.connections)) throw new Error('invalid workflow')
          restoreWorkflowSnapshot(workflow)
          lastWorkflowSnapshotText = JSON.stringify(workflowSnapshot())
          commitWorkflowChange()
        } catch {
          aiError.value = '工作流 JSON 导入失败'
        }
      }
      reader.readAsText(file)
      event.target.value = ''
    }

    function createWorkflowImageNode(src, point, name = '图片素材') {
      const node = createWorkflowNode('reference', {
        x: Math.round(point.x),
        y: Math.round(point.y),
        title: name,
        body: '从本地拖入的图片素材',
        image: src,
        width: 350,
      })
      workflowNodes.value.push(node)
      selectWorkflowNode(node)
      commitWorkflowChange()
    }

    function onWorkflowDrop(event) {
      const files = [...(event.dataTransfer?.files || [])].filter((file) => file.type.startsWith('image/'))
      if (!files.length) return
      const point = workflowStagePoint(event)
      files.forEach((file, index) => {
        const reader = new FileReader()
        reader.onload = () => createWorkflowImageNode(String(reader.result || ''), { x: point.x + index * 42, y: point.y + index * 42 }, file.name)
        reader.readAsDataURL(file)
      })
    }

    function onWorkflowMiniMapPointerDown(event) {
      const rect = event.currentTarget.getBoundingClientRect()
      const x = (event.clientX - rect.left) / workflowBounds.value.scale + workflowBounds.value.minX
      const y = (event.clientY - rect.top) / workflowBounds.value.scale + workflowBounds.value.minY
      const width = workflowStageRef.value?.clientWidth || 1200
      const height = workflowStageRef.value?.clientHeight || 720
      workflowPan.x = Math.round(width / 2 - x * workflowZoom.value)
      workflowPan.y = Math.round(height / 2 - y * workflowZoom.value)
      commitWorkflowChange()
    }

    function updateWorkflowNode(node, key, value) {
      node[key] = value
      if (node.type === 'prompt') aiPrompt.value = value
      commitWorkflowChange()
    }

    function deleteWorkflowNode(node) {
      if (!node) return
      workflowNodes.value = workflowNodes.value.filter((item) => item.id !== node.id)
      workflowConnections.value = workflowConnections.value.filter((item) => item.from !== node.id && item.to !== node.id)
      if (selectedWorkflowNodeId.value === node.id) selectedWorkflowNodeId.value = ''
      selectedWorkflowNodeIds.value = selectedWorkflowNodeIds.value.filter((id) => id !== node.id)
      selectedWorkflowConnectionId.value = ''
      hideWorkflowNodePicker()
      commitWorkflowChange()
    }

    function deleteWorkflowConnection(connectionId) {
      workflowConnections.value = workflowConnections.value.filter((item) => item.id !== connectionId)
      if (selectedWorkflowConnectionId.value === connectionId) selectedWorkflowConnectionId.value = ''
      hideWorkflowNodePicker()
      commitWorkflowChange()
    }

    function deleteSelectedWorkflowItem() {
      if (selectedWorkflowConnectionId.value) {
        deleteWorkflowConnection(selectedWorkflowConnectionId.value)
        return
      }
      if (selectedWorkflowNodeIds.value.length) {
        const ids = new Set(selectedWorkflowNodeIds.value)
        workflowNodes.value = workflowNodes.value.filter((node) => !ids.has(node.id))
        workflowConnections.value = workflowConnections.value.filter((connection) => !ids.has(connection.from) && !ids.has(connection.to))
        selectedWorkflowNodeId.value = ''
        selectedWorkflowNodeIds.value = []
        hideWorkflowNodePicker()
        commitWorkflowChange()
      }
    }

    function isEditableEventTarget(target) {
      if (!target) return false
      const tag = target.tagName
      return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)
    }

    function onWorkflowKeyDown(event) {
      if (isEditableEventTarget(event.target)) return
      const mod = event.ctrlKey || event.metaKey
      if (event.key === 'Escape') {
        hideWorkflowNodePicker()
        selectedWorkflowNodeId.value = ''
        selectedWorkflowNodeIds.value = []
        selectedWorkflowConnectionId.value = ''
        return
      }
      if (mod && event.key.toLowerCase() === 'a') {
        event.preventDefault()
        selectAllWorkflowNodes()
        return
      }
      if (mod && event.key.toLowerCase() === 'c') {
        event.preventDefault()
        copySelectedWorkflowNodes()
        return
      }
      if (mod && event.key.toLowerCase() === 'v') {
        event.preventDefault()
        pasteWorkflowNodes()
        return
      }
      if (mod && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) redoWorkflow()
        else undoWorkflow()
        return
      }
      if (mod && event.key.toLowerCase() === 'y') {
        event.preventDefault()
        redoWorkflow()
        return
      }
      if (!['Delete', 'Backspace'].includes(event.key)) return
      if (!selectedWorkflowNodeIds.value.length && !selectedWorkflowConnection.value) return
      event.preventDefault()
      deleteSelectedWorkflowItem()
    }

    function taskResultImage(task) {
      return taskImages(task)[0] || task?.thumbnailUrls?.[0] || task?.thumbnailUrl || ''
    }

    function isTerminalTaskStatus(status) {
      return terminalTaskStatuses.includes(status)
    }

    function createCanvasAiNode(prompt) {
      const artboard = selectedArtboard.value || activeProject.value?.artboards[0]
      const [ratioWidth, ratioHeight] = ratio.value.split(':').map((item) => Number(item) || 1)
      const width = Math.max(260, Math.min(520, (artboard?.width || 900) * 0.54))
      const height = Math.round(width * (ratioHeight / ratioWidth))
      return createImageElement('', {
        name: 'AI 生图节点',
        status: 'generating',
        prompt,
        x: (artboard?.x || 0) + 90,
        y: (artboard?.y || 0) + 120,
        width,
        height,
      })
    }

    function applyCanvasTask(task, elementId) {
      const element = activeProject.value?.elements.find((item) => item.id === elementId)
      if (!element || !task) return
      element.taskId = task.id || element.taskId
      element.status = task.status === 'success' ? 'ready' : task.status === 'failed' ? 'failed' : 'generating'
      element.errorMessage = task.errorMessage || ''
      const image = taskResultImage(task)
      if (image) {
        element.src = image
        element.status = task.status === 'failed' ? 'failed' : 'ready'
        element.name = 'AI 生成图片'
      }
      persist()
    }

    function applyWorkflowTask(task, nodeId) {
      const node = workflowNodes.value.find((item) => item.id === nodeId)
      if (!node || !task) return
      node.taskId = task.id || node.taskId
      node.status = task.status === 'success' ? 'ready' : task.status === 'failed' ? 'failed' : 'running'
      node.errorMessage = task.errorMessage || ''
      const image = taskResultImage(task)
      if (image) {
        node.image = image
        node.status = task.status === 'failed' ? 'failed' : 'ready'
        node.body = '已生成图片，可继续接入色彩、尺寸、矢量化等后续节点'
      }
      markSaved()
    }

    function scheduleTaskPoll(taskId, elementId, delay = 1800) {
      const timer = window.setTimeout(async () => {
        taskPollTimers.delete(timer)
        try {
          const response = await clientApi.getTask(taskId)
          applyCanvasTask(response.data, elementId)
          if (!isTerminalTaskStatus(response.data?.status)) scheduleTaskPoll(taskId, elementId, 2200)
        } catch (error) {
          const element = activeProject.value?.elements.find((item) => item.id === elementId)
          if (element) {
            element.status = 'failed'
            element.errorMessage = error.message || '任务同步失败'
            persist()
          }
        }
      }, delay)
      taskPollTimers.add(timer)
    }

    function scheduleWorkflowTaskPoll(taskId, nodeId, delay = 1800) {
      const timer = window.setTimeout(async () => {
        taskPollTimers.delete(timer)
        try {
          const response = await clientApi.getTask(taskId)
          applyWorkflowTask(response.data, nodeId)
          if (!isTerminalTaskStatus(response.data?.status)) scheduleWorkflowTaskPoll(taskId, nodeId, 2200)
        } catch (error) {
          const node = workflowNodes.value.find((item) => item.id === nodeId)
          if (node) {
            node.status = 'failed'
            node.errorMessage = error.message || '任务同步失败'
            markSaved()
          }
        }
      }, delay)
      taskPollTimers.add(timer)
    }

    async function openAiGenerate() {
      const prompt = workflowPromptText.value
      aiError.value = ''
      if (!props.currentUser) {
        emit('login')
        return
      }
      if (!prompt) {
        aiError.value = '请输入画面需求'
        return
      }
      if (!modelId.value) {
        aiError.value = '请选择生成模型'
        return
      }
      const node = workflowGenerateNode.value || createWorkflowNode('generate', { x: 1020, y: 210 })
      if (!workflowGenerateNode.value) workflowNodes.value.push(node)
      node.status = 'running'
      node.image = ''
      node.prompt = prompt
      node.errorMessage = ''
      node.body = '已开始调用生图模型，请稍等片刻'
      selectedWorkflowNodeId.value = node.id
      selectedWorkflowNodeIds.value = [node.id]
      markSaved()
      aiGenerating.value = true
      try {
        const response = await clientApi.generateImage({
          userId: props.currentUser.id,
          modelId: modelId.value,
          prompt,
          sizeTier: sizeTier.value,
          size: outputSize.value,
          outputFormat: 'jpeg',
          transparentBackground: false,
          quantity: 1,
        })
        applyWorkflowTask(response.data, node.id)
        if (response.data?.id && !isTerminalTaskStatus(response.data.status)) {
          scheduleWorkflowTaskPoll(response.data.id, node.id)
        }
      } catch (error) {
        node.status = 'failed'
        node.errorMessage = error.message || '生成失败'
        aiError.value = node.errorMessage
        persist()
      } finally {
        aiGenerating.value = false
      }
    }

    function exportSelectedArtboard() {
      const artboard = selectedType.value === 'artboard' ? selectedArtboard.value : activeProject.value?.artboards[0]
      if (!artboard) return
      const elements = activeProject.value.elements.filter((element) => rectsIntersect(element, artboard))
      const svg = createExportSvg(artboard, elements)
      const image = new Image()
      image.onload = () => {
        const canvas = document.createElement('canvas')
        const scale = Math.min(3, Math.max(1, 1600 / Math.max(artboard.width, artboard.height)))
        canvas.width = Math.round(artboard.width * scale)
        canvas.height = Math.round(artboard.height * scale)
        const context = canvas.getContext('2d')
        context.fillStyle = artboard.background || '#fff'
        context.fillRect(0, 0, canvas.width, canvas.height)
        context.drawImage(image, 0, 0, canvas.width, canvas.height)
        const link = document.createElement('a')
        link.href = canvas.toDataURL('image/png')
        link.download = `${activeProject.value.name || 'canvas'}-${artboard.name}.png`
        link.click()
      }
      image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
    }

    function createExportSvg(artboard, elements) {
      const children = elements.map((element) => {
        const x = element.x - artboard.x
        const y = element.y - artboard.y
        if (element.type === 'image') {
          if (!element.src) return ''
          return `<image href="${element.src}" x="${x}" y="${y}" width="${element.width}" height="${element.height}" preserveAspectRatio="xMidYMid slice" />`
        }
        if (element.type === 'rect') {
          return `<rect x="${x}" y="${y}" width="${element.width}" height="${element.height}" rx="${element.radius || 0}" fill="${element.fill || '#e8f8ef'}" />`
        }
        return `<text x="${x}" y="${y + element.fontSize}" fill="${element.fill || '#101828'}" font-size="${element.fontSize}" font-family="Microsoft YaHei, PingFang SC, Arial" font-weight="${element.fontWeight || 700}">${escapeHtml(element.text || '')}</text>`
      }).join('')
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${artboard.width}" height="${artboard.height}" viewBox="0 0 ${artboard.width} ${artboard.height}"><rect width="100%" height="100%" fill="${artboard.background || '#fff'}" />${children}</svg>`
    }

    function escapeHtml(value) {
      return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char])
    }

    watch(projects, () => saveStoredProjects(projects.value), { deep: true })

    watch(workflowNodes, () => saveStoredWorkflowNodes(workflowNodes.value), { deep: true })

    watch(workflowConnections, () => saveStoredWorkflowConnections(workflowConnections.value), { deep: true })

    watch([workflowBackgroundMode, workflowMiniMapOpen], () => {
      saveStoredWorkflowView({
        backgroundMode: workflowBackgroundMode.value,
        miniMapOpen: workflowMiniMapOpen.value,
      })
    })

    watch(availableRatios, (items) => {
      if (!items.includes(ratio.value)) ratio.value = items[0] || '1:1'
    })

    watch(availableSizeTiers, (items) => {
      if (!items.includes(sizeTier.value)) sizeTier.value = items[0] || '1k'
    })

    onMounted(() => {
      window.addEventListener('pointermove', onPointerMove)
      window.addEventListener('pointerup', onPointerUp)
      window.addEventListener('pointermove', onWorkflowPointerMove)
      window.addEventListener('pointerup', onWorkflowPointerUp)
      window.addEventListener('keydown', onWorkflowKeyDown)
      loadModels()
      nextTick(fitView)
    })

    onBeforeUnmount(() => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointermove', onWorkflowPointerMove)
      window.removeEventListener('pointerup', onWorkflowPointerUp)
      window.removeEventListener('keydown', onWorkflowKeyDown)
      taskPollTimers.forEach((timer) => window.clearTimeout(timer))
      taskPollTimers.clear()
    })

    return {
      props,
      projects,
      activeProjectId,
      activeProject,
      activeProjectUpdated,
      selectedId,
      selectedType,
      selectedElement,
      selectedArtboard,
      selectedBounds,
      activeTool,
      activePresetId,
      activePreset,
      sizePresets,
      starterTemplates,
      stageRef,
      fileInputRef,
      zoom,
      zoomText,
      pan,
      viewBox,
      sortedElements,
      aiPrompt,
      modelId,
      chatModels,
      ratio,
      sizeTier,
      aiGenerating,
      aiError,
      availableRatios,
      availableSizeTiers,
      getModelLabel,
      saveNotice,
      workflowLibrary,
      workflowBackgroundModes,
      workflowBackgroundMode,
      workflowCanvasClass,
      workflowNodes,
      workflowLinks,
      workflowDraftLink,
      workflowSelectionBox,
      workflowSelectionStyle,
      workflowStageRef,
      workflowPan,
      workflowZoom,
      workflowConnections,
      workflowNodePicker,
      workflowPickerGroup,
      workflowMiniMapOpen,
      workflowMiniMapNodes,
      workflowMiniMapViewport,
      workflowHistory,
      workflowImportInputRef,
      workflowZoomText,
      selectedWorkflowNodeId,
      selectedWorkflowNodeIds,
      selectedWorkflowNode,
      selectedWorkflowConnectionId,
      selectedWorkflowConnection,
      workflowSelectedCount,
      setTool,
      selectItem,
      addArtboard,
      triggerUpload,
      handleImageUpload,
      applyTemplate,
      onStagePointerDown,
      onElementPointerDown,
      onArtboardPointerDown,
      onWheel,
      zoomIn,
      zoomOut,
      fitView,
      updateSelected,
      duplicateSelected,
      deleteSelected,
      createNewProject,
      markSaved,
      updateProjectName,
      addWorkflowNode,
      addWorkflowNodeFromPicker,
      setWorkflowPickerGroup,
      selectWorkflowNode,
      selectWorkflowConnection,
      onWorkflowStagePointerDown,
      onWorkflowNodePointerDown,
      onWorkflowPortPointerDown,
      onWorkflowPortPointerUp,
      onWorkflowResizePointerDown,
      onWorkflowWheel,
      onWorkflowDrop,
      onWorkflowMiniMapPointerDown,
      workflowZoomIn,
      workflowZoomOut,
      workflowFitView,
      setWorkflowBackground,
      toggleWorkflowMiniMap,
      selectAllWorkflowNodes,
      copySelectedWorkflowNodes,
      pasteWorkflowNodes,
      undoWorkflow,
      redoWorkflow,
      exportWorkflowJson,
      triggerWorkflowImport,
      importWorkflowJson,
      updateWorkflowNode,
      deleteWorkflowNode,
      deleteWorkflowConnection,
      deleteSelectedWorkflowItem,
      openAiGenerate,
      exportSelectedArtboard,
    }
  },
  template: `
    <section class="canvas-page workflow-page">
      <aside class="workflow-library">
        <div class="workflow-library-head">
          <span class="workflow-mark"><i class="ti ti-affiliate"></i></span>
          <div>
            <strong>组件库</strong>
            <small>广告店工作流节点</small>
          </div>
          <button type="button" title="收起"><i class="ti ti-chevron-left"></i></button>
        </div>

        <div class="workflow-node-groups">
          <section v-for="group in workflowLibrary" :key="group.title" class="workflow-node-group">
            <p>{{ group.title }}</p>
            <button v-for="item in group.items" :key="item.type" type="button" @click="addWorkflowNode(item)">
              <i :style="{ background: item.color }"></i>
              <span>{{ item.label }}</span>
            </button>
          </section>
        </div>
      </aside>

      <main
        :class="['workflow-canvas', workflowCanvasClass]"
        ref="workflowStageRef"
        @pointerdown="onWorkflowStagePointerDown"
        @wheel="onWorkflowWheel"
        @dragover.prevent
        @drop.prevent="onWorkflowDrop"
      >
        <div class="workflow-top-actions">
          <button type="button" title="导入图片" @click="triggerUpload"><i class="ti ti-photo-plus"></i></button>
          <button type="button" title="新建项目" @click="createNewProject"><i class="ti ti-file-plus"></i></button>
          <input ref="fileInputRef" type="file" accept="image/*" hidden @change="handleImageUpload" />
          <input ref="workflowImportInputRef" type="file" accept="application/json,.json" hidden @change="importWorkflowJson" />
        </div>

        <div class="workflow-stage-tools">
          <button type="button" title="撤销" :disabled="!workflowHistory.undo.length" @click="undoWorkflow"><i class="ti ti-arrow-back-up"></i></button>
          <button type="button" title="重做" :disabled="!workflowHistory.redo.length" @click="redoWorkflow"><i class="ti ti-arrow-forward-up"></i></button>
          <em></em>
          <button
            v-for="mode in workflowBackgroundModes"
            :key="'workflow-bg-' + mode.id"
            type="button"
            :title="mode.label"
            :class="{ active: workflowBackgroundMode === mode.id }"
            @click="setWorkflowBackground(mode.id)"
          >
            <i :class="['ti', mode.icon]"></i>
          </button>
          <button type="button" title="小地图" :class="{ active: workflowMiniMapOpen }" @click="toggleWorkflowMiniMap"><i class="ti ti-map"></i></button>
          <em></em>
          <button type="button" title="缩小" @click="workflowZoomOut"><i class="ti ti-minus"></i></button>
          <span>{{ workflowZoomText }}</span>
          <button type="button" title="放大" @click="workflowZoomIn"><i class="ti ti-plus"></i></button>
          <button type="button" title="适配" @click="workflowFitView"><i class="ti ti-focus-centered"></i></button>
        </div>

        <div
          class="workflow-stage-inner"
          :style="{ transform: 'translate(' + workflowPan.x + 'px, ' + workflowPan.y + 'px) scale(' + workflowZoom + ')' }"
        >
          <svg class="workflow-link-layer" width="2400" height="1200" viewBox="0 0 2400 1200">
            <path
              v-for="link in workflowLinks"
              :key="link.id"
              :d="link.path"
              :class="['workflow-link-path', { selected: link.selected }]"
              @pointerdown.stop="selectWorkflowConnection(link.id)"
              @click.stop="selectWorkflowConnection(link.id)"
              @dblclick.stop="deleteWorkflowConnection(link.id)"
            />
            <path v-if="workflowDraftLink" :d="workflowDraftLink" class="workflow-link-path workflow-link-draft" />
          </svg>
          <div v-if="workflowSelectionBox.active" class="workflow-selection-box" :style="workflowSelectionStyle"></div>

          <article
            v-for="node in workflowNodes"
            :key="node.id"
            :class="[
              'workflow-node',
              'workflow-node-' + node.type,
              {
                selected: selectedWorkflowNodeIds.includes(node.id),
                primary: selectedWorkflowNodeId === node.id,
                running: node.status === 'running',
                failed: node.status === 'failed'
              }
            ]"
            :style="{ left: node.x + 'px', top: node.y + 'px', width: node.width + 'px' }"
            @pointerdown="onWorkflowNodePointerDown($event, node)"
          >
            <span class="workflow-port workflow-port-in" title="连接到此节点" @pointerup.stop="onWorkflowPortPointerUp($event, node)"></span>
            <span class="workflow-port workflow-port-out" title="从这里拖出连线" @pointerdown.stop="onWorkflowPortPointerDown($event, node)"></span>
            <header>
              <span class="workflow-node-icon" :style="{ color: node.color }"><i :class="['ti', node.icon]"></i></span>
              <strong>{{ node.title }}</strong>
              <button type="button" title="删除节点" @click.stop="deleteWorkflowNode(node)">
                <i class="ti ti-x"></i>
              </button>
            </header>
            <span class="workflow-node-resize" title="调整节点宽度" @pointerdown.stop="onWorkflowResizePointerDown($event, node)"></span>

            <div v-if="node.type === 'prompt'" class="workflow-node-body">
              <textarea :value="node.prompt" placeholder="在这里输入广告画面需求..." @pointerdown.stop @input="updateWorkflowNode(node, 'prompt', $event.target.value)"></textarea>
              <button type="button" @click.stop="openAiGenerate"><i class="ti ti-player-play"></i><span>运行到生图节点</span></button>
            </div>

            <div v-else-if="node.type === 'reference'" class="workflow-node-body">
              <div class="workflow-image-slot" @click.stop="triggerUpload">
                <img v-if="node.image" :src="node.image" alt="" />
                <template v-else>
                  <i class="ti ti-photo-plus"></i>
                  <span>{{ node.body }}</span>
                </template>
              </div>
              <small>支持客户素材、门店照片、商品图、旧海报</small>
            </div>

            <div v-else-if="node.type === 'generate'" class="workflow-node-body">
              <div class="workflow-preview" :class="{ empty: !node.image }">
                <img v-if="node.image" :src="node.image" alt="" />
                <template v-else>
                  <i :class="['ti', node.status === 'failed' ? 'ti-alert-triangle' : 'ti-sparkles']"></i>
                  <strong>{{ node.status === 'running' ? '生成中' : node.status === 'failed' ? '生成失败' : '等待执行' }}</strong>
                  <span>{{ node.status === 'failed' ? node.errorMessage : node.body }}</span>
                </template>
              </div>
              <div class="workflow-node-controls">
                <select v-model="modelId" @pointerdown.stop>
                  <option v-for="model in chatModels" :key="model.id" :value="model.id">{{ getModelLabel(model) }}</option>
                </select>
                <select v-model="ratio" @pointerdown.stop>
                  <option v-for="item in availableRatios" :key="item" :value="item">{{ item }}</option>
                </select>
                <select v-model="sizeTier" @pointerdown.stop>
                  <option v-for="item in availableSizeTiers" :key="item" :value="item">{{ item.toUpperCase() }}</option>
                </select>
              </div>
            </div>

            <div v-else class="workflow-node-body">
              <textarea :value="node.body" @pointerdown.stop @input="updateWorkflowNode(node, 'body', $event.target.value)"></textarea>
              <small v-if="node.type === 'caption'">不会参与计算，可作为客户修改记录</small>
              <button v-else type="button" @click.stop="selectWorkflowNode(node)"><i class="ti ti-plus"></i><span>添加参考组件</span></button>
            </div>
          </article>
        </div>

        <div
          v-if="workflowNodePicker.visible"
          class="workflow-add-menu"
          :style="{ left: workflowNodePicker.x + 'px', top: workflowNodePicker.y + 'px' }"
          @pointerdown.stop
        >
          <div class="workflow-add-menu-main">
            <button class="workflow-add-menu-title" type="button">
              <span>添加连接节点</span>
            </button>
            <button
              v-for="group in workflowLibrary"
              :key="'picker-group-' + group.title"
              :class="['workflow-add-menu-group', { active: workflowNodePicker.groupTitle === group.title }]"
              type="button"
              @mouseenter="setWorkflowPickerGroup(group.title)"
              @click.stop="setWorkflowPickerGroup(group.title)"
            >
              <span>{{ group.title }}</span>
              <i class="ti ti-chevron-right"></i>
            </button>
          </div>
          <div class="workflow-add-submenu">
            <button
              v-for="item in workflowPickerGroup.items"
              :key="'picker-item-' + item.type"
              type="button"
              @click.stop="addWorkflowNodeFromPicker(item)"
            >
              <i :class="['ti', item.icon]" :style="{ color: item.color }"></i>
              <span>{{ item.label }}</span>
            </button>
          </div>
        </div>

        <div class="workflow-runbar">
          <div class="workflow-project-title">
            <strong>{{ activeProject?.name || '新画布' }}</strong>
            <button type="button" title="重命名"><i class="ti ti-pencil"></i></button>
            <small>{{ workflowSelectedCount ? '已选择 ' + workflowSelectedCount + ' 项' : (saveNotice || '已保存') }}</small>
          </div>
          <div class="workflow-runbar-actions">
            <button type="button" title="导出工作流" @click="exportWorkflowJson"><i class="ti ti-download"></i></button>
            <button type="button" title="导入工作流" @click="triggerWorkflowImport"><i class="ti ti-upload"></i></button>
            <button type="button" title="保存" @click="markSaved"><i class="ti ti-device-floppy"></i></button>
            <button type="button" title="添加提示词节点" @click="addWorkflowNode(workflowLibrary[0].items[0])"><i class="ti ti-plus"></i></button>
            <button class="workflow-run-all" type="button" :disabled="aiGenerating" @click="openAiGenerate">
              <i :class="['ti', aiGenerating ? 'ti-loader-2' : 'ti-player-play-filled']"></i>
              <span>{{ aiGenerating ? '执行中' : '全页执行' }}</span>
            </button>
          </div>
        </div>

        <div v-if="workflowMiniMapOpen" class="workflow-minimap" @pointerdown.stop>
          <div class="workflow-minimap-head">
            <span>小地图</span>
            <strong>{{ workflowZoomText }}</strong>
          </div>
          <div class="workflow-minimap-world" @pointerdown.stop="onWorkflowMiniMapPointerDown">
            <i
              v-for="item in workflowMiniMapNodes"
              :key="'mini-' + item.id"
              :class="{ selected: item.selected }"
              :style="item.style"
            ></i>
            <b :style="workflowMiniMapViewport"></b>
          </div>
        </div>

        <div v-if="aiError" class="workflow-toast">
          <i class="ti ti-alert-circle"></i>
          <span>{{ aiError }}</span>
        </div>
      </main>
    </section>
  `,
}
