package content

import (
	"context"
	"database/sql"
	"strings"
	"time"
)

type Repository struct {
	db *sql.DB
}

func NewRepository(db *sql.DB) *Repository {
	return &Repository{db: db}
}

func (r *Repository) FindAnnouncements(ctx context.Context, onlyVisible bool, userID string) ([]Announcement, error) {
	query := `
		SELECT announcements.id, announcements.title, announcements.content,
			COALESCE(announcements.display_mode, 'popup') AS display_mode,
			announcements.target_type, announcements.status, announcements.sort_order,
			GROUP_CONCAT(DISTINCT announcement_users.user_id) AS user_ids,
			announcements.created_at, announcements.updated_at
		FROM announcements
		LEFT JOIN announcement_users ON announcement_users.announcement_id = announcements.id
	`
	args := []any{}
	if onlyVisible {
		query += `
			WHERE announcements.status = 'active'
			  AND (
				announcements.target_type = 'all'
				OR (? <> '' AND EXISTS (
					SELECT 1 FROM announcement_users target_users
					WHERE target_users.announcement_id = announcements.id
					  AND target_users.user_id = ?
				))
			  )
			  AND (COALESCE(announcements.display_mode, 'popup') <> 'popup' OR ? = '' OR NOT EXISTS (
				SELECT 1 FROM announcement_receipts
				WHERE announcement_receipts.announcement_id = announcements.id
				  AND announcement_receipts.user_id = ?
			  ))
		`
		args = append(args, userID, userID, userID, userID)
	}
	query += ` GROUP BY announcements.id ORDER BY announcements.sort_order ASC, announcements.created_at DESC`
	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []Announcement{}
	for rows.Next() {
		item, err := scanAnnouncement(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (r *Repository) FindAnnouncement(ctx context.Context, id string) (*Announcement, error) {
	row := r.db.QueryRowContext(ctx, `
		SELECT announcements.id, announcements.title, announcements.content,
			COALESCE(announcements.display_mode, 'popup') AS display_mode,
			announcements.target_type, announcements.status, announcements.sort_order,
			GROUP_CONCAT(DISTINCT announcement_users.user_id) AS user_ids,
			announcements.created_at, announcements.updated_at
		FROM announcements
		LEFT JOIN announcement_users ON announcement_users.announcement_id = announcements.id
		WHERE announcements.id = ?
		GROUP BY announcements.id
		LIMIT 1
	`, id)
	item, err := scanAnnouncement(row)
	if err != nil {
		return nil, err
	}
	return &item, nil
}

func (r *Repository) SaveAnnouncement(ctx context.Context, item Announcement) (*Announcement, error) {
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO announcements (id, title, content, display_mode, target_type, status, sort_order)
		VALUES (?, ?, ?, ?, ?, ?, ?)
		ON DUPLICATE KEY UPDATE
			title = VALUES(title),
			content = VALUES(content),
			display_mode = VALUES(display_mode),
			target_type = VALUES(target_type),
			status = VALUES(status),
			sort_order = VALUES(sort_order),
			updated_at = CURRENT_TIMESTAMP
	`, item.ID, item.Title, item.Content, defaultStringLocal(item.DisplayMode, "popup"), defaultStringLocal(item.TargetType, "all"), defaultStringLocal(item.Status, "active"), item.SortOrder)
	if err != nil {
		return nil, err
	}
	if err := r.ReplaceAnnouncementUsers(ctx, item.ID, item.UserIDs); err != nil {
		return nil, err
	}
	return r.FindAnnouncement(ctx, item.ID)
}

func (r *Repository) DeleteAnnouncement(ctx context.Context, id string) (bool, error) {
	_, _ = r.db.ExecContext(ctx, `DELETE FROM announcement_receipts WHERE announcement_id = ?`, id)
	_, _ = r.db.ExecContext(ctx, `DELETE FROM announcement_users WHERE announcement_id = ?`, id)
	result, err := r.db.ExecContext(ctx, `DELETE FROM announcements WHERE id = ?`, id)
	if err != nil {
		return false, err
	}
	rows, err := result.RowsAffected()
	return rows > 0, err
}

func (r *Repository) SignAnnouncement(ctx context.Context, announcementID string, userID string) error {
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO announcement_receipts (announcement_id, user_id)
		VALUES (?, ?)
		ON DUPLICATE KEY UPDATE signed_at = CURRENT_TIMESTAMP
	`, announcementID, userID)
	return err
}

func (r *Repository) ReplaceAnnouncementUsers(ctx context.Context, announcementID string, userIDs []string) error {
	if _, err := r.db.ExecContext(ctx, `DELETE FROM announcement_users WHERE announcement_id = ?`, announcementID); err != nil {
		return err
	}
	for _, userID := range userIDs {
		userID = strings.TrimSpace(userID)
		if userID == "" {
			continue
		}
		if _, err := r.db.ExecContext(ctx, `INSERT INTO announcement_users (announcement_id, user_id) VALUES (?, ?)`, announcementID, userID); err != nil {
			return err
		}
	}
	return nil
}

func (r *Repository) FindPromotions(ctx context.Context, activeOnly bool) ([]Promotion, error) {
	query := `SELECT id, title, content, badge, action_text, action_url, status, sort_order, created_at, updated_at FROM promotions`
	if activeOnly {
		query += ` WHERE status = 'active'`
	}
	query += ` ORDER BY sort_order ASC, created_at DESC`
	rows, err := r.db.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []Promotion{}
	for rows.Next() {
		item, err := scanPromotion(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (r *Repository) FindPromotion(ctx context.Context, id string) (*Promotion, error) {
	row := r.db.QueryRowContext(ctx, `SELECT id, title, content, badge, action_text, action_url, status, sort_order, created_at, updated_at FROM promotions WHERE id = ? LIMIT 1`, id)
	item, err := scanPromotion(row)
	if err != nil {
		return nil, err
	}
	return &item, nil
}

func (r *Repository) SavePromotion(ctx context.Context, item Promotion) (*Promotion, error) {
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO promotions (id, title, content, badge, action_text, action_url, status, sort_order)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		ON DUPLICATE KEY UPDATE
			title = VALUES(title),
			content = VALUES(content),
			badge = VALUES(badge),
			action_text = VALUES(action_text),
			action_url = VALUES(action_url),
			status = VALUES(status),
			sort_order = VALUES(sort_order),
			updated_at = CURRENT_TIMESTAMP
	`, item.ID, item.Title, item.Content, item.Badge, item.ActionText, item.ActionURL, defaultStringLocal(item.Status, "active"), item.SortOrder)
	if err != nil {
		return nil, err
	}
	return r.FindPromotion(ctx, item.ID)
}

func (r *Repository) DeletePromotion(ctx context.Context, id string) (bool, error) {
	result, err := r.db.ExecContext(ctx, `DELETE FROM promotions WHERE id = ?`, id)
	if err != nil {
		return false, err
	}
	rows, err := result.RowsAffected()
	return rows > 0, err
}

type scanner interface {
	Scan(dest ...any) error
}

func scanAnnouncement(row scanner) (Announcement, error) {
	var item Announcement
	var userIDs sql.NullString
	var createdAt, updatedAt time.Time
	if err := row.Scan(&item.ID, &item.Title, &item.Content, &item.DisplayMode, &item.TargetType, &item.Status, &item.SortOrder, &userIDs, &createdAt, &updatedAt); err != nil {
		return item, err
	}
	item.UserIDs = splitIDs(userIDs.String)
	item.CreatedAt = createdAt.In(time.Local).Format(time.RFC3339)
	item.UpdatedAt = updatedAt.In(time.Local).Format(time.RFC3339)
	return item, nil
}

func scanPromotion(row scanner) (Promotion, error) {
	var item Promotion
	var badge, actionText, actionURL sql.NullString
	var createdAt, updatedAt time.Time
	if err := row.Scan(&item.ID, &item.Title, &item.Content, &badge, &actionText, &actionURL, &item.Status, &item.SortOrder, &createdAt, &updatedAt); err != nil {
		return item, err
	}
	if badge.Valid {
		item.Badge = &badge.String
	}
	if actionText.Valid {
		item.ActionText = &actionText.String
	}
	if actionURL.Valid {
		item.ActionURL = &actionURL.String
	}
	item.CreatedAt = createdAt.In(time.Local).Format(time.RFC3339)
	item.UpdatedAt = updatedAt.In(time.Local).Format(time.RFC3339)
	return item, nil
}

func splitIDs(value string) []string {
	if strings.TrimSpace(value) == "" {
		return []string{}
	}
	parts := strings.Split(value, ",")
	result := []string{}
	for _, part := range parts {
		if strings.TrimSpace(part) != "" {
			result = append(result, strings.TrimSpace(part))
		}
	}
	return result
}

func defaultStringLocal(value string, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return strings.TrimSpace(value)
}
