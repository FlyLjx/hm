package database

import (
	"context"
	"database/sql"
	"time"
)

func EnsureSchema(db *sql.DB) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()
	statements := []string{
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
	for _, statement := range statements {
		if _, err := db.ExecContext(ctx, statement); err != nil {
			return err
		}
	}
	if err := addColumnIfMissing(ctx, db, "generation_tasks", "output_format", "VARCHAR(20) NULL AFTER size"); err != nil {
		return err
	}
	if err := addColumnIfMissing(ctx, db, "announcements", "display_mode", "VARCHAR(20) NOT NULL DEFAULT 'popup' AFTER content"); err != nil {
		return err
	}
	return nil
}

func addColumnIfMissing(ctx context.Context, db *sql.DB, table string, column string, definition string) error {
	var exists int
	err := db.QueryRowContext(ctx, `
		SELECT COUNT(*)
		FROM information_schema.COLUMNS
		WHERE TABLE_SCHEMA = DATABASE()
			AND TABLE_NAME = ?
			AND COLUMN_NAME = ?
	`, table, column).Scan(&exists)
	if err != nil {
		return err
	}
	if exists > 0 {
		return nil
	}
	_, err = db.ExecContext(ctx, "ALTER TABLE "+table+" ADD COLUMN "+column+" "+definition)
	return err
}
