package database

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"
)

func EnsureSchema(db *sql.DB) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()
	statements := schemaBootstrapStatements()
	for _, statement := range statements {
		if _, err := db.ExecContext(ctx, Rebind(statement)); err != nil {
			return err
		}
	}
	if err := addColumnIfMissing(ctx, db, "generation_tasks", "output_format", "VARCHAR(20) NULL", "size"); err != nil {
		return err
	}
	if err := addColumnIfMissing(ctx, db, "announcements", "display_mode", "VARCHAR(20) NOT NULL DEFAULT 'popup'", "content"); err != nil {
		return err
	}
	indexes := []struct {
		name      string
		statement string
	}{
		{"idx_generation_tasks_status_created_at", `CREATE INDEX idx_generation_tasks_status_created_at ON generation_tasks (status, created_at)`},
		{"idx_generation_tasks_user_id_created_at", `CREATE INDEX idx_generation_tasks_user_id_created_at ON generation_tasks (user_id, created_at)`},
		{"idx_generation_tasks_created_at_user_id", `CREATE INDEX idx_generation_tasks_created_at_user_id ON generation_tasks (created_at, user_id)`},
		{"idx_generation_tasks_public_status_display_enabled_created_at", `CREATE INDEX idx_generation_tasks_public_status_display_enabled_created_at ON generation_tasks (public_status, display_enabled, created_at)`},
		{"idx_recharge_orders_status_created_at", `CREATE INDEX idx_recharge_orders_status_created_at ON recharge_orders (status, created_at)`},
		{"idx_recharge_orders_user_id_created_at", `CREATE INDEX idx_recharge_orders_user_id_created_at ON recharge_orders (user_id, created_at)`},
		{"idx_credit_logs_user_id_created_at", `CREATE INDEX idx_credit_logs_user_id_created_at ON credit_logs (user_id, created_at)`},
		{"idx_credit_logs_type_created_at", `CREATE INDEX idx_credit_logs_type_created_at ON credit_logs (type, created_at)`},
		{"idx_user_checkins_user_id_checkin_date", `CREATE INDEX idx_user_checkins_user_id_checkin_date ON user_checkins (user_id, checkin_date)`},
		{"idx_user_invites_invitee_id", `CREATE INDEX idx_user_invites_invitee_id ON user_invites (invitee_id)`},
		{"idx_user_invites_inviter_id", `CREATE INDEX idx_user_invites_inviter_id ON user_invites (inviter_id)`},
	}
	for _, index := range indexes {
		if err := addIndexIfMissing(ctx, db, index.name, index.statement); err != nil {
			return err
		}
	}
	return nil
}

func addColumnIfMissing(ctx context.Context, db *sql.DB, table string, column string, definition string, afterColumn string) error {
	var exists int
	err := db.QueryRowContext(ctx, Rebind(columnExistsSQL()), columnExistsArgs(table, column)...).Scan(&exists)
	if err != nil {
		return err
	}
	if exists > 0 {
		return nil
	}
	statement := fmt.Sprintf("ALTER TABLE %s ADD COLUMN %s %s", table, column, definition)
	if CurrentDialect() == DialectMySQL && strings.TrimSpace(afterColumn) != "" {
		statement += " AFTER " + afterColumn
	}
	_, err = db.ExecContext(ctx, statement)
	return err
}

func addIndexIfMissing(ctx context.Context, db *sql.DB, indexName string, statement string) error {
	var exists int
	err := db.QueryRowContext(ctx, Rebind(indexExistsSQL()), indexExistsArgs(indexName)...).Scan(&exists)
	if err != nil {
		return err
	}
	if exists > 0 {
		return nil
	}
	_, err = db.ExecContext(ctx, statement)
	return err
}

func schemaBootstrapStatements() []string {
	if CurrentDialect() == DialectPostgres {
		return []string{
			`CREATE TABLE IF NOT EXISTS users (
				id VARCHAR(36) PRIMARY KEY,
				email VARCHAR(120) NOT NULL UNIQUE,
				password_hash VARCHAR(255) NOT NULL,
				role VARCHAR(16) NOT NULL DEFAULT 'user',
				status VARCHAR(16) NOT NULL DEFAULT 'active',
				email_verified_at TIMESTAMP NULL,
				created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
				updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
				credits NUMERIC(12,4) NOT NULL DEFAULT 0.0000
			)`,
			`CREATE TABLE IF NOT EXISTS api_providers (
				id VARCHAR(36) PRIMARY KEY,
				name VARCHAR(80) NOT NULL,
				type VARCHAR(32) NOT NULL,
				capability VARCHAR(32) NOT NULL DEFAULT 'chat_image',
				base_url VARCHAR(255) NOT NULL,
				api_key VARCHAR(255) NOT NULL,
				status VARCHAR(16) NOT NULL DEFAULT 'active',
				created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
				updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
			)`,
			`CREATE TABLE IF NOT EXISTS ai_models (
				id VARCHAR(36) PRIMARY KEY,
				provider_id VARCHAR(36) NOT NULL,
				model_name VARCHAR(120) NOT NULL,
				display_name VARCHAR(120) NOT NULL,
				capability VARCHAR(32) NOT NULL DEFAULT 'image',
				status VARCHAR(16) NOT NULL DEFAULT 'active',
				created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
				updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
				price_1k NUMERIC(10,4) NOT NULL DEFAULT 0.0000,
				price_2k NUMERIC(10,4) NOT NULL DEFAULT 0.0000,
				price_4k NUMERIC(10,4) NOT NULL DEFAULT 0.0000,
				append_size_to_prompt BOOLEAN NOT NULL DEFAULT FALSE,
				enabled_size_tiers JSONB NULL,
				sort_order INTEGER NOT NULL DEFAULT 100,
				cost_1k NUMERIC(10,4) NOT NULL DEFAULT 0.0000,
				cost_2k NUMERIC(10,4) NOT NULL DEFAULT 0.0000,
				cost_4k NUMERIC(10,4) NOT NULL DEFAULT 0.0000,
				markup_percent NUMERIC(8,2) NOT NULL DEFAULT 0.00,
				price_change_percent NUMERIC(8,2) NOT NULL DEFAULT 0.00,
				CONSTRAINT uq_ai_models_provider_model_capability UNIQUE (provider_id, model_name, capability)
			)`,
			`CREATE TABLE IF NOT EXISTS generation_tasks (
				id VARCHAR(36) PRIMARY KEY,
				user_id VARCHAR(36) NOT NULL,
				model_id VARCHAR(36) NOT NULL,
				provider_id VARCHAR(36) NOT NULL,
				capability VARCHAR(32) NOT NULL,
				prompt TEXT NOT NULL,
				reference_image_url TEXT NULL,
				size_tier VARCHAR(8) NOT NULL DEFAULT '1k',
				size VARCHAR(30) NULL,
				output_format VARCHAR(20) NOT NULL DEFAULT 'jpeg',
				transparent_background BOOLEAN NOT NULL DEFAULT FALSE,
				quantity INTEGER NOT NULL DEFAULT 1,
				user_ip VARCHAR(64) NOT NULL,
				cost_credits NUMERIC(12,4) NOT NULL DEFAULT 0.0000,
				model_cost_credits NUMERIC(12,4) NOT NULL DEFAULT 0.0000,
				remaining_credits NUMERIC(12,4) NOT NULL DEFAULT 0.0000,
				duration_seconds NUMERIC(10,3) NOT NULL DEFAULT 0.000,
				status VARCHAR(16) NOT NULL DEFAULT 'queued',
				error_message TEXT NULL,
				result_json JSONB NULL,
				favorite_enabled BOOLEAN NOT NULL DEFAULT FALSE,
				public_status VARCHAR(16) NOT NULL DEFAULT 'private',
				public_requested_at TIMESTAMP NULL,
				public_reviewed_at TIMESTAMP NULL,
				display_enabled BOOLEAN NOT NULL DEFAULT FALSE,
				display_note VARCHAR(500) NULL,
				created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
				updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
			)`,
			`CREATE TABLE IF NOT EXISTS credit_logs (
				id VARCHAR(36) PRIMARY KEY,
				user_id VARCHAR(36) NOT NULL,
				type VARCHAR(16) NOT NULL,
				amount NUMERIC(12,4) NOT NULL,
				balance_after NUMERIC(12,4) NOT NULL,
				remark VARCHAR(200) NULL,
				created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
			)`,
			`CREATE TABLE IF NOT EXISTS system_settings (
				setting_key VARCHAR(80) PRIMARY KEY,
				setting_value TEXT NOT NULL,
				updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
			)`,
			`CREATE TABLE IF NOT EXISTS recharge_orders (
				id VARCHAR(36) PRIMARY KEY,
				user_id VARCHAR(36) NOT NULL,
				out_trade_no VARCHAR(64) NOT NULL UNIQUE,
				trade_no VARCHAR(80) NULL,
				order_type VARCHAR(24) NOT NULL DEFAULT 'recharge',
				subscription_plan_id VARCHAR(36) NULL,
				amount NUMERIC(12,2) NOT NULL,
				credits NUMERIC(12,4) NOT NULL,
				status VARCHAR(16) NOT NULL DEFAULT 'pending',
				pay_url TEXT NULL,
				qr_code TEXT NULL,
				paid_at TIMESTAMP NULL,
				created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
				updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
			)`,
			`CREATE TABLE IF NOT EXISTS recharge_products (
				id VARCHAR(36) PRIMARY KEY,
				name VARCHAR(80) NOT NULL,
				amount NUMERIC(12,2) NOT NULL,
				credits NUMERIC(12,4) NOT NULL,
				badge VARCHAR(40) NULL,
				sort_order INTEGER NOT NULL DEFAULT 0,
				status VARCHAR(16) NOT NULL DEFAULT 'active',
				created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
				updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
			)`,
			`CREATE TABLE IF NOT EXISTS subscription_plans (
				id VARCHAR(36) PRIMARY KEY,
				name VARCHAR(80) NOT NULL,
				description VARCHAR(300) NULL,
				amount NUMERIC(12,2) NOT NULL,
				duration_days INTEGER NOT NULL,
				bonus_credits NUMERIC(12,4) NOT NULL DEFAULT 0.0000,
				discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0.00,
				allowed_provider_ids JSONB NULL,
				allowed_model_ids JSONB NULL,
				badge VARCHAR(40) NULL,
				sort_order INTEGER NOT NULL DEFAULT 0,
				status VARCHAR(16) NOT NULL DEFAULT 'active',
				created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
				updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
			)`,
			`CREATE TABLE IF NOT EXISTS user_subscriptions (
				id VARCHAR(36) PRIMARY KEY,
				user_id VARCHAR(36) NOT NULL UNIQUE,
				plan_id VARCHAR(36) NOT NULL,
				status VARCHAR(16) NOT NULL DEFAULT 'active',
				started_at TIMESTAMP NOT NULL,
				expires_at TIMESTAMP NOT NULL,
				created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
				updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
			)`,
			`CREATE TABLE IF NOT EXISTS redeem_codes (
				id VARCHAR(36) PRIMARY KEY,
				code VARCHAR(80) NOT NULL UNIQUE,
				credits NUMERIC(12,4) NOT NULL,
				status VARCHAR(16) NOT NULL DEFAULT 'active',
				remark VARCHAR(200) NULL,
				user_id VARCHAR(36) NULL,
				used_at TIMESTAMP NULL,
				expires_at TIMESTAMP NULL,
				created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
				updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
			)`,
			`CREATE TABLE IF NOT EXISTS user_checkins (
				id VARCHAR(36) PRIMARY KEY,
				user_id VARCHAR(36) NOT NULL,
				reward_credits NUMERIC(12,4) NOT NULL,
				checkin_date DATE NOT NULL,
				user_ip VARCHAR(64) NULL,
				created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
				CONSTRAINT uq_user_checkins_user_date UNIQUE (user_id, checkin_date)
			)`,
			`CREATE TABLE IF NOT EXISTS user_invites (
				id VARCHAR(36) PRIMARY KEY,
				inviter_id VARCHAR(36) NOT NULL,
				invitee_id VARCHAR(36) NOT NULL UNIQUE,
				reward_credits NUMERIC(12,4) NOT NULL,
				invitee_ip VARCHAR(64) NULL,
				created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
			)`,
			`CREATE TABLE IF NOT EXISTS announcements (
				id VARCHAR(36) PRIMARY KEY,
				title VARCHAR(120) NOT NULL,
				content TEXT NOT NULL,
				display_mode VARCHAR(20) NOT NULL DEFAULT 'popup',
				target_type VARCHAR(20) NOT NULL DEFAULT 'all',
				status VARCHAR(16) NOT NULL DEFAULT 'active',
				sort_order INTEGER NOT NULL DEFAULT 0,
				created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
				updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
			)`,
			`CREATE TABLE IF NOT EXISTS announcement_users (
				announcement_id VARCHAR(36) NOT NULL,
				user_id VARCHAR(36) NOT NULL,
				created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
				PRIMARY KEY (announcement_id, user_id)
			)`,
			`CREATE TABLE IF NOT EXISTS announcement_receipts (
				announcement_id VARCHAR(36) NOT NULL,
				user_id VARCHAR(36) NOT NULL,
				signed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
				PRIMARY KEY (announcement_id, user_id)
			)`,
			`CREATE INDEX IF NOT EXISTS idx_announcement_receipts_user_id ON announcement_receipts (user_id)`,
			`CREATE TABLE IF NOT EXISTS oauth_authorization_codes (
				code VARCHAR(120) PRIMARY KEY,
				client_id VARCHAR(120) NOT NULL,
				user_id VARCHAR(36) NOT NULL,
				redirect_uri VARCHAR(500) NOT NULL,
				scope VARCHAR(200) NULL,
				expires_at TIMESTAMP NOT NULL,
				used_at TIMESTAMP NULL,
				created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
			)`,
			`CREATE INDEX IF NOT EXISTS idx_oauth_codes_client_user ON oauth_authorization_codes (client_id, user_id)`,
			`CREATE INDEX IF NOT EXISTS idx_oauth_codes_expires_at ON oauth_authorization_codes (expires_at)`,
			`CREATE TABLE IF NOT EXISTS oauth_access_tokens (
				token_hash CHAR(64) PRIMARY KEY,
				client_id VARCHAR(120) NOT NULL,
				user_id VARCHAR(36) NOT NULL,
				scope VARCHAR(200) NULL,
				expires_at TIMESTAMP NOT NULL,
				created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
			)`,
			`CREATE INDEX IF NOT EXISTS idx_oauth_tokens_user_id ON oauth_access_tokens (user_id)`,
			`CREATE INDEX IF NOT EXISTS idx_oauth_tokens_expires_at ON oauth_access_tokens (expires_at)`,
			`CREATE TABLE IF NOT EXISTS user_email_tokens (
				token_hash CHAR(64) PRIMARY KEY,
				user_id VARCHAR(36) NOT NULL,
				purpose VARCHAR(40) NOT NULL,
				expires_at TIMESTAMP NOT NULL,
				used_at TIMESTAMP NULL,
				created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
			)`,
			`CREATE INDEX IF NOT EXISTS idx_user_email_tokens_user_id ON user_email_tokens (user_id)`,
			`CREATE INDEX IF NOT EXISTS idx_user_email_tokens_purpose ON user_email_tokens (purpose)`,
			`CREATE INDEX IF NOT EXISTS idx_user_email_tokens_expires_at ON user_email_tokens (expires_at)`,
			`CREATE TABLE IF NOT EXISTS promotions (
				id VARCHAR(36) PRIMARY KEY,
				title VARCHAR(120) NOT NULL,
				content TEXT NOT NULL,
				badge VARCHAR(40) NULL,
				action_text VARCHAR(40) NULL,
				action_url VARCHAR(255) NULL,
				status VARCHAR(16) NOT NULL DEFAULT 'active',
				sort_order INTEGER NOT NULL DEFAULT 0,
				created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
				updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
			)`,
			`CREATE TABLE IF NOT EXISTS user_api_keys (
				id VARCHAR(36) PRIMARY KEY,
				user_id VARCHAR(36) NOT NULL,
				name VARCHAR(80) NOT NULL,
				key_prefix VARCHAR(20) NOT NULL,
				key_hash VARCHAR(64) NOT NULL UNIQUE,
				key_plain VARCHAR(255) NULL,
				encrypted_key TEXT NULL,
				status VARCHAR(16) NOT NULL DEFAULT 'active',
				last_used_at TIMESTAMP NULL,
				deleted_at TIMESTAMP NULL,
				created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
				updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
			)`,
			`CREATE TABLE IF NOT EXISTS api_call_logs (
				id VARCHAR(36) PRIMARY KEY,
				direction VARCHAR(16) NOT NULL DEFAULT 'upstream',
				task_id VARCHAR(36) NULL,
				user_id VARCHAR(36) NULL,
				api_key_id VARCHAR(36) NULL,
				api_key_name VARCHAR(120) NULL,
				provider_id VARCHAR(36) NULL,
				provider_type VARCHAR(40) NULL,
				endpoint VARCHAR(500) NOT NULL,
				phase VARCHAR(80) NOT NULL,
				method VARCHAR(12) NOT NULL DEFAULT 'POST',
				status VARCHAR(16) NOT NULL,
				status_code INTEGER NULL,
				duration_ms INTEGER NOT NULL DEFAULT 0,
				request_summary JSONB NULL,
				response_summary JSONB NULL,
				error_message TEXT NULL,
				created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
			)`,
			`CREATE INDEX IF NOT EXISTS idx_ai_models_status_capability ON ai_models (status, capability)`,
			`CREATE INDEX IF NOT EXISTS idx_generation_tasks_created_at ON generation_tasks (created_at)`,
			`CREATE INDEX IF NOT EXISTS idx_generation_tasks_user_id ON generation_tasks (user_id)`,
			`CREATE INDEX IF NOT EXISTS idx_generation_tasks_capability ON generation_tasks (capability)`,
			`CREATE INDEX IF NOT EXISTS idx_generation_tasks_user_created_id ON generation_tasks (user_id, created_at, id)`,
			`CREATE INDEX IF NOT EXISTS idx_generation_tasks_user_favorite ON generation_tasks (user_id, favorite_enabled, updated_at)`,
			`CREATE INDEX IF NOT EXISTS idx_generation_tasks_public_status ON generation_tasks (public_status, updated_at)`,
			`CREATE INDEX IF NOT EXISTS idx_credit_logs_user_id ON credit_logs (user_id)`,
			`CREATE INDEX IF NOT EXISTS idx_credit_logs_created_at ON credit_logs (created_at)`,
			`CREATE INDEX IF NOT EXISTS idx_credit_logs_user_created_id ON credit_logs (user_id, created_at, id)`,
			`CREATE INDEX IF NOT EXISTS idx_recharge_orders_user_id ON recharge_orders (user_id)`,
			`CREATE INDEX IF NOT EXISTS idx_recharge_orders_out_trade_no ON recharge_orders (out_trade_no)`,
			`CREATE INDEX IF NOT EXISTS idx_recharge_orders_status ON recharge_orders (status)`,
			`CREATE INDEX IF NOT EXISTS idx_recharge_products_status_sort ON recharge_products (status, sort_order)`,
			`CREATE INDEX IF NOT EXISTS idx_subscription_plans_status_sort ON subscription_plans (status, sort_order)`,
			`CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_status ON user_subscriptions (user_id, status, expires_at)`,
			`CREATE INDEX IF NOT EXISTS idx_user_subscriptions_plan_id ON user_subscriptions (plan_id)`,
			`CREATE INDEX IF NOT EXISTS idx_redeem_codes_status ON redeem_codes (status)`,
			`CREATE INDEX IF NOT EXISTS idx_redeem_codes_user_id ON redeem_codes (user_id)`,
			`CREATE INDEX IF NOT EXISTS idx_user_checkins_date ON user_checkins (checkin_date)`,
			`CREATE INDEX IF NOT EXISTS idx_user_invites_ip_created ON user_invites (invitee_ip, created_at)`,
			`CREATE INDEX IF NOT EXISTS idx_announcements_status_sort ON announcements (status, sort_order, created_at)`,
			`CREATE INDEX IF NOT EXISTS idx_announcement_users_user_id ON announcement_users (user_id)`,
			`CREATE INDEX IF NOT EXISTS idx_promotions_status_sort ON promotions (status, sort_order, created_at)`,
			`CREATE INDEX IF NOT EXISTS idx_user_api_keys_user_id ON user_api_keys (user_id)`,
			`CREATE INDEX IF NOT EXISTS idx_user_api_keys_prefix_status ON user_api_keys (key_prefix, status)`,
			`CREATE INDEX IF NOT EXISTS idx_api_call_logs_created_at ON api_call_logs (created_at)`,
			`CREATE INDEX IF NOT EXISTS idx_api_call_logs_provider_created ON api_call_logs (provider_id, created_at)`,
			`CREATE INDEX IF NOT EXISTS idx_api_call_logs_status_created ON api_call_logs (status, created_at)`,
			`CREATE INDEX IF NOT EXISTS idx_api_call_logs_task_id ON api_call_logs (task_id)`,
			`CREATE INDEX IF NOT EXISTS idx_api_call_logs_direction_created ON api_call_logs (direction, created_at)`,
			`CREATE INDEX IF NOT EXISTS idx_api_call_logs_user_created ON api_call_logs (user_id, created_at)`,
			`CREATE INDEX IF NOT EXISTS idx_api_call_logs_api_key_created ON api_call_logs (api_key_id, created_at)`,
			`CREATE INDEX IF NOT EXISTS idx_api_call_logs_monitor_provider_created ON api_call_logs (direction, phase, provider_id, created_at, id)`,
			`CREATE INDEX IF NOT EXISTS idx_api_call_logs_monitor_created ON api_call_logs (direction, phase, created_at)`,
		}
	}
	return []string{
		`CREATE TABLE IF NOT EXISTS announcement_receipts (
			announcement_id VARCHAR(36) NOT NULL,
			user_id VARCHAR(36) NOT NULL,
			signed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			PRIMARY KEY (announcement_id, user_id),
			INDEX idx_announcement_receipts_user_id (user_id)
		)`,
		`CREATE TABLE IF NOT EXISTS oauth_authorization_codes (
			code VARCHAR(120) PRIMARY KEY,
			client_id VARCHAR(120) NOT NULL,
			user_id VARCHAR(36) NOT NULL,
			redirect_uri VARCHAR(500) NOT NULL,
			scope VARCHAR(200) NULL,
			expires_at DATETIME NOT NULL,
			used_at DATETIME NULL,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			INDEX idx_oauth_codes_client_user (client_id, user_id),
			INDEX idx_oauth_codes_expires_at (expires_at)
		)`,
		`CREATE TABLE IF NOT EXISTS oauth_access_tokens (
			token_hash CHAR(64) PRIMARY KEY,
			client_id VARCHAR(120) NOT NULL,
			user_id VARCHAR(36) NOT NULL,
			scope VARCHAR(200) NULL,
			expires_at DATETIME NOT NULL,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			INDEX idx_oauth_tokens_user_id (user_id),
			INDEX idx_oauth_tokens_expires_at (expires_at)
		)`,
		`CREATE TABLE IF NOT EXISTS user_email_tokens (
			token_hash CHAR(64) PRIMARY KEY,
			user_id VARCHAR(36) NOT NULL,
			purpose VARCHAR(40) NOT NULL,
			expires_at DATETIME NOT NULL,
			used_at DATETIME NULL,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			INDEX idx_user_email_tokens_user_id (user_id),
			INDEX idx_user_email_tokens_purpose (purpose),
			INDEX idx_user_email_tokens_expires_at (expires_at)
		)`,
	}
}

func columnExistsSQL() string {
	if CurrentDialect() == DialectPostgres {
		return `
			SELECT COUNT(*)
			FROM information_schema.columns
			WHERE table_schema = current_schema()
				AND table_name = ?
				AND column_name = ?
		`
	}
	return `
		SELECT COUNT(*)
		FROM information_schema.COLUMNS
		WHERE TABLE_SCHEMA = DATABASE()
			AND TABLE_NAME = ?
			AND COLUMN_NAME = ?
	`
}

func columnExistsArgs(table string, column string) []any {
	return []any{table, column}
}

func indexExistsSQL() string {
	if CurrentDialect() == DialectPostgres {
		return `
			SELECT COUNT(*)
			FROM pg_indexes
			WHERE schemaname = current_schema()
				AND indexname = ?
		`
	}
	return `
		SELECT COUNT(*)
		FROM information_schema.STATISTICS
		WHERE TABLE_SCHEMA = DATABASE()
			AND INDEX_NAME = ?
	`
}

func indexExistsArgs(indexName string) []any {
	return []any{indexName}
}
