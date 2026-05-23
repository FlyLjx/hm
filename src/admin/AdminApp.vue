<script setup lang="ts">
import {
  Connection,
  House,
  MagicStick,
  Plus,
  Refresh,
  Setting,
  SwitchButton,
  Tickets,
  User,
  View,
} from '@element-plus/icons-vue'
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  API_BASE_URL,
  adminApi,
  type AdminUser,
  type AiModel,
  type AiModelCapability,
  type ApiProvider,
  type CreditLog,
  type GenerationTask,
  type SystemSettings,
  type UserDetails,
} from '../api/adminApi'

type AdminSection = 'users' | 'apis' | 'models' | 'tasks' | 'settings'

const menuItems: Array<{
  id: AdminSection
  label: string
  desc: string
  icon: typeof User
}> = [
  { id: 'users', label: '用户管理', desc: '账号与权限', icon: User },
  { id: 'apis', label: '接口管理', desc: '服务商与密钥', icon: Connection },
  { id: 'models', label: '模型管理', desc: '模型用途与状态', icon: MagicStick },
  { id: 'tasks', label: '任务列表', desc: '生成记录与扣费', icon: Tickets },
  { id: 'settings', label: '系统设置', desc: '站点基础配置', icon: Setting },
]

const sectionSet = new Set<AdminSection>(['users', 'apis', 'models', 'tasks', 'settings'])
const activeSection = ref<AdminSection>(getSectionFromHash())
const users = ref<AdminUser[]>([])
const providers = ref<ApiProvider[]>([])
const models = ref<AiModel[]>([])
const tasks = ref<GenerationTask[]>([])
const selectedModels = ref<AiModel[]>([])
const loadingUsers = ref(false)
const loadingProviders = ref(false)
const loadingModels = ref(false)
const loadingTasks = ref(false)
const syncingModels = ref(false)
const loadingDialogModels = ref(false)
const userDialogVisible = ref(false)
const apiDialogVisible = ref(false)
const modelDialogVisible = ref(false)
const rechargeDialogVisible = ref(false)
const detailDialogVisible = ref(false)
const editingUserId = ref('')
const editingProviderId = ref('')
const editingModelId = ref('')
const rechargingUser = ref<AdminUser | null>(null)
const detailUser = ref<AdminUser | null>(null)
const detailData = ref<UserDetails | null>(null)
const loadingUserDetails = ref(false)
const taskPreviewVisible = ref(false)
const taskPreviewUrl = ref('')

const userForm = reactive({
  email: '',
  password: '',
  role: 'user' as 'admin' | 'user',
})

const rechargeForm = reactive({
  amount: 0,
  remark: '后台充值',
})

const apiForm = reactive({
  name: 'sub2api 主接口',
  type: 'sub2api' as 'sub2api' | 'custom',
  baseUrl: '',
  apiKey: '',
})

const modelForm = reactive({
  providerId: '',
  modelName: '',
  modelNames: [] as string[],
  displayName: '',
  capability: 'image' as AiModelCapability,
  capabilities: [] as AiModelCapability[],
  price1k: 0,
  price2k: 0,
  price4k: 0,
})
const dialogModelOptions = ref<string[]>([])

const syncForm = reactive({
  providerId: '',
  capability: 'image' as AiModelCapability,
  keyword: '',
})

const capabilityOptions: Array<{ label: string; value: AiModelCapability }> = [
  { label: '普通生图', value: 'image' },
  { label: '对话生图', value: 'chat_image' },
  { label: '工作流画布', value: 'workflow' },
  { label: '文字视频', value: 'video' },
]

const settingsForm = reactive({
  siteName: 'AIπ',
  creditName: '积分',
  frontendUrl: 'http://localhost:5173',
  backendUrl: 'http://localhost:3001',
  registerMode: 'open',
  emailEnabled: false,
  emailHost: '',
  emailPort: 465,
  emailSecure: true,
  emailUser: '',
  emailPassword: '',
  emailFromName: 'AIπ',
  emailFromAddress: '',
  registerEmailVerification: false,
})

const testEmailForm = reactive({
  email: '',
})
const sendingTestEmail = ref(false)

const current = computed(
  () => menuItems.find((item) => item.id === activeSection.value) ?? menuItems[0],
)

const taskSummary = computed(() => {
  return tasks.value.reduce(
    (summary, task) => {
      summary.totalTasks += 1
      summary.totalImages += task.status === 'success' ? task.quantity : 0
      summary.totalCredits += task.status === 'success' ? Number(task.costCredits) : 0
      if (task.status === 'success') summary.successTasks += 1
      if (task.status === 'failed') summary.failedTasks += 1
      if (task.status === 'canceled') summary.canceledTasks += 1
      if (['queued', 'pending', 'processing'].includes(task.status)) summary.runningTasks += 1
      return summary
    },
    {
      totalTasks: 0,
      successTasks: 0,
      failedTasks: 0,
      canceledTasks: 0,
      runningTasks: 0,
      totalImages: 0,
      totalCredits: 0,
    },
  )
})

const taskCapabilityStats = computed(() => {
  const stats = new Map<AiModelCapability, {
    capability: AiModelCapability
    label: string
    totalTasks: number
    successTasks: number
    failedTasks: number
    canceledTasks: number
    runningTasks: number
    totalImages: number
    totalCredits: number
  }>()

  for (const option of capabilityOptions) {
    stats.set(option.value, {
      capability: option.value,
      label: option.label,
      totalTasks: 0,
      successTasks: 0,
      failedTasks: 0,
      canceledTasks: 0,
      runningTasks: 0,
      totalImages: 0,
      totalCredits: 0,
    })
  }

  for (const task of tasks.value) {
    const row = stats.get(task.capability)
    if (!row) continue
    row.totalTasks += 1
    if (task.status === 'success') {
      row.successTasks += 1
      row.totalImages += task.quantity
      row.totalCredits += Number(task.costCredits)
    } else if (task.status === 'failed') {
      row.failedTasks += 1
    } else if (task.status === 'canceled') {
      row.canceledTasks += 1
    } else {
      row.runningTasks += 1
    }
  }

  return Array.from(stats.values())
})

function getSectionFromHash(): AdminSection {
  const section = window.location.hash.replace('#/', '') as AdminSection
  return sectionSet.has(section) ? section : 'users'
}

function changeSection(section: AdminSection) {
  activeSection.value = section
  window.location.hash = `/${section}`
}

function formatDate(date: string) {
  return new Date(date).toLocaleString()
}

function getTaskStatusLabel(status: GenerationTask['status']) {
  const labels = {
    queued: '等待中',
    pending: '等待中',
    processing: '创作中',
    success: '成功',
    failed: '失败',
    canceled: '已取消',
  }
  return labels[status]
}

function getTaskStatusType(status: GenerationTask['status']) {
  if (status === 'success') return 'success'
  if (status === 'failed') return 'danger'
  if (status === 'canceled') return 'warning'
  if (status === 'processing') return 'primary'
  return 'info'
}

function resolveAssetUrl(url: string) {
  if (url.startsWith('/')) return `${API_BASE_URL}${url}`
  return url
}

function resolveOriginalImageUrl(url: string) {
  return resolveAssetUrl(url).replace('/thumbnails/', '/images/')
}

function getTaskPreviewUrl(task: GenerationTask) {
  const url = task.resultUrls?.[0] ?? task.resultUrl ?? ''
  return url ? resolveOriginalImageUrl(url) : ''
}

function openTaskPreview(task: GenerationTask) {
  const url = getTaskPreviewUrl(task)
  if (!url) {
    ElMessage.warning('暂无可预览图片')
    return
  }
  taskPreviewUrl.value = url
  taskPreviewVisible.value = true
}

function getImageExtension(contentType: string) {
  if (contentType.includes('jpeg') || contentType.includes('jpg')) return 'jpg'
  if (contentType.includes('webp')) return 'webp'
  if (contentType.includes('gif')) return 'gif'
  return 'png'
}

async function downloadTaskImage(task: GenerationTask) {
  const url = getTaskPreviewUrl(task)
  if (!url) {
    ElMessage.warning('暂无可下载图片')
    return
  }

  try {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`下载失败：${response.status}`)
    }

    const blob = await response.blob()
    if (!blob.type.startsWith('image/')) {
      throw new Error('下载内容不是图片')
    }

    const objectUrl = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = objectUrl
    link.download = `task-${task.id.slice(0, 8)}.${getImageExtension(blob.type)}`
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(objectUrl)
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '下载失败')
  }
}

async function cancelTask(task: GenerationTask) {
  try {
    await adminApi.cancelTask(task.id)
    ElMessage.success('任务已取消')
    await loadTasks()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '取消任务失败')
  }
}

async function loadUsers() {
  try {
    loadingUsers.value = true
    const response = await adminApi.listUsers()
    users.value = response.data
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '加载用户失败')
  } finally {
    loadingUsers.value = false
  }
}

async function createUser() {
  try {
    if (editingUserId.value) {
      await adminApi.updateUser(editingUserId.value, {
        email: userForm.email,
        password: userForm.password || undefined,
        role: userForm.role,
      })
      ElMessage.success('用户已更新')
    } else {
      await adminApi.createUser(userForm)
      ElMessage.success('用户已创建')
    }
    Object.assign(userForm, { email: '', password: '', role: 'user' })
    editingUserId.value = ''
    userDialogVisible.value = false
    await loadUsers()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存用户失败')
  }
}

function openCreateUserDialog() {
  editingUserId.value = ''
  Object.assign(userForm, { email: '', password: '', role: 'user' })
  userDialogVisible.value = true
}

function openEditUserDialog(user: AdminUser) {
  editingUserId.value = user.id
  Object.assign(userForm, {
    email: user.email,
    password: '',
    role: user.role,
  })
  userDialogVisible.value = true
}

async function toggleUserStatus(user: AdminUser) {
  try {
    await adminApi.updateUserStatus(user.id, user.status === 'active' ? 'disabled' : 'active')
    ElMessage.success('状态已更新')
    await loadUsers()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '更新状态失败')
  }
}

function openRechargeDialog(user: AdminUser) {
  rechargingUser.value = user
  Object.assign(rechargeForm, {
    amount: 0,
    remark: '后台充值',
  })
  rechargeDialogVisible.value = true
}

async function rechargeUser() {
  if (!rechargingUser.value) return
  if (rechargeForm.amount <= 0) {
    ElMessage.warning('请输入充值金额')
    return
  }

  try {
    await adminApi.rechargeUser(rechargingUser.value.id, rechargeForm)
    ElMessage.success('充值成功')
    rechargeDialogVisible.value = false
    await loadUsers()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '充值失败')
  }
}

async function openUserDetailsDialog(user: AdminUser) {
  detailUser.value = user
  detailDialogVisible.value = true
  loadingUserDetails.value = true
  try {
    const response = await adminApi.getUserDetails(user.id)
    detailData.value = response.data
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '加载明细失败')
  } finally {
    loadingUserDetails.value = false
  }
}

function getCreditLogTypeLabel(log: CreditLog) {
  return log.type === 'recharge' ? '充值' : '扣费'
}

async function loadProviders() {
  try {
    loadingProviders.value = true
    const response = await adminApi.listApiProviders()
    providers.value = response.data
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '加载接口失败')
  } finally {
    loadingProviders.value = false
  }
}

async function createProvider() {
  try {
    if (editingProviderId.value) {
      await adminApi.updateApiProvider(editingProviderId.value, apiForm)
      ElMessage.success('接口已更新')
    } else {
      await adminApi.createApiProvider(apiForm)
      ElMessage.success('接口已保存')
    }
    Object.assign(apiForm, {
      name: 'sub2api 主接口',
      type: 'sub2api',
      baseUrl: '',
      apiKey: '',
    })
    editingProviderId.value = ''
    apiDialogVisible.value = false
    await loadProviders()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存接口失败')
  }
}

function openCreateProviderDialog() {
  editingProviderId.value = ''
  Object.assign(apiForm, {
    name: 'sub2api 主接口',
    type: 'sub2api',
    baseUrl: '',
    apiKey: '',
  })
  apiDialogVisible.value = true
}

function openEditProviderDialog(provider: ApiProvider) {
  editingProviderId.value = provider.id
  Object.assign(apiForm, {
    name: provider.name,
    type: provider.type,
    baseUrl: provider.baseUrl,
    apiKey: provider.apiKey,
  })
  apiDialogVisible.value = true
}

async function toggleProviderStatus(provider: ApiProvider) {
  try {
    await adminApi.updateApiProvider(provider.id, {
      status: provider.status === 'active' ? 'disabled' : 'active',
    })
    ElMessage.success('状态已更新')
    await loadProviders()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '更新状态失败')
  }
}

async function loadModels() {
  try {
    loadingModels.value = true
    const response = await adminApi.listModels()
    models.value = response.data
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '加载模型失败')
  } finally {
    loadingModels.value = false
  }
}

async function loadTasks() {
  try {
    loadingTasks.value = true
    const response = await adminApi.listTasks()
    tasks.value = response.data
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '加载任务失败')
  } finally {
    loadingTasks.value = false
  }
}

async function loadSettings() {
  try {
    const response = await adminApi.getSettings()
    Object.assign(settingsForm, response.data)
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '加载设置失败')
  }
}

async function createModel() {
  try {
    if (editingModelId.value) {
      await adminApi.updateModel(editingModelId.value, {
        providerId: modelForm.providerId,
        modelName: modelForm.modelName,
        displayName: modelForm.displayName,
        capability: modelForm.capability,
        price1k: modelForm.price1k,
        price2k: modelForm.price2k,
        price4k: modelForm.price4k,
      })
      ElMessage.success('模型已更新')
    } else {
      if (modelForm.modelNames.length === 0) {
        ElMessage.warning('请选择模型名称')
        return
      }
      if (modelForm.capabilities.length === 0) {
        ElMessage.warning('请选择用途')
        return
      }

      const tasks = modelForm.modelNames.flatMap((modelName) =>
        modelForm.capabilities.map((capability) =>
          adminApi.createModel({
            providerId: modelForm.providerId,
            modelName,
            displayName: modelName,
            capability,
            price1k: modelForm.price1k,
            price2k: modelForm.price2k,
            price4k: modelForm.price4k,
          }),
        ),
      )
      await Promise.all(tasks)
      ElMessage.success(`已新增 ${tasks.length} 条模型配置`)
    }
    Object.assign(modelForm, {
      providerId: '',
      modelName: '',
      modelNames: [],
      displayName: '',
      capability: 'image',
      capabilities: [],
      price1k: 0,
      price2k: 0,
      price4k: 0,
    })
    dialogModelOptions.value = []
    editingModelId.value = ''
    modelDialogVisible.value = false
    await loadModels()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存模型失败')
  }
}

function openCreateModelDialog() {
  editingModelId.value = ''
  Object.assign(modelForm, {
    providerId: '',
    modelName: '',
    modelNames: [],
    displayName: '',
    capability: 'image',
    capabilities: [],
    price1k: 0,
    price2k: 0,
    price4k: 0,
  })
  dialogModelOptions.value = []
  modelDialogVisible.value = true
}

function openEditModelDialog(model: AiModel) {
  editingModelId.value = model.id
  Object.assign(modelForm, {
    providerId: model.providerId,
    modelName: model.modelName,
    modelNames: [model.modelName],
    displayName: model.displayName,
    capability: model.capability,
    capabilities: [model.capability],
    price1k: model.price1k,
    price2k: model.price2k,
    price4k: model.price4k,
  })
  dialogModelOptions.value = [model.modelName]
  modelDialogVisible.value = true
}

async function loadDialogModelOptions() {
  const provider = providers.value.find((item) => item.id === modelForm.providerId)
  if (!provider) {
    ElMessage.warning('请先选择接口')
    return
  }

  try {
    loadingDialogModels.value = true
    const response = await adminApi.fetchApiProviderModels({
      type: provider.type,
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey,
    })
    dialogModelOptions.value = response.data
    ElMessage.success('模型列表已读取')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '读取模型失败')
  } finally {
    loadingDialogModels.value = false
  }
}

function handleModelProviderChange() {
  if (!editingModelId.value) {
    modelForm.modelNames = []
    dialogModelOptions.value = []
  }
}

async function syncModels() {
  if (!syncForm.providerId) {
    ElMessage.warning('请选择接口')
    return
  }

  try {
    syncingModels.value = true
    const response = await adminApi.syncModels(syncForm)
    ElMessage.success(`已同步 ${response.data.length} 个模型`)
    await loadModels()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '同步模型失败')
  } finally {
    syncingModels.value = false
  }
}

async function toggleModelStatus(model: AiModel) {
  try {
    await adminApi.updateModel(model.id, {
      status: model.status === 'active' ? 'disabled' : 'active',
    })
    ElMessage.success('状态已更新')
    await loadModels()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '更新状态失败')
  }
}

async function deleteModel(model: AiModel) {
  try {
    await ElMessageBox.confirm(`确定删除模型「${model.displayName}」吗？`, '删除确认', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
      confirmButtonClass: 'el-button--danger',
    })
    await adminApi.deleteModel(model.id)
    ElMessage.success('模型已删除')
    await loadModels()
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') {
      ElMessage.error(error instanceof Error ? error.message : '删除模型失败')
    }
  }
}

async function deleteSelectedModels() {
  if (selectedModels.value.length === 0) {
    ElMessage.warning('请先选择要删除的模型')
    return
  }

  try {
    await ElMessageBox.confirm(
      `确定删除选中的 ${selectedModels.value.length} 个模型吗？`,
      '批量删除确认',
      {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning',
        confirmButtonClass: 'el-button--danger',
      },
    )
    const response = await adminApi.deleteModels(selectedModels.value.map((model) => model.id))
    selectedModels.value = []
    ElMessage.success(`已删除 ${response.data.deletedCount} 个模型`)
    await loadModels()
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') {
      ElMessage.error(error instanceof Error ? error.message : '批量删除模型失败')
    }
  }
}

function handleModelSelectionChange(selection: AiModel[]) {
  selectedModels.value = selection
}

async function deleteUser(user: AdminUser) {
  try {
    await ElMessageBox.confirm(`确定删除用户「${user.email}」吗？`, '删除确认', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
      confirmButtonClass: 'el-button--danger',
    })
    await adminApi.deleteUser(user.id)
    ElMessage.success('用户已删除')
    await loadUsers()
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') {
      ElMessage.error(error instanceof Error ? error.message : '删除用户失败')
    }
  }
}

async function deleteProvider(provider: ApiProvider) {
  try {
    await ElMessageBox.confirm(`确定删除接口「${provider.name}」吗？`, '删除确认', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
      confirmButtonClass: 'el-button--danger',
    })
    await adminApi.deleteApiProvider(provider.id)
    ElMessage.success('接口已删除')
    await loadProviders()
    await loadModels()
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') {
      ElMessage.error(error instanceof Error ? error.message : '删除接口失败')
    }
  }
}

async function saveSettings() {
  try {
    const response = await adminApi.updateSettings(settingsForm as SystemSettings)
    Object.assign(settingsForm, response.data)
    ElMessage.success('设置已保存')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存设置失败')
  }
}

async function sendTestEmail() {
  if (!testEmailForm.email.trim()) {
    ElMessage.warning('请输入测试收件邮箱')
    return
  }

  try {
    sendingTestEmail.value = true
    await adminApi.sendTestEmail(testEmailForm.email.trim())
    ElMessage.success('测试邮件已发送，请查看邮箱')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '测试邮件发送失败')
  } finally {
    sendingTestEmail.value = false
  }
}

onMounted(() => {
  window.addEventListener('hashchange', () => {
    activeSection.value = getSectionFromHash()
  })
  loadUsers()
  loadProviders()
  loadModels()
  loadTasks()
  loadSettings()
})
</script>

<template>
  <el-container class="admin-shell">
    <el-aside class="admin-sidebar" width="240px">
      <div class="admin-brand">
        <span>AI</span>
        <strong>AIπ Admin</strong>
      </div>

      <el-menu
        :default-active="activeSection"
        background-color="#10192b"
        class="admin-menu"
        text-color="#d8e1f3"
        active-text-color="#ffffff"
        @select="(key: string) => changeSection(key as AdminSection)"
      >
        <el-menu-item v-for="item in menuItems" :key="item.id" :index="item.id">
          <el-icon><component :is="item.icon" /></el-icon>
          <div class="menu-copy">
            <strong>{{ item.label }}</strong>
            <small>{{ item.desc }}</small>
          </div>
        </el-menu-item>
      </el-menu>
    </el-aside>

    <el-container>
      <el-header class="admin-topbar" height="50px">
        <el-breadcrumb separator="/">
          <el-breadcrumb-item>AIπ 后台</el-breadcrumb-item>
          <el-breadcrumb-item>{{ current.label }}</el-breadcrumb-item>
        </el-breadcrumb>
        <el-button :icon="House" link tag="a" href="/">返回前台</el-button>
      </el-header>

      <el-main class="admin-page">
        <el-card v-if="activeSection === 'users'" class="admin-card" shadow="never">
          <template #header>
            <div class="card-header">
              <span>用户管理</span>
              <el-space>
                <el-button :icon="Refresh" @click="loadUsers">刷新</el-button>
                <el-button :icon="Plus" type="primary" @click="openCreateUserDialog">
                  新增用户
                </el-button>
              </el-space>
            </div>
          </template>

          <el-table :data="users" border stripe v-loading="loadingUsers" height="480">
            <el-table-column label="ID" type="index" width="80" />
            <el-table-column label="邮箱" prop="email" min-width="240" />
            <el-table-column label="邮箱验证" min-width="120">
              <template #default="{ row }">
                <el-tag :type="row.emailVerifiedAt ? 'success' : 'danger'" effect="light">
                  {{ row.emailVerifiedAt ? '已验证' : '未验证' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column :label="settingsForm.creditName" prop="credits" width="120" />
            <el-table-column label="角色" width="120">
              <template #default="{ row }">
                <el-tag :type="row.role === 'admin' ? 'warning' : 'info'" effect="light">
                  {{ row.role === 'admin' ? '管理员' : '用户' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="状态" width="120">
              <template #default="{ row }">
                <el-tag :type="row.status === 'active' ? 'success' : 'info'" effect="light">
                  {{ row.status === 'active' ? '正常' : '禁用' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="注册时间" min-width="190">
              <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
            </el-table-column>
            <el-table-column label="操作" width="390">
              <template #default="{ row }">
                <el-button size="small" type="success" plain @click.stop="openRechargeDialog(row)">
                  充值
                </el-button>
                <el-button size="small" type="info" plain @click.stop="openUserDetailsDialog(row)">
                  明细
                </el-button>
                <el-button size="small" type="primary" plain @click.stop="openEditUserDialog(row)">
                  编辑
                </el-button>
                <el-button size="small" type="warning" plain @click.stop="toggleUserStatus(row)">
                  {{ row.status === 'active' ? '禁用' : '启用' }}
                </el-button>
                <el-button size="small" type="danger" plain @click.stop="deleteUser(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>

        <el-card v-if="activeSection === 'apis'" class="admin-card" shadow="never">
          <template #header>
            <div class="card-header">
              <span>接口管理</span>
              <el-space>
                <el-button :icon="Refresh" @click="loadProviders">刷新</el-button>
                <el-button :icon="Plus" type="primary" @click="openCreateProviderDialog">
                  新增接口
                </el-button>
              </el-space>
            </div>
          </template>

          <el-table :data="providers" border stripe v-loading="loadingProviders" height="420">
            <el-table-column label="名称" prop="name" min-width="220" />
            <el-table-column label="类型" prop="type" width="130" />
            <el-table-column label="API 地址" prop="baseUrl" min-width="280" show-overflow-tooltip />
            <el-table-column label="状态" width="120">
              <template #default="{ row }">
                <el-tag :type="row.status === 'active' ? 'success' : 'info'" effect="light">
                  {{ row.status === 'active' ? '正常' : '禁用' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="250">
              <template #default="{ row }">
                <el-button size="small" type="primary" plain @click.stop="openEditProviderDialog(row)">
                  编辑
                </el-button>
                <el-button size="small" type="warning" plain @click.stop="toggleProviderStatus(row)">
                  {{ row.status === 'active' ? '禁用' : '启用' }}
                </el-button>
                <el-button size="small" type="danger" plain @click.stop="deleteProvider(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>

        <el-card v-if="activeSection === 'models'" class="admin-card" shadow="never">
          <template #header>
            <div class="card-header">
              <span>模型管理</span>
              <el-space>
                <el-select v-model="syncForm.providerId" placeholder="选择接口" style="width: 180px">
                  <el-option
                    v-for="provider in providers"
                    :key="provider.id"
                    :label="provider.name"
                    :value="provider.id"
                  />
                </el-select>
                <el-select v-model="syncForm.capability" style="width: 140px">
                  <el-option
                    v-for="item in capabilityOptions"
                    :key="item.value"
                    :label="item.label"
                    :value="item.value"
                  />
                </el-select>
                <el-input
                  v-model="syncForm.keyword"
                  clearable
                  placeholder="按模型名称过滤"
                  style="width: 180px"
                />
                <el-button :icon="Refresh" :loading="syncingModels" @click="syncModels">
                  同步模型
                </el-button>
                <el-button
                  :disabled="selectedModels.length === 0"
                  type="danger"
                  plain
                  @click="deleteSelectedModels"
                >
                  删除选中
                </el-button>
                <el-button :icon="Plus" type="primary" @click="openCreateModelDialog">
                  新增模型
                </el-button>
              </el-space>
            </div>
          </template>

          <el-table
            :data="models"
            border
            stripe
            v-loading="loadingModels"
            height="420"
            @selection-change="handleModelSelectionChange"
          >
            <el-table-column type="selection" width="48" />
            <el-table-column label="模型名称" prop="modelName" min-width="240" />
            <el-table-column label="显示名称" prop="displayName" min-width="180" />
            <el-table-column label="接口" prop="providerName" min-width="180" />
            <el-table-column label="用途" width="130">
              <template #default="{ row }">
                <el-tag effect="light">
                  {{ capabilityOptions.find((item) => item.value === row.capability)?.label }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="1K价格" prop="price1k" width="110" />
            <el-table-column label="2K价格" prop="price2k" width="110" />
            <el-table-column label="4K价格" prop="price4k" width="110" />
            <el-table-column label="状态" width="120">
              <template #default="{ row }">
                <el-tag :type="row.status === 'active' ? 'success' : 'info'" effect="light">
                  {{ row.status === 'active' ? '正常' : '禁用' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="250">
              <template #default="{ row }">
                <el-button size="small" type="primary" plain @click.stop="openEditModelDialog(row)">
                  编辑
                </el-button>
                <el-button size="small" type="warning" plain @click.stop="toggleModelStatus(row)">
                  {{ row.status === 'active' ? '禁用' : '启用' }}
                </el-button>
                <el-button size="small" type="danger" plain @click.stop="deleteModel(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>

        <el-card v-if="activeSection === 'tasks'" class="admin-card" shadow="never">
          <template #header>
            <div class="card-header">
              <span>任务列表</span>
              <el-button :icon="Refresh" @click="loadTasks">刷新</el-button>
            </div>
          </template>

          <div class="task-dashboard">
            <div class="task-overview-card primary">
              <span>生成图片数</span>
              <strong>{{ taskSummary.totalImages }}</strong>
              <small>成功任务 {{ taskSummary.successTasks }} / 总任务 {{ taskSummary.totalTasks }}</small>
            </div>
            <div class="task-overview-card">
              <span>扣除{{ settingsForm.creditName }}</span>
              <strong>{{ Number(taskSummary.totalCredits).toFixed(4) }}</strong>
              <small>仅统计成功任务</small>
            </div>
            <div class="task-overview-card">
              <span>创作中</span>
              <strong>{{ taskSummary.runningTasks }}</strong>
              <small>等待中与处理中</small>
            </div>
            <div class="task-overview-card danger">
              <span>失败/取消</span>
              <strong>{{ taskSummary.failedTasks + taskSummary.canceledTasks }}</strong>
              <small>失败 {{ taskSummary.failedTasks }} / 取消 {{ taskSummary.canceledTasks }}</small>
            </div>
          </div>

          <div class="capability-stat-grid">
            <div
              v-for="item in taskCapabilityStats"
              :key="item.capability"
              class="capability-stat-card"
            >
              <div class="capability-stat-head">
                <strong>{{ item.label }}</strong>
                <el-tag size="small" effect="light">{{ item.totalTasks }} 个任务</el-tag>
              </div>
              <div class="capability-stat-main">
                <span>{{ item.totalImages }}</span>
                <small>生成张数</small>
              </div>
              <div class="capability-stat-meta">
                <span>成功 {{ item.successTasks }}</span>
                <span>创作中 {{ item.runningTasks }}</span>
                <span>失败 {{ item.failedTasks }}</span>
                <span>扣费 {{ Number(item.totalCredits).toFixed(4) }}</span>
              </div>
            </div>
          </div>

          <el-table
            class="content-fit-table task-table"
            :data="tasks"
            border
            stripe
            v-loading="loadingTasks"
            height="420"
            table-layout="auto"
          >
            <el-table-column label="用户" prop="userEmail" min-width="90" show-overflow-tooltip />
            <el-table-column label="用户IP" prop="userIp" min-width="76" />
            <el-table-column label="用途" min-width="92">
              <template #default="{ row }">
                <el-tag effect="light">
                  {{ capabilityOptions.find((item) => item.value === row.capability)?.label }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="模型" prop="modelName" min-width="88" show-overflow-tooltip />
            <el-table-column label="规格" prop="sizeTier" min-width="58" />
            <el-table-column label="分辨率" prop="size" min-width="94" />
            <el-table-column label="数量" prop="quantity" min-width="58" />
            <el-table-column :label="`扣除${settingsForm.creditName}`" prop="costCredits" min-width="82" />
            <el-table-column :label="`剩余${settingsForm.creditName}`" prop="remainingCredits" min-width="82" />
            <el-table-column label="用时(s)" prop="durationSeconds" min-width="74" />
            <el-table-column label="状态" min-width="82">
              <template #default="{ row }">
                <el-tag
                  :type="getTaskStatusType(row.status)"
                  effect="light"
                >
                  {{ getTaskStatusLabel(row.status) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="提示词" prop="prompt" min-width="82" show-overflow-tooltip>
              <template #default="{ row }">
                <span class="task-prompt-cell">{{ row.prompt }}</span>
              </template>
            </el-table-column>
            <el-table-column label="创建时间" min-width="154">
              <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
            </el-table-column>
            <el-table-column label="操作" min-width="144">
              <template #default="{ row }">
                <el-button :icon="View" size="small" plain @click="openTaskPreview(row)">预览</el-button>
                <el-button size="small" plain @click="downloadTaskImage(row)">下载</el-button>
                <el-button
                  v-if="['queued', 'pending', 'processing'].includes(row.status)"
                  size="small"
                  type="danger"
                  plain
                  @click="cancelTask(row)"
                >
                  取消
                </el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>

        <el-dialog v-model="taskPreviewVisible" title="图片预览" width="720px">
          <div class="task-preview-dialog">
            <el-image v-if="taskPreviewUrl" :src="taskPreviewUrl" fit="contain" />
          </div>
        </el-dialog>

        <el-card v-if="activeSection === 'settings'" class="admin-card settings-card" shadow="never">
          <template #header>
            <div class="card-header">
              <span>系统设置</span>
            </div>
          </template>

          <el-form :model="settingsForm" label-position="top" class="settings-form settings-form-v2">
            <div class="settings-layout">
              <section class="settings-panel">
                <div class="settings-panel-head">
                  <div>
                    <strong>站点设置</strong>
                    <span>控制前台展示、访问地址和注册入口</span>
                  </div>
                </div>
                <div class="settings-panel-grid">
                  <el-form-item label="站点名称">
                    <el-input v-model="settingsForm.siteName" placeholder="AIπ" />
                  </el-form-item>
                  <el-form-item label="积分名称">
                    <el-input v-model="settingsForm.creditName" placeholder="例如：积分、算力、点数" />
                  </el-form-item>
                  <el-form-item label="前台地址">
                    <el-input v-model="settingsForm.frontendUrl" placeholder="http://localhost:5173" />
                  </el-form-item>
                  <el-form-item label="后端地址">
                    <el-input v-model="settingsForm.backendUrl" placeholder="http://localhost:3001" />
                  </el-form-item>
                  <el-form-item label="注册方式">
                    <el-select v-model="settingsForm.registerMode">
                      <el-option label="开放注册" value="open" />
                      <el-option label="关闭注册" value="closed" />
                    </el-select>
                  </el-form-item>
                  <el-form-item label="注册验证邮箱">
                    <el-switch
                      v-model="settingsForm.registerEmailVerification"
                      active-text="需要验证"
                      inactive-text="不验证"
                    />
                  </el-form-item>
                </div>
              </section>

              <section class="settings-panel">
                <div class="settings-panel-head">
                  <div>
                    <strong>邮件服务</strong>
                    <span>用于注册验证、找回密码和系统通知</span>
                  </div>
                  <el-switch
                    v-model="settingsForm.emailEnabled"
                    active-text="启用"
                    inactive-text="关闭"
                  />
                </div>
                <div class="settings-panel-grid">
                  <el-form-item label="SMTP Host">
                    <el-input v-model="settingsForm.emailHost" placeholder="smtp.example.com" />
                  </el-form-item>
                  <el-form-item label="SMTP Port">
                    <el-input-number v-model="settingsForm.emailPort" :min="1" :max="65535" />
                  </el-form-item>
                  <el-form-item label="安全连接">
                    <el-switch
                      v-model="settingsForm.emailSecure"
                      active-text="SSL/TLS"
                      inactive-text="普通连接"
                    />
                  </el-form-item>
                  <el-form-item label="SMTP 用户名">
                    <el-input v-model="settingsForm.emailUser" placeholder="邮箱账号或用户名" />
                  </el-form-item>
                  <el-form-item label="SMTP 密码">
                    <el-input v-model="settingsForm.emailPassword" type="password" show-password />
                  </el-form-item>
                  <el-form-item label="发件人名称">
                    <el-input v-model="settingsForm.emailFromName" placeholder="AIπ" />
                  </el-form-item>
                  <el-form-item label="发件邮箱">
                    <el-input v-model="settingsForm.emailFromAddress" placeholder="noreply@example.com" />
                  </el-form-item>
                </div>
              </section>

              <section class="settings-panel settings-panel-compact">
                <div class="settings-panel-head">
                  <div>
                    <strong>测试邮件</strong>
                    <span>保存配置后发送一封测试邮件检查 SMTP 是否可用</span>
                  </div>
                </div>
                <div class="test-email-panel">
                  <el-input
                    v-model="testEmailForm.email"
                    placeholder="输入测试收件邮箱"
                    type="email"
                  />
                  <el-button
                    :loading="sendingTestEmail"
                    type="success"
                    @click="sendTestEmail"
                  >
                    发送测试邮件
                  </el-button>
                </div>
              </section>

              <div class="settings-actions">
                <el-button :icon="SwitchButton" type="primary" @click="saveSettings">
                  保存设置
                </el-button>
              </div>
            </div>
            <el-form-item label="站点名称">
              <el-input v-model="settingsForm.siteName" />
            </el-form-item>
            <el-form-item label="积分名称">
              <el-input v-model="settingsForm.creditName" placeholder="例如：积分、算力、点数" />
            </el-form-item>
            <el-form-item label="前台地址">
              <el-input v-model="settingsForm.frontendUrl" />
            </el-form-item>
            <el-form-item label="后端地址">
              <el-input v-model="settingsForm.backendUrl" />
            </el-form-item>
            <el-form-item label="注册方式">
              <el-select v-model="settingsForm.registerMode">
                <el-option label="开放注册" value="open" />
                <el-option label="关闭注册" value="closed" />
              </el-select>
            </el-form-item>
            <div class="settings-section">
              <div class="settings-section-title">
                <strong>注册与邮件</strong>
                <span>用于注册邮箱验证和找回密码</span>
              </div>
              <div class="settings-grid">
                <el-form-item label="注册验证邮箱">
                  <el-switch
                    v-model="settingsForm.registerEmailVerification"
                    active-text="需要验证"
                    inactive-text="不验证"
                  />
                </el-form-item>
                <el-form-item label="启用邮件服务">
                  <el-switch
                    v-model="settingsForm.emailEnabled"
                    active-text="启用"
                    inactive-text="关闭"
                  />
                </el-form-item>
                <el-form-item label="SMTP Host">
                  <el-input v-model="settingsForm.emailHost" placeholder="smtp.example.com" />
                </el-form-item>
                <el-form-item label="SMTP Port">
                  <el-input-number v-model="settingsForm.emailPort" :min="1" :max="65535" />
                </el-form-item>
                <el-form-item label="SMTP 安全连接">
                  <el-switch
                    v-model="settingsForm.emailSecure"
                    active-text="SSL/TLS"
                    inactive-text="普通连接"
                  />
                </el-form-item>
                <el-form-item label="SMTP 用户名">
                  <el-input v-model="settingsForm.emailUser" placeholder="邮箱账号或用户名" />
                </el-form-item>
                <el-form-item label="SMTP 密码">
                  <el-input v-model="settingsForm.emailPassword" type="password" show-password />
                </el-form-item>
                <el-form-item label="发件人名称">
                  <el-input v-model="settingsForm.emailFromName" placeholder="AIπ" />
                </el-form-item>
                <el-form-item label="发件邮箱">
                  <el-input v-model="settingsForm.emailFromAddress" placeholder="noreply@example.com" />
                </el-form-item>
              </div>
              <div class="test-email-panel">
                <el-input
                  v-model="testEmailForm.email"
                  placeholder="输入测试收件邮箱"
                  type="email"
                />
                <el-button
                  :loading="sendingTestEmail"
                  type="success"
                  @click="sendTestEmail"
                >
                  发送测试邮件
                </el-button>
              </div>
            </div>
            <el-button :icon="SwitchButton" type="primary" @click="saveSettings">
              保存设置
            </el-button>
          </el-form>
        </el-card>
      </el-main>
    </el-container>

    <el-dialog
      v-model="userDialogVisible"
      :title="editingUserId ? '编辑用户' : '新增用户'"
      width="520px"
    >
      <el-form :model="userForm" label-position="top">
        <el-form-item label="邮箱">
          <el-input v-model="userForm.email" placeholder="请输入邮箱" />
        </el-form-item>
        <el-form-item label="密码">
          <el-input
            v-model="userForm.password"
            :placeholder="editingUserId ? '不修改请留空' : '请输入密码'"
            type="password"
            show-password
          />
        </el-form-item>
        <el-form-item label="角色">
          <el-select v-model="userForm.role">
            <el-option label="普通用户" value="user" />
            <el-option label="管理员" value="admin" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="userDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="createUser">
          {{ editingUserId ? '保存' : '创建' }}
        </el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="rechargeDialogVisible"
      :title="`给 ${rechargingUser?.email ?? ''} 充值`"
      width="460px"
    >
      <el-form :model="rechargeForm" label-position="top">
        <el-form-item :label="`充值${settingsForm.creditName}`">
          <el-input-number
            v-model="rechargeForm.amount"
            :min="0"
            :precision="4"
            controls-position="right"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="rechargeForm.remark" maxlength="200" placeholder="请输入备注" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="rechargeDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="rechargeUser">确认充值</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="detailDialogVisible"
      :title="`${detailUser?.email ?? ''} 明细`"
      width="980px"
    >
      <el-tabs v-loading="loadingUserDetails">
        <el-tab-pane :label="`${settingsForm.creditName}明细`">
          <el-table :data="detailData?.creditLogs ?? []" border stripe height="360">
            <el-table-column label="类型" width="100">
              <template #default="{ row }">
                <el-tag :type="row.type === 'recharge' ? 'success' : 'warning'" effect="light">
                  {{ getCreditLogTypeLabel(row) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="金额" width="130">
              <template #default="{ row }">
                {{ row.type === 'recharge' ? '+' : '-' }}{{ row.amount }}
              </template>
            </el-table-column>
            <el-table-column :label="`余额(${settingsForm.creditName})`" prop="balanceAfter" width="150" />
            <el-table-column label="备注" prop="remark" min-width="220" show-overflow-tooltip />
            <el-table-column label="时间" min-width="190">
              <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
            </el-table-column>
          </el-table>
        </el-tab-pane>
        <el-tab-pane label="生成记录">
          <el-table :data="detailData?.tasks ?? []" border stripe height="360">
            <el-table-column label="用途" width="130">
              <template #default="{ row }">
                <el-tag effect="light">
                  {{ capabilityOptions.find((item) => item.value === row.capability)?.label }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="模型" prop="modelName" min-width="180" />
            <el-table-column label="规格" prop="sizeTier" width="90" />
            <el-table-column label="数量" prop="quantity" width="90" />
            <el-table-column :label="`扣除${settingsForm.creditName}`" prop="costCredits" width="130" />
            <el-table-column :label="`剩余${settingsForm.creditName}`" prop="remainingCredits" width="130" />
            <el-table-column label="状态" width="100">
              <template #default="{ row }">
                <el-tag
                  :type="row.status === 'success' ? 'success' : row.status === 'failed' ? 'danger' : 'info'"
                  effect="light"
                >
                  {{ row.status === 'success' ? '成功' : row.status === 'failed' ? '失败' : '等待中' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="提示词" prop="prompt" min-width="240" show-overflow-tooltip />
            <el-table-column label="时间" min-width="190">
              <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
            </el-table-column>
          </el-table>
        </el-tab-pane>
      </el-tabs>
    </el-dialog>

    <el-dialog
      v-model="apiDialogVisible"
      :title="editingProviderId ? '编辑接口' : '新增接口'"
      width="620px"
    >
      <el-form :model="apiForm" label-position="top">
        <el-form-item label="接口名称">
          <el-input v-model="apiForm.name" placeholder="请输入接口名称" />
        </el-form-item>
        <el-form-item label="接口类型">
          <el-select v-model="apiForm.type">
            <el-option label="sub2api" value="sub2api" />
            <el-option label="custom" value="custom" />
          </el-select>
        </el-form-item>
        <el-form-item label="Base URL">
          <el-input v-model="apiForm.baseUrl" placeholder="请输入 Base URL" />
        </el-form-item>
        <el-form-item label="API Key">
          <el-input v-model="apiForm.apiKey" placeholder="请输入 API Key" show-password />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="apiDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="createProvider">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="modelDialogVisible"
      :title="editingModelId ? '编辑模型' : '新增模型'"
      width="720px"
    >
      <el-form :model="modelForm" label-position="top">
        <el-form-item label="所属接口">
          <el-select
            v-model="modelForm.providerId"
            placeholder="请选择接口"
            @change="handleModelProviderChange"
          >
            <el-option
              v-for="provider in providers"
              :key="provider.id"
              :label="provider.name"
              :value="provider.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item v-if="!editingModelId" label="模型名称">
          <el-space fill class="model-dialog-picker">
            <el-select
              v-model="modelForm.modelNames"
              multiple
              filterable
              placeholder="请选择模型"
            >
              <el-option
                v-for="modelName in dialogModelOptions"
                :key="modelName"
                :label="modelName"
                :value="modelName"
              />
            </el-select>
            <el-button :loading="loadingDialogModels" @click="loadDialogModelOptions">
              读取模型
            </el-button>
          </el-space>
        </el-form-item>
        <el-form-item v-else label="模型名称">
          <el-select v-model="modelForm.modelName" filterable allow-create placeholder="请选择模型">
            <el-option
              v-for="modelName in dialogModelOptions"
              :key="modelName"
              :label="modelName"
              :value="modelName"
            />
          </el-select>
        </el-form-item>
        <el-form-item v-if="editingModelId" label="显示名称">
          <el-input v-model="modelForm.displayName" placeholder="请输入显示名称" />
        </el-form-item>
        <el-form-item v-if="!editingModelId" label="用途">
          <el-select
            v-model="modelForm.capabilities"
            multiple
            placeholder="请选择用途"
          >
            <el-option
              v-for="item in capabilityOptions"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item v-else label="用途">
          <el-select v-model="modelForm.capability">
            <el-option
              v-for="item in capabilityOptions"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="模型定价">
          <div class="price-grid">
            <label>
              <span>1K 图像</span>
              <el-input-number
                v-model="modelForm.price1k"
                :min="0"
                :precision="4"
                controls-position="right"
              />
            </label>
            <label>
              <span>2K 图像</span>
              <el-input-number
                v-model="modelForm.price2k"
                :min="0"
                :precision="4"
                controls-position="right"
              />
            </label>
            <label>
              <span>4K 图像</span>
              <el-input-number
                v-model="modelForm.price4k"
                :min="0"
                :precision="4"
                controls-position="right"
              />
            </label>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="modelDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="createModel">保存</el-button>
      </template>
    </el-dialog>
  </el-container>
</template>
