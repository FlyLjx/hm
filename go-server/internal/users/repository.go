package users

import (
	"context"
	"database/sql"
	"regexp"
	"strconv"
	"time"
)

type Repository struct {
	db *sql.DB
}

func NewRepository(db *sql.DB) *Repository {
	return &Repository{db: db}
}

func (r *Repository) FindAll(ctx context.Context) ([]User, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT id, email, password_hash, credits, role, status, email_verified_at, created_at, updated_at
		FROM users
		ORDER BY created_at DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := []User{}
	for rows.Next() {
		user, err := scanUser(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, *user)
	}
	return items, rows.Err()
}

func (r *Repository) FindByEmail(ctx context.Context, email string) (*User, error) {
	row := r.db.QueryRowContext(ctx, `
		SELECT id, email, password_hash, credits, role, status, email_verified_at, created_at, updated_at
		FROM users
		WHERE email = ?
		LIMIT 1
	`, email)
	return scanUser(row)
}

func (r *Repository) FindByID(ctx context.Context, id string) (*User, error) {
	legacyID := legacyIDFromCompatUUID(id)
	if legacyID != "" {
		row := r.db.QueryRowContext(ctx, `
			SELECT id, email, password_hash, credits, role, status, email_verified_at, created_at, updated_at
			FROM users
			WHERE id IN (?, ?)
			ORDER BY id = ? DESC
			LIMIT 1
		`, id, legacyID, id)
		return scanUser(row)
	}
	row := r.db.QueryRowContext(ctx, `
		SELECT id, email, password_hash, credits, role, status, email_verified_at, created_at, updated_at
		FROM users
		WHERE id = ?
		LIMIT 1
	`, id)
	return scanUser(row)
}

func (r *Repository) Create(ctx context.Context, user User) (*User, error) {
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO users (id, email, password_hash, credits, role, status, email_verified_at)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`, user.ID, user.Email, user.PasswordHash, user.Credits, user.Role, user.Status, user.EmailVerifiedAt)
	if err != nil {
		return nil, err
	}
	return r.FindByID(ctx, user.ID)
}

func (r *Repository) UpdatePassword(ctx context.Context, id string, passwordHash string) (*User, error) {
	if _, err := r.db.ExecContext(ctx, `UPDATE users SET password_hash = ? WHERE id = ?`, passwordHash, id); err != nil {
		return nil, err
	}
	return r.FindByID(ctx, id)
}

func (r *Repository) MarkEmailVerified(ctx context.Context, id string) (*User, error) {
	if _, err := r.db.ExecContext(ctx, `UPDATE users SET email_verified_at = COALESCE(email_verified_at, NOW()) WHERE id = ?`, id); err != nil {
		return nil, err
	}
	return r.FindByID(ctx, id)
}

func (r *Repository) Update(ctx context.Context, id string, input User) (*User, error) {
	if _, err := r.db.ExecContext(ctx, `
		UPDATE users
		SET email = ?, credits = ?, role = ?, status = ?
		WHERE id = ?
	`, input.Email, input.Credits, input.Role, input.Status, id); err != nil {
		return nil, err
	}
	return r.FindByID(ctx, id)
}

func (r *Repository) Delete(ctx context.Context, id string) (bool, error) {
	result, err := r.db.ExecContext(ctx, `DELETE FROM users WHERE id = ?`, id)
	if err != nil {
		return false, err
	}
	rows, err := result.RowsAffected()
	return rows > 0, err
}

type scanner interface {
	Scan(dest ...any) error
}

func scanUser(row scanner) (*User, error) {
	var user User
	var verifiedAt sql.NullTime
	if err := row.Scan(
		&user.ID,
		&user.Email,
		&user.PasswordHash,
		&user.Credits,
		&user.Role,
		&user.Status,
		&verifiedAt,
		&user.CreatedAt,
		&user.UpdatedAt,
	); err != nil {
		return nil, err
	}
	if verifiedAt.Valid {
		value := verifiedAt.Time
		user.EmailVerifiedAt = &value
	}
	user.CreatedAt = user.CreatedAt.In(time.Local)
	user.UpdatedAt = user.UpdatedAt.In(time.Local)
	return &user, nil
}

var compatUUIDPattern = regexp.MustCompile(`^00000000-0000-4000-8000-(\d{12})$`)

func legacyIDFromCompatUUID(id string) string {
	matches := compatUUIDPattern.FindStringSubmatch(id)
	if len(matches) != 2 {
		return ""
	}
	number, err := strconv.Atoi(matches[1])
	if err != nil {
		return ""
	}
	return "legacy-" + strconv.Itoa(number)
}
