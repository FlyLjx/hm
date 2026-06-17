package httpserver

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"strings"
	"time"

	"aipi-go/internal/apikeys"
	"aipi-go/internal/auth"
	"aipi-go/internal/operations"
	"aipi-go/internal/settings"
	"aipi-go/internal/tasks"
	"aipi-go/internal/users"
)

func (r *Router) userLogin(w http.ResponseWriter, req *http.Request) {
	if req.Method != http.MethodPost {
		writeMethodNotAllowed(w)
		return
	}
	var input struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := decodeJSON(req, &input); err != nil {
		writeError(w, newAppError(http.StatusBadRequest, "请求参数不正确"))
		return
	}
	input.Email = strings.TrimSpace(input.Email)
	if input.Email == "" || input.Password == "" {
		writeError(w, newAppError(http.StatusBadRequest, "请输入邮箱和密码"))
		return
	}
	ctx, cancel := context.WithTimeout(req.Context(), 5*time.Second)
	defer cancel()
	user, err := users.NewRepository(r.db).FindByEmail(ctx, input.Email)
	if errors.Is(err, sql.ErrNoRows) || user == nil || !auth.VerifyPassword(input.Password, user.PasswordHash) {
		writeError(w, newAppError(http.StatusUnauthorized, "邮箱或密码错误"))
		return
	}
	if err != nil {
		writeError(w, err)
		return
	}
	if user.Status != "active" {
		writeError(w, newAppError(http.StatusForbidden, "用户已被禁用"))
		return
	}
	token, err := r.tokens.CreateUserToken(user.ID)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"data": mergeUserToken(users.ToPublicUser(user), token),
	})
}

func (r *Router) userProfile(w http.ResponseWriter, req *http.Request) {
	path := strings.Trim(strings.TrimPrefix(req.URL.Path, "/api/users/"), "/")
	if strings.Contains(path, "/api-keys") {
		r.userAPIKeys(w, req, path)
		return
	}
	if strings.HasSuffix(path, "/public-details") {
		r.userDetails(w, req, strings.TrimSuffix(path, "/public-details"), true)
		return
	}
	if strings.HasSuffix(path, "/details") {
		r.userDetails(w, req, strings.TrimSuffix(path, "/details"), false)
		return
	}
	if strings.HasSuffix(path, "/password") {
		r.changeUserPassword(w, req, strings.TrimSuffix(path, "/password"))
		return
	}
	if strings.HasSuffix(path, "/status") {
		r.updateUserStatus(w, req, strings.TrimSuffix(path, "/status"))
		return
	}
	if strings.HasSuffix(path, "/recharge") {
		r.rechargeUser(w, req, strings.TrimSuffix(path, "/recharge"))
		return
	}
	if !strings.Contains(strings.Trim(path, "/"), "/") {
		switch req.Method {
		case http.MethodPatch:
			r.updateUser(w, req, strings.Trim(path, "/"))
			return
		case http.MethodDelete:
			r.deleteUser(w, req, strings.Trim(path, "/"))
			return
		}
	}
	if req.Method != http.MethodGet {
		writeMethodNotAllowed(w)
		return
	}
	id := strings.TrimSuffix(path, "/profile")
	id = strings.Trim(id, "/")
	if id == "" || strings.Contains(id, "/") {
		writeError(w, newAppError(http.StatusNotFound, "用户不存在"))
		return
	}
	ctx, cancel := context.WithTimeout(req.Context(), 5*time.Second)
	defer cancel()
	user, err := users.NewRepository(r.db).FindByID(ctx, id)
	if errors.Is(err, sql.ErrNoRows) || user == nil {
		writeError(w, newAppError(http.StatusNotFound, "用户不存在"))
		return
	}
	if err != nil {
		writeError(w, err)
		return
	}
	if user.Status != "active" {
		writeError(w, newAppError(http.StatusForbidden, "用户已被禁用"))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": users.ToPublicUser(user)})
}

func (r *Router) userDetails(w http.ResponseWriter, req *http.Request, id string, public bool) {
	if req.Method != http.MethodGet {
		writeMethodNotAllowed(w)
		return
	}
	id = strings.Trim(id, "/")
	if !public {
		if _, err := r.requireAdmin(req); err != nil {
			writeError(w, err)
			return
		}
	} else if req.URL.Query().Get("userId") != id {
		writeError(w, newAppError(http.StatusForbidden, "只能查看自己的账户明细"))
		return
	}
	ctx, cancel := context.WithTimeout(req.Context(), 8*time.Second)
	defer cancel()
	user, err := users.NewRepository(r.db).FindByID(ctx, id)
	if err != nil {
		writeError(w, err)
		return
	}
	taskItems, _, _ := tasks.NewRepository(r.db).FindByUserID(ctx, id, queryInt(req, "taskPage", 1), queryInt(req, "taskPageSize", 10))
	apiKeys, _ := apikeys.NewService(apikeys.NewRepository(r.db), users.NewRepository(r.db)).ListUserKeys(ctx, id)
	publicTasks := make([]tasks.PublicTask, 0, len(taskItems))
	for index := range taskItems {
		publicTasks = append(publicTasks, tasks.ToPublic(&taskItems[index]))
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": map[string]any{
		"user":                 users.ToPublicUser(user),
		"tasks":                publicTasks,
		"tasksPagination":      map[string]any{"total": len(publicTasks), "page": 1, "pageSize": len(publicTasks)},
		"creditLogs":           []any{},
		"creditLogsPagination": map[string]any{"total": 0, "page": 1, "pageSize": 10},
		"apiKeys":              apiKeys,
	}})
}

func (r *Router) changeUserPassword(w http.ResponseWriter, req *http.Request, id string) {
	if req.Method != http.MethodPatch {
		writeMethodNotAllowed(w)
		return
	}
	var input struct {
		UserID      string `json:"userId"`
		OldPassword string `json:"oldPassword"`
		Password    string `json:"password"`
	}
	if err := decodeCompatJSON(req, &input); err != nil {
		writeError(w, newAppError(http.StatusBadRequest, "请求参数不正确"))
		return
	}
	id = strings.Trim(id, "/")
	if input.UserID != id {
		writeError(w, newAppError(http.StatusForbidden, "只能修改自己的密码"))
		return
	}
	ctx, cancel := context.WithTimeout(req.Context(), 8*time.Second)
	defer cancel()
	repo := users.NewRepository(r.db)
	user, err := repo.FindByID(ctx, id)
	if err != nil {
		writeError(w, err)
		return
	}
	if !auth.VerifyPassword(input.OldPassword, user.PasswordHash) {
		writeError(w, newAppError(http.StatusBadRequest, "当前密码不正确"))
		return
	}
	updated, err := repo.UpdatePassword(ctx, id, auth.HashPassword(input.Password))
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": users.ToPublicUser(updated)})
}

func (r *Router) updateUserStatus(w http.ResponseWriter, req *http.Request, id string) {
	if req.Method != http.MethodPatch {
		writeMethodNotAllowed(w)
		return
	}
	if _, err := r.requireAdmin(req); err != nil {
		writeError(w, err)
		return
	}
	var input struct {
		Status string `json:"status"`
	}
	if err := decodeCompatJSON(req, &input); err != nil {
		writeError(w, newAppError(http.StatusBadRequest, "请求参数不正确"))
		return
	}
	if input.Status != "active" && input.Status != "disabled" {
		writeError(w, newAppError(http.StatusBadRequest, "状态不正确"))
		return
	}
	ctx, cancel := context.WithTimeout(req.Context(), 8*time.Second)
	defer cancel()
	user, err := users.NewRepository(r.db).FindByID(ctx, strings.Trim(id, "/"))
	if err != nil {
		writeError(w, err)
		return
	}
	user.Status = input.Status
	updated, err := users.NewRepository(r.db).Update(ctx, user.ID, *user)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": users.ToPublicUser(updated)})
}

func (r *Router) updateUser(w http.ResponseWriter, req *http.Request, id string) {
	if _, err := r.requireAdmin(req); err != nil {
		writeError(w, err)
		return
	}
	var input struct {
		Email    string  `json:"email"`
		Password string  `json:"password"`
		Credits  float64 `json:"credits"`
		Role     string  `json:"role"`
		Status   string  `json:"status"`
	}
	if err := decodeCompatJSON(req, &input); err != nil {
		writeError(w, newAppError(http.StatusBadRequest, "请求参数不正确"))
		return
	}
	ctx, cancel := context.WithTimeout(req.Context(), 8*time.Second)
	defer cancel()
	repo := users.NewRepository(r.db)
	user, err := repo.FindByID(ctx, id)
	if err != nil {
		writeError(w, err)
		return
	}
	if strings.TrimSpace(input.Email) != "" {
		user.Email = strings.TrimSpace(input.Email)
	}
	if input.Role == "admin" || input.Role == "user" {
		user.Role = input.Role
	}
	if input.Status == "active" || input.Status == "disabled" {
		user.Status = input.Status
	}
	user.Credits = input.Credits
	if strings.TrimSpace(input.Password) != "" {
		if _, err := repo.UpdatePassword(ctx, id, auth.HashPassword(input.Password)); err != nil {
			writeError(w, err)
			return
		}
	}
	updated, err := repo.Update(ctx, id, *user)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": users.ToPublicUser(updated)})
}

func (r *Router) deleteUser(w http.ResponseWriter, req *http.Request, id string) {
	if _, err := r.requireAdmin(req); err != nil {
		writeError(w, err)
		return
	}
	ctx, cancel := context.WithTimeout(req.Context(), 8*time.Second)
	defer cancel()
	deleted, err := users.NewRepository(r.db).Delete(ctx, id)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": map[string]any{"deleted": deleted}})
}

func (r *Router) rechargeUser(w http.ResponseWriter, req *http.Request, id string) {
	if req.Method != http.MethodPost {
		writeMethodNotAllowed(w)
		return
	}
	if _, err := r.requireAdmin(req); err != nil {
		writeError(w, err)
		return
	}
	var input struct {
		Amount float64 `json:"amount"`
		Remark string  `json:"remark"`
	}
	if err := decodeCompatJSON(req, &input); err != nil {
		writeError(w, newAppError(http.StatusBadRequest, "请求参数不正确"))
		return
	}
	ctx, cancel := context.WithTimeout(req.Context(), 8*time.Second)
	defer cancel()
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		writeError(w, err)
		return
	}
	defer tx.Rollback()
	var credits float64
	userID := strings.Trim(id, "/")
	if err := tx.QueryRowContext(ctx, `SELECT credits FROM users WHERE id = ? FOR UPDATE`, userID).Scan(&credits); err != nil {
		writeError(w, err)
		return
	}
	next := credits + input.Amount
	if next < 0 {
		writeError(w, newAppError(http.StatusBadRequest, "扣减额度不能超过当前余额"))
		return
	}
	if _, err := tx.ExecContext(ctx, `UPDATE users SET credits = ? WHERE id = ?`, next, userID); err != nil {
		writeError(w, err)
		return
	}
	logType := "recharge"
	amount := input.Amount
	if input.Amount < 0 {
		logType = "deduct"
		amount = -input.Amount
	}
	remark := defaultString(strings.TrimSpace(input.Remark), "后台调整额度")
	if _, err := tx.ExecContext(ctx, `INSERT INTO credit_logs (id, user_id, type, amount, balance_after, remark) VALUES (?, ?, ?, ?, ?, ?)`, newID(), userID, logType, amount, next, remark); err != nil {
		writeError(w, err)
		return
	}
	if err := tx.Commit(); err != nil {
		writeError(w, err)
		return
	}
	user, _ := users.NewRepository(r.db).FindByID(context.Background(), userID)
	if r.userHub != nil {
		r.userHub.PublishUser(user)
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": map[string]any{"user": users.ToPublicUser(user)}})
}

func (r *Router) userAPIKeys(w http.ResponseWriter, req *http.Request, path string) {
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) < 2 || parts[1] != "api-keys" {
		writeError(w, newAppError(http.StatusNotFound, "接口不存在"))
		return
	}
	userID := strings.TrimSpace(parts[0])
	ctx, cancel := context.WithTimeout(req.Context(), 8*time.Second)
	defer cancel()
	service := apikeys.NewService(apikeys.NewRepository(r.db), users.NewRepository(r.db))
	if len(parts) == 2 {
		switch req.Method {
		case http.MethodGet:
			items, err := service.ListUserKeys(ctx, userID)
			if err != nil {
				writeError(w, err)
				return
			}
			writeJSON(w, http.StatusOK, map[string]any{"data": items})
		case http.MethodPost:
			var input struct {
				Name string `json:"name"`
			}
			if err := decodeCompatJSON(req, &input); err != nil {
				writeError(w, newAppError(http.StatusBadRequest, "请求参数不正确"))
				return
			}
			key, err := service.CreateUserKey(ctx, userID, defaultString(strings.TrimSpace(input.Name), "API Key"))
			if err != nil {
				writeError(w, err)
				return
			}
			writeJSON(w, http.StatusCreated, map[string]any{"data": key})
		default:
			writeMethodNotAllowed(w)
		}
		return
	}
	if len(parts) == 3 {
		keyID := parts[2]
		switch req.Method {
		case http.MethodPatch:
			var input struct {
				Status string `json:"status"`
			}
			if err := decodeCompatJSON(req, &input); err != nil {
				writeError(w, newAppError(http.StatusBadRequest, "请求参数不正确"))
				return
			}
			key, err := service.UpdateUserKeyStatus(ctx, keyID, userID, input.Status)
			if err != nil {
				writeError(w, err)
				return
			}
			writeJSON(w, http.StatusOK, map[string]any{"data": key})
		case http.MethodDelete:
			if err := service.DeleteUserKey(ctx, keyID, userID); err != nil {
				writeError(w, err)
				return
			}
			writeJSON(w, http.StatusOK, map[string]any{"data": map[string]any{"deleted": true}})
		default:
			writeMethodNotAllowed(w)
		}
		return
	}
	writeError(w, newAppError(http.StatusNotFound, "接口不存在"))
}

func (r *Router) listUsers(w http.ResponseWriter, req *http.Request) {
	if _, err := r.requireAdmin(req); err != nil {
		writeError(w, err)
		return
	}
	if req.Method == http.MethodPost {
		r.createUser(w, req, true)
		return
	}
	if req.Method != http.MethodGet {
		writeMethodNotAllowed(w)
		return
	}
	ctx, cancel := context.WithTimeout(req.Context(), 8*time.Second)
	defer cancel()
	items, err := users.NewRepository(r.db).FindAll(ctx)
	if err != nil {
		writeError(w, err)
		return
	}
	data := make([]users.PublicUser, 0, len(items))
	for index := range items {
		item := items[index]
		data = append(data, users.ToPublicUser(&item))
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": data})
}

func (r *Router) userActivityRanking(w http.ResponseWriter, req *http.Request) {
	if req.Method != http.MethodGet {
		writeMethodNotAllowed(w)
		return
	}
	if _, err := r.requireAdmin(req); err != nil {
		writeError(w, err)
		return
	}
	ctx, cancel := context.WithTimeout(req.Context(), 8*time.Second)
	defer cancel()
	items, err := users.NewRepository(r.db).ActivityRanking(ctx, queryInt(req, "days", 7), queryInt(req, "limit", 10))
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": items})
}

func (r *Router) registerUser(w http.ResponseWriter, req *http.Request) {
	if req.Method != http.MethodPost {
		writeMethodNotAllowed(w)
		return
	}
	r.createUser(w, req, false)
}

func (r *Router) createUser(w http.ResponseWriter, req *http.Request, admin bool) {
	var input struct {
		Email     string `json:"email"`
		Password  string `json:"password"`
		Role      string `json:"role"`
		InviterID string `json:"inviterId"`
	}
	if err := decodeCompatJSON(req, &input); err != nil {
		writeError(w, newAppError(http.StatusBadRequest, "请求参数不正确"))
		return
	}
	email := strings.TrimSpace(input.Email)
	if email == "" || len(input.Password) < 6 {
		writeError(w, newAppError(http.StatusBadRequest, "请输入邮箱和至少 6 位密码"))
		return
	}
	role := "user"
	if admin && input.Role == "admin" {
		role = "admin"
	}
	ctx, cancel := context.WithTimeout(req.Context(), 8*time.Second)
	defer cancel()
	repo := users.NewRepository(r.db)
	if existing, err := repo.FindByEmail(ctx, email); err == nil && existing != nil {
		writeError(w, newAppError(http.StatusConflict, "邮箱已存在"))
		return
	}
	now := time.Now()
	user, err := repo.Create(ctx, users.User{
		ID:              newID(),
		Email:           email,
		PasswordHash:    auth.HashPassword(input.Password),
		Credits:         0,
		Role:            role,
		Status:          "active",
		EmailVerifiedAt: &now,
	})
	if err != nil {
		writeError(w, err)
		return
	}
	if !admin {
		if values, err := settings.NewRepository(r.db).Get(ctx); err == nil {
			inviteEnabled, _ := values["inviteEnabled"].(bool)
			inviteReward, _ := values["inviteRewardCredits"].(float64)
			if inviteEnabled && inviteReward > 0 {
				_ = operations.NewRepository(r.db).RewardInvite(ctx, strings.TrimSpace(input.InviterID), user.ID, inviteReward, requestIP(req))
			}
		}
	}
	token, _ := r.tokens.CreateUserToken(user.ID)
	if admin {
		writeJSON(w, http.StatusCreated, map[string]any{"data": users.ToPublicUser(user)})
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"data": mergeUserToken(users.ToPublicUser(user), token)})
}
