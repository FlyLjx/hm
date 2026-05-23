import type { RowDataPacket } from 'mysql2'
import { db } from '../../config/db.js'
import type { SystemSettings } from './settingTypes.js'

type SettingRow = RowDataPacket & {
  setting_key: keyof SystemSettings
  setting_value: string
}

const defaultSettings: SystemSettings = {
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
}

function parseSettingValue<Key extends keyof SystemSettings>(
  key: Key,
  value: string,
): SystemSettings[Key] {
  if (key === 'emailEnabled' || key === 'emailSecure' || key === 'registerEmailVerification') {
    return (value === 'true' || value === '1') as SystemSettings[Key]
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
