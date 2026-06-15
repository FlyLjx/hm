package operations

import (
	"context"
	"database/sql"
	"encoding/json"
	"strings"
	"time"
)

type Repository struct {
	db *sql.DB
}

const apiLogMonitorPhase = "service-monitor"
const publicSlowRequestMs = 10000

func NewRepository(db *sql.DB) *Repository {
	return &Repository{db: db}
}

type PageInput struct {
	Page     int
	PageSize int
	Keyword  string
	Status   string
	APIKeyID string
}

func (r *Repository) Dashboard(ctx context.Context) (map[string]any, error) {
	result := map[string]any{}
	todayUsers, err := r.count(ctx, `SELECT COUNT(*) FROM users WHERE created_at >= CURDATE()`)
	if err != nil {
		return nil, err
	}
	todayOrders, err := r.count(ctx, `SELECT COUNT(*) FROM recharge_orders WHERE created_at >= CURDATE()`)
	if err != nil {
		return nil, err
	}
	var todayPaidAmount float64
	_ = r.db.QueryRowContext(ctx, `SELECT COALESCE(SUM(amount),0) FROM recharge_orders WHERE status='paid' AND paid_at >= CURDATE()`).Scan(&todayPaidAmount)
	var todayTasks, todayRunning, todayFailed int
	_ = r.db.QueryRowContext(ctx, `
		SELECT COUNT(*),
			COALESCE(SUM(status IN ('queued','pending','processing')),0),
			COALESCE(SUM(status IN ('failed','canceled')),0)
		FROM generation_tasks WHERE created_at >= CURDATE()
	`).Scan(&todayTasks, &todayRunning, &todayFailed)
	pendingOrders, _ := r.count(ctx, `SELECT COUNT(*) FROM recharge_orders WHERE status='pending'`)
	runningTasks, _ := r.count(ctx, `SELECT COUNT(*) FROM generation_tasks WHERE status IN ('queued','pending','processing')`)
	recentFailed, _ := r.count(ctx, `SELECT COUNT(*) FROM generation_tasks WHERE status IN ('failed','canceled') AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)`)
	privateImages, _ := r.count(ctx, `SELECT COUNT(*) FROM generation_tasks WHERE status='success' AND display_enabled=0`)
	activeProviders, _ := r.count(ctx, `SELECT COUNT(*) FROM api_providers WHERE status='active'`)
	disabledProviders, _ := r.count(ctx, `SELECT COUNT(*) FROM api_providers WHERE status='disabled'`)
	activeModels, _ := r.count(ctx, `SELECT COUNT(*) FROM ai_models WHERE capability='chat_image' AND status='active'`)
	disabledModels, _ := r.count(ctx, `SELECT COUNT(*) FROM ai_models WHERE capability='chat_image' AND status='disabled'`)
	var lastTask sql.NullTime
	_ = r.db.QueryRowContext(ctx, `SELECT MAX(created_at) FROM generation_tasks`).Scan(&lastTask)
	lastTaskValue := any(nil)
	if lastTask.Valid {
		lastTaskValue = lastTask.Time.In(time.Local).Format(time.RFC3339)
	}
	result["today"] = map[string]any{
		"users": todayUsers, "orders": todayOrders, "paidAmount": todayPaidAmount,
		"tasks": todayTasks, "runningTasks": todayRunning, "failedTasks": todayFailed,
	}
	result["pending"] = map[string]any{
		"pendingOrders": pendingOrders, "runningTasks": runningTasks,
		"recentFailedTasks": recentFailed, "privateImages": privateImages,
	}
	result["system"] = map[string]any{
		"api": "ok", "database": "ok", "activeProviders": activeProviders,
		"disabledProviders": disabledProviders, "activeModels": activeModels,
		"disabledModels": disabledModels, "lastTaskAt": lastTaskValue,
	}
	return result, nil
}

func (r *Repository) CreditLogs(ctx context.Context, input PageInput) ([]CreditLog, int, error) {
	page, pageSize, offset := normalizePage(input.Page, input.PageSize)
	_ = page
	where := []string{}
	args := []any{}
	if input.Keyword != "" {
		where = append(where, "(users.email LIKE ? OR credit_logs.remark LIKE ? OR credit_logs.user_id LIKE ?)")
		like := "%" + strings.TrimSpace(input.Keyword) + "%"
		args = append(args, like, like, like)
	}
	if input.Status == "recharge" || input.Status == "deduct" {
		where = append(where, "credit_logs.type = ?")
		args = append(args, input.Status)
	}
	whereSQL := buildWhere(where)
	total, err := r.countWithArgs(ctx, `SELECT COUNT(*) FROM credit_logs LEFT JOIN users ON users.id = credit_logs.user_id `+whereSQL, args)
	if err != nil {
		return nil, 0, err
	}
	rows, err := r.db.QueryContext(ctx, `
		SELECT credit_logs.id, credit_logs.user_id, users.email, credit_logs.type, credit_logs.amount,
			credit_logs.balance_after, credit_logs.remark, credit_logs.created_at
		FROM credit_logs
		LEFT JOIN users ON users.id = credit_logs.user_id
		`+whereSQL+`
		ORDER BY credit_logs.created_at DESC, credit_logs.id DESC
		LIMIT ? OFFSET ?
	`, append(args, pageSize, offset)...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	items := []CreditLog{}
	for rows.Next() {
		item, err := scanCreditLog(rows)
		if err != nil {
			return nil, 0, err
		}
		items = append(items, item)
	}
	return items, total, rows.Err()
}

func (r *Repository) CreditStats(ctx context.Context) (map[string]any, error) {
	var recharge, deduct, totalRows float64
	_ = r.db.QueryRowContext(ctx, `SELECT COALESCE(SUM(CASE WHEN type='recharge' THEN amount ELSE 0 END),0), COALESCE(SUM(CASE WHEN type='deduct' THEN amount ELSE 0 END),0), COUNT(*) FROM credit_logs`).Scan(&recharge, &deduct, &totalRows)
	rows, err := r.db.QueryContext(ctx, `
		SELECT DATE(created_at) AS day,
			COALESCE(SUM(CASE WHEN type='recharge' THEN amount ELSE 0 END),0) AS recharge,
			COALESCE(SUM(CASE WHEN type='deduct' THEN amount ELSE 0 END),0) AS deduct
		FROM credit_logs
		WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 29 DAY)
		GROUP BY DATE(created_at)
		ORDER BY day ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	daily := []map[string]any{}
	for rows.Next() {
		var day time.Time
		var in, out float64
		if err := rows.Scan(&day, &in, &out); err != nil {
			return nil, err
		}
		daily = append(daily, map[string]any{"date": day.Format("2006-01-02"), "recharge": in, "deduct": out})
	}
	return map[string]any{"total": totalRows, "recharge": recharge, "deduct": deduct, "daily": daily}, rows.Err()
}

func (r *Repository) DeleteCreditLog(ctx context.Context, id string) (bool, error) {
	result, err := r.db.ExecContext(ctx, `DELETE FROM credit_logs WHERE id = ?`, id)
	return affected(result, err)
}

func (r *Repository) FinanceCosts(ctx context.Context, days int) (map[string]any, error) {
	if days <= 0 {
		days = 30
	}
	if days > 365 {
		days = 365
	}
	now := time.Now()
	start := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location()).AddDate(0, 0, -(days - 1))

	var paidOrders int
	var paidAmount float64
	if err := r.db.QueryRowContext(ctx, `
		SELECT COUNT(*), COALESCE(SUM(amount), 0)
		FROM recharge_orders
		WHERE status = 'paid'
			AND COALESCE(paid_at, updated_at, created_at) >= ?
	`, start).Scan(&paidOrders, &paidAmount); err != nil {
		return nil, err
	}

	var successTasks, images int
	var taskRevenue, modelCost float64
	if err := r.db.QueryRowContext(ctx, `
		SELECT COUNT(*),
			COALESCE(SUM(quantity), 0),
			COALESCE(SUM(cost_credits), 0),
			COALESCE(SUM(model_cost_credits), 0)
		FROM generation_tasks
		WHERE status = 'success'
			AND created_at >= ?
	`, start).Scan(&successTasks, &images, &taskRevenue, &modelCost); err != nil {
		return nil, err
	}

	models, err := r.financeCostModels(ctx, start)
	if err != nil {
		return nil, err
	}
	trends, err := r.financeCostTrends(ctx, start, days)
	if err != nil {
		return nil, err
	}

	grossProfit := taskRevenue - modelCost
	return map[string]any{
		"summary": map[string]any{
			"paidAmount":         paidAmount,
			"paidOrders":         paidOrders,
			"taskRevenue":        taskRevenue,
			"modelCost":          modelCost,
			"grossProfit":        grossProfit,
			"grossProfitRate":    financeProfitRate(taskRevenue, modelCost),
			"cashMinusModelCost": paidAmount - modelCost,
			"successTasks":       successTasks,
			"images":             images,
		},
		"models": models,
		"trends": trends,
	}, nil
}

func (r *Repository) financeCostModels(ctx context.Context, start time.Time) ([]map[string]any, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT COALESCE(generation_tasks.model_id, '') AS model_id,
			COALESCE(ai_models.model_name, generation_tasks.model_id, '未知模型') AS model_name,
			COALESCE(ai_models.display_name, '') AS display_name,
			COUNT(*) AS success_tasks,
			COALESCE(SUM(generation_tasks.quantity), 0) AS images,
			COALESCE(SUM(generation_tasks.cost_credits), 0) AS task_revenue,
			COALESCE(SUM(generation_tasks.model_cost_credits), 0) AS model_cost
		FROM generation_tasks
		LEFT JOIN ai_models ON ai_models.id = generation_tasks.model_id
		WHERE generation_tasks.status = 'success'
			AND generation_tasks.created_at >= ?
		GROUP BY generation_tasks.model_id, ai_models.model_name, ai_models.display_name
		ORDER BY task_revenue DESC
		LIMIT 100
	`, start)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var modelID, modelName, displayName string
		var successTasks, images int
		var revenue, cost float64
		if err := rows.Scan(&modelID, &modelName, &displayName, &successTasks, &images, &revenue, &cost); err != nil {
			return nil, err
		}
		grossProfit := revenue - cost
		items = append(items, map[string]any{
			"modelId":         modelID,
			"modelName":       modelName,
			"displayName":     displayName,
			"successTasks":    successTasks,
			"images":          images,
			"taskRevenue":     revenue,
			"modelCost":       cost,
			"grossProfit":     grossProfit,
			"grossProfitRate": financeProfitRate(revenue, cost),
		})
	}
	return items, rows.Err()
}

type financeTrendRow struct {
	day         string
	paidOrders  int
	paidAmount  float64
	successTasks int
	images      int
	taskRevenue float64
	modelCost   float64
}

func (r *Repository) financeCostTrends(ctx context.Context, start time.Time, days int) ([]map[string]any, error) {
	byDay := map[string]*financeTrendRow{}
	for index := 0; index < days; index++ {
		day := start.AddDate(0, 0, index).Format("2006-01-02")
		byDay[day] = &financeTrendRow{day: day}
	}

	orderRows, err := r.db.QueryContext(ctx, `
		SELECT DATE(COALESCE(paid_at, updated_at, created_at)) AS day,
			COUNT(*) AS paid_orders,
			COALESCE(SUM(amount), 0) AS paid_amount
		FROM recharge_orders
		WHERE status = 'paid'
			AND COALESCE(paid_at, updated_at, created_at) >= ?
		GROUP BY DATE(COALESCE(paid_at, updated_at, created_at))
	`, start)
	if err != nil {
		return nil, err
	}
	for orderRows.Next() {
		var day time.Time
		var paidOrders int
		var paidAmount float64
		if err := orderRows.Scan(&day, &paidOrders, &paidAmount); err != nil {
			orderRows.Close()
			return nil, err
		}
		key := day.Format("2006-01-02")
		if item := byDay[key]; item != nil {
			item.paidOrders = paidOrders
			item.paidAmount = paidAmount
		}
	}
	if err := orderRows.Close(); err != nil {
		return nil, err
	}
	if err := orderRows.Err(); err != nil {
		return nil, err
	}

	taskRows, err := r.db.QueryContext(ctx, `
		SELECT DATE(created_at) AS day,
			COUNT(*) AS success_tasks,
			COALESCE(SUM(quantity), 0) AS images,
			COALESCE(SUM(cost_credits), 0) AS task_revenue,
			COALESCE(SUM(model_cost_credits), 0) AS model_cost
		FROM generation_tasks
		WHERE status = 'success'
			AND created_at >= ?
		GROUP BY DATE(created_at)
	`, start)
	if err != nil {
		return nil, err
	}
	for taskRows.Next() {
		var day time.Time
		var successTasks, images int
		var revenue, cost float64
		if err := taskRows.Scan(&day, &successTasks, &images, &revenue, &cost); err != nil {
			taskRows.Close()
			return nil, err
		}
		key := day.Format("2006-01-02")
		if item := byDay[key]; item != nil {
			item.successTasks = successTasks
			item.images = images
			item.taskRevenue = revenue
			item.modelCost = cost
		}
	}
	if err := taskRows.Close(); err != nil {
		return nil, err
	}
	if err := taskRows.Err(); err != nil {
		return nil, err
	}

	items := make([]map[string]any, 0, days)
	for index := 0; index < days; index++ {
		day := start.AddDate(0, 0, index).Format("2006-01-02")
		item := byDay[day]
		grossProfit := item.taskRevenue - item.modelCost
		items = append(items, map[string]any{
			"day":             day,
			"paidOrders":      item.paidOrders,
			"paidAmount":      item.paidAmount,
			"successTasks":    item.successTasks,
			"images":          item.images,
			"taskRevenue":     item.taskRevenue,
			"modelCost":       item.modelCost,
			"grossProfit":     grossProfit,
			"grossProfitRate": financeProfitRate(item.taskRevenue, item.modelCost),
		})
	}
	return items, nil
}

func financeProfitRate(revenue float64, cost float64) float64 {
	if revenue <= 0 {
		return 0
	}
	return (revenue - cost) / revenue * 100
}

func (r *Repository) Products(ctx context.Context, activeOnly bool) ([]RechargeProduct, error) {
	query := `SELECT id, name, amount, credits, badge, sort_order, status, created_at, updated_at FROM recharge_products`
	if activeOnly {
		query += ` WHERE status='active'`
	}
	query += ` ORDER BY sort_order ASC, amount ASC`
	rows, err := r.db.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []RechargeProduct{}
	for rows.Next() {
		item, err := scanProduct(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (r *Repository) SaveProduct(ctx context.Context, item RechargeProduct) (*RechargeProduct, error) {
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO recharge_products (id, name, amount, credits, badge, sort_order, status)
		VALUES (?, ?, ?, ?, ?, ?, ?)
		ON DUPLICATE KEY UPDATE name=VALUES(name), amount=VALUES(amount), credits=VALUES(credits),
			badge=VALUES(badge), sort_order=VALUES(sort_order), status=VALUES(status), updated_at=CURRENT_TIMESTAMP
	`, item.ID, item.Name, item.Amount, item.Credits, item.Badge, item.SortOrder, defaultStatus(item.Status))
	if err != nil {
		return nil, err
	}
	return r.FindProduct(ctx, item.ID)
}

func (r *Repository) FindProduct(ctx context.Context, id string) (*RechargeProduct, error) {
	row := r.db.QueryRowContext(ctx, `SELECT id, name, amount, credits, badge, sort_order, status, created_at, updated_at FROM recharge_products WHERE id=? LIMIT 1`, id)
	item, err := scanProduct(row)
	return &item, err
}

func (r *Repository) DeleteProduct(ctx context.Context, id string) (bool, error) {
	result, err := r.db.ExecContext(ctx, `DELETE FROM recharge_products WHERE id=?`, id)
	return affected(result, err)
}

func (r *Repository) Plans(ctx context.Context, activeOnly bool) ([]SubscriptionPlan, error) {
	query := `SELECT id, name, description, amount, duration_days, bonus_credits, discount_percent, allowed_provider_ids, allowed_model_ids, badge, sort_order, status, created_at, updated_at FROM subscription_plans`
	if activeOnly {
		query += ` WHERE status='active'`
	}
	query += ` ORDER BY sort_order ASC, amount ASC`
	rows, err := r.db.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []SubscriptionPlan{}
	for rows.Next() {
		item, err := scanPlan(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (r *Repository) SavePlan(ctx context.Context, item SubscriptionPlan) (*SubscriptionPlan, error) {
	providersJSON, _ := json.Marshal(item.AllowedProviderIDs)
	modelsJSON, _ := json.Marshal(item.AllowedModelIDs)
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO subscription_plans (id, name, description, amount, duration_days, bonus_credits, discount_percent, allowed_provider_ids, allowed_model_ids, badge, sort_order, status)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON DUPLICATE KEY UPDATE name=VALUES(name), description=VALUES(description), amount=VALUES(amount), duration_days=VALUES(duration_days),
			bonus_credits=VALUES(bonus_credits), discount_percent=VALUES(discount_percent), allowed_provider_ids=VALUES(allowed_provider_ids),
			allowed_model_ids=VALUES(allowed_model_ids), badge=VALUES(badge), sort_order=VALUES(sort_order), status=VALUES(status), updated_at=CURRENT_TIMESTAMP
	`, item.ID, item.Name, item.Description, item.Amount, item.DurationDays, item.BonusCredits, item.DiscountPercent, string(providersJSON), string(modelsJSON), item.Badge, item.SortOrder, defaultStatus(item.Status))
	if err != nil {
		return nil, err
	}
	return r.FindPlan(ctx, item.ID)
}

func (r *Repository) FindPlan(ctx context.Context, id string) (*SubscriptionPlan, error) {
	row := r.db.QueryRowContext(ctx, `SELECT id, name, description, amount, duration_days, bonus_credits, discount_percent, allowed_provider_ids, allowed_model_ids, badge, sort_order, status, created_at, updated_at FROM subscription_plans WHERE id=? LIMIT 1`, id)
	item, err := scanPlan(row)
	return &item, err
}

func (r *Repository) DeletePlan(ctx context.Context, id string) (bool, error) {
	result, err := r.db.ExecContext(ctx, `DELETE FROM subscription_plans WHERE id=?`, id)
	return affected(result, err)
}

func (r *Repository) CurrentSubscription(ctx context.Context, userID string) (map[string]any, error) {
	row := r.db.QueryRowContext(ctx, `
		SELECT user_subscriptions.id, user_subscriptions.status, user_subscriptions.started_at, user_subscriptions.expires_at,
			subscription_plans.id, subscription_plans.name, subscription_plans.discount_percent
		FROM user_subscriptions
		LEFT JOIN subscription_plans ON subscription_plans.id = user_subscriptions.plan_id
		WHERE user_subscriptions.user_id = ? AND user_subscriptions.status='active' AND user_subscriptions.expires_at > NOW()
		LIMIT 1
	`, userID)
	var id, status, planID, planName string
	var started, expires time.Time
	var discount float64
	if err := row.Scan(&id, &status, &started, &expires, &planID, &planName, &discount); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return map[string]any{"id": id, "status": status, "startedAt": started.In(time.Local).Format(time.RFC3339), "expiresAt": expires.In(time.Local).Format(time.RFC3339), "plan": map[string]any{"id": planID, "name": planName, "discountPercent": discount}}, nil
}

func (r *Repository) RedeemCodes(ctx context.Context, input PageInput) ([]RedeemCode, int, error) {
	_, pageSize, offset := normalizePage(input.Page, input.PageSize)
	where := []string{}
	args := []any{}
	if input.Keyword != "" {
		where = append(where, "(redeem_codes.code LIKE ? OR redeem_codes.remark LIKE ? OR users.email LIKE ?)")
		like := "%" + strings.TrimSpace(input.Keyword) + "%"
		args = append(args, like, like, like)
	}
	if input.Status != "" && input.Status != "all" {
		where = append(where, "redeem_codes.status = ?")
		args = append(args, input.Status)
	}
	whereSQL := buildWhere(where)
	total, err := r.countWithArgs(ctx, `SELECT COUNT(*) FROM redeem_codes LEFT JOIN users ON users.id=redeem_codes.user_id `+whereSQL, args)
	if err != nil {
		return nil, 0, err
	}
	rows, err := r.db.QueryContext(ctx, `
		SELECT redeem_codes.id, redeem_codes.code, redeem_codes.credits, redeem_codes.status, redeem_codes.remark,
			redeem_codes.user_id, users.email, redeem_codes.used_at, redeem_codes.expires_at, redeem_codes.created_at, redeem_codes.updated_at
		FROM redeem_codes LEFT JOIN users ON users.id=redeem_codes.user_id
		`+whereSQL+` ORDER BY redeem_codes.created_at DESC LIMIT ? OFFSET ?
	`, append(args, pageSize, offset)...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	items := []RedeemCode{}
	for rows.Next() {
		item, err := scanRedeemCode(rows)
		if err != nil {
			return nil, 0, err
		}
		items = append(items, item)
	}
	return items, total, rows.Err()
}

func (r *Repository) SaveRedeemCode(ctx context.Context, item RedeemCode) (*RedeemCode, error) {
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO redeem_codes (id, code, credits, status, remark, expires_at)
		VALUES (?, ?, ?, ?, ?, ?)
		ON DUPLICATE KEY UPDATE code=VALUES(code), credits=VALUES(credits), status=VALUES(status), remark=VALUES(remark), expires_at=VALUES(expires_at), updated_at=CURRENT_TIMESTAMP
	`, item.ID, strings.TrimSpace(item.Code), item.Credits, defaultStatus(item.Status), item.Remark, parseOptionalTime(item.ExpiresAt))
	if err != nil {
		return nil, err
	}
	found, _, err := r.RedeemCodes(ctx, PageInput{Keyword: item.Code, Page: 1, PageSize: 1})
	if err != nil || len(found) == 0 {
		return nil, err
	}
	return &found[0], nil
}

func (r *Repository) DeleteRedeemCode(ctx context.Context, id string) (bool, error) {
	result, err := r.db.ExecContext(ctx, `DELETE FROM redeem_codes WHERE id=?`, id)
	return affected(result, err)
}

func (r *Repository) Redeem(ctx context.Context, code string, userID string, ip string) (float64, float64, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return 0, 0, err
	}
	defer tx.Rollback()
	var id, status string
	var credits, balance float64
	var expires sql.NullTime
	if err := tx.QueryRowContext(ctx, `SELECT id, credits, status, expires_at FROM redeem_codes WHERE code=? FOR UPDATE`, code).Scan(&id, &credits, &status, &expires); err != nil {
		return 0, 0, err
	}
	if status != "active" || (expires.Valid && expires.Time.Before(time.Now())) {
		return 0, 0, sql.ErrNoRows
	}
	if err := tx.QueryRowContext(ctx, `SELECT credits FROM users WHERE id=? FOR UPDATE`, userID).Scan(&balance); err != nil {
		return 0, 0, err
	}
	next := balance + credits
	if _, err := tx.ExecContext(ctx, `UPDATE users SET credits=? WHERE id=?`, next, userID); err != nil {
		return 0, 0, err
	}
	if _, err := tx.ExecContext(ctx, `UPDATE redeem_codes SET status='used', user_id=?, used_at=NOW() WHERE id=?`, userID, id); err != nil {
		return 0, 0, err
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO credit_logs (id, user_id, type, amount, balance_after, remark) VALUES (?, ?, 'recharge', ?, ?, ?)`, newOperationID(), userID, credits, next, "兑换码充值 "+code+" / "+ip); err != nil {
		return 0, 0, err
	}
	return credits, next, tx.Commit()
}

func (r *Repository) CheckinStatus(ctx context.Context, userID string) (map[string]any, error) {
	var checked int
	_ = r.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM user_checkins WHERE user_id=? AND checkin_date=CURDATE()`, userID).Scan(&checked)
	var streak int
	rows, err := r.db.QueryContext(ctx, `SELECT checkin_date FROM user_checkins WHERE user_id=? ORDER BY checkin_date DESC LIMIT 30`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	expected := time.Now().Format("2006-01-02")
	for rows.Next() {
		var date time.Time
		if err := rows.Scan(&date); err != nil {
			return nil, err
		}
		if date.Format("2006-01-02") != expected {
			break
		}
		streak++
		expected = date.AddDate(0, 0, -1).Format("2006-01-02")
	}
	return map[string]any{"checkedToday": checked > 0, "streak": streak}, rows.Err()
}

func (r *Repository) Checkin(ctx context.Context, userID string, reward float64, ip string) (map[string]any, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	var balance float64
	if err := tx.QueryRowContext(ctx, `SELECT credits FROM users WHERE id=? FOR UPDATE`, userID).Scan(&balance); err != nil {
		return nil, err
	}
	id := newOperationID()
	if _, err := tx.ExecContext(ctx, `INSERT INTO user_checkins (id, user_id, reward_credits, checkin_date, user_ip) VALUES (?, ?, ?, CURDATE(), ?)`, id, userID, reward, ip); err != nil {
		return nil, err
	}
	next := balance + reward
	if _, err := tx.ExecContext(ctx, `UPDATE users SET credits=? WHERE id=?`, next, userID); err != nil {
		return nil, err
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO credit_logs (id, user_id, type, amount, balance_after, remark) VALUES (?, ?, 'recharge', ?, ?, '每日签到')`, newOperationID(), userID, reward, next); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return map[string]any{"id": id, "rewardCredits": reward, "balanceAfter": next}, nil
}

func (r *Repository) Checkins(ctx context.Context, input PageInput) ([]Checkin, int, error) {
	_, pageSize, offset := normalizePage(input.Page, input.PageSize)
	total, err := r.count(ctx, `SELECT COUNT(*) FROM user_checkins`)
	if err != nil {
		return nil, 0, err
	}
	rows, err := r.db.QueryContext(ctx, `
		SELECT user_checkins.id, user_checkins.user_id, users.email, user_checkins.reward_credits, user_checkins.checkin_date, user_checkins.user_ip, user_checkins.created_at
		FROM user_checkins LEFT JOIN users ON users.id=user_checkins.user_id
		ORDER BY user_checkins.created_at DESC LIMIT ? OFFSET ?
	`, pageSize, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	items := []Checkin{}
	for rows.Next() {
		item, err := scanCheckin(rows)
		if err != nil {
			return nil, 0, err
		}
		items = append(items, item)
	}
	return items, total, rows.Err()
}

func (r *Repository) DeleteCheckin(ctx context.Context, id string) (bool, error) {
	result, err := r.db.ExecContext(ctx, `DELETE FROM user_checkins WHERE id=?`, id)
	return affected(result, err)
}

func (r *Repository) Invites(ctx context.Context, input PageInput) ([]Invite, int, error) {
	_, pageSize, offset := normalizePage(input.Page, input.PageSize)
	total, err := r.count(ctx, `SELECT COUNT(*) FROM user_invites`)
	if err != nil {
		return nil, 0, err
	}
	rows, err := r.db.QueryContext(ctx, `
		SELECT user_invites.id, user_invites.inviter_id, inviter.email, user_invites.invitee_id, invitee.email,
			user_invites.reward_credits, user_invites.invitee_ip, user_invites.created_at
		FROM user_invites
		LEFT JOIN users inviter ON inviter.id=user_invites.inviter_id
		LEFT JOIN users invitee ON invitee.id=user_invites.invitee_id
		ORDER BY user_invites.created_at DESC LIMIT ? OFFSET ?
	`, pageSize, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	items := []Invite{}
	for rows.Next() {
		item, err := scanInvite(rows)
		if err != nil {
			return nil, 0, err
		}
		items = append(items, item)
	}
	return items, total, rows.Err()
}

func (r *Repository) InviteSummary(ctx context.Context, userID string) (map[string]any, error) {
	var count int
	var reward float64
	_ = r.db.QueryRowContext(ctx, `SELECT COUNT(*), COALESCE(SUM(reward_credits),0) FROM user_invites WHERE inviter_id=?`, userID).Scan(&count, &reward)
	return map[string]any{"inviteCount": count, "rewardCredits": reward}, nil
}

func (r *Repository) DeleteInvite(ctx context.Context, id string) (bool, error) {
	result, err := r.db.ExecContext(ctx, `DELETE FROM user_invites WHERE id=?`, id)
	return affected(result, err)
}

func (r *Repository) Orders(ctx context.Context, input PageInput) ([]RechargeOrder, int, error) {
	_, pageSize, offset := normalizePage(input.Page, input.PageSize)
	where := []string{}
	args := []any{}
	if input.Status != "" && input.Status != "all" {
		where = append(where, "recharge_orders.status=?")
		args = append(args, input.Status)
	}
	whereSQL := buildWhere(where)
	total, err := r.countWithArgs(ctx, `SELECT COUNT(*) FROM recharge_orders LEFT JOIN users ON users.id=recharge_orders.user_id `+whereSQL, args)
	if err != nil {
		return nil, 0, err
	}
	rows, err := r.db.QueryContext(ctx, `
		SELECT recharge_orders.id, recharge_orders.user_id, users.email, recharge_orders.out_trade_no, recharge_orders.trade_no,
			recharge_orders.order_type, recharge_orders.subscription_plan_id, recharge_orders.amount, recharge_orders.credits,
			recharge_orders.status, recharge_orders.pay_url, recharge_orders.qr_code, recharge_orders.paid_at, recharge_orders.created_at, recharge_orders.updated_at
		FROM recharge_orders LEFT JOIN users ON users.id=recharge_orders.user_id
		`+whereSQL+` ORDER BY recharge_orders.created_at DESC LIMIT ? OFFSET ?
	`, append(args, pageSize, offset)...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	items := []RechargeOrder{}
	for rows.Next() {
		item, err := scanOrder(rows)
		if err != nil {
			return nil, 0, err
		}
		items = append(items, item)
	}
	return items, total, rows.Err()
}

func (r *Repository) CreateOrder(ctx context.Context, order RechargeOrder) (*RechargeOrder, error) {
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO recharge_orders (id, user_id, out_trade_no, order_type, subscription_plan_id, amount, credits, status, pay_url, qr_code)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, order.ID, order.UserID, order.OutTradeNo, defaultString(order.OrderType, "recharge"), order.SubscriptionPlanID, order.Amount, order.Credits, defaultString(order.Status, "pending"), order.PayURL, order.QRCode)
	if err != nil {
		return nil, err
	}
	return r.FindOrder(ctx, order.ID)
}

func (r *Repository) FindOrder(ctx context.Context, id string) (*RechargeOrder, error) {
	rows, total, err := r.Orders(ctx, PageInput{Page: 1, PageSize: 1})
	if err != nil {
		return nil, err
	}
	_ = total
	for _, item := range rows {
		if item.ID == id {
			return &item, nil
		}
	}
	row := r.db.QueryRowContext(ctx, `
		SELECT recharge_orders.id, recharge_orders.user_id, users.email, recharge_orders.out_trade_no, recharge_orders.trade_no,
			recharge_orders.order_type, recharge_orders.subscription_plan_id, recharge_orders.amount, recharge_orders.credits,
			recharge_orders.status, recharge_orders.pay_url, recharge_orders.qr_code, recharge_orders.paid_at, recharge_orders.created_at, recharge_orders.updated_at
		FROM recharge_orders LEFT JOIN users ON users.id=recharge_orders.user_id WHERE recharge_orders.id=? LIMIT 1
	`, id)
	item, err := scanOrder(row)
	return &item, err
}

func (r *Repository) FindOrderByOutTradeNo(ctx context.Context, outTradeNo string) (*RechargeOrder, error) {
	row := r.db.QueryRowContext(ctx, `
		SELECT recharge_orders.id, recharge_orders.user_id, users.email, recharge_orders.out_trade_no, recharge_orders.trade_no,
			recharge_orders.order_type, recharge_orders.subscription_plan_id, recharge_orders.amount, recharge_orders.credits,
			recharge_orders.status, recharge_orders.pay_url, recharge_orders.qr_code, recharge_orders.paid_at, recharge_orders.created_at, recharge_orders.updated_at
		FROM recharge_orders LEFT JOIN users ON users.id=recharge_orders.user_id WHERE recharge_orders.out_trade_no=? LIMIT 1
	`, strings.TrimSpace(outTradeNo))
	item, err := scanOrder(row)
	return &item, err
}

func (r *Repository) CompleteOrder(ctx context.Context, outTradeNo string, tradeNo string) (*RechargeOrder, bool, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, false, err
	}
	defer tx.Rollback()
	var order RechargeOrder
	var email, trade, plan, payURL, qr sql.NullString
	var paid sql.NullTime
	var created, updated time.Time
	err = tx.QueryRowContext(ctx, `
		SELECT recharge_orders.id, recharge_orders.user_id, users.email, recharge_orders.out_trade_no, recharge_orders.trade_no,
			recharge_orders.order_type, recharge_orders.subscription_plan_id, recharge_orders.amount, recharge_orders.credits,
			recharge_orders.status, recharge_orders.pay_url, recharge_orders.qr_code, recharge_orders.paid_at, recharge_orders.created_at, recharge_orders.updated_at
		FROM recharge_orders LEFT JOIN users ON users.id=recharge_orders.user_id
		WHERE recharge_orders.out_trade_no=? FOR UPDATE
	`, strings.TrimSpace(outTradeNo)).Scan(&order.ID, &order.UserID, &email, &order.OutTradeNo, &trade, &order.OrderType, &plan, &order.Amount, &order.Credits, &order.Status, &payURL, &qr, &paid, &created, &updated)
	if err != nil {
		return nil, false, err
	}
	order.UserEmail = nullString(email)
	order.TradeNo = nullString(trade)
	order.SubscriptionPlanID = nullString(plan)
	order.PayURL = nullString(payURL)
	order.QRCode = nullString(qr)
	order.PaidAt = nullTime(paid)
	order.CreatedAt = created.In(time.Local).Format(time.RFC3339)
	order.UpdatedAt = updated.In(time.Local).Format(time.RFC3339)
	if order.Status == "paid" {
		if err := tx.Commit(); err != nil {
			return nil, false, err
		}
		return &order, false, nil
	}
	var balance float64
	if err := tx.QueryRowContext(ctx, `SELECT credits FROM users WHERE id=? FOR UPDATE`, order.UserID).Scan(&balance); err != nil {
		return nil, false, err
	}
	next := balance + order.Credits
	now := time.Now()
	if _, err := tx.ExecContext(ctx, `UPDATE recharge_orders SET status='paid', trade_no=?, paid_at=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`, strings.TrimSpace(tradeNo), now, order.ID); err != nil {
		return nil, false, err
	}
	if order.OrderType == "subscription" && order.SubscriptionPlanID != nil && *order.SubscriptionPlanID != "" {
		plan, err := r.FindPlan(ctx, *order.SubscriptionPlanID)
		if err != nil {
			return nil, false, err
		}
		if _, err := tx.ExecContext(ctx, `UPDATE user_subscriptions SET status='expired' WHERE user_id=? AND status='active'`, order.UserID); err != nil {
			return nil, false, err
		}
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO user_subscriptions (id, user_id, plan_id, status, started_at, expires_at)
			VALUES (?, ?, ?, 'active', ?, ?)
		`, newOperationID(), order.UserID, plan.ID, now, now.AddDate(0, 0, plan.DurationDays)); err != nil {
			return nil, false, err
		}
		next = balance + plan.BonusCredits
		if plan.BonusCredits > 0 {
			if _, err := tx.ExecContext(ctx, `UPDATE users SET credits=? WHERE id=?`, next, order.UserID); err != nil {
				return nil, false, err
			}
			if _, err := tx.ExecContext(ctx, `INSERT INTO credit_logs (id, user_id, type, amount, balance_after, remark) VALUES (?, ?, 'recharge', ?, ?, ?)`, newOperationID(), order.UserID, plan.BonusCredits, next, "订阅套餐赠送 "+plan.Name); err != nil {
				return nil, false, err
			}
		}
	} else {
		if _, err := tx.ExecContext(ctx, `UPDATE users SET credits=? WHERE id=?`, next, order.UserID); err != nil {
			return nil, false, err
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO credit_logs (id, user_id, type, amount, balance_after, remark) VALUES (?, ?, 'recharge', ?, ?, ?)`, newOperationID(), order.UserID, order.Credits, next, "支付宝充值 "+order.OutTradeNo); err != nil {
			return nil, false, err
		}
	}
	if err := tx.Commit(); err != nil {
		return nil, false, err
	}
	updatedOrder, err := r.FindOrder(ctx, order.ID)
	return updatedOrder, true, err
}

func (r *Repository) APILogs(ctx context.Context, input PageInput) ([]APICallLog, int, error) {
	_, pageSize, offset := normalizePage(input.Page, input.PageSize)
	where := []string{"api_call_logs.phase <> ?"}
	args := []any{apiLogMonitorPhase}
	if input.Keyword != "" {
		where = append(where, "(api_call_logs.endpoint LIKE ? OR api_call_logs.phase LIKE ? OR api_call_logs.error_message LIKE ? OR users.email LIKE ?)")
		like := "%" + strings.TrimSpace(input.Keyword) + "%"
		args = append(args, like, like, like, like)
	}
	if input.Status != "" && input.Status != "all" {
		where = append(where, "api_call_logs.status=?")
		args = append(args, input.Status)
	}
	if strings.TrimSpace(input.APIKeyID) != "" {
		where = append(where, "api_call_logs.api_key_id=?")
		args = append(args, strings.TrimSpace(input.APIKeyID))
	}
	whereSQL := buildWhere(where)
	total, err := r.countWithArgs(ctx, `SELECT COUNT(*) FROM api_call_logs LEFT JOIN users ON users.id=api_call_logs.user_id `+whereSQL, args)
	if err != nil {
		return nil, 0, err
	}
	rows, err := r.db.QueryContext(ctx, `
		SELECT api_call_logs.id, api_call_logs.direction, api_call_logs.task_id, api_call_logs.user_id, users.email,
			api_call_logs.api_key_id, api_call_logs.api_key_name, api_call_logs.provider_id, api_providers.name,
			api_call_logs.provider_type, api_call_logs.endpoint, api_call_logs.phase, api_call_logs.method,
			api_call_logs.status, api_call_logs.status_code, api_call_logs.duration_ms,
			api_call_logs.request_summary, api_call_logs.response_summary, api_call_logs.error_message, api_call_logs.created_at
		FROM api_call_logs
		LEFT JOIN users ON users.id=api_call_logs.user_id
		LEFT JOIN api_providers ON api_providers.id=api_call_logs.provider_id
		`+whereSQL+` ORDER BY api_call_logs.created_at DESC LIMIT ? OFFSET ?
	`, append(args, pageSize, offset)...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	items := []APICallLog{}
	for rows.Next() {
		item, err := scanAPILog(rows)
		if err != nil {
			return nil, 0, err
		}
		items = append(items, item)
	}
	return items, total, rows.Err()
}

func (r *Repository) FindAPILog(ctx context.Context, id string) (*APICallLog, error) {
	row := r.db.QueryRowContext(ctx, `
		SELECT api_call_logs.id, api_call_logs.direction, api_call_logs.task_id, api_call_logs.user_id, users.email,
			api_call_logs.api_key_id, api_call_logs.api_key_name, api_call_logs.provider_id, api_providers.name,
			api_call_logs.provider_type, api_call_logs.endpoint, api_call_logs.phase, api_call_logs.method,
			api_call_logs.status, api_call_logs.status_code, api_call_logs.duration_ms,
			api_call_logs.request_summary, api_call_logs.response_summary, api_call_logs.error_message, api_call_logs.created_at
		FROM api_call_logs
		LEFT JOIN users ON users.id=api_call_logs.user_id
		LEFT JOIN api_providers ON api_providers.id=api_call_logs.provider_id
		WHERE api_call_logs.id = ?
		LIMIT 1
	`, id)
	item, err := scanAPILog(row)
	if err != nil {
		return nil, err
	}
	return &item, nil
}

func (r *Repository) APILogStats(ctx context.Context) (map[string]any, error) {
	var total, success, failed int
	_ = r.db.QueryRowContext(ctx, `SELECT COUNT(*), COALESCE(SUM(status='success'),0), COALESCE(SUM(status='failed'),0) FROM api_call_logs WHERE phase <> ?`, apiLogMonitorPhase).Scan(&total, &success, &failed)
	return map[string]any{"total": total, "success": success, "failed": failed}, nil
}

func (r *Repository) CleanupAPILogs(ctx context.Context, days int) (int64, error) {
	if days < 1 {
		days = 30
	}
	result, err := r.db.ExecContext(ctx, `DELETE FROM api_call_logs WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)`, days)
	if err != nil {
		return 0, err
	}
	return result.RowsAffected()
}

func (r *Repository) PublicServiceStatus(ctx context.Context) (map[string]any, error) {
	overall, err := r.serviceStatusWindow(ctx, 24*time.Hour)
	if err != nil {
		return nil, err
	}
	weekly, err := r.serviceStatusWindow(ctx, 7*24*time.Hour)
	if err != nil {
		return nil, err
	}
	providers, err := r.serviceStatusProviders(ctx)
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"overall":   overall,
		"weekly":    weekly,
		"providers": providers,
	}, nil
}

func (r *Repository) serviceStatusWindow(ctx context.Context, window time.Duration) (map[string]any, error) {
	var total, success, failed, slow int
	var avg, max sql.NullFloat64
	var last sql.NullTime
	hours := int(window.Hours())
	if hours < 1 {
		hours = 24
	}
	err := r.db.QueryRowContext(ctx, `
		SELECT COUNT(*),
			COALESCE(SUM(status='success'),0),
			COALESCE(SUM(status='failed'),0),
			COALESCE(SUM(duration_ms >= ?),0),
			AVG(duration_ms),
			MAX(duration_ms),
			MAX(created_at)
		FROM api_call_logs
		WHERE direction = 'upstream'
			AND phase = ?
			AND created_at >= DATE_SUB(NOW(), INTERVAL ? HOUR)
	`, publicSlowRequestMs, apiLogMonitorPhase, hours).Scan(&total, &success, &failed, &slow, &avg, &max, &last)
	if err != nil {
		return nil, err
	}
	return serviceStatusMetric(total, success, failed, slow, avg, max, last), nil
}

func (r *Repository) serviceStatusProviders(ctx context.Context) ([]map[string]any, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT
			api_providers.id,
			api_providers.name,
			api_providers.status,
			api_providers.type,
			COALESCE(model_summary.model_names, ''),
			COALESCE(log_summary.total, 0),
			COALESCE(log_summary.success, 0),
			COALESCE(log_summary.failed, 0),
			COALESCE(log_summary.slow, 0),
			log_summary.avg_duration_ms,
			log_summary.max_duration_ms,
			log_summary.last_checked_at
		FROM api_providers
		LEFT JOIN (
			SELECT provider_id, GROUP_CONCAT(DISTINCT display_name ORDER BY display_name SEPARATOR ', ') AS model_names
			FROM ai_models
			WHERE status = 'active' AND capability = 'chat_image'
			GROUP BY provider_id
		) model_summary ON model_summary.provider_id = api_providers.id
		LEFT JOIN (
			SELECT
				provider_id,
				COUNT(*) AS total,
				COALESCE(SUM(status='success'),0) AS success,
				COALESCE(SUM(status='failed'),0) AS failed,
				COALESCE(SUM(duration_ms >= ?),0) AS slow,
				AVG(duration_ms) AS avg_duration_ms,
				MAX(duration_ms) AS max_duration_ms,
				MAX(created_at) AS last_checked_at
			FROM api_call_logs
			WHERE direction = 'upstream'
				AND phase = ?
				AND provider_id IS NOT NULL
				AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
			GROUP BY provider_id
		) log_summary ON log_summary.provider_id = api_providers.id
		ORDER BY api_providers.status ASC, total DESC, api_providers.name ASC
	`, publicSlowRequestMs, apiLogMonitorPhase)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := []map[string]any{}
	for rows.Next() {
		var providerID, providerName, providerStatus, providerType, modelNames string
		var total, success, failed, slow int
		var avg, max sql.NullFloat64
		var last sql.NullTime
		if err := rows.Scan(&providerID, &providerName, &providerStatus, &providerType, &modelNames, &total, &success, &failed, &slow, &avg, &max, &last); err != nil {
			return nil, err
		}
		history, err := r.serviceStatusHistory(ctx, providerID)
		if err != nil {
			return nil, err
		}
		lastStatus := any(nil)
		lastDuration := 0
		if len(history) > 0 {
			lastItem := history[len(history)-1]
			lastStatus = lastItem["status"]
			if duration, ok := lastItem["durationMs"].(int); ok {
				lastDuration = duration
			}
		}
		item := serviceStatusMetric(total, success, failed, slow, avg, max, last)
		item["providerId"] = providerID
		item["providerName"] = providerName
		item["providerStatus"] = providerStatus
		item["providerType"] = providerType
		item["modelNames"] = splitProviderModelNames(modelNames)
		item["lastStatus"] = lastStatus
		item["lastDurationMs"] = lastDuration
		item["history"] = history
		items = append(items, item)
	}
	return items, rows.Err()
}

func (r *Repository) serviceStatusHistory(ctx context.Context, providerID string) ([]map[string]any, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT status, duration_ms, created_at
		FROM api_call_logs
		WHERE direction = 'upstream'
			AND phase = ?
			AND provider_id = ?
			AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
		ORDER BY created_at DESC, id DESC
		LIMIT 60
	`, apiLogMonitorPhase, providerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	reversed := []map[string]any{}
	for rows.Next() {
		var status string
		var duration int
		var created time.Time
		if err := rows.Scan(&status, &duration, &created); err != nil {
			return nil, err
		}
		reversed = append(reversed, map[string]any{
			"status":     status,
			"durationMs": duration,
			"createdAt":  created.In(time.Local).Format(time.RFC3339),
		})
	}
	for left, right := 0, len(reversed)-1; left < right; left, right = left+1, right-1 {
		reversed[left], reversed[right] = reversed[right], reversed[left]
	}
	return reversed, rows.Err()
}

func (r *Repository) count(ctx context.Context, query string) (int, error) {
	return r.countWithArgs(ctx, query, nil)
}

func (r *Repository) countWithArgs(ctx context.Context, query string, args []any) (int, error) {
	var total int
	err := r.db.QueryRowContext(ctx, query, args...).Scan(&total)
	return total, err
}

func normalizePage(page int, pageSize int) (int, int, int) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 {
		pageSize = 20
	}
	if pageSize > 100 {
		pageSize = 100
	}
	return page, pageSize, (page - 1) * pageSize
}

func buildWhere(conditions []string) string {
	if len(conditions) == 0 {
		return ""
	}
	return " WHERE " + strings.Join(conditions, " AND ")
}

func serviceStatusMetric(total, success, failed, slow int, avg, max sql.NullFloat64, last sql.NullTime) map[string]any {
	successRate := 0.0
	slowRate := 0.0
	if total > 0 {
		successRate = float64(success) / float64(total) * 100
		slowRate = float64(slow) / float64(total) * 100
	}
	return map[string]any{
		"total":         total,
		"success":       success,
		"failed":        failed,
		"successRate":   round2(successRate),
		"slow":          slow,
		"slowRate":      round2(slowRate),
		"avgDurationMs": nullFloat(avg),
		"maxDurationMs": nullFloat(max),
		"lastCheckedAt": nullTime(last),
	}
}

func splitProviderModelNames(value string) []string {
	if strings.TrimSpace(value) == "" {
		return []string{}
	}
	parts := strings.Split(value, ", ")
	if len(parts) > 3 {
		parts = parts[:3]
	}
	return parts
}

func nullFloat(value sql.NullFloat64) float64 {
	if !value.Valid {
		return 0
	}
	return value.Float64
}

func round2(value float64) float64 {
	return float64(int(value*100+0.5)) / 100
}

func scanCreditLog(row interface{ Scan(dest ...any) error }) (CreditLog, error) {
	var item CreditLog
	var userEmail, remark sql.NullString
	var createdAt time.Time
	err := row.Scan(&item.ID, &item.UserID, &userEmail, &item.Type, &item.Amount, &item.BalanceAfter, &remark, &createdAt)
	item.UserEmail = nullString(userEmail)
	item.Remark = nullString(remark)
	item.CreatedAt = createdAt.In(time.Local)
	item.CreatedAtISO = item.CreatedAt.Format(time.RFC3339)
	return item, err
}

func scanProduct(row interface{ Scan(dest ...any) error }) (RechargeProduct, error) {
	var item RechargeProduct
	var badge sql.NullString
	var created, updated time.Time
	err := row.Scan(&item.ID, &item.Name, &item.Amount, &item.Credits, &badge, &item.SortOrder, &item.Status, &created, &updated)
	item.Badge = nullString(badge)
	item.CreatedAt = created.In(time.Local).Format(time.RFC3339)
	item.UpdatedAt = updated.In(time.Local).Format(time.RFC3339)
	return item, err
}

func scanPlan(row interface{ Scan(dest ...any) error }) (SubscriptionPlan, error) {
	var item SubscriptionPlan
	var description, providers, models, badge sql.NullString
	var created, updated time.Time
	err := row.Scan(&item.ID, &item.Name, &description, &item.Amount, &item.DurationDays, &item.BonusCredits, &item.DiscountPercent, &providers, &models, &badge, &item.SortOrder, &item.Status, &created, &updated)
	item.Description = nullString(description)
	item.Badge = nullString(badge)
	item.AllowedProviderIDs = jsonStringList(providers.String)
	item.AllowedModelIDs = jsonStringList(models.String)
	item.CreatedAt = created.In(time.Local).Format(time.RFC3339)
	item.UpdatedAt = updated.In(time.Local).Format(time.RFC3339)
	return item, err
}

func scanRedeemCode(row interface{ Scan(dest ...any) error }) (RedeemCode, error) {
	var item RedeemCode
	var remark, userID, userEmail sql.NullString
	var used, expires sql.NullTime
	var created, updated time.Time
	err := row.Scan(&item.ID, &item.Code, &item.Credits, &item.Status, &remark, &userID, &userEmail, &used, &expires, &created, &updated)
	item.Remark = nullString(remark)
	item.UserID = nullString(userID)
	item.UserEmail = nullString(userEmail)
	item.UsedAt = nullTime(used)
	item.ExpiresAt = nullTime(expires)
	item.CreatedAt = created.In(time.Local).Format(time.RFC3339)
	item.UpdatedAt = updated.In(time.Local).Format(time.RFC3339)
	return item, err
}

func scanCheckin(row interface{ Scan(dest ...any) error }) (Checkin, error) {
	var item Checkin
	var email, ip sql.NullString
	var date, created time.Time
	err := row.Scan(&item.ID, &item.UserID, &email, &item.RewardCredits, &date, &ip, &created)
	item.UserEmail = nullString(email)
	item.UserIP = nullString(ip)
	item.CheckinDate = date.Format("2006-01-02")
	item.CreatedAt = created.In(time.Local).Format(time.RFC3339)
	return item, err
}

func scanInvite(row interface{ Scan(dest ...any) error }) (Invite, error) {
	var item Invite
	var inviter, invitee, ip sql.NullString
	var created time.Time
	err := row.Scan(&item.ID, &item.InviterID, &inviter, &item.InviteeID, &invitee, &item.RewardCredits, &ip, &created)
	item.InviterEmail = nullString(inviter)
	item.InviteeEmail = nullString(invitee)
	item.InviteeIP = nullString(ip)
	item.CreatedAt = created.In(time.Local).Format(time.RFC3339)
	return item, err
}

func scanOrder(row interface{ Scan(dest ...any) error }) (RechargeOrder, error) {
	var item RechargeOrder
	var email, trade, plan, payURL, qr sql.NullString
	var paid sql.NullTime
	var created, updated time.Time
	err := row.Scan(&item.ID, &item.UserID, &email, &item.OutTradeNo, &trade, &item.OrderType, &plan, &item.Amount, &item.Credits, &item.Status, &payURL, &qr, &paid, &created, &updated)
	item.UserEmail = nullString(email)
	item.TradeNo = nullString(trade)
	item.SubscriptionPlanID = nullString(plan)
	item.PayURL = nullString(payURL)
	item.QRCode = nullString(qr)
	item.PaidAt = nullTime(paid)
	item.CreatedAt = created.In(time.Local).Format(time.RFC3339)
	item.UpdatedAt = updated.In(time.Local).Format(time.RFC3339)
	return item, err
}

func scanAPILog(row interface{ Scan(dest ...any) error }) (APICallLog, error) {
	var item APICallLog
	var taskID, userID, userEmail, keyID, keyName, providerID, providerName, providerType, reqJSON, resJSON, errMsg sql.NullString
	var statusCode sql.NullInt64
	var created time.Time
	err := row.Scan(&item.ID, &item.Direction, &taskID, &userID, &userEmail, &keyID, &keyName, &providerID, &providerName, &providerType, &item.Endpoint, &item.Phase, &item.Method, &item.Status, &statusCode, &item.DurationMS, &reqJSON, &resJSON, &errMsg, &created)
	item.TaskID = nullString(taskID)
	item.UserID = nullString(userID)
	item.UserEmail = nullString(userEmail)
	item.APIKeyID = nullString(keyID)
	item.APIKeyName = nullString(keyName)
	item.ProviderID = nullString(providerID)
	item.ProviderName = nullString(providerName)
	item.ProviderType = nullString(providerType)
	item.ErrorMessage = nullString(errMsg)
	if statusCode.Valid {
		code := int(statusCode.Int64)
		item.StatusCode = &code
	}
	item.RequestSummary = jsonValue(reqJSON.String)
	item.ResponseSummary = jsonValue(resJSON.String)
	item.CreatedAt = created.In(time.Local).Format(time.RFC3339)
	return item, err
}

func nullString(value sql.NullString) *string {
	if !value.Valid {
		return nil
	}
	text := value.String
	return &text
}

func nullTime(value sql.NullTime) *string {
	if !value.Valid {
		return nil
	}
	text := value.Time.In(time.Local).Format(time.RFC3339)
	return &text
}

func jsonStringList(value string) []string {
	var items []string
	if err := json.Unmarshal([]byte(value), &items); err != nil {
		return []string{}
	}
	return items
}

func jsonValue(value string) any {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	var payload any
	if err := json.Unmarshal([]byte(value), &payload); err != nil {
		return value
	}
	return payload
}

func defaultStatus(value string) string {
	if value == "disabled" || value == "used" {
		return value
	}
	return "active"
}

func defaultString(value string, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return strings.TrimSpace(value)
}

func parseOptionalTime(value *string) any {
	if value == nil || strings.TrimSpace(*value) == "" {
		return nil
	}
	if t, err := time.Parse(time.RFC3339, strings.TrimSpace(*value)); err == nil {
		return t
	}
	if t, err := time.Parse("2006-01-02 15:04:05", strings.TrimSpace(*value)); err == nil {
		return t
	}
	if t, err := time.Parse("2006-01-02", strings.TrimSpace(*value)); err == nil {
		return t
	}
	return nil
}

func affected(result sql.Result, err error) (bool, error) {
	if err != nil {
		return false, err
	}
	rows, err := result.RowsAffected()
	return rows > 0, err
}
