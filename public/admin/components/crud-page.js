import { amount, formatDate, money, statusItem, text, toNumber } from '../format.js'
import { renderMarkdown } from '../common/markdown.js'

const { computed, onBeforeUnmount, onMounted, reactive, ref, watch } = Vue
const { message, Modal } = antd

const markdownTemplates = [
  {
    key: 'activity',
    label: '活动通知',
    title: '限时活动通知',
    content: `### 限时活动通知

**活动时间：** 即日起 - 结束时间待定

- 活动期间完成充值，可获得额外权益
- 会员用户可优先体验新模型
- 如遇到账问题，请联系客服处理

> 活动名额有限，具体规则以页面展示为准。`,
  },
  {
    key: 'maintenance',
    label: '维护通知',
    title: '系统维护通知',
    content: `### 系统维护通知

为了提升服务稳定性，平台将进行短时维护。

**维护时间：** 请填写具体时间

维护期间可能出现：

- 页面短暂无法访问
- 任务状态同步延迟
- 充值到账轻微延迟

维护完成后服务会自动恢复，感谢理解。`,
  },
  {
    key: 'release',
    label: '版本更新',
    title: '版本更新公告',
    content: `### 版本更新公告

本次更新内容如下：

1. 优化生成任务体验
2. 修复已知问题
3. 提升移动端页面适配

如果你在使用中遇到异常，可以联系管理员反馈。`,
  },
  {
    key: 'recharge',
    label: '充值优惠',
    title: '充值优惠活动',
    content: `### 充值优惠活动

活动期间充值可享受更多创作权益。

| 充值档位 | 活动权益 |
| --- | --- |
| 30 元 | 适合日常体验 |
| 50 元 | 推荐创作用户 |
| 100 元 | 高频用户更划算 |

点击充值后，支付完成会自动到账。`,
  },
]

function read(row, key) {
  if (!key) return ''
  return key.split('.').reduce((value, part) => value?.[part], row)
}

function formatCell(row, column) {
  const value = column.render ? column.render(row) : read(row, column.key)
  if (column.format === 'amount') return amount(value)
  if (column.format === 'money') return money(value)
  if (column.format === 'date') return formatDate(value)
  return text(value)
}

function fieldValue(field, value) {
  if (field.type === 'multiple-select') {
    return Array.isArray(value) ? [...value] : []
  }
  return value ?? field.defaultValue ?? ''
}

export const CrudPage = {
  props: {
    title: { type: String, required: true },
    description: String,
    singular: String,
    list: { type: Function, required: true },
    create: Function,
    update: Function,
    delete: Function,
    columns: { type: Array, required: true },
    fields: [Array, Function],
    paginated: Boolean,
    pageSize: { type: Number, default: 20 },
    search: Boolean,
    defaultFilters: Object,
    filters: Array,
    readonly: Boolean,
    actions: Array,
  },
  setup(props) {
    const rows = ref([])
    const loading = ref(false)
    const page = ref(1)
    const keyword = ref('')
    const filterValues = reactive({ ...(props.defaultFilters || {}) })
    const pagination = ref(null)
    const editing = ref(undefined)
    const form = reactive({})
    const aiDrafts = reactive({})
    const aiGenerating = reactive({})

    const filteredRows = computed(() => {
      if (props.paginated) return rows.value
      const normalizedKeyword = keyword.value.trim().toLowerCase()
      if (!normalizedKeyword) return rows.value
      return rows.value.filter((row) => props.columns.some((column) => {
        const value = column.render ? column.render(row) : read(row, column.key)
        return String(value ?? '').toLowerCase().includes(normalizedKeyword)
      }))
    })
    const total = computed(() => props.paginated ? (pagination.value?.total || 0) : filteredRows.value.length)
    const visibleRows = computed(() => props.paginated ? rows.value : filteredRows.value.slice((page.value - 1) * props.pageSize, page.value * props.pageSize))
    const dialogFields = computed(() => typeof props.fields === 'function' ? props.fields(editing.value || null) : props.fields || [])
    const drawerWidth = computed(() => dialogFields.value.some((field) => field.preview === 'markdown') ? 'min(96vw, 1120px)' : 'min(92vw, 760px)')
    const canCreate = computed(() => Boolean(props.create))
    const canUpdate = computed(() => Boolean(props.update))
    const canDelete = computed(() => Boolean(props.delete))
    const canMutate = computed(() => !props.readonly && (canUpdate.value || canDelete.value))
    const extraActions = computed(() => props.actions || [])
    const tableColumns = computed(() => {
      const baseColumns = props.columns.map((column, index) => ({
        title: column.label,
        key: `column-${index}`,
        source: column,
        ellipsis: !column.longText,
        width: column.width || 150,
      }))
      if (canMutate.value) {
        baseColumns.push({ title: '操作', key: '__actions', fixed: 'right', width: 130 })
      }
      return baseColumns
    })
    const tableScrollX = computed(() => Math.max(720, tableColumns.value.reduce((sum, column) => sum + Number(column.width || 150), 0)))

    async function load() {
      loading.value = true
      try {
        const params = props.paginated ? { page: page.value, pageSize: props.pageSize, keyword: keyword.value, ...filterValues } : undefined
        const response = await props.list(params)
        rows.value = response.data || []
        pagination.value = response.pagination || null
      } catch (error) {
        message.error(error instanceof Error ? error.message : '加载失败')
      } finally {
        loading.value = false
      }
    }

    function openCreate() {
      editing.value = null
      Object.keys(form).forEach((key) => delete form[key])
      dialogFields.value.forEach((field) => {
        form[field.key] = fieldValue(field, field.defaultValue)
      })
    }

    function openEdit(row) {
      editing.value = row
      Object.keys(form).forEach((key) => delete form[key])
      dialogFields.value.forEach((field) => {
        form[field.key] = fieldValue(field, read(row, field.key))
      })
    }

    function closeForm() {
      editing.value = undefined
    }

    function aiState(field) {
      if (!aiDrafts[field.key]) aiDrafts[field.key] = { prompt: '' }
      return aiDrafts[field.key]
    }

    function resetFilterState() {
      keyword.value = ''
      Object.keys(filterValues).forEach((key) => {
        filterValues[key] = props.defaultFilters?.[key] || ''
      })
    }

    async function submit() {
      const input = {}
      dialogFields.value.forEach((field) => {
        const value = form[field.key]
        if (field.omitEmpty && value === '') return
        if (field.number) input[field.key] = toNumber(value, Number(field.defaultValue || 0))
        else if (field.boolean) input[field.key] = value === true || value === 'true'
        else if (field.nullable && value === '') input[field.key] = null
        else input[field.key] = value
      })
      try {
        if (editing.value) await props.update?.(editing.value.id, input)
        else await props.create?.(input)
        message.success('保存成功')
        editing.value = undefined
        await load()
      } catch (error) {
        message.error(error instanceof Error ? error.message : '保存失败')
      }
    }

    function remove(row) {
      if (!props.delete) return
      Modal.confirm({
        title: '删除确认',
        content: '确定删除当前记录吗？',
        okText: '删除',
        okType: 'danger',
        cancelText: '取消',
        async onOk() {
          const response = await props.delete(row.id)
          message.success(response?.message || response?.data?.message || '删除成功')
          await load()
        },
      })
    }

    function isStatusColumn(column) {
      return column?.source?.format === 'status'
    }

    function isReadStatsColumn(column) {
      return column?.source?.format === 'read-stats'
    }

    function isPriceChangeColumn(column) {
      return column?.source?.format === 'price-change'
    }

    function statusCell(record, column) {
      const source = column?.source || {}
      return statusItem(source.map || 'common', source.render ? source.render(record) : read(record, source.key))
    }

    function priceChangeCell(record, column) {
      const source = column?.source || {}
      const value = toNumber(source.render ? source.render(record) : read(record, source.key), 0)
      if (value > 0) return { label: `上涨 ${amount(value)}%`, color: 'red' }
      if (value < 0) return { label: `下降 ${amount(Math.abs(value))}%`, color: 'green' }
      return { label: '持平', color: 'default' }
    }

    function fieldPreviewHtml(field) {
      const html = renderMarkdown(form[field.key] || '')
      return html || '<p class="admin-markdown-empty">暂无内容</p>'
    }

    function handleTextareaTab(event, field) {
      if (field.preview !== 'markdown' || event.key !== 'Tab') return
      event.preventDefault()
      const input = event.target
      const start = input.selectionStart ?? 0
      const end = input.selectionEnd ?? start
      const value = String(form[field.key] || '')
      form[field.key] = `${value.slice(0, start)}  ${value.slice(end)}`
      Vue.nextTick(() => {
        input.selectionStart = start + 2
        input.selectionEnd = start + 2
      })
    }

    function insertMarkdown(field, type) {
      const fieldNode = document.querySelector(`[data-field-key="${field.key}"]`)
      const textarea = fieldNode?.tagName === 'TEXTAREA' ? fieldNode : fieldNode?.querySelector?.('textarea')
      if (!textarea) return
      const start = textarea.selectionStart ?? 0
      const end = textarea.selectionEnd ?? start
      const value = String(form[field.key] || '')
      const selected = value.slice(start, end)
      const lineStart = value.lastIndexOf('\n', Math.max(start - 1, 0)) + 1
      const lineEndIndex = value.indexOf('\n', end)
      const lineEnd = lineEndIndex === -1 ? value.length : lineEndIndex
      const lineValue = value.slice(lineStart, lineEnd)
      const replacements = {
        heading: { text: `### ${selected || '标题'}`, selectStart: 4, selectEnd: selected ? 4 + selected.length : 6 },
        bold: { text: `**${selected || '加粗文字'}**`, selectStart: 2, selectEnd: selected ? 2 + selected.length : 6 },
        link: { text: `[${selected || '链接文字'}](https://)`, selectStart: 1, selectEnd: selected ? 1 + selected.length : 5 },
        image: { text: `![${selected || '图片描述'}](https://)`, selectStart: 2, selectEnd: selected ? 2 + selected.length : 6 },
        quote: { text: `> ${selected || '引用内容'}`, selectStart: 2, selectEnd: selected ? 2 + selected.length : 6 },
        code: { text: selected.includes('\n') ? `\`\`\`\n${selected || '代码'}\n\`\`\`` : `\`${selected || '代码'}\``, selectStart: selected.includes('\n') ? 4 : 1, selectEnd: selected ? (selected.includes('\n') ? 4 + selected.length : 1 + selected.length) : (selected.includes('\n') ? 6 : 3) },
      }
      let replacement = replacements[type]
      let replaceStart = start
      let replaceEnd = end

      if (type === 'ul' || type === 'ol') {
        const lines = (selected || lineValue || '列表项').split('\n')
        replacement = {
          text: lines.map((line, index) => `${type === 'ol' ? `${index + 1}.` : '-'} ${line || '列表项'}`).join('\n'),
          selectStart: type === 'ol' ? 3 : 2,
          selectEnd: type === 'ol' ? 6 : 5,
        }
        if (!selected) {
          replaceStart = lineStart
          replaceEnd = lineEnd
        }
      }

      if (!replacement) return
      form[field.key] = `${value.slice(0, replaceStart)}${replacement.text}${value.slice(replaceEnd)}`
      Vue.nextTick(() => {
        const nextStart = replaceStart + replacement.selectStart
        textarea.focus()
        textarea.selectionStart = nextStart
        textarea.selectionEnd = replaceStart + replacement.selectEnd
      })
    }

    function applyMarkdownTemplate(field, template) {
      if (form[field.key]) {
        Modal.confirm({
          title: '替换当前内容？',
          content: '当前内容会被模板替换，确定继续吗？',
          okText: '替换',
          cancelText: '取消',
          onOk() {
            if ('title' in form) form.title = template.title
            form[field.key] = template.content
          },
        })
        return
      }
      if ('title' in form) form.title = template.title
      form[field.key] = template.content
    }

    async function generateFieldDraft(field) {
      if (typeof field.aiGenerate !== 'function') return
      const state = aiState(field)
      const prompt = String(state.prompt || '').trim()
      if (!prompt) {
        message.warning('先输入公告主题或要点')
        return
      }
      aiGenerating[field.key] = true
      try {
        const response = await field.aiGenerate({
          prompt,
          title: form.title || '',
          content: form[field.key] || '',
          displayMode: form.displayMode || '',
          targetType: form.targetType || '',
        })
        const data = response.data || {}
        if (data.title && 'title' in form) form.title = data.title
        if (data.content) form[field.key] = data.content
        message.success('AI 已生成公告草稿')
      } catch (error) {
        message.error(error instanceof Error ? error.message : 'AI 生成失败')
      } finally {
        aiGenerating[field.key] = false
      }
    }

    async function copyCell(record, column) {
      const source = column?.source || {}
      const value = source.render ? source.render(record) : read(record, source.key)
      const content = String(value ?? '').trim()
      if (!content || content === '-') return
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(content)
        } else {
          const input = document.createElement('textarea')
          input.value = content
          input.setAttribute('readonly', '')
          input.style.position = 'fixed'
          input.style.left = '-9999px'
          document.body.appendChild(input)
          input.select()
          document.execCommand('copy')
          document.body.removeChild(input)
        }
        message.success('已复制')
      } catch (error) {
        message.error('复制失败，请手动复制')
      }
    }

    watch([keyword, () => JSON.stringify(filterValues)], () => {
      page.value = 1
      load()
    })
    watch(page, load)
    function handleAutoRefresh() {
      if (editing.value !== undefined) return
      load()
    }

    onMounted(() => {
      load()
      window.addEventListener('admin:auto-refresh', handleAutoRefresh)
    })
    onBeforeUnmount(() => {
      window.removeEventListener('admin:auto-refresh', handleAutoRefresh)
    })

    return {
      rows,
      loading,
      page,
      keyword,
      filterValues,
      total,
      visibleRows,
      editing,
      form,
      dialogFields,
      drawerWidth,
      load,
      openCreate,
      openEdit,
      closeForm,
      resetFilterState,
      submit,
      remove,
      read,
      formatCell,
      statusItem,
      tableColumns,
      tableScrollX,
      canCreate,
      canUpdate,
      canDelete,
      extraActions,
      isStatusColumn,
      isReadStatsColumn,
      isPriceChangeColumn,
      statusCell,
      priceChangeCell,
      fieldPreviewHtml,
      handleTextareaTab,
      insertMarkdown,
      applyMarkdownTemplate,
      aiState,
      aiGenerating,
      generateFieldDraft,
      markdownTemplates,
      copyCell,
    }
  },
  template: `
    <div class="crud-page">
      <a-card class="admin-view-card" :bordered="false">
        <div class="admin-card-hero">
          <div>
            <div class="page-kicker">Management</div>
            <div class="page-title">{{ title }}</div>
            <div v-if="description" class="page-desc">{{ description }}</div>
          </div>
          <div class="toolbar">
            <a-button :loading="loading" @click="load">刷新</a-button>
            <a-button v-for="action in extraActions" :key="action.key || action.label" :type="action.type || 'default'" @click="action.onClick?.({ rows, load })">
              <i v-if="action.icon" :class="['ti', action.icon]"></i>
              {{ action.label }}
            </a-button>
            <a-button v-if="canCreate" type="primary" @click="openCreate">新增{{ singular || '' }}</a-button>
          </div>
        </div>
        <div v-if="search || filters?.length" class="filter-row">
          <a-input v-if="search" v-model:value="keyword" allow-clear placeholder="搜索关键词" style="width: 280px" />
          <template v-for="filter in filters || []" :key="filter.key">
            <a-select v-model:value="filterValues[filter.key]" style="width: 160px" :placeholder="filter.placeholder || '请选择'">
              <a-select-option v-for="option in filter.options" :key="option.value" :value="option.value">{{ option.label }}</a-select-option>
            </a-select>
          </template>
          <a-button @click="resetFilterState">重置</a-button>
          <a-tag class="filter-count-tag" color="blue">筛选 {{ total }} 条</a-tag>
        </div>
      </a-card>

      <a-card class="admin-view-card" :bordered="false">
        <template #title>{{ title }}列表</template>
        <template #extra><span class="page-desc">共 {{ total }} 条，当前 {{ visibleRows.length }} 条</span></template>
        <a-table :columns="tableColumns" :data-source="visibleRows" :pagination="false" :loading="loading" :scroll="{ x: tableScrollX }" row-key="id" size="small">
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === '__actions'">
              <div class="table-actions">
                <a-button v-if="canUpdate" type="link" size="small" @click="openEdit(record)">编辑</a-button>
                <a-button v-if="canDelete" type="link" size="small" danger @click="remove(record)">删除</a-button>
              </div>
            </template>
            <template v-else-if="isStatusColumn(column)">
              <a-tag :color="statusCell(record, column).color">
                {{ statusCell(record, column).label }}
              </a-tag>
            </template>
            <template v-else-if="isReadStatsColumn(column)">
              <div class="read-stat-cell">
                <div class="read-stat-main">
                  <span>{{ record.readCount || 0 }} / {{ record.targetCount || 0 }}</span>
                  <b>{{ record.readRate || 0 }}%</b>
                </div>
                <a-progress :percent="record.readRate || 0" size="small" :show-info="false" />
                <div class="read-stat-sub">未读 {{ record.unreadCount || 0 }}</div>
              </div>
            </template>
            <template v-else-if="isPriceChangeColumn(column)">
              <a-tag :color="priceChangeCell(record, column).color">
                {{ priceChangeCell(record, column).label }}
              </a-tag>
            </template>
            <template v-else-if="column.source.copy">
              <button class="copy-cell" type="button" title="点击复制" @click.stop="copyCell(record, column)">
                <span class="cell-ellipsis">{{ formatCell(record, column.source) }}</span>
                <i class="ti ti-copy"></i>
              </button>
            </template>
            <template v-else-if="column.source.longText">
              <a-tooltip :title="formatCell(record, column.source)" overlay-class-name="long-text-tooltip">
                <span class="cell-long-text">{{ formatCell(record, column.source) }}</span>
              </a-tooltip>
            </template>
            <template v-else>
              <span class="cell-ellipsis">{{ formatCell(record, column.source) }}</span>
            </template>
          </template>
        </a-table>
        <div class="pagination-row">
          <a-pagination v-model:current="page" size="small" :page-size="pageSize" :total="total" />
        </div>
      </a-card>

      <a-drawer
        :open="editing !== undefined"
        :title="(editing ? '编辑' : '新增') + (singular || title)"
        :width="drawerWidth"
        class="admin-edit-drawer"
        destroy-on-close
        @close="closeForm"
      >
        <div class="form-grid drawer-form-grid">
          <label v-for="field in dialogFields" :key="field.key" :class="{ full: field.type === 'textarea' || field.full }">
            <div class="muted" style="margin-bottom:6px">{{ field.label }}</div>
            <div v-if="field.aiGenerate" class="admin-ai-draft">
              <div class="admin-ai-draft-head">
                <span><i class="ti ti-sparkles"></i> AI 代写公告</span>
                <small>输入主题后自动生成标题和 Markdown 内容</small>
              </div>
              <div class="admin-ai-draft-row">
                <a-input v-model:value="aiState(field).prompt" placeholder="例如：端午活动通知，强调全站冲档优惠、邀请好友一起参与" @press-enter="generateFieldDraft(field)" />
                <a-button type="primary" :loading="aiGenerating[field.key]" @click="generateFieldDraft(field)">
                  <i class="ti ti-wand"></i>
                  生成
                </a-button>
              </div>
            </div>
            <div v-if="field.type === 'textarea' && field.preview === 'markdown'" class="admin-markdown-editor-grid">
              <div class="admin-markdown-editor">
                <div class="admin-markdown-toolbar">
                  <button type="button" title="标题" @click="insertMarkdown(field, 'heading')"><i class="ti ti-heading"></i></button>
                  <button type="button" title="加粗" @click="insertMarkdown(field, 'bold')"><i class="ti ti-bold"></i></button>
                  <button type="button" title="链接" @click="insertMarkdown(field, 'link')"><i class="ti ti-link"></i></button>
                  <button type="button" title="图片" @click="insertMarkdown(field, 'image')"><i class="ti ti-photo"></i></button>
                  <button type="button" title="无序列表" @click="insertMarkdown(field, 'ul')"><i class="ti ti-list"></i></button>
                  <button type="button" title="有序列表" @click="insertMarkdown(field, 'ol')"><i class="ti ti-list-numbers"></i></button>
                  <button type="button" title="引用" @click="insertMarkdown(field, 'quote')"><i class="ti ti-blockquote"></i></button>
                  <button type="button" title="代码" @click="insertMarkdown(field, 'code')"><i class="ti ti-code"></i></button>
                  <span class="admin-markdown-toolbar-divider"></span>
                  <a-dropdown>
                    <button class="admin-markdown-template-trigger" type="button" title="Markdown 模板">
                      <i class="ti ti-template"></i>
                      <span>模板</span>
                    </button>
                    <template #overlay>
                      <a-menu>
                        <a-menu-item v-for="item in markdownTemplates" :key="item.key" @click="applyMarkdownTemplate(field, item)">
                          {{ item.label }}
                        </a-menu-item>
                      </a-menu>
                    </template>
                  </a-dropdown>
                </div>
                <a-textarea :data-field-key="field.key" v-model:value="form[field.key]" :rows="field.rows || 8" @keydown="event => handleTextareaTab(event, field)" />
              </div>
              <div class="admin-markdown-preview">
                <div class="admin-markdown-preview-head">
                  <span>实时预览</span>
                  <a-tag color="blue">Markdown</a-tag>
                </div>
                <div class="admin-markdown-body" v-html="fieldPreviewHtml(field)"></div>
              </div>
            </div>
            <a-textarea v-else-if="field.type === 'textarea'" v-model:value="form[field.key]" :rows="field.rows || 4" />
            <a-select v-else-if="field.type === 'select'" v-model:value="form[field.key]" style="width:100%">
              <a-select-option v-for="option in field.options || []" :key="option.value" :value="option.value">{{ option.label }}</a-select-option>
            </a-select>
            <a-select v-else-if="field.type === 'multiple-select'" v-model:value="form[field.key]" mode="multiple" show-search allow-clear :placeholder="field.placeholder || '请选择'" option-filter-prop="searchText" style="width:100%">
              <a-select-option v-for="option in field.options || []" :key="option.value" :value="option.value" :label="option.label" :search-text="option.searchText || option.label">{{ option.label }}</a-select-option>
            </a-select>
            <a-switch v-else-if="field.boolean" v-model:checked="form[field.key]" checked-children="开" un-checked-children="关" />
            <a-input v-else v-model:value="form[field.key]" :type="field.type || 'text'" />
          </label>
        </div>
        <template #footer>
          <div class="drawer-footer-actions">
            <a-button @click="closeForm">取消</a-button>
            <a-button type="primary" @click="submit">保存</a-button>
          </div>
        </template>
      </a-drawer>
    </div>
  `,
}
