CREATE DATABASE IF NOT EXISTS aipi
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE aipi;

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
);

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
);

CREATE TABLE IF NOT EXISTS user_checkins (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  reward_credits DECIMAL(12,4) NOT NULL,
  checkin_date DATE NOT NULL,
  user_ip VARCHAR(64) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_checkins_user_date (user_id, checkin_date),
  INDEX idx_user_checkins_date (checkin_date)
);

CREATE TABLE IF NOT EXISTS user_invites (
  id VARCHAR(36) PRIMARY KEY,
  inviter_id VARCHAR(36) NOT NULL,
  invitee_id VARCHAR(36) NOT NULL UNIQUE,
  reward_credits DECIMAL(12,4) NOT NULL,
  invitee_ip VARCHAR(64) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_invites_inviter_id (inviter_id),
  INDEX idx_user_invites_ip_created (invitee_ip, created_at)
);

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
  model_cost_credits DECIMAL(12,4) NOT NULL DEFAULT 0,
  remaining_credits DECIMAL(12,4) NOT NULL DEFAULT 0,
  duration_seconds DECIMAL(10,3) NOT NULL DEFAULT 0,
  status ENUM('queued', 'processing', 'pending', 'success', 'failed', 'canceled') NOT NULL DEFAULT 'queued',
  error_message TEXT NULL,
  result_json JSON NULL,
  favorite_enabled TINYINT(1) NOT NULL DEFAULT 0,
  public_status ENUM('private', 'pending', 'approved', 'rejected') NOT NULL DEFAULT 'private',
  public_requested_at DATETIME NULL,
  public_reviewed_at DATETIME NULL,
  display_enabled TINYINT(1) NOT NULL DEFAULT 0,
  display_note VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_generation_tasks_created_at (created_at),
  INDEX idx_generation_tasks_user_id (user_id),
  INDEX idx_generation_tasks_user_created_id (user_id, created_at, id),
  INDEX idx_generation_tasks_user_favorite (user_id, favorite_enabled, updated_at),
  INDEX idx_generation_tasks_public_status (public_status, updated_at),
  INDEX idx_generation_tasks_capability (capability)
);

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
);

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
  price_change_percent DECIMAL(8,2) NOT NULL DEFAULT 0,
  price_1k DECIMAL(10,4) NOT NULL DEFAULT 0,
  price_2k DECIMAL(10,4) NOT NULL DEFAULT 0,
  price_4k DECIMAL(10,4) NOT NULL DEFAULT 0,
  append_size_to_prompt TINYINT(1) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 100,
  status ENUM('active', 'disabled') NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_ai_models_provider_model_capability (provider_id, model_name, capability),
  INDEX idx_ai_models_status_capability (status, capability)
);

CREATE TABLE IF NOT EXISTS user_api_keys (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  name VARCHAR(120) NOT NULL,
  key_prefix VARCHAR(32) NOT NULL,
  key_hash CHAR(64) NOT NULL UNIQUE,
  key_plain VARCHAR(255) NULL,
  status ENUM('active', 'disabled') NOT NULL DEFAULT 'active',
  last_used_at DATETIME NULL,
  deleted_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_user_api_keys_user_id (user_id),
  INDEX idx_user_api_keys_prefix_status (key_prefix, status)
);

CREATE TABLE IF NOT EXISTS system_settings (
  setting_key VARCHAR(80) PRIMARY KEY,
  setting_value TEXT NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

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
);

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
);

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
);

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
);

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
);

CREATE TABLE IF NOT EXISTS announcement_users (
  announcement_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (announcement_id, user_id),
  INDEX idx_announcement_users_user_id (user_id)
);

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
);

CREATE TABLE IF NOT EXISTS credit_logs (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  type ENUM('recharge', 'deduct') NOT NULL,
  amount DECIMAL(12,4) NOT NULL,
  balance_after DECIMAL(12,4) NOT NULL,
  remark VARCHAR(200) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_credit_logs_user_id (user_id),
  INDEX idx_credit_logs_user_created_id (user_id, created_at, id),
  INDEX idx_credit_logs_created_at (created_at)
);

CREATE TABLE IF NOT EXISTS api_call_logs (
  id VARCHAR(36) PRIMARY KEY,
  direction ENUM('upstream', 'downstream') NOT NULL DEFAULT 'upstream',
  task_id VARCHAR(36) NULL,
  user_id VARCHAR(36) NULL,
  api_key_id VARCHAR(36) NULL,
  api_key_name VARCHAR(120) NULL,
  provider_id VARCHAR(36) NULL,
  provider_type VARCHAR(40) NULL,
  endpoint VARCHAR(500) NOT NULL,
  phase VARCHAR(80) NOT NULL,
  method VARCHAR(12) NOT NULL DEFAULT 'POST',
  status ENUM('success', 'failed') NOT NULL,
  status_code INT NULL,
  duration_ms INT NOT NULL DEFAULT 0,
  request_summary JSON NULL,
  response_summary JSON NULL,
  error_message TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_api_call_logs_created_at (created_at),
  INDEX idx_api_call_logs_direction_created (direction, created_at),
  INDEX idx_api_call_logs_user_created (user_id, created_at),
  INDEX idx_api_call_logs_api_key_created (api_key_id, created_at),
  INDEX idx_api_call_logs_provider_created (provider_id, created_at),
  INDEX idx_api_call_logs_monitor_created (direction, phase, created_at),
  INDEX idx_api_call_logs_monitor_provider_created (direction, phase, provider_id, created_at, id),
  INDEX idx_api_call_logs_status_created (status, created_at),
  INDEX idx_api_call_logs_task_id (task_id)
);

INSERT IGNORE INTO system_settings (setting_key, setting_value)
VALUES
  ('supportEnabled', 'true'),
  ('supportTitle', '联系客服'),
  ('supportDescription', '遇到充值、生成或账号问题，可以通过下面方式联系管理员。'),
  ('supportWechat', ''),
  ('supportQq', ''),
  ('supportEmail', ''),
  ('supportUrl', ''),
  ('supportQrCodeUrl', ''),
  ('streamGenerationEnabled', 'false'),
  ('promptModerationEnabled', 'true'),
  ('promptModerationAdultKeywords', '裸体
裸露
色情
黄图
成人
性爱
性交
做爱
露点
私处
乳头
生殖器
强奸
未成年色情'),
  ('promptModerationPoliticalKeywords', '习近平
毛泽东
共产党
中共
台湾独立
台独
港独
藏独
疆独
六四
法轮功
政治宣传
推翻政府'),
  ('promptModerationRejectMessage', '提示词包含不支持生成的敏感内容，请修改后再试。'),
  ('barkEnabled', 'false'),
  ('barkServerUrl', 'https://api.day.app'),
  ('barkDeviceKey', ''),
  ('barkTitlePrefix', 'AIπ'),
  ('barkSound', ''),
  ('barkNotifyGenerationFailure', 'true'),
  ('barkNotifyTaskTimeout', 'true'),
  ('barkNotifyProviderFailure', 'true');
