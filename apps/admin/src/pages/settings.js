import { adminApi } from '../api.js'
import { toNumber } from '../format.js'

const { computed, reactive, ref, watch } = Vue
const { message, Modal } = antd

const defaultSettings = {
  siteName: 'AI-PAI',
  logoText: 'AI-PAI',
  frontendUrl: window.location.origin,
  backendUrl: window.location.origin,
  supportEnabled: true,
  supportTitle: '联系客服',
  supportDescription: '遇到订阅、生成或账号问题，可以通过下面方式联系管理员。',
  supportWechat: '',
  supportQq: '',
  supportGroupNumber: '',
  supportGroupUrl: '',
  supportEmail: '',
  supportUrl: '',
  supportQrCodeUrl: '',
  freeHourlyGenerationQuota: 2,
  freeDailyGenerationQuota: 5,
  freeGenerationQuota: 10,
  taskTimeoutMinutes: 3,
  streamGenerationEnabled: false,
  alipayAppId: '',
  alipayPrivateKey: '',
  alipayPublicKey: '',
  alipayGateway: 'https://openapi.alipay.com/gateway.do',
  registerMode: 'open',
  emailEnabled: false,
  emailHost: '',
  emailPort: 465,
  emailSecure: true,
  emailUser: '',
  emailPassword: '',
  emailFromName: 'AI-PAI',
  emailFromAddress: '',
  registerEmailVerification: false,
}

function displayBrandName(value, fallback = 'AI-PAI') {
  const text = String(value || fallback).trim() || fallback
  const normalized = text.replace(/AIπ/g, 'AI-PAI')
  return /^(ai-pai|ai\s+pai)$/i.test(normalized) ? 'AI-PAI' : normalized
}

function normalizeBrandFields(target) {
  ;['siteName', 'logoText', 'emailFromName'].forEach((key) => {
    target[key] = displayBrandName(target[key])
  })
}

export const SettingsPage = {
  props: { settings: Object },
  emits: ['refresh-settings'],
  setup(props, { emit }) {
    const form = reactive({ ...defaultSettings, ...(props.settings || {}) })
    normalizeBrandFields(form)
    const settingsVisible = ref(false)
    const groups = [
      { title: '站点与注册', fields: [
        { key: 'siteName', label: '站点名称' }, { key: 'logoText', label: 'Logo 文字' },
        { key: 'registerMode', label: '注册模式', type: 'select', options: [{ label: '开放注册', value: 'open' }, { label: '关闭注册', value: 'closed' }] },
        { key: 'registerEmailVerification', label: '注册邮箱验证', type: 'boolean' },
        { key: 'frontendUrl', label: '前台地址', type: 'url' }, { key: 'backendUrl', label: '后端地址', type: 'url' },
      ] },
      { title: '客服入口', fields: [
        { key: 'supportEnabled', label: '开启客服入口', type: 'boolean' }, { key: 'supportTitle', label: '客服标题' }, { key: 'supportDescription', label: '客服说明', type: 'textarea' },
        { key: 'supportWechat', label: '微信号' }, { key: 'supportQq', label: 'QQ号' }, { key: 'supportGroupNumber', label: '群聊群号' }, { key: 'supportGroupUrl', label: '群聊跳转链接', type: 'url' }, { key: 'supportEmail', label: '客服邮箱' }, { key: 'supportUrl', label: '在线客服链接' }, { key: 'supportQrCodeUrl', label: '二维码图片地址' },
      ] },
      { title: '生成策略', fields: [
        { key: 'freeHourlyGenerationQuota', label: '免费小时额度（张）', type: 'number', help: '未开通订阅的用户每个自然小时可提交的图片张数。' },
        { key: 'freeDailyGenerationQuota', label: '免费日额度（张）', type: 'number', help: '未开通订阅的用户每天可提交的图片张数。' },
        { key: 'freeGenerationQuota', label: '免费月额度（张）', type: 'number', help: '未开通订阅的用户每个自然月可生成的图片张数。' },
        { key: 'streamGenerationEnabled', label: '启用流式生图', type: 'boolean' },
        { key: 'taskTimeoutMinutes', label: '任务超时分钟', type: 'number' },
      ] },
      { title: '支付与邮件', fields: [
        { key: 'alipayAppId', label: '支付宝 App ID' }, { key: 'alipayGateway', label: '支付宝网关', type: 'url' }, { key: 'alipayPrivateKey', label: '应用私钥', type: 'textarea' }, { key: 'alipayPublicKey', label: '支付宝公钥', type: 'textarea' },
        { key: 'emailEnabled', label: '开启邮件', type: 'boolean' }, { key: 'emailHost', label: 'SMTP Host', help: 'Gmail: smtp.gmail.com；QQ邮箱: smtp.qq.com' }, { key: 'emailPort', label: 'SMTP Port', type: 'number', help: 'SSL/TLS 通常用 465；STARTTLS 通常用 587' }, { key: 'emailSecure', label: 'SSL/TLS', type: 'boolean', help: '465 端口请开启；587 端口通常关闭后走 STARTTLS' }, { key: 'emailUser', label: '邮箱账号', help: '填写完整邮箱地址，例如 name@gmail.com 或 name@qq.com' }, { key: 'emailPassword', label: '邮箱密码/授权码', type: 'password', help: 'Gmail 请填写应用专用密码；QQ 邮箱请填写 SMTP 授权码，不是登录密码' }, { key: 'emailFromName', label: '发件人名称' }, { key: 'emailFromAddress', label: '发件地址', help: '建议与邮箱账号保持一致，避免被 SMTP 服务拒绝' },
      ] },
    ]
    const statusItems = computed(() => [
      ['当前站点', displayBrandName(form.siteName)],
      ['注册状态', form.registerMode === 'closed' ? '关闭注册' : '开放注册'],
      ['免费额度', `${toNumber(form.freeHourlyGenerationQuota, 2)} 张/小时 · ${toNumber(form.freeDailyGenerationQuota, 5)} 张/日 · ${toNumber(form.freeGenerationQuota, 10)} 张/月`],
      ['生图模式', form.streamGenerationEnabled ? '流式' : '普通'],
      ['任务超时', `${toNumber(form.taskTimeoutMinutes, 3)} 分钟`],
    ])
    watch(() => props.settings, (next) => {
      Object.assign(form, defaultSettings, next || {})
      normalizeBrandFields(form)
    }, { deep: true })

    function normalizeInput() {
      const input = {}
      groups.forEach((group) => group.fields.forEach((field) => { input[field.key] = form[field.key] }))
      ;['supportEnabled', 'streamGenerationEnabled', 'emailEnabled', 'emailSecure', 'registerEmailVerification'].forEach((key) => { input[key] = input[key] === true || input[key] === 'true' })
      ;['freeHourlyGenerationQuota', 'freeDailyGenerationQuota', 'freeGenerationQuota', 'taskTimeoutMinutes', 'emailPort'].forEach((key) => { input[key] = toNumber(input[key], defaultSettings[key]) })
      normalizeBrandFields(input)
      input.frontendUrl = input.frontendUrl || window.location.origin
      input.backendUrl = input.backendUrl || window.location.origin
      return input
    }

    function applySmtpPreset(provider) {
      form.emailEnabled = true
      if (provider === 'gmail') {
        form.emailHost = 'smtp.gmail.com'
        form.emailPort = 465
        form.emailSecure = true
        message.success('已填入 Gmail SMTP 参数，请继续填写邮箱账号和应用专用密码')
        return
      }
      form.emailHost = 'smtp.qq.com'
      form.emailPort = 465
      form.emailSecure = true
      message.success('已填入 QQ 邮箱 SMTP 参数，请继续填写邮箱账号和 SMTP 授权码')
    }

    function readFieldValue(field) {
      if (field.type === 'boolean') return form[field.key] ? '开启' : '关闭'
      return form[field.key] || '-'
    }

    async function submit() {
      try {
        const input = normalizeInput()
        const response = await adminApi.updateSettings(input)
        const saved = response?.data || {}
        const groupNumberChanged = String(input.supportGroupNumber || '').trim() !== String(saved.supportGroupNumber || '').trim()
        const groupUrlChanged = String(input.supportGroupUrl || '').trim() !== String(saved.supportGroupUrl || '').trim()
        if ((input.supportGroupNumber || input.supportGroupUrl) && (groupNumberChanged || groupUrlChanged)) {
          throw new Error('后端未接收群聊配置，请重启 Go 后端后再保存')
        }
        Object.assign(form, defaultSettings, saved)
        normalizeBrandFields(form)
        message.success('设置已保存')
        settingsVisible.value = false
        emit('refresh-settings')
      } catch (error) {
        message.error(error instanceof Error ? error.message : '保存失败')
      }
    }

    function testEmail() {
      let value = form.emailFromAddress || ''
      Modal.confirm({
        title: '发送测试邮件',
        content: Vue.h('input', { class: 'ant-input', value, type: 'email', onInput: (event) => { value = event.target.value } }),
        okText: '发送',
        cancelText: '取消',
        async onOk() {
          if (!value) return
          await adminApi.sendTestEmail(value)
          message.success('测试邮件已发送')
        },
      })
    }

    return { applySmtpPreset, form, groups, readFieldValue, statusItems, settingsVisible, submit, testEmail }
  },
  template: `
    <div class="settings-page">
      <section class="page-panel">
        <div class="page-hero">
          <div><div class="page-kicker">System Settings</div><div class="page-title">系统设置</div><div class="page-desc">维护站点基础信息、注册规则、客服入口、生成策略和支付邮件。</div></div>
          <div class="toolbar"><a-button @click="testEmail">发送测试邮件</a-button><a-button type="primary" @click="settingsVisible = true">编辑设置</a-button></div>
        </div>
        <div class="summary-grid"><div v-for="[label, value] in statusItems" :key="label" class="summary-card"><span>{{ label }}</span><b style="font-size:18px">{{ value }}</b></div></div>
      </section>
      <section v-for="group in groups" :key="group.title" class="page-panel">
        <div class="page-hero"><div><div class="page-title" style="font-size:16px">{{ group.title }}</div></div></div>
        <div class="settings-read-grid">
          <div v-for="field in group.fields" :key="field.key" class="settings-read-item">
            <span>{{ field.label }}</span>
            <b>{{ readFieldValue(field) }}</b>
          </div>
        </div>
      </section>
      <a-drawer
        v-model:open="settingsVisible"
        title="编辑系统设置"
        width="min(96vw, 980px)"
        class="admin-edit-drawer"
        destroy-on-close
      >
        <section v-for="group in groups" :key="group.title" class="drawer-form-section">
          <div class="drawer-form-section-title">
            <span>{{ group.title }}</span>
            <span v-if="group.title === '支付与邮件'" class="settings-preset-actions">
              <a-button size="small" @click="applySmtpPreset('qq')">QQ邮箱</a-button>
              <a-button size="small" @click="applySmtpPreset('gmail')">Gmail</a-button>
            </span>
          </div>
          <div class="form-grid drawer-form-grid">
            <label v-for="field in group.fields" :key="field.key" :class="{ full: field.type === 'textarea' }">
              <div class="muted" style="margin-bottom:6px">{{ field.label }}</div>
              <a-textarea v-if="field.type === 'textarea'" v-model:value="form[field.key]" :rows="4" />
              <a-select v-else-if="field.type === 'select'" v-model:value="form[field.key]" style="width:100%"><a-select-option v-for="option in field.options" :key="option.value" :value="option.value">{{ option.label }}</a-select-option></a-select>
              <a-switch v-else-if="field.type === 'boolean'" v-model:checked="form[field.key]" checked-children="开" un-checked-children="关" />
              <a-input v-else v-model:value="form[field.key]" :type="field.type || 'text'" />
              <small v-if="field.help" class="settings-field-help">{{ field.help }}</small>
            </label>
          </div>
        </section>
        <template #footer>
          <div class="drawer-footer-actions">
            <a-button @click="settingsVisible = false">取消</a-button>
            <a-button type="primary" @click="submit">保存</a-button>
          </div>
        </template>
      </a-drawer>
    </div>
  `,
}
