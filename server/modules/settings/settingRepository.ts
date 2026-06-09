import type { RowDataPacket } from 'mysql2'
import { db } from '../../config/db.js'
import type { SystemSettings } from './settingTypes.js'

type SettingRow = RowDataPacket & {
  setting_key: keyof SystemSettings
  setting_value: string
}

const defaultSettings: SystemSettings = {
  siteName: 'AIπ',
  logoText: 'AIπ',
  creditName: '积分',
  frontendUrl: 'http://localhost:5173',
  backendUrl: 'http://localhost:3001',
  announcementEnabled: true,
  announcementTitle: '系统公告',
  announcementContent: '欢迎使用 AIπ 生图工作台，充值后即可开始创作。',
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
  promptModerationAdultKeywords: [
    '裸体',
    '裸露',
    '色情',
    '黄图',
    '成人',
    '性爱',
    '性交',
    '做爱',
    '露点',
    '私处',
    '乳头',
    '生殖器',
    '强奸',
    '未成年色情',
  ].join('\n'),
  promptModerationPoliticalKeywords: [
    '习近平',
    '毛泽东',
    '共产党',
    '中共',
    '台湾独立',
    '台独',
    '港独',
    '藏独',
    '疆独',
    '六四',
    '法轮功',
    '政治宣传',
    '推翻政府',
  ].join('\n'),
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
  accountPoolEndpoint: 'https://free-api.yccc.me/api/accounts',
  accountPoolApiKey: '',
  accountPoolAuthHeader: 'Authorization',
  barkEnabled: false,
  barkServerUrl: 'https://api.day.app',
  barkDeviceKey: '',
  barkTitlePrefix: 'AIπ',
  barkSound: '',
  barkNotifyGenerationFailure: true,
  barkNotifyTaskTimeout: true,
  barkNotifyProviderFailure: true,
}

function parseSettingValue<Key extends keyof SystemSettings>(
  key: Key,
  value: string,
): SystemSettings[Key] {
  if (
    key === 'emailEnabled' ||
    key === 'emailSecure' ||
    key === 'registerEmailVerification' ||
    key === 'announcementEnabled' ||
    key === 'supportEnabled' ||
    key === 'rechargeEnabled' ||
    key === 'checkinEnabled' ||
    key === 'inviteEnabled' ||
    key === 'streamGenerationEnabled' ||
    key === 'promptModerationEnabled' ||
    key === 'barkEnabled' ||
    key === 'barkNotifyGenerationFailure' ||
    key === 'barkNotifyTaskTimeout' ||
    key === 'barkNotifyProviderFailure'
  ) {
    return (value === 'true' || value === '1') as SystemSettings[Key]
  }

  if (key === 'registerRewardCredits') {
    const numberValue = Number(value)
    return (
      Number.isFinite(numberValue) && numberValue >= 0 ? numberValue : defaultSettings[key]
    ) as SystemSettings[Key]
  }

  if (
    key === 'rechargeRate' ||
    key === 'rechargeMinAmount' ||
    key === 'inviteRewardCredits' ||
    key === 'taskTimeoutMinutes'
  ) {
    const numberValue = Number(value)
    return (
      Number.isFinite(numberValue) && numberValue > 0 ? numberValue : defaultSettings[key]
    ) as SystemSettings[Key]
  }

  if (key === 'emailPort') {
    const port = Number(value)
    return (Number.isFinite(port) && port > 0 ? port : defaultSettings.emailPort) as SystemSettings[Key]
  }

  return value as SystemSettings[Key]
}

function serializeSettingValue(value: SystemSettings[keyof SystemSettings]) {
  return String(value)
}

export class SettingRepository {
  async getSettings(): Promise<SystemSettings> {
    const [rows] = await db.query<SettingRow[]>('SELECT setting_key, setting_value FROM system_settings')
    return rows.reduce<SystemSettings>(
      (settings, row) => ({
        ...settings,
        [row.setting_key]: parseSettingValue(row.setting_key, row.setting_value),
      }),
      defaultSettings,
    )
  }

  async updateSettings(settings: SystemSettings) {
    await Promise.all(
      Object.entries(settings).map(([key, value]) =>
        db.query(
          `INSERT INTO system_settings (setting_key, setting_value)
           VALUES (:key, :value)
           ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
          { key, value: serializeSettingValue(value) },
        ),
      ),
    )
    return this.getSettings()
  }
}
