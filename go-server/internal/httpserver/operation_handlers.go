package httpserver

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/http"
	"strconv"
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

func (r *Router) creditLogs(w http.ResponseWriter, req *http.Request) {
	if _, err := r.requireAdmin(req); err != nil {
		writeError(w, err)
		return
	}
	repo := operations.NewRepository(r.db)
	ctx, cancel := context.WithTimeout(req.Context(), 8*time.Second)
	defer cancel()
	if req.Method == http.MethodGet {
		items, total, err := repo.CreditLogs(ctx, operationPage(req))
		if err != nil {
			writeError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, paginated(items, total, req))
		return
	}
	writeMethodNotAllowed(w)
}

func (r *Router) creditLogStats(w http.ResponseWriter, req *http.Request) {
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
	data, err := operations.NewRepository(r.db).CreditStats(ctx)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": data})
}

func (r *Router) creditLogByID(w http.ResponseWriter, req *http.Request) {
	if req.Method != http.MethodDelete {
		writeMethodNotAllowed(w)
		return
	}
	if _, err := r.requireAdmin(req); err != nil {
		writeError(w, err)
		return
	}
	id := strings.TrimPrefix(req.URL.Path, "/api/credit-logs/")
	ctx, cancel := context.WithTimeout(req.Context(), 8*time.Second)
	defer cancel()
	deleted, err := operations.NewRepository(r.db).DeleteCreditLog(ctx, id)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": map[string]any{"deleted": deleted}})
}

func (r *Router) financeCosts(w http.ResponseWriter, req *http.Request) {
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
	data, err := operations.NewRepository(r.db).FinanceCosts(ctx, queryInt(req, "days", 30))
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": data})
}

func (r *Router) shopProducts(w http.ResponseWriter, req *http.Request) {
	r.productCollection(w, req, true)
}

func (r *Router) adminShopProducts(w http.ResponseWriter, req *http.Request) {
	r.productCollection(w, req, false)
}

func (r *Router) productCollection(w http.ResponseWriter, req *http.Request, public bool) {
	if !public {
		if _, err := r.requireAdmin(req); err != nil {
			writeError(w, err)
			return
		}
	}
	repo := operations.NewRepository(r.db)
	ctx, cancel := context.WithTimeout(req.Context(), 8*time.Second)
	defer cancel()
	switch req.Method {
	case http.MethodGet:
		items, err := repo.Products(ctx, public)
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
		var input operations.RechargeProduct
		if err := decodeCompatJSON(req, &input); err != nil {
			writeError(w, newAppError(http.StatusBadRequest, "请求参数不正确"))
			return
		}
		input.ID = newID()
		item, err := repo.SaveProduct(ctx, input)
		if err != nil {
			writeError(w, err)
			return
		}
		writeJSON(w, http.StatusCreated, map[string]any{"data": item})
	default:
		writeMethodNotAllowed(w)
	}
}

func (r *Router) shopProductByID(w http.ResponseWriter, req *http.Request) {
	if _, err := r.requireAdmin(req); err != nil {
		writeError(w, err)
		return
	}
	id := strings.TrimPrefix(req.URL.Path, "/api/shop/recharge-products/")
	ctx, cancel := context.WithTimeout(req.Context(), 8*time.Second)
	defer cancel()
	repo := operations.NewRepository(r.db)
	switch req.Method {
	case http.MethodPatch:
		var input operations.RechargeProduct
		if err := decodeCompatJSON(req, &input); err != nil {
			writeError(w, newAppError(http.StatusBadRequest, "请求参数不正确"))
			return
		}
		input.ID = id
		item, err := repo.SaveProduct(ctx, input)
		if err != nil {
			writeError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"data": item})
	case http.MethodDelete:
		deleted, err := repo.DeleteProduct(ctx, id)
		if err != nil {
			writeError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"data": map[string]any{"deleted": deleted}})
	default:
		writeMethodNotAllowed(w)
	}
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
	data, err := operations.NewRepository(r.db).CurrentSubscription(ctx, userID)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": data})
}

func (r *Router) redeemCodes(w http.ResponseWriter, req *http.Request) {
	if req.URL.Path == "/api/redeem-codes/redeem" {
		r.redeemCode(w, req)
		return
	}
	if _, err := r.requireAdmin(req); err != nil {
		writeError(w, err)
		return
	}
	ctx, cancel := context.WithTimeout(req.Context(), 8*time.Second)
	defer cancel()
	repo := operations.NewRepository(r.db)
	switch req.Method {
	case http.MethodGet:
		items, total, err := repo.RedeemCodes(ctx, operationPage(req))
		if err != nil {
			writeError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, paginated(items, total, req))
	case http.MethodPost:
		var input operations.RedeemCode
		if err := decodeCompatJSON(req, &input); err != nil {
			writeError(w, newAppError(http.StatusBadRequest, "请求参数不正确"))
			return
		}
		input.ID = newID()
		item, err := repo.SaveRedeemCode(ctx, input)
		if err != nil {
			writeError(w, err)
			return
		}
		writeJSON(w, http.StatusCreated, map[string]any{"data": item})
	default:
		writeMethodNotAllowed(w)
	}
}

func (r *Router) redeemCodeByID(w http.ResponseWriter, req *http.Request) {
	if _, err := r.requireAdmin(req); err != nil {
		writeError(w, err)
		return
	}
	id := strings.TrimPrefix(req.URL.Path, "/api/redeem-codes/")
	ctx, cancel := context.WithTimeout(req.Context(), 8*time.Second)
	defer cancel()
	repo := operations.NewRepository(r.db)
	switch req.Method {
	case http.MethodPatch:
		var input operations.RedeemCode
		if err := decodeCompatJSON(req, &input); err != nil {
			writeError(w, newAppError(http.StatusBadRequest, "请求参数不正确"))
			return
		}
		input.ID = id
		item, err := repo.SaveRedeemCode(ctx, input)
		if err != nil {
			writeError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"data": item})
	case http.MethodDelete:
		deleted, err := repo.DeleteRedeemCode(ctx, id)
		if err != nil {
			writeError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"data": map[string]any{"deleted": deleted}})
	default:
		writeMethodNotAllowed(w)
	}
}

func (r *Router) redeemCode(w http.ResponseWriter, req *http.Request) {
	if req.Method != http.MethodPost {
		writeMethodNotAllowed(w)
		return
	}
	var input struct {
		UserID string `json:"userId"`
		Code   string `json:"code"`
	}
	if err := decodeCompatJSON(req, &input); err != nil {
		writeError(w, newAppError(http.StatusBadRequest, "请求参数不正确"))
		return
	}
	ctx, cancel := context.WithTimeout(req.Context(), 8*time.Second)
	defer cancel()
	credits, balance, err := operations.NewRepository(r.db).Redeem(ctx, strings.TrimSpace(input.Code), strings.TrimSpace(input.UserID), requestIP(req))
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, newAppError(http.StatusBadRequest, "兑换码无效或已过期"))
		return
	}
	if err != nil {
		writeError(w, err)
		return
	}
	if user, err := users.NewRepository(r.db).FindByID(context.Background(), strings.TrimSpace(input.UserID)); err == nil && r.userHub != nil {
		r.userHub.PublishUser(user)
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": map[string]any{"credits": credits, "balanceAfter": balance}})
}

func (r *Router) checkins(w http.ResponseWriter, req *http.Request) {
	repo := operations.NewRepository(r.db)
	ctx, cancel := context.WithTimeout(req.Context(), 8*time.Second)
	defer cancel()
	switch req.Method {
	case http.MethodGet:
		if _, err := r.requireAdmin(req); err != nil {
			writeError(w, err)
			return
		}
		items, total, err := repo.Checkins(ctx, operationPage(req))
		if err != nil {
			writeError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, paginated(items, total, req))
	case http.MethodPost:
		var input struct {
			UserID string `json:"userId"`
		}
		if err := decodeCompatJSON(req, &input); err != nil {
			writeError(w, newAppError(http.StatusBadRequest, "请求参数不正确"))
			return
		}
		settingsData, _ := settings.NewRepository(r.db).Get(ctx)
		reward := firstReward(fmt.Sprint(settingsData["checkinRewards"]))
		data, err := repo.Checkin(ctx, strings.TrimSpace(input.UserID), reward, requestIP(req))
		if err != nil {
			writeError(w, newAppError(http.StatusBadRequest, "今日已签到或用户不存在"))
			return
		}
		if user, err := users.NewRepository(r.db).FindByID(context.Background(), strings.TrimSpace(input.UserID)); err == nil && r.userHub != nil {
			r.userHub.PublishUser(user)
		}
		writeJSON(w, http.StatusOK, map[string]any{"data": data})
	default:
		writeMethodNotAllowed(w)
	}
}

func (r *Router) checkinStatus(w http.ResponseWriter, req *http.Request) {
	if req.Method != http.MethodGet {
		writeMethodNotAllowed(w)
		return
	}
	userID := strings.TrimSpace(req.URL.Query().Get("userId"))
	ctx, cancel := context.WithTimeout(req.Context(), 8*time.Second)
	defer cancel()
	data, err := operations.NewRepository(r.db).CheckinStatus(ctx, userID)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": data})
}

func (r *Router) checkinByID(w http.ResponseWriter, req *http.Request) {
	if req.Method != http.MethodDelete {
		writeMethodNotAllowed(w)
		return
	}
	if _, err := r.requireAdmin(req); err != nil {
		writeError(w, err)
		return
	}
	id := strings.TrimPrefix(req.URL.Path, "/api/checkins/")
	ctx, cancel := context.WithTimeout(req.Context(), 8*time.Second)
	defer cancel()
	deleted, err := operations.NewRepository(r.db).DeleteCheckin(ctx, id)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": map[string]any{"deleted": deleted}})
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
	reward, _ := values["inviteRewardCredits"].(float64)
	data, err := operations.NewRepository(r.db).InviteSummary(ctx, userID, reward)
	if err != nil {
		writeError(w, err)
		return
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
	deleted, err := operations.NewRepository(r.db).DeleteInvite(ctx, id)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": map[string]any{"deleted": deleted}})
}

func (r *Router) recharge(w http.ResponseWriter, req *http.Request) {
	if req.Method != http.MethodPost {
		writeMethodNotAllowed(w)
		return
	}
	var input struct {
		UserID             string  `json:"userId"`
		Amount             float64 `json:"amount"`
		Credits            float64 `json:"credits"`
		OrderType          string  `json:"orderType"`
		ProductID          string  `json:"productId"`
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
	if !anyBool(values["rechargeEnabled"]) {
		writeError(w, newAppError(http.StatusForbidden, "充值暂未开放"))
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
	amount := input.Amount
	credits := input.Credits
	subject := anyString(values["siteName"]) + "自定义充值"
	orderType := defaultString(input.OrderType, "recharge")
	var subscriptionPlanID *string
	repo := operations.NewRepository(r.db)
	if input.SubscriptionPlanID != nil && strings.TrimSpace(*input.SubscriptionPlanID) != "" {
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
		amount = plan.Amount
		credits = plan.BonusCredits
		subject = anyString(values["siteName"]) + plan.Name
		orderType = "subscription"
		subscriptionPlanID = &planID
	} else if strings.TrimSpace(input.ProductID) != "" {
		product, err := repo.FindProduct(ctx, strings.TrimSpace(input.ProductID))
		if errors.Is(err, sql.ErrNoRows) || product == nil || product.Status != "active" {
			writeError(w, newAppError(http.StatusNotFound, "充值套餐不存在或已下架"))
			return
		}
		if err != nil {
			writeError(w, err)
			return
		}
		amount = product.Amount
		credits = product.Credits
		subject = anyString(values["siteName"]) + product.Name
		orderType = "recharge"
	} else {
		minAmount := anyFloat(values["rechargeMinAmount"], 1)
		if amount < minAmount {
			writeError(w, newAppError(http.StatusBadRequest, fmt.Sprintf("自定义充值最低 %.2f 元", minAmount)))
			return
		}
		if credits == 0 {
			credits = amount * anyFloat(values["rechargeRate"], 1)
		}
	}
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
		writeError(w, newAppError(http.StatusNotFound, "充值订单不存在"))
		return
	}
	if err != nil {
		writeError(w, err)
		return
	}
	if changed {
		if user, err := users.NewRepository(r.db).FindByID(context.Background(), order.UserID); err == nil && r.userHub != nil {
			r.userHub.PublishUser(user)
		}
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
		writeError(w, newAppError(http.StatusNotFound, "充值订单不存在"))
		return
	}
	if err != nil {
		writeError(w, err)
		return
	}
	if strings.TrimSpace(input.UserID) != "" && strings.TrimSpace(input.UserID) != order.UserID {
		writeError(w, newAppError(http.StatusNotFound, "充值订单不存在"))
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
		if user, err := users.NewRepository(r.db).FindByID(context.Background(), paidOrder.UserID); err == nil && r.userHub != nil {
			r.userHub.PublishUser(user)
		}
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

func firstReward(value string) float64 {
	for _, part := range strings.Split(value, ",") {
		n, err := strconv.ParseFloat(strings.TrimSpace(part), 64)
		if err == nil && n > 0 {
			return n
		}
	}
	return 0.1
}
