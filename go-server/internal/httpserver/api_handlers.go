package httpserver

import (
	"context"
	"net/http"
	"strings"
	"time"

	"aipi-go/internal/apikeys"
	"aipi-go/internal/operations"
	"aipi-go/internal/users"
)

func (r *Router) adminAPIKeys(w http.ResponseWriter, req *http.Request) {
	if _, err := r.requireAdmin(req); err != nil {
		writeError(w, err)
		return
	}
	if req.Method != http.MethodGet {
		writeMethodNotAllowed(w)
		return
	}
	ctx, cancel := context.WithTimeout(req.Context(), 8*time.Second)
	defer cancel()
	service := apikeys.NewService(apikeys.NewRepository(r.db), users.NewRepository(r.db))
	userID := strings.TrimSpace(req.URL.Query().Get("userId"))
	var items []apikeys.PublicAPIKey
	var err error
	if userID == "" {
		items, err = service.ListAll(ctx)
	} else {
		items, err = service.ListUserKeys(ctx, userID)
	}
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": items})
}

func (r *Router) adminAPIKeyByID(w http.ResponseWriter, req *http.Request) {
	if _, err := r.requireAdmin(req); err != nil {
		writeError(w, err)
		return
	}
	path := strings.Trim(strings.TrimPrefix(req.URL.Path, "/api/api-keys/"), "/")
	if strings.HasSuffix(path, "/logs") {
		r.adminAPIKeyLogs(w, req, strings.TrimSuffix(path, "/logs"))
		return
	}
	id := path
	ctx, cancel := context.WithTimeout(req.Context(), 8*time.Second)
	defer cancel()
	service := apikeys.NewService(apikeys.NewRepository(r.db), users.NewRepository(r.db))
	switch req.Method {
	case http.MethodPatch:
		var input struct {
			Status string `json:"status"`
		}
		if err := decodeCompatJSON(req, &input); err != nil {
			writeError(w, newAppError(http.StatusBadRequest, "请求参数不正确"))
			return
		}
		key, err := service.UpdateUserKeyStatus(ctx, id, "", input.Status)
		if err != nil {
			writeError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"data": key})
	case http.MethodDelete:
		if err := service.DeleteUserKey(ctx, id, ""); err != nil {
			writeError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"data": map[string]any{"deleted": true}})
	default:
		writeMethodNotAllowed(w)
	}
}

func (r *Router) adminAPIKeyLogs(w http.ResponseWriter, req *http.Request, id string) {
	if req.Method != http.MethodGet {
		writeMethodNotAllowed(w)
		return
	}
	ctx, cancel := context.WithTimeout(req.Context(), 8*time.Second)
	defer cancel()
	page := operationPage(req)
	page.APIKeyID = strings.Trim(id, "/")
	items, total, err := operations.NewRepository(r.db).APILogs(ctx, page)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, paginated(items, total, req))
}

func (r *Router) apiLogs(w http.ResponseWriter, req *http.Request) {
	if _, err := r.requireAdmin(req); err != nil {
		writeError(w, err)
		return
	}
	if req.Method != http.MethodGet {
		writeMethodNotAllowed(w)
		return
	}
	ctx, cancel := context.WithTimeout(req.Context(), 8*time.Second)
	defer cancel()
	items, total, err := operations.NewRepository(r.db).APILogs(ctx, operationPage(req))
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, paginated(items, total, req))
}

func (r *Router) apiLogStats(w http.ResponseWriter, req *http.Request) {
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
	data, err := operations.NewRepository(r.db).APILogStats(ctx)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": data})
}

func (r *Router) apiLogCleanup(w http.ResponseWriter, req *http.Request) {
	if req.Method != http.MethodPost {
		writeMethodNotAllowed(w)
		return
	}
	if _, err := r.requireAdmin(req); err != nil {
		writeError(w, err)
		return
	}
	ctx, cancel := context.WithTimeout(req.Context(), 20*time.Second)
	defer cancel()
	deleted, err := operations.NewRepository(r.db).CleanupAPILogs(ctx, 30)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": map[string]any{"deletedCount": deleted}})
}

func (r *Router) apiLogByID(w http.ResponseWriter, req *http.Request) {
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
	item, err := operations.NewRepository(r.db).FindAPILog(ctx, strings.Trim(strings.TrimPrefix(req.URL.Path, "/api/api-logs/"), "/"))
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": item})
}
