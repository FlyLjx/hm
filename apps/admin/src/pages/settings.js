import { adminApi } from '../api.js'
import { toNumber } from '../format.js'

const { computed, reactive, ref, watch } = Vue
const { message, Modal } = antd

const defaultSettings = {
  siteName: 'AIπ',
  logoText: 'AIπ',
  creditName: '积分',
  frontendUrl: window.location.origin,
  backendUrl: window.location.origin,
  supportEnabled: true,
  supportTitle: '联系客服',
  supportDescription: '遇到充值、生成或账号问题，可以通过下面方式联系管理员。',
  supportWechat: '',
  supportQq: '',
  supportEmail: '',
  supportUrl: '',
  supportQrCodeUrl: '',
  rechargeEnabled: true,
  rechargeRate: 1,
  rechargeMinAmount: 1,
  rechargePresets: '10,30,50,100',
  checkinEnabled: true,
  checkinRewards: '0.1,0.2,0.3,0.5,0.8,1',
  inviteEnabled: true,
  inviteRewardCredits: 1,
  taskTimeoutMinutes: 3,
  streamGenerationEnabled: false,
  promptModerationEnabled: true,
  promptModerationAdultKeywords: '裸体\n裸露\n色情\n黄图\n成人\n性爱\n性交\n做爱\n露点\n私处\n乳头\n生殖器\n强奸\n未成年色情',
  promptModerationPoliticalKeywords: '习近平\n毛泽东\n共产党\n中共\n台湾独立\n台独\n港独\n藏独\n疆独\n六四\n法轮功\n政治宣传\n推翻政府',
  promptModerationRejectMessage: '提示词包含不支持生成的敏感内容，请修改后再试。',
  alipayAppId: '',
  alipayPrivateKey: '',
  alipayPublicKey: '',
  alipayGateway: 'https://openapi.alipay.com/gateway.do',
  registerMode: 'open',
  registerRewardCredits: 0,
  emailEnabled: false,
  emailHost: '',
  emailPort: 465,
  emailSecure: true,
  emailUser: '',
  emailPassword: '',
  emailFromName: 'AIπ',
  emailFromAddress: '',
  registerEmailVerification: false,
  barkEnabled: false,
  barkServerUrl: 'https://api.day.app',
  barkDeviceKey: '',
  barkTitlePrefix: 'AIπ',
  barkSound: '',
  barkNotifyGenerationFailure: true,
  barkNotifyTaskTimeout: true,
  barkNotifyProviderFailure: true,
}

export const SettingsPage = {
  props: { settings: Object },
  emits: ['refresh-settings'],
  setup(props, { emit }) {
    const form = reactive({ ...defaultSettings, ...(props.settings || {}) })
    const settingsVisible = ref(false)
    const groups = [
      { title: '站点与注册', fields: [
        { key: 'siteName', label: '站点名称' }, { key: 'logoText', label: 'Logo 文字' }, { key: 'creditName', label: '额度名称' },
        { key: 'registerMode', label: '注册模式', type: 'select', options: [{ label: '开放注册', value: 'open' }, { label: '关闭注册', value: 'closed' }] },
        { key: 'registerRewardCredits', label: '注册赠送额度', type: 'number' }, { key: 'registerEmailVerification', label: '注册邮箱验证', type: 'boolean' },
        { key: 'frontendUrl', label: '前台地址', type: 'url' }, { key: 'backendUrl', label: '后端地址', type: 'url' },
      ] },
      { title: '客服入口', fields: [
        { key: 'supportEnabled', label: '开启客服入口', type: 'boolean' }, { key: 'supportTitle', label: '客服标题' }, { key: 'supportDescription', label: '客服说明', type: 'textarea' },
        { key: 'supportWechat', label: '微信号' }, { key: 'supportQq', label: 'QQ号' }, { key: 'supportEmail', label: '客服邮箱' }, { key: 'supportUrl', label: '在线客服链接' }, { key: 'supportQrCodeUrl', label: '二维码图片地址' },
      ] },
      { title: '充值与运营', fields: [
        { key: 'rechargeEnabled', label: '开启充值', type: 'boolean' }, { key: 'rechargeRate', label: '充值比例', type: 'number' }, { key: 'rechargeMinAmount', label: '最低充值金额', type: 'number' }, { key: 'rechargePresets', label: '充值预设' },
        { key: 'checkinEnabled', label: '开启签到', type: 'boolean' }, { key: 'checkinRewards', label: '签到奖励池' }, { key: 'inviteEnabled', label: '开启邀请', type: 'boolean' }, { key: 'inviteRewardCredits', label: '邀请奖励额度', type: 'number' }, { key: 'taskTimeoutMinutes', label: '任务超时分钟', type: 'number' },
      ] },
      { title: '生成策略', fields: [
        { key: 'streamGenerationEnabled', label: '启用流式生图', type: 'boolean' },
      ] },
      { title: '提示词审核', fields: [
        { key: 'promptModerationEnabled', label: '开启提示词审核', type: 'boolean' },
        { key: 'promptModerationRejectMessage', label: '拦截提示文案' },
        { key: 'promptModerationAdultKeywords', label: '黄图关键词', type: 'textarea' },
        { key: 'promptModerationPoliticalKeywords', label: '涉政关键词', type: 'textarea' },
      ] },
      { title: '支付与邮件', fields: [
        { key: 'alipayAppId', label: '支付宝 App ID' }, { key: 'alipayGateway', label: '支付宝网关', type: 'url' }, { key: 'alipayPrivateKey', label: '应用私钥', type: 'textarea' }, { key: 'alipayPublicKey', label: '支付宝公钥', type: 'textarea' },
        { key: 'emailEnabled', label: '开启邮件', type: 'boolean' }, { key: 'emailHost', label: 'SMTP Host' }, { key: 'emailPort', label: 'SMTP Port', type: 'number' }, { key: 'emailSecure', label: 'SSL/TLS', type: 'boolean' }, { key: 'emailUser', label: '邮箱账号' }, { key: 'emailPassword', label: '邮箱密码', type: 'password' }, { key: 'emailFromName', label: '发件人名称' }, { key: 'emailFromAddress', label: '发件地址' },
      ] },
      { title: '通知告警', fields: [
        { key: 'barkEnabled', label: '开启 Bark 推送', type: 'boolean' },
        { key: 'barkNotifyGenerationFailure', label: '生图失败推送', type: 'boolean' },
        { key: 'barkNotifyTaskTimeout', label: '任务超时推送', type: 'boolean' },
        { key: 'barkNotifyProviderFailure', label: '接口异常推送', type: 'boolean' },
        { key: 'barkServerUrl', label: 'Bark Server', type: 'url' },
        { key: 'barkDeviceKey', label: 'Device Key' },
        { key: 'barkTitlePrefix', label: '标题前缀' },
        { key: 'barkSound', label: '提示音（可空）' },
      ] },
    ]
    const statusItems = computed(() => [
      ['当前站点', form.siteName || 'AIπ'],
      ['注册状态', form.registerMode === 'closed' ? '关闭注册' : '开放注册'],
      ['充值功能', form.rechargeEnabled ? '已开启' : '已关闭'],
      ['生图模式', form.streamGenerationEnabled ? '流式' : '普通'],
      ['Bark 推送', form.barkEnabled ? '已开启' : '已关闭'],
      ['任务超时', `${toNumber(form.taskTimeoutMinutes, 3)} 分钟`],
    ])
    watch(() => props.settings, (next) => Object.assign(form, defaultSettings, next || {}), { deep: true })

    function normalizeInput() {
      const input = { ...form }
      input.announcementEnabled = true
      ;['announcementEnabled', 'supportEnabled', 'rechargeEnabled', 'checkinEnabled', 'inviteEnabled', 'streamGenerationEnabled', 'promptModerationEnabled', 'emailEnabled', 'emailSecure', 'registerEmailVerification', 'barkEnabled', 'barkNotifyGenerationFailure', 'barkNotifyTaskTimeout', 'barkNotifyProviderFailure'].forEach((key) => { input[key] = input[key] === true || input[key] === 'true' })
      ;['rechargeRate', 'rechargeMinAmount', 'inviteRewardCredits', 'taskTimeoutMinutes', 'emailPort', 'registerRewardCredits'].forEach((key) => { input[key] = toNumber(input[key], defaultSettings[key]) })
      input.frontendUrl = input.frontendUrl || window.location.origin
      input.backendUrl = input.backendUrl || window.location.origin
      return input
    }

    async function submit() {
      try {
        await adminApi.updateSettings(normalizeInput())
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

    async function testBark() {
      try {
        await submit()
        await adminApi.sendTestBark()
        message.success('Bark 测试推送已发送')
      } catch (error) {
        message.error(error instanceof Error ? error.message : 'Bark 测试失败')
      }
    }

    return { form, groups, statusItems, settingsVisible, submit, testEmail, testBark }
  },
  template: `
    <div class="settings-page">
      <section class="page-panel">
        <div class="page-hero">
          <div><div class="page-kicker">System Settings</div><div class="page-title">系统设置</div><div class="page-desc">维护站点配置、充值运营、支付邮件和前台展示策略。</div></div>
          <div class="toolbar"><a-button @click="testEmail">发送测试邮件</a-button><a-button @click="testBark">测试 Bark</a-button><a-button type="primary" @click="settingsVisible = true">编辑设置</a-button></div>
        </div>
        <div class="summary-grid"><div v-for="[label, value] in statusItems" :key="label" class="summary-card"><span>{{ label }}</span><b style="font-size:18px">{{ value }}</b></div></div>
      </section>
      <section v-for="group in groups" :key="group.title" class="page-panel">
        <div class="page-hero"><div><div class="page-title" style="font-size:16px">{{ group.title }}</div></div></div>
        <div class="settings-read-grid">
          <div v-for="field in group.fields" :key="field.key" class="settings-read-item">
            <span>{{ field.label }}</span>
            <b v-if="field.type === 'boolean'">{{ form[field.key] ? '开启' : '关闭' }}</b>
            <b v-else>{{ form[field.key] || '-' }}</b>
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
          <div class="drawer-form-section-title">{{ group.title }}</div>
          <div class="form-grid drawer-form-grid">
            <label v-for="field in group.fields" :key="field.key" :class="{ full: field.type === 'textarea' }">
              <div class="muted" style="margin-bottom:6px">{{ field.label }}</div>
              <a-textarea v-if="field.type === 'textarea'" v-model:value="form[field.key]" :rows="4" />
              <a-select v-else-if="field.type === 'select'" v-model:value="form[field.key]" style="width:100%"><a-select-option v-for="option in field.options" :key="option.value" :value="option.value">{{ option.label }}</a-select-option></a-select>
              <a-switch v-else-if="field.type === 'boolean'" v-model:checked="form[field.key]" checked-children="开" un-checked-children="关" />
              <a-input v-else v-model:value="form[field.key]" :type="field.type || 'text'" />
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
