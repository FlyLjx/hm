package httpserver

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"aipi-go/internal/operations"
	"aipi-go/internal/settings"
	"aipi-go/internal/users"

	qrcode "github.com/skip2/go-qrcode"
)

func (r *Router) dashboard(w http.ResponseWriter, req *http.Request) {
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
	data, err := operations.NewRepository(r.db).DashboardSummary(ctx, queryInt(req, "limit", 8))
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": data})
}

func (r *Router) plans(w http.ResponseWriter, req *http.Request) {
	r.planCollection(w, req, true)
}

func (r *Router) adminPlans(w http.ResponseWriter, req *http.Request) {
	r.planCollection(w, req, false)
}

func (r *Router) planCollection(w http.ResponseWriter, req *http.Request, public bool) {
	if !public {
		if _, err := r.requireAdmin(req); err != nil {
			writeError(w, err)
			return
		}
	}
	ctx, cancel := context.WithTimeout(req.Context(), 8*time.Second)
	defer cancel()
	repo := operations.NewRepository(r.db)
	switch req.Method {
	case http.MethodGet:
		items, err := repo.Plans(ctx, public)
		if err != nil {
			writeError(w, err)
			return
		}
		if public {
			w.Header().Set("Cache-Control", "public, max-age=30")
		}
		writeJSON(w, http.StatusOK, map[string]any{"data": items})
	case http.MethodPost:
		if public {
			writeMethodNotAllowed(w)
			return
		}
		var input operations.SubscriptionPlan
		if err := decodeCompatJSON(req, &input); err != nil {
			writeError(w, newAppError(http.StatusBadRequest, "请求参数不正确"))
			return
		}
		input.ID = newID()
		item, err := repo.SavePlan(ctx, input)
		if err != nil {
			writeError(w, err)
			return
		}
		writeJSON(w, http.StatusCreated, map[string]any{"data": item})
	default:
		writeMethodNotAllowed(w)
	}
}

func (r *Router) planByID(w http.ResponseWriter, req *http.Request) {
	if _, err := r.requireAdmin(req); err != nil {
		writeError(w, err)
		return
	}
	id := strings.TrimPrefix(req.URL.Path, "/api/subscriptions/plans/")
	ctx, cancel := context.WithTimeout(req.Context(), 8*time.Second)
	defer cancel()
	repo := operations.NewRepository(r.db)
	switch req.Method {
	case http.MethodPatch:
		var input operations.SubscriptionPlan
		if err := decodeCompatJSON(req, &input); err != nil {
			writeError(w, newAppError(http.StatusBadRequest, "请求参数不正确"))
			return
		}
		input.ID = id
		item, err := repo.SavePlan(ctx, input)
		if err != nil {
			writeError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"data": item})
	case http.MethodDelete:
		deleted, err := repo.DeletePlan(ctx, id)
		if err != nil {
			writeError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"data": map[string]any{"deleted": deleted}})
	default:
		writeMethodNotAllowed(w)
	}
}

func (r *Router) currentSubscription(w http.ResponseWriter, req *http.Request) {
	if req.Method != http.MethodGet {
		writeMethodNotAllowed(w)
		return
	}
	userID := strings.TrimSpace(req.URL.Query().Get("userId"))
	if userID == "" {
		writeJSON(w, http.StatusOK, map[string]any{"data": nil})
		return
	}
	ctx, cancel := context.WithTimeout(req.Context(), 8*time.Second)
	defer cancel()
	data, err := r.currentSubscriptionEntitlement(ctx, userID)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": data})
}

func (r *Router) invites(w http.ResponseWriter, req *http.Request) {
	if _, err := r.requireAdmin(req); err != nil {
		writeError(w, err)
		return
	}
	ctx, cancel := context.WithTimeout(req.Context(), 8*time.Second)
	defer cancel()
	items, total, err := operations.NewRepository(r.db).Invites(ctx, operationPage(req))
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, paginated(items, total, req))
}

func (r *Router) inviteSummary(w http.ResponseWriter, req *http.Request) {
	if req.Method != http.MethodGet {
		writeMethodNotAllowed(w)
		return
	}
	userID := strings.TrimSpace(req.URL.Query().Get("userId"))
	ctx, cancel := context.WithTimeout(req.Context(), 8*time.Second)
	defer cancel()
	values, err := settings.NewRepository(r.db).Get(ctx)
	if err != nil {
		writeError(w, err)
		return
	}
	data, err := operations.NewRepository(r.db).InviteSummary(ctx, userID)
	if err != nil {
		writeError(w, err)
		return
	}
	if userID != "" {
		userRepo := users.NewRepository(r.db)
		if inviteCode, err := userRepo.EnsureInviteCode(ctx, userID); err == nil {
			data["inviteCode"] = inviteCode
		}
	}
	data["rewardType"] = "subscription"
	planID := strings.TrimSpace(anyString(values["inviteRewardPlanId"]))
	data["rewardPlanId"] = planID
	if planID != "" {
		if plan, err := operations.NewRepository(r.db).FindPlan(ctx, planID); err == nil && plan != nil {
			data["rewardPlanName"] = plan.Name
			data["rewardText"] = plan.Name
		}
	}
	if data["rewardText"] == nil {
		data["rewardText"] = "订阅权益"
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": data})
}

func (r *Router) inviteByID(w http.ResponseWriter, req *http.Request) {
	if req.Method != http.MethodDelete {
		writeMethodNotAllowed(w)
		return
	}
	if _, err := r.requireAdmin(req); err != nil {
		writeError(w, err)
		return
	}
	id := strings.TrimPrefix(req.URL.Path, "/api/invites/")
	ctx, cancel := context.WithTimeout(req.Context(), 8*time.Second)
	defer cancel()
	result, err := operations.NewRepository(r.db).DeleteInvite(ctx, id)
	if err != nil {
		writeError(w, err)
		return
	}
	if result != nil && result.Deleted && result.InviterID != "" {
		r.publishCurrentUser(context.Background(), result.InviterID)
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": result})
}

func (r *Router) recharge(w http.ResponseWriter, req *http.Request) {
	if req.Method != http.MethodPost {
		writeMethodNotAllowed(w)
		return
	}
	var input struct {
		UserID             string  `json:"userId"`
		SubscriptionPlanID *string `json:"subscriptionPlanId"`
	}
	if err := decodeCompatJSON(req, &input); err != nil {
		writeError(w, newAppError(http.StatusBadRequest, "请求参数不正确"))
		return
	}
	ctx, cancel := context.WithTimeout(req.Context(), 8*time.Second)
	defer cancel()
	input.UserID = strings.TrimSpace(input.UserID)
	if input.UserID == "" {
		writeError(w, newAppError(http.StatusBadRequest, "缺少用户信息"))
		return
	}
	values, err := settings.NewRepository(r.db).Get(ctx)
	if err != nil {
		writeError(w, err)
		return
	}
	user, err := users.NewRepository(r.db).FindByID(ctx, input.UserID)
	if errors.Is(err, sql.ErrNoRows) || user == nil || user.Status != "active" {
		writeError(w, newAppError(http.StatusNotFound, "用户不存在或已被禁用"))
		return
	}
	if err != nil {
		writeError(w, err)
		return
	}
	if input.SubscriptionPlanID == nil || strings.TrimSpace(*input.SubscriptionPlanID) == "" {
		writeError(w, newAppError(http.StatusBadRequest, "请选择订阅套餐"))
		return
	}
	repo := operations.NewRepository(r.db)
	planID := strings.TrimSpace(*input.SubscriptionPlanID)
	plan, err := repo.FindPlan(ctx, planID)
	if errors.Is(err, sql.ErrNoRows) || plan == nil || plan.Status != "active" {
		writeError(w, newAppError(http.StatusNotFound, "订阅套餐不存在或已下架"))
		return
	}
	if err != nil {
		writeError(w, err)
		return
	}
	amount := plan.Amount
	credits := float64(0)
	subject := anyString(values["siteName"]) + plan.Name
	orderType := "subscription"
	subscriptionPlanID := &planID
	orderID := newID()
	outTradeNo := "AIPI" + time.Now().Format("20060102150405") + strings.ToUpper(strings.ReplaceAll(orderID[:8], "-", ""))
	payment, err := createAlipayPrecreateOrder(ctx, alipaySettingsFromMap(values), outTradeNo, amount, subject, requestOrigin(req))
	if err != nil {
		writeError(w, err)
		return
	}
	payURL := payment.QRCode
	order, err := repo.CreateOrder(ctx, operations.RechargeOrder{
		ID: orderID, UserID: input.UserID, OutTradeNo: outTradeNo,
		OrderType: orderType, SubscriptionPlanID: subscriptionPlanID,
		Amount: amount, Credits: credits, Status: "pending",
		PayURL: &payURL, QRCode: &payURL,
	})
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"data": order})
}

func (r *Router) rechargeQRCode(w http.ResponseWriter, req *http.Request) {
	if req.Method != http.MethodGet {
		writeMethodNotAllowed(w)
		return
	}
	text := strings.TrimSpace(req.URL.Query().Get("text"))
	if text == "" {
		writeError(w, newAppError(http.StatusBadRequest, "缺少二维码内容"))
		return
	}
	png, err := qrcode.Encode(text, qrcode.Medium, 260)
	if err != nil {
		writeError(w, err)
		return
	}
	w.Header().Set("Content-Type", "image/png")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(png)
}

func (r *Router) alipayNotify(w http.ResponseWriter, req *http.Request) {
	if req.Method != http.MethodPost {
		writeMethodNotAllowed(w)
		return
	}
	if err := req.ParseForm(); err != nil {
		writeError(w, newAppError(http.StatusBadRequest, "支付宝通知参数不正确"))
		return
	}
	ctx, cancel := context.WithTimeout(req.Context(), 12*time.Second)
	defer cancel()
	values, err := settings.NewRepository(r.db).Get(ctx)
	if err != nil {
		writeError(w, err)
		return
	}
	if err := verifyAlipayNotify(alipaySettingsFromMap(values), req.PostForm); err != nil {
		writeError(w, err)
		return
	}
	outTradeNo := strings.TrimSpace(req.FormValue("out_trade_no"))
	tradeNo := strings.TrimSpace(req.FormValue("trade_no"))
	tradeStatus := strings.TrimSpace(req.FormValue("trade_status"))
	if outTradeNo == "" {
		var input map[string]any
		if err := decodeCompatJSON(req, &input); err == nil {
			outTradeNo = strings.TrimSpace(fmt.Sprint(input["out_trade_no"]))
			tradeNo = strings.TrimSpace(fmt.Sprint(input["trade_no"]))
			tradeStatus = strings.TrimSpace(fmt.Sprint(input["trade_status"]))
		}
	}
	if outTradeNo == "" {
		writeError(w, newAppError(http.StatusBadRequest, "缺少商户订单号"))
		return
	}
	if tradeStatus != "" && tradeStatus != "TRADE_SUCCESS" && tradeStatus != "TRADE_FINISHED" {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		_, _ = w.Write([]byte("success"))
		return
	}
	order, changed, err := operations.NewRepository(r.db).CompleteOrder(ctx, outTradeNo, tradeNo)
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, newAppError(http.StatusNotFound, "订阅订单不存在"))
		return
	}
	if err != nil {
		writeError(w, err)
		return
	}
	if changed {
		r.publishCurrentUser(context.Background(), order.UserID)
	}
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	_, _ = w.Write([]byte("success"))
}

func (r *Router) rechargeOrders(w http.ResponseWriter, req *http.Request) {
	if _, err := r.requireAdmin(req); err != nil {
		writeError(w, err)
		return
	}
	ctx, cancel := context.WithTimeout(req.Context(), 8*time.Second)
	defer cancel()
	items, total, err := operations.NewRepository(r.db).Orders(ctx, operationPage(req))
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, paginated(items, total, req))
}

func (r *Router) rechargeByID(w http.ResponseWriter, req *http.Request) {
	id := strings.TrimPrefix(req.URL.Path, "/api/recharge/")
	if strings.HasSuffix(id, "/sync") {
		r.syncRechargeOrder(w, req, strings.TrimSuffix(id, "/sync"))
		return
	}
	if req.Method != http.MethodGet {
		writeMethodNotAllowed(w)
		return
	}
	ctx, cancel := context.WithTimeout(req.Context(), 8*time.Second)
	defer cancel()
	order, err := operations.NewRepository(r.db).FindOrder(ctx, strings.Trim(id, "/"))
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": order})
}

func (r *Router) syncRechargeOrder(w http.ResponseWriter, req *http.Request, id string) {
	if req.Method != http.MethodPost {
		writeMethodNotAllowed(w)
		return
	}
	var input struct {
		UserID string `json:"userId"`
	}
	_ = decodeCompatJSON(req, &input)
	ctx, cancel := context.WithTimeout(req.Context(), 15*time.Second)
	defer cancel()
	repo := operations.NewRepository(r.db)
	order, err := repo.FindOrder(ctx, strings.Trim(id, "/"))
	if errors.Is(err, sql.ErrNoRows) || order == nil {
		writeError(w, newAppError(http.StatusNotFound, "订阅订单不存在"))
		return
	}
	if err != nil {
		writeError(w, err)
		return
	}
	if strings.TrimSpace(input.UserID) != "" && strings.TrimSpace(input.UserID) != order.UserID {
		writeError(w, newAppError(http.StatusNotFound, "订阅订单不存在"))
		return
	}
	if order.Status != "pending" {
		writeJSON(w, http.StatusOK, map[string]any{"data": order})
		return
	}
	values, err := settings.NewRepository(r.db).Get(ctx)
	if err != nil {
		writeError(w, err)
		return
	}
	queried, err := queryAlipayOrder(ctx, alipaySettingsFromMap(values), order.OutTradeNo)
	if err != nil {
		writeError(w, err)
		return
	}
	if !queried.Paid {
		writeJSON(w, http.StatusOK, map[string]any{"data": order})
		return
	}
	paidOrder, changed, err := repo.CompleteOrder(ctx, order.OutTradeNo, queried.TradeNo)
	if err != nil {
		writeError(w, err)
		return
	}
	if changed {
		r.publishCurrentUser(context.Background(), paidOrder.UserID)
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": paidOrder})
}

func operationPage(req *http.Request) operations.PageInput {
	return operations.PageInput{
		Page:     queryInt(req, "page", 1),
		PageSize: queryInt(req, "pageSize", queryInt(req, "limit", 20)),
		Keyword:  strings.TrimSpace(req.URL.Query().Get("keyword")),
		Status:   strings.TrimSpace(req.URL.Query().Get("status")),
	}
}

func paginated(items any, total int, req *http.Request) map[string]any {
	page := queryInt(req, "page", 1)
	pageSize := queryInt(req, "pageSize", queryInt(req, "limit", 20))
	return map[string]any{
		"data": items,
		"pagination": map[string]any{
			"total": total, "page": page, "pageSize": pageSize,
		},
	}
}
