import { db, rootDb } from './db.js'
import { env } from './env.js'
import { repairLegacyUserIds } from './legacyUserIdRepair.js'

async function columnExists(tableName: string, columnName: string) {
  const [rows] = await db.query(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = :databaseName
       AND TABLE_NAME = :tableName
       AND COLUMN_NAME = :columnName
     LIMIT 1`,
    {
      databaseName: env.mysql.database,
      tableName,
      columnName,
    },
  )

  return Array.isArray(rows) && rows.length > 0
}

async function addColumnIfMissing(tableName: string, columnName: string, definition: string) {
  const exists = await columnExists(tableName, columnName)
  if (!exists) {
    await db.query(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`)
  }
}

async function dropColumnIfExists(tableName: string, columnName: string) {
  const exists = await columnExists(tableName, columnName)
  if (exists) {
    await db.query(`ALTER TABLE ${tableName} DROP COLUMN ${columnName}`)
  }
}

async function indexExists(tableName: string, indexName: string) {
  const [rows] = await db.query(
    `SELECT INDEX_NAME
     FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = :databaseName
       AND TABLE_NAME = :tableName
       AND INDEX_NAME = :indexName
     LIMIT 1`,
    {
      databaseName: env.mysql.database,
      tableName,
      indexName,
    },
  )

  return Array.isArray(rows) && rows.length > 0
}

async function dropIndexIfExists(tableName: string, indexName: string) {
  const exists = await indexExists(tableName, indexName)
  if (exists) {
    await db.query(`ALTER TABLE ${tableName} DROP INDEX ${indexName}`)
  }
}

async function addIndexIfMissing(tableName: string, indexName: string, definition: string) {
  const exists = await indexExists(tableName, indexName)
  if (!exists) {
    await db.query(`ALTER TABLE ${tableName} ADD ${definition}`)
  }
}

export async function initializeDatabase(options: { repairLegacyUserIds?: boolean } = {}) {
  await rootDb.query(
    `CREATE DATABASE IF NOT EXISTS \`${env.mysql.database}\`
     DEFAULT CHARACTER SET utf8mb4
     DEFAULT COLLATE utf8mb4_unicode_ci`,
  )

  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(36) PRIMARY KEY,
      email VARCHAR(120) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      credits DECIMAL(12,4) NOT NULL DEFAULT 0,
      role ENUM('admin', 'user') NOT NULL DEFAULT 'user',
      status ENUM('active', 'disabled') NOT NULL DEFAULT 'active',
      email_verified_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `)

  await db.query(`
    CREATE TABLE IF NOT EXISTS api_providers (
      id VARCHAR(36) PRIMARY KEY,
      name VARCHAR(80) NOT NULL,
      type ENUM('sub2api', 'custom') NOT NULL,
      capability ENUM('chat_image') NOT NULL DEFAULT 'chat_image',
      base_url VARCHAR(255) NOT NULL,
      api_key VARCHAR(255) NOT NULL,
      status ENUM('active', 'disabled') NOT NULL DEFAULT 'active',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `)

  await db.query(`
    CREATE TABLE IF NOT EXISTS ai_models (
      id VARCHAR(36) PRIMARY KEY,
      provider_id VARCHAR(36) NOT NULL,
      model_name VARCHAR(120) NOT NULL,
      display_name VARCHAR(120) NOT NULL,
      capability ENUM('chat_image') NOT NULL DEFAULT 'chat_image',
      cost_1k DECIMAL(10,4) NOT NULL DEFAULT 0,
      cost_2k DECIMAL(10,4) NOT NULL DEFAULT 0,
      cost_4k DECIMAL(10,4) NOT NULL DEFAULT 0,
      markup_percent DECIMAL(8,2) NOT NULL DEFAULT 0,
      price_1k DECIMAL(10,4) NOT NULL DEFAULT 0,
      price_2k DECIMAL(10,4) NOT NULL DEFAULT 0,
      price_4k DECIMAL(10,4) NOT NULL DEFAULT 0,
      append_size_to_prompt TINYINT(1) NOT NULL DEFAULT 0,
      status ENUM('active', 'disabled') NOT NULL DEFAULT 'active',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_ai_models_provider_model_capability (provider_id, model_name, capability),
      INDEX idx_ai_models_status_capability (status, capability)
    )
  `)

  await db.query(`
    CREATE TABLE IF NOT EXISTS generation_tasks (
      id VARCHAR(36) PRIMARY KEY,
      user_id VARCHAR(36) NOT NULL,
      model_id VARCHAR(36) NOT NULL,
      provider_id VARCHAR(36) NOT NULL,
      capability ENUM('chat_image') NOT NULL,
      prompt TEXT NOT NULL,
      reference_image_url LONGTEXT NULL,
      size_tier ENUM('1k', '2k', '4k') NOT NULL DEFAULT '1k',
      size VARCHAR(30) NULL,
      transparent_background TINYINT(1) NOT NULL DEFAULT 0,
      quantity INT NOT NULL DEFAULT 1,
      user_ip VARCHAR(64) NOT NULL,
      cost_credits DECIMAL(12,4) NOT NULL DEFAULT 0,
      remaining_credits DECIMAL(12,4) NOT NULL DEFAULT 0,
      duration_seconds DECIMAL(10,3) NOT NULL DEFAULT 0,
      status ENUM('queued', 'processing', 'pending', 'success', 'failed', 'canceled') NOT NULL DEFAULT 'queued',
      error_message TEXT NULL,
      result_json JSON NULL,
      display_enabled TINYINT(1) NOT NULL DEFAULT 0,
      display_note VARCHAR(500) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_generation_tasks_created_at (created_at),
      INDEX idx_generation_tasks_user_id (user_id),
      INDEX idx_generation_tasks_capability (capability)
    )
  `)

  await db.query(`
    CREATE TABLE IF NOT EXISTS system_settings (
      setting_key VARCHAR(80) PRIMARY KEY,
      setting_value TEXT NOT NULL,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `)

  await db.query(`
    CREATE TABLE IF NOT EXISTS email_tokens (
      id VARCHAR(36) PRIMARY KEY,
      email VARCHAR(120) NOT NULL,
      user_id VARCHAR(36) NULL,
      type ENUM('register_verify', 'password_reset') NOT NULL,
      token_hash VARCHAR(64) NOT NULL,
      expires_at DATETIME NOT NULL,
      used_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_email_tokens_email_type (email, type),
      INDEX idx_email_tokens_token_hash (token_hash),
      INDEX idx_email_tokens_user_id (user_id)
    )
  `)

  await db.query(`
    CREATE TABLE IF NOT EXISTS credit_logs (
      id VARCHAR(36) PRIMARY KEY,
      user_id VARCHAR(36) NOT NULL,
      type ENUM('recharge', 'deduct') NOT NULL,
      amount DECIMAL(12,4) NOT NULL,
      balance_after DECIMAL(12,4) NOT NULL,
      remark VARCHAR(200) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_credit_logs_user_id (user_id),
      INDEX idx_credit_logs_created_at (created_at)
    )
  `)

  await db.query(`
    CREATE TABLE IF NOT EXISTS redeem_codes (
      id VARCHAR(36) PRIMARY KEY,
      code VARCHAR(80) NOT NULL UNIQUE,
      credits DECIMAL(12,4) NOT NULL,
      status ENUM('active', 'used', 'disabled') NOT NULL DEFAULT 'active',
      remark VARCHAR(200) NULL,
      user_id VARCHAR(36) NULL,
      used_at DATETIME NULL,
      expires_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_redeem_codes_status (status),
      INDEX idx_redeem_codes_user_id (user_id)
    )
  `)

  await db.query(`
    CREATE TABLE IF NOT EXISTS user_checkins (
      id VARCHAR(36) PRIMARY KEY,
      user_id VARCHAR(36) NOT NULL,
      reward_credits DECIMAL(12,4) NOT NULL,
      checkin_date DATE NOT NULL,
      user_ip VARCHAR(64) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_user_checkins_user_date (user_id, checkin_date),
      INDEX idx_user_checkins_date (checkin_date)
    )
  `)

  await db.query(`
    CREATE TABLE IF NOT EXISTS user_invites (
      id VARCHAR(36) PRIMARY KEY,
      inviter_id VARCHAR(36) NOT NULL,
      invitee_id VARCHAR(36) NOT NULL UNIQUE,
      reward_credits DECIMAL(12,4) NOT NULL,
      invitee_ip VARCHAR(64) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_user_invites_inviter_id (inviter_id)
    )
  `)

  await db.query(`
    CREATE TABLE IF NOT EXISTS recharge_orders (
      id VARCHAR(36) PRIMARY KEY,
      user_id VARCHAR(36) NOT NULL,
      out_trade_no VARCHAR(64) NOT NULL UNIQUE,
      trade_no VARCHAR(80) NULL,
      order_type ENUM('recharge', 'subscription') NOT NULL DEFAULT 'recharge',
      subscription_plan_id VARCHAR(36) NULL,
      amount DECIMAL(12,2) NOT NULL,
      credits DECIMAL(12,4) NOT NULL,
      status ENUM('pending', 'paid', 'closed', 'failed') NOT NULL DEFAULT 'pending',
      pay_url TEXT NULL,
      qr_code TEXT NULL,
      paid_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_recharge_orders_user_id (user_id),
      INDEX idx_recharge_orders_out_trade_no (out_trade_no),
      INDEX idx_recharge_orders_status (status)
    )
  `)

  await db.query(`
    CREATE TABLE IF NOT EXISTS recharge_products (
      id VARCHAR(36) PRIMARY KEY,
      name VARCHAR(80) NOT NULL,
      amount DECIMAL(12,2) NOT NULL,
      credits DECIMAL(12,4) NOT NULL,
      badge VARCHAR(40) NULL,
      sort_order INT NOT NULL DEFAULT 0,
      status ENUM('active', 'disabled') NOT NULL DEFAULT 'active',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_recharge_products_status_sort (status, sort_order)
    )
  `)

  await db.query(`
    CREATE TABLE IF NOT EXISTS subscription_plans (
      id VARCHAR(36) PRIMARY KEY,
      name VARCHAR(80) NOT NULL,
      description VARCHAR(300) NULL,
      amount DECIMAL(12,2) NOT NULL,
      duration_days INT NOT NULL,
      bonus_credits DECIMAL(12,4) NOT NULL DEFAULT 0,
      discount_percent DECIMAL(5,2) NOT NULL DEFAULT 0,
      allowed_provider_ids JSON NULL,
      allowed_model_ids JSON NULL,
      badge VARCHAR(40) NULL,
      sort_order INT NOT NULL DEFAULT 0,
      status ENUM('active', 'disabled') NOT NULL DEFAULT 'active',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_subscription_plans_status_sort (status, sort_order)
    )
  `)

  await db.query(`
    CREATE TABLE IF NOT EXISTS user_subscriptions (
      id VARCHAR(36) PRIMARY KEY,
      user_id VARCHAR(36) NOT NULL UNIQUE,
      plan_id VARCHAR(36) NOT NULL,
      status ENUM('active', 'expired', 'canceled') NOT NULL DEFAULT 'active',
      started_at DATETIME NOT NULL,
      expires_at DATETIME NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_user_subscriptions_user_status (user_id, status, expires_at),
      INDEX idx_user_subscriptions_plan_id (plan_id)
    )
  `)

  await db.query(`
    CREATE TABLE IF NOT EXISTS announcements (
      id VARCHAR(36) PRIMARY KEY,
      title VARCHAR(120) NOT NULL,
      content TEXT NOT NULL,
      display_mode ENUM('popup', 'home', 'topbar') NOT NULL DEFAULT 'popup',
      target_type ENUM('all', 'specific') NOT NULL DEFAULT 'all',
      status ENUM('active', 'disabled') NOT NULL DEFAULT 'active',
      sort_order INT NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_announcements_status_sort (status, sort_order, created_at)
    )
  `)

  await db.query(`
    CREATE TABLE IF NOT EXISTS announcement_users (
      announcement_id VARCHAR(36) NOT NULL,
      user_id VARCHAR(36) NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (announcement_id, user_id),
      INDEX idx_announcement_users_user_id (user_id)
    )
  `)

  await db.query(`
    CREATE TABLE IF NOT EXISTS announcement_receipts (
      announcement_id VARCHAR(36) NOT NULL,
      user_id VARCHAR(36) NOT NULL,
      signed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (announcement_id, user_id),
      INDEX idx_announcement_receipts_user_id (user_id)
    )
  `)

  await db.query(`
    CREATE TABLE IF NOT EXISTS promotions (
      id VARCHAR(36) PRIMARY KEY,
      title VARCHAR(120) NOT NULL,
      content TEXT NOT NULL,
      badge VARCHAR(40) NULL,
      action_text VARCHAR(40) NULL,
      action_url VARCHAR(255) NULL,
      status ENUM('active', 'disabled') NOT NULL DEFAULT 'active',
      sort_order INT NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_promotions_status_sort (status, sort_order, created_at)
    )
  `)

  await addColumnIfMissing('users', 'role', "ENUM('admin', 'user') NOT NULL DEFAULT 'user'")
  await addColumnIfMissing('users', 'status', "ENUM('active', 'disabled') NOT NULL DEFAULT 'active'")
  await addColumnIfMissing('users', 'credits', 'DECIMAL(12,4) NOT NULL DEFAULT 0')
  await addColumnIfMissing('users', 'email_verified_at', 'DATETIME NULL AFTER status')
  await dropColumnIfExists('users', 'username')
  await addColumnIfMissing(
    'api_providers',
    'status',
    "ENUM('active', 'disabled') NOT NULL DEFAULT 'active'",
  )
  await addColumnIfMissing(
    'api_providers',
    'capability',
    "ENUM('chat_image') NOT NULL DEFAULT 'chat_image' AFTER type",
  )
  await addColumnIfMissing(
    'ai_models',
    'display_name',
    'VARCHAR(120) NOT NULL DEFAULT ""',
  )
  await addColumnIfMissing(
    'ai_models',
    'capability',
    "ENUM('chat_image') NOT NULL DEFAULT 'chat_image'",
  )
  await addColumnIfMissing('ai_models', 'cost_1k', 'DECIMAL(10,4) NOT NULL DEFAULT 0')
  await addColumnIfMissing('ai_models', 'cost_2k', 'DECIMAL(10,4) NOT NULL DEFAULT 0')
  await addColumnIfMissing('ai_models', 'cost_4k', 'DECIMAL(10,4) NOT NULL DEFAULT 0')
  await addColumnIfMissing('ai_models', 'markup_percent', 'DECIMAL(8,2) NOT NULL DEFAULT 0')
  await addColumnIfMissing('ai_models', 'price_1k', 'DECIMAL(10,4) NOT NULL DEFAULT 0')
  await addColumnIfMissing('ai_models', 'price_2k', 'DECIMAL(10,4) NOT NULL DEFAULT 0')
  await addColumnIfMissing('ai_models', 'price_4k', 'DECIMAL(10,4) NOT NULL DEFAULT 0')
  await addColumnIfMissing('ai_models', 'append_size_to_prompt', 'TINYINT(1) NOT NULL DEFAULT 0 AFTER price_4k')
  await db.query(`
    UPDATE ai_models
    SET
      cost_1k = CASE WHEN cost_1k = 0 AND price_1k > 0 THEN price_1k ELSE cost_1k END,
      cost_2k = CASE WHEN cost_2k = 0 AND price_2k > 0 THEN price_2k ELSE cost_2k END,
      cost_4k = CASE WHEN cost_4k = 0 AND price_4k > 0 THEN price_4k ELSE cost_4k END
  `)
  await db.query(`
    UPDATE api_providers
    SET capability = 'chat_image'
    WHERE capability <> 'chat_image'
  `)
  await db.query(`
    UPDATE ai_models
    SET capability = 'chat_image'
    WHERE capability <> 'chat_image'
  `)
  await db.query(`
    UPDATE generation_tasks
    SET capability = 'chat_image'
    WHERE capability <> 'chat_image'
  `)
  await addColumnIfMissing('generation_tasks', 'quantity', 'INT NOT NULL DEFAULT 1 AFTER size_tier')
  await addColumnIfMissing('generation_tasks', 'size', 'VARCHAR(30) NULL AFTER size_tier')
  await addColumnIfMissing(
    'generation_tasks',
    'transparent_background',
    'TINYINT(1) NOT NULL DEFAULT 0 AFTER size',
  )
  await addColumnIfMissing('generation_tasks', 'reference_image_url', 'LONGTEXT NULL AFTER prompt')
  await addColumnIfMissing(
    'generation_tasks',
    'display_enabled',
    'TINYINT(1) NOT NULL DEFAULT 0 AFTER result_json',
  )
  await addColumnIfMissing('generation_tasks', 'display_note', 'VARCHAR(500) NULL AFTER display_enabled')
  await addColumnIfMissing(
    'recharge_orders',
    'order_type',
    "ENUM('recharge', 'subscription') NOT NULL DEFAULT 'recharge' AFTER trade_no",
  )
  await addColumnIfMissing('recharge_orders', 'subscription_plan_id', 'VARCHAR(36) NULL AFTER order_type')
  await addColumnIfMissing('subscription_plans', 'allowed_provider_ids', 'JSON NULL AFTER discount_percent')
  await addColumnIfMissing('subscription_plans', 'allowed_model_ids', 'JSON NULL AFTER allowed_provider_ids')
  await addColumnIfMissing(
    'announcements',
    'display_mode',
    "ENUM('popup', 'home', 'topbar') NOT NULL DEFAULT 'popup' AFTER content",
  )
  await addIndexIfMissing(
    'generation_tasks',
    'idx_generation_tasks_user_created_id',
    'INDEX idx_generation_tasks_user_created_id (user_id, created_at, id)',
  )
  await addIndexIfMissing(
    'credit_logs',
    'idx_credit_logs_user_created_id',
    'INDEX idx_credit_logs_user_created_id (user_id, created_at, id)',
  )
  await addIndexIfMissing(
    'user_invites',
    'idx_user_invites_ip_created',
    'INDEX idx_user_invites_ip_created (invitee_ip, created_at)',
  )
  await db.query(`
    ALTER TABLE generation_tasks
    MODIFY status ENUM('queued', 'processing', 'pending', 'success', 'failed', 'canceled') NOT NULL DEFAULT 'queued'
  `)
  await dropColumnIfExists('api_providers', 'model')
  await dropColumnIfExists('api_providers', 'priority')
  await dropColumnIfExists('ai_models', 'priority')
  await dropIndexIfExists('ai_models', 'uq_ai_models_provider_model')
  await addIndexIfMissing(
    'ai_models',
    'uq_ai_models_provider_model_capability',
    'UNIQUE KEY uq_ai_models_provider_model_capability (provider_id, model_name, capability)',
  )

  const [productRows] = await db.query('SELECT id FROM recharge_products LIMIT 1')
  if (Array.isArray(productRows) && productRows.length === 0) {
    await db.query(`
      INSERT INTO recharge_products (id, name, amount, credits, badge, sort_order, status)
      VALUES
        (UUID(), '体验包', 10.00, 10.0000, '入门', 10, 'active'),
        (UUID(), '常用包', 30.00, 30.0000, '推荐', 20, 'active'),
        (UUID(), '创作包', 50.00, 50.0000, '热门', 30, 'active'),
        (UUID(), '专业包', 100.00, 100.0000, '高频', 40, 'active')
    `)
  }

  const [subscriptionPlanRows] = await db.query('SELECT id FROM subscription_plans LIMIT 1')
  if (Array.isArray(subscriptionPlanRows) && subscriptionPlanRows.length === 0) {
    await db.query(`
      INSERT INTO subscription_plans
        (id, name, description, amount, duration_days, bonus_credits, discount_percent, badge, sort_order, status)
      VALUES
        (UUID(), '月度会员', '适合稳定创作用户，开通后享受模型折扣。', 29.00, 30, 10.0000, 10.00, '推荐', 10, 'active'),
        (UUID(), '季度会员', '更长周期更划算，适合高频创作者。', 79.00, 90, 35.0000, 15.00, '热门', 20, 'active')
    `)
  }

  await db.query(
    `INSERT IGNORE INTO system_settings (setting_key, setting_value)
     VALUES
      ('siteName', 'AIπ'),
      ('logoText', 'AIπ'),
      ('creditName', '积分'),
      ('frontendUrl', 'http://localhost:5173'),
      ('backendUrl', 'http://localhost:3001'),
      ('announcementEnabled', 'true'),
      ('announcementTitle', '系统公告'),
      ('announcementContent', '欢迎使用 AIπ 生图工作台，充值后即可开始创作。'),
      ('supportEnabled', 'true'),
      ('supportTitle', '联系客服'),
      ('supportDescription', '遇到充值、生成或账号问题，可以通过下面方式联系管理员。'),
      ('supportWechat', ''),
      ('supportQq', ''),
      ('supportEmail', ''),
      ('supportUrl', ''),
      ('supportQrCodeUrl', ''),
      ('rechargeEnabled', 'true'),
      ('rechargeRate', '1'),
      ('rechargeMinAmount', '1'),
      ('rechargePresets', '10,30,50,100'),
      ('checkinEnabled', 'true'),
      ('checkinRewards', '0.1,0.2,0.3,0.5,0.8,1'),
      ('inviteEnabled', 'true'),
      ('inviteRewardCredits', '1'),
      ('taskTimeoutMinutes', '3'),
      ('alipayAppId', ''),
      ('alipayPrivateKey', ''),
      ('alipayPublicKey', ''),
      ('alipayGateway', 'https://openapi.alipay.com/gateway.do'),
      ('registerMode', 'open'),
      ('registerRewardCredits', '0'),
      ('emailEnabled', 'false'),
      ('emailHost', ''),
      ('emailPort', '465'),
      ('emailSecure', 'true'),
      ('emailUser', ''),
      ('emailPassword', ''),
      ('emailFromName', 'AIπ'),
      ('emailFromAddress', ''),
      ('registerEmailVerification', 'false'),
      ('accountPoolEndpoint', 'https://free-api.yccc.me/api/accounts'),
      ('accountPoolApiKey', ''),
      ('accountPoolAuthHeader', 'Authorization')`,
  )

  const [announcementRows] = await db.query('SELECT id FROM announcements LIMIT 1')
  if (Array.isArray(announcementRows) && announcementRows.length === 0) {
    const [settingRows] = await db.query(
      `SELECT setting_key, setting_value
       FROM system_settings
       WHERE setting_key IN ('announcementEnabled', 'announcementTitle', 'announcementContent')`,
    )
    const settingMap = new Map(
      Array.isArray(settingRows)
        ? settingRows.map((row) => [
            String((row as { setting_key: unknown }).setting_key),
            String((row as { setting_value: unknown }).setting_value),
          ])
        : [],
    )
    const enabled = settingMap.get('announcementEnabled') !== 'false'
    const content = settingMap.get('announcementContent')?.trim() ?? ''
    if (enabled && content) {
      await db.query(
        `INSERT INTO announcements (id, title, content, target_type, status, sort_order)
         VALUES (UUID(), :title, :content, 'all', 'active', 10)`,
        {
          title: settingMap.get('announcementTitle')?.trim() || '系统公告',
          content,
        },
      )
    }
  }

  if (options.repairLegacyUserIds !== false) {
    const legacyRepair = await repairLegacyUserIds()
    if (legacyRepair.found > 0) {
      console.log(
        `旧用户ID修复完成：发现 ${legacyRepair.found} 个，用户 ${legacyRepair.repairedUsers} 个，关联 ${legacyRepair.repairedReferences} 条。`,
      )
    }
  }
}
