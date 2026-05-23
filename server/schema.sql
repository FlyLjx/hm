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
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS generation_tasks (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  model_id VARCHAR(36) NOT NULL,
  provider_id VARCHAR(36) NOT NULL,
  capability ENUM('image', 'video', 'chat_image', 'workflow') NOT NULL,
  prompt TEXT NOT NULL,
  size_tier ENUM('1k', '2k', '4k') NOT NULL DEFAULT '1k',
  quantity INT NOT NULL DEFAULT 1,
  user_ip VARCHAR(64) NOT NULL,
  cost_credits DECIMAL(12,4) NOT NULL DEFAULT 0,
  remaining_credits DECIMAL(12,4) NOT NULL DEFAULT 0,
  duration_seconds DECIMAL(10,3) NOT NULL DEFAULT 0,
  status ENUM('pending', 'success', 'failed') NOT NULL DEFAULT 'pending',
  error_message TEXT NULL,
  result_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_generation_tasks_created_at (created_at),
  INDEX idx_generation_tasks_user_id (user_id),
  INDEX idx_generation_tasks_capability (capability)
);

CREATE TABLE IF NOT EXISTS api_providers (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  type ENUM('sub2api', 'custom') NOT NULL,
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
  capability ENUM('image', 'video', 'chat_image', 'workflow') NOT NULL DEFAULT 'image',
  price_1k DECIMAL(10,4) NOT NULL DEFAULT 0,
  price_2k DECIMAL(10,4) NOT NULL DEFAULT 0,
  price_4k DECIMAL(10,4) NOT NULL DEFAULT 0,
  status ENUM('active', 'disabled') NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_ai_models_provider_model_capability (provider_id, model_name, capability),
  INDEX idx_ai_models_status_capability (status, capability)
);

CREATE TABLE IF NOT EXISTS system_settings (
  setting_key VARCHAR(80) PRIMARY KEY,
  setting_value TEXT NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
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
  INDEX idx_credit_logs_created_at (created_at)
);
