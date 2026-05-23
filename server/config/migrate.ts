import { db, rootDb } from './db.js'
import { env } from './env.js'

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

export async function initializeDatabase() {
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
      capability ENUM('image', 'video', 'chat_image', 'workflow') NOT NULL DEFAULT 'image',
      price_1k DECIMAL(10,4) NOT NULL DEFAULT 0,
      price_2k DECIMAL(10,4) NOT NULL DEFAULT 0,
      price_4k DECIMAL(10,4) NOT NULL DEFAULT 0,
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
      capability ENUM('image', 'video', 'chat_image', 'workflow') NOT NULL,
      prompt TEXT NOT NULL,
      reference_image_url LONGTEXT NULL,
      size_tier ENUM('1k', '2k', '4k') NOT NULL DEFAULT '1k',
      size VARCHAR(30) NULL,
      quantity INT NOT NULL DEFAULT 1,
      user_ip VARCHAR(64) NOT NULL,
      cost_credits DECIMAL(12,4) NOT NULL DEFAULT 0,
      remaining_credits DECIMAL(12,4) NOT NULL DEFAULT 0,
      duration_seconds DECIMAL(10,3) NOT NULL DEFAULT 0,
      status ENUM('queued', 'processing', 'pending', 'success', 'failed', 'canceled') NOT NULL DEFAULT 'queued',
      error_message TEXT NULL,
      result_json JSON NULL,
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
    'ai_models',
    'display_name',
    'VARCHAR(120) NOT NULL DEFAULT ""',
  )
  await addColumnIfMissing(
    'ai_models',
    'capability',
    "ENUM('image', 'video', 'chat_image', 'workflow') NOT NULL DEFAULT 'image'",
  )
  await addColumnIfMissing('ai_models', 'price_1k', 'DECIMAL(10,4) NOT NULL DEFAULT 0')
  await addColumnIfMissing('ai_models', 'price_2k', 'DECIMAL(10,4) NOT NULL DEFAULT 0')
  await addColumnIfMissing('ai_models', 'price_4k', 'DECIMAL(10,4) NOT NULL DEFAULT 0')
  await addColumnIfMissing('generation_tasks', 'quantity', 'INT NOT NULL DEFAULT 1 AFTER size_tier')
  await addColumnIfMissing('generation_tasks', 'size', 'VARCHAR(30) NULL AFTER size_tier')
  await addColumnIfMissing('generation_tasks', 'reference_image_url', 'LONGTEXT NULL AFTER prompt')
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

  await db.query(
    `INSERT IGNORE INTO system_settings (setting_key, setting_value)
     VALUES
      ('siteName', 'AIπ'),
      ('creditName', '积分'),
      ('frontendUrl', 'http://localhost:5173'),
      ('backendUrl', 'http://localhost:3001'),
      ('registerMode', 'open'),
      ('emailEnabled', 'false'),
      ('emailHost', ''),
      ('emailPort', '465'),
      ('emailSecure', 'true'),
      ('emailUser', ''),
      ('emailPassword', ''),
      ('emailFromName', 'AIπ'),
      ('emailFromAddress', ''),
      ('registerEmailVerification', 'false')`,
  )
}
