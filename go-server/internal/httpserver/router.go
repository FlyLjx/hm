package httpserver

import (
	"context"
	"database/sql"
	"encoding/json"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"aipi-go/internal/auth"
	"aipi-go/internal/build"
	"aipi-go/internal/config"
	"aipi-go/internal/generation"
	"aipi-go/internal/operations"
	"aipi-go/internal/tasks"
	"aipi-go/internal/users"
)

type Router struct {
	cfg     config.Config
	db      *sql.DB
	logger  *slog.Logger
	mux     *http.ServeMux
	tokens  auth.TokenManager
	queue   *generation.Queue
	taskHub *tasks.Hub
	userHub *users.Hub
}

func NewRouter(cfg config.Config, db *sql.DB, logger *slog.Logger) http.Handler {
	router := &Router{
		cfg:    cfg,
		db:     db,
		logger: logger,
		mux:    http.NewServeMux(),
		tokens: auth.NewTokenManager(cfg.Database),
	}
	router.taskHub = tasks.NewHub()
	router.userHub = users.NewHub()
	router.queue = generation.NewQueue(db, logger, 3, router.taskHub, router.userHub)
	router.queue.Start()
	router.routes()
	return router.withMiddleware(router.mux)
}

func (r *Router) routes() {
	r.mux.HandleFunc("/api/health", r.health)
	r.mux.HandleFunc("/api/service-status", r.serviceStatus)
	r.mux.HandleFunc("/api/go/migration", r.migrationStatus)
	r.mux.HandleFunc("/api/home/bootstrap", r.homeBootstrap)
	r.mux.HandleFunc("/api/dashboard", r.dashboard)
	r.mux.HandleFunc("/api/admin/login", r.adminLogin)
	r.mux.HandleFunc("/api/admin/session", r.adminSession)
	r.mux.HandleFunc("/api/users/register", r.registerUser)
	r.mux.HandleFunc("/api/users/login", r.userLogin)
	r.mux.HandleFunc("/api/users/verify-email", r.verifyEmail)
	r.mux.HandleFunc("/api/users/password/forgot", r.forgotPassword)
	r.mux.HandleFunc("/api/users/password/reset", r.resetPassword)
	r.mux.HandleFunc("/api/users/activity-ranking", r.userActivityRanking)
	r.mux.HandleFunc("/api/users", r.listUsers)
	r.mux.HandleFunc("/api/users/", r.userProfile)
	r.mux.HandleFunc("/api/api-providers/model-details", r.providerModelDetails)
	r.mux.HandleFunc("/api/api-providers/models", r.providerModelDetails)
	r.mux.HandleFunc("/api/api-providers", r.listProviders)
	r.mux.HandleFunc("/api/api-providers/", r.providerByID)
	r.mux.HandleFunc("/api/models", r.listModels)
	r.mux.HandleFunc("/api/models/", r.modelByID)
	r.mux.HandleFunc("/api/announcements/public", r.publicAnnouncements)
	r.mux.HandleFunc("/api/announcements/generate", r.generateAnnouncement)
	r.mux.HandleFunc("/api/announcements", r.announcements)
	r.mux.HandleFunc("/api/announcements/", r.announcementByID)
	r.mux.HandleFunc("/api/promotions/public", r.publicPromotions)
	r.mux.HandleFunc("/api/promotions", r.promotions)
	r.mux.HandleFunc("/api/promotions/", r.promotionByID)
	r.mux.HandleFunc("/api/credit-logs/stats", r.creditLogStats)
	r.mux.HandleFunc("/api/credit-logs", r.creditLogs)
	r.mux.HandleFunc("/api/credit-logs/", r.creditLogByID)
	r.mux.HandleFunc("/api/finance-stats/costs", r.financeCosts)
	r.mux.HandleFunc("/api/pricing/activity", r.activityStatus)
	r.mux.HandleFunc("/api/pricing/incentive", r.incentiveStatus)
	r.mux.HandleFunc("/api/shop/public/recharge-products", r.shopProducts)
	r.mux.HandleFunc("/api/shop/recharge-products", r.adminShopProducts)
	r.mux.HandleFunc("/api/shop/recharge-products/", r.shopProductByID)
	r.mux.HandleFunc("/api/subscriptions/public/plans", r.plans)
	r.mux.HandleFunc("/api/subscriptions/public/current", r.currentSubscription)
	r.mux.HandleFunc("/api/subscriptions/plans", r.adminPlans)
	r.mux.HandleFunc("/api/subscriptions/plans/", r.planByID)
	r.mux.HandleFunc("/api/redeem-codes/redeem", r.redeemCode)
	r.mux.HandleFunc("/api/redeem-codes", r.redeemCodes)
	r.mux.HandleFunc("/api/redeem-codes/", r.redeemCodeByID)
	r.mux.HandleFunc("/api/checkins/status", r.checkinStatus)
	r.mux.HandleFunc("/api/checkins", r.checkins)
	r.mux.HandleFunc("/api/checkins/", r.checkinByID)
	r.mux.HandleFunc("/api/invites/summary", r.inviteSummary)
	r.mux.HandleFunc("/api/invites", r.invites)
	r.mux.HandleFunc("/api/invites/", r.inviteByID)
	r.mux.HandleFunc("/api/recharge/qr-code", r.rechargeQRCode)
	r.mux.HandleFunc("/api/recharge/alipay/notify", r.alipayNotify)
	r.mux.HandleFunc("/api/recharge/orders", r.rechargeOrders)
	r.mux.HandleFunc("/api/recharge", r.recharge)
	r.mux.HandleFunc("/api/recharge/", r.rechargeByID)
	r.mux.HandleFunc("/api/prompt-library/opennana", r.openNanaPrompts)
	r.mux.HandleFunc("/api/prompt-library/opennana/", r.openNanaPrompt)
	r.mux.HandleFunc("/api/prompt-reverse", r.promptReverse)
	r.mux.HandleFunc("/api/generate/image/stream", r.generateImageStream)
	r.mux.HandleFunc("/api/generate/image", r.generateImage)
	r.mux.HandleFunc("/api/chat/completions", r.siteChatCompletions)
	r.mux.HandleFunc("/api/tasks/public-display", r.listPublicDisplay)
	r.mux.HandleFunc("/api/tasks/favorites", r.listFavorites)
	r.mux.HandleFunc("/api/tasks/history", r.taskHistory)
	r.mux.HandleFunc("/api/tasks/images", r.listTaskImages)
	r.mux.HandleFunc("/api/tasks/image-check", r.checkTaskImage)
	r.mux.HandleFunc("/api/tasks/stats", r.taskStats)
	r.mux.HandleFunc("/api/tasks/estimate", r.estimateTaskDuration)
	r.mux.HandleFunc("/api/tasks/export", r.exportTasks)
	r.mux.HandleFunc("/api/tasks", r.listTasks)
	r.mux.HandleFunc("/api/tasks/", r.taskByID)
	r.mux.HandleFunc("/api/system-logs", r.listSystemLogs)
	r.mux.HandleFunc("/api/system-logs/detail", r.systemLogDetail)
	r.mux.HandleFunc("/api/system-logs/stream", r.systemLogStream)
	r.mux.HandleFunc("/api/system-logs/", r.deleteSystemLog)
	r.mux.HandleFunc("/api/settings/public", r.publicSettings)
	r.mux.HandleFunc("/api/settings/account-pool", r.accountPoolSettings)
	r.mux.HandleFunc("/api/settings/test-email", r.testSettingEndpoint)
	r.mux.HandleFunc("/api/settings/test-bark", r.testSettingEndpoint)
	r.mux.HandleFunc("/api/settings", r.settings)
	r.mux.HandleFunc("/api/account-pool/accounts", r.accountPoolAccounts)
	r.mux.HandleFunc("/api/mail-broadcast", r.mailBroadcast)
	r.mux.HandleFunc("/api/api-keys", r.adminAPIKeys)
	r.mux.HandleFunc("/api/api-keys/", r.adminAPIKeyByID)
	r.mux.HandleFunc("/api/api-logs/stats", r.apiLogStats)
	r.mux.HandleFunc("/api/api-logs/cleanup", r.apiLogCleanup)
	r.mux.HandleFunc("/api/api-logs", r.apiLogs)
	r.mux.HandleFunc("/api/api-logs/", r.apiLogByID)
	r.mux.HandleFunc("/oauth/client", r.oauthClient)
	r.mux.HandleFunc("/oauth/authorize", r.oauthAuthorize)
	r.mux.HandleFunc("/oauth/token", r.oauthToken)
	r.mux.HandleFunc("/oauth/me", r.oauthMe)
	r.mux.HandleFunc("/v1/models", r.compatModels)
	r.mux.HandleFunc("/v1/balance", r.compatBalance)
	r.mux.HandleFunc("/v1/credits", r.compatBalance)
	r.mux.HandleFunc("/v1/images/generations", r.compatImageGenerations)
	r.mux.HandleFunc("/v1/images/edits", r.compatImageEdits)
	r.mux.HandleFunc("/v1/chat/completions", r.compatChatCompletions)
	r.mux.HandleFunc("/v1/responses", r.compatResponses)
	r.mux.HandleFunc("/ws/tasks", r.taskSocket)
	r.mux.HandleFunc("/ws/users", r.userSocket)

	if r.cfg.ServeStatic {
		r.mux.HandleFunc("/", r.staticFallback)
	}
}

func (r *Router) health(w http.ResponseWriter, _ *http.Request) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	err := r.db.PingContext(ctx)
	status := "ok"
	if err != nil {
		status = "degraded"
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"data": map[string]any{
			"status": status,
			"build":  build.Info(),
			"mysql":  errString(err),
		},
	})
}

func (r *Router) serviceStatus(w http.ResponseWriter, _ *http.Request) {
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	data, err := operations.NewRepository(r.db).PublicServiceStatus(ctx)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": data})
}

func (r *Router) migrationStatus(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"data": map[string]any{
			"phase": "go-primary",
			"modules": []map[string]string{
				{"name": "config/database/health/static", "status": "ready"},
				{"name": "users/admin/auth/oauth", "status": "ready"},
				{"name": "models/providers", "status": "ready"},
				{"name": "generation/tasks/ws", "status": "ready"},
				{"name": "openai-compatible-api", "status": "ready"},
				{"name": "operations/logs/shop/subscriptions", "status": "ready"},
			},
		},
	})
}

var adminPathPattern = regexp.MustCompile(`^/admin(?:/.*)?$`)

func (r *Router) staticFallback(w http.ResponseWriter, req *http.Request) {
	if strings.HasPrefix(req.URL.Path, "/api/") ||
		strings.HasPrefix(req.URL.Path, "/oauth/") ||
		strings.HasPrefix(req.URL.Path, "/v1/") ||
		strings.HasPrefix(req.URL.Path, "/ws/") {
		writeJSON(w, http.StatusNotFound, map[string]any{"message": "接口尚未迁移到 Go 服务"})
		return
	}

	publicDir := filepath.Clean(r.cfg.PublicDir)
	requestPath := strings.TrimPrefix(req.URL.Path, "/")
	if requestPath != "" {
		candidate := filepath.Join(publicDir, requestPath)
		if isSafePublicPath(publicDir, candidate) {
			if info, err := os.Stat(candidate); err == nil && !info.IsDir() {
				setStaticNoStoreHeaders(w, req.URL.Path)
				http.ServeFile(w, req, candidate)
				return
			}
		}
	}

	indexPath := filepath.Join(publicDir, "web", "index.html")
	if adminPathPattern.MatchString(req.URL.Path) {
		indexPath = filepath.Join(publicDir, "admin", "index.html")
	}
	setStaticNoStoreHeaders(w, req.URL.Path)
	http.ServeFile(w, req, indexPath)
}

func setStaticNoStoreHeaders(w http.ResponseWriter, requestPath string) {
	if strings.HasPrefix(requestPath, "/web/") ||
		strings.HasPrefix(requestPath, "/admin/") ||
		requestPath == "/" ||
		requestPath == "/admin" ||
		strings.HasSuffix(requestPath, ".html") {
		w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
		w.Header().Set("Pragma", "no-cache")
		w.Header().Set("Expires", "0")
	}
}

func (r *Router) withMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		startedAt := time.Now()
		if r.cfg.RequestBodyLimit > 0 {
			req.Body = http.MaxBytesReader(w, req.Body, r.cfg.RequestBodyLimit)
		}
		r.applyCORS(w, req)
		if req.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, req)
		r.logger.Info("http request",
			"method", req.Method,
			"path", req.URL.Path,
			"durationMs", time.Since(startedAt).Milliseconds(),
			"remoteAddr", req.RemoteAddr,
		)
	})
}

func (r *Router) applyCORS(w http.ResponseWriter, req *http.Request) {
	origin := req.Header.Get("Origin")
	if origin == "" {
		return
	}
	if !r.isAllowedOrigin(origin) {
		return
	}
	w.Header().Set("Access-Control-Allow-Origin", origin)
	w.Header().Set("Vary", "Origin")
	w.Header().Set("Access-Control-Allow-Credentials", "true")
	w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-API-Key")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
}

func (r *Router) isAllowedOrigin(origin string) bool {
	if origin == "" {
		return true
	}
	for _, item := range r.cfg.CorsOrigins {
		if item == "*" || item == origin {
			return true
		}
	}
	return strings.HasPrefix(origin, "http://localhost:") ||
		strings.HasPrefix(origin, "http://127.0.0.1:") ||
		strings.HasPrefix(origin, "http://[::1]:")
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func errString(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}

func isSafePublicPath(root string, candidate string) bool {
	absRoot, err := filepath.Abs(root)
	if err != nil {
		return false
	}
	absCandidate, err := filepath.Abs(candidate)
	if err != nil {
		return false
	}
	return absCandidate == absRoot || strings.HasPrefix(absCandidate, absRoot+string(os.PathSeparator))
}
