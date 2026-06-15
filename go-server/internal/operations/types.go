package operations

import "time"

type CreditLog struct {
	ID           string    `json:"id"`
	UserID       string    `json:"userId"`
	UserEmail    *string   `json:"userEmail,omitempty"`
	Type         string    `json:"type"`
	Amount       float64   `json:"amount"`
	BalanceAfter float64   `json:"balanceAfter"`
	Remark       *string   `json:"remark"`
	CreatedAt    time.Time `json:"-"`
	CreatedAtISO string    `json:"createdAt"`
}

type RechargeProduct struct {
	ID        string  `json:"id"`
	Name      string  `json:"name"`
	Amount    float64 `json:"amount"`
	Credits   float64 `json:"credits"`
	Badge     *string `json:"badge"`
	SortOrder int     `json:"sortOrder"`
	Status    string  `json:"status"`
	CreatedAt string  `json:"createdAt"`
	UpdatedAt string  `json:"updatedAt"`
}

type SubscriptionPlan struct {
	ID                 string   `json:"id"`
	Name               string   `json:"name"`
	Description        *string  `json:"description"`
	Amount             float64  `json:"amount"`
	DurationDays       int      `json:"durationDays"`
	BonusCredits       float64  `json:"bonusCredits"`
	DiscountPercent    float64  `json:"discountPercent"`
	AllowedProviderIDs []string `json:"allowedProviderIds"`
	AllowedModelIDs    []string `json:"allowedModelIds"`
	Badge              *string  `json:"badge"`
	SortOrder          int      `json:"sortOrder"`
	Status             string   `json:"status"`
	CreatedAt          string   `json:"createdAt"`
	UpdatedAt          string   `json:"updatedAt"`
}

type RedeemCode struct {
	ID        string  `json:"id"`
	Code      string  `json:"code"`
	Credits   float64 `json:"credits"`
	Status    string  `json:"status"`
	Remark    *string `json:"remark"`
	UserID    *string `json:"userId"`
	UserEmail *string `json:"userEmail,omitempty"`
	UsedAt    *string `json:"usedAt"`
	ExpiresAt *string `json:"expiresAt"`
	CreatedAt string  `json:"createdAt"`
	UpdatedAt string  `json:"updatedAt"`
}

type Checkin struct {
	ID            string  `json:"id"`
	UserID        string  `json:"userId"`
	UserEmail     *string `json:"userEmail,omitempty"`
	RewardCredits float64 `json:"rewardCredits"`
	CheckinDate   string  `json:"checkinDate"`
	UserIP        *string `json:"userIp"`
	CreatedAt     string  `json:"createdAt"`
}

type Invite struct {
	ID            string  `json:"id"`
	InviterID     string  `json:"inviterId"`
	InviterEmail  *string `json:"inviterEmail,omitempty"`
	InviteeID     string  `json:"inviteeId"`
	InviteeEmail  *string `json:"inviteeEmail,omitempty"`
	RewardCredits float64 `json:"rewardCredits"`
	InviteeIP     *string `json:"inviteeIp"`
	CreatedAt     string  `json:"createdAt"`
}

type RechargeOrder struct {
	ID                 string  `json:"id"`
	UserID             string  `json:"userId"`
	UserEmail          *string `json:"userEmail,omitempty"`
	OutTradeNo         string  `json:"outTradeNo"`
	TradeNo            *string `json:"tradeNo"`
	OrderType          string  `json:"orderType"`
	SubscriptionPlanID *string `json:"subscriptionPlanId"`
	Amount             float64 `json:"amount"`
	Credits            float64 `json:"credits"`
	Status             string  `json:"status"`
	PayURL             *string `json:"payUrl"`
	QRCode             *string `json:"qrCode"`
	PaidAt             *string `json:"paidAt"`
	CreatedAt          string  `json:"createdAt"`
	UpdatedAt          string  `json:"updatedAt"`
}

type APICallLog struct {
	ID              string  `json:"id"`
	Direction       string  `json:"direction"`
	TaskID          *string `json:"taskId"`
	UserID          *string `json:"userId"`
	UserEmail       *string `json:"userEmail,omitempty"`
	APIKeyID        *string `json:"apiKeyId"`
	APIKeyName      *string `json:"apiKeyName"`
	ProviderID      *string `json:"providerId"`
	ProviderName    *string `json:"providerName,omitempty"`
	ProviderType    *string `json:"providerType"`
	Endpoint        string  `json:"endpoint"`
	Phase           string  `json:"phase"`
	Method          string  `json:"method"`
	Status          string  `json:"status"`
	StatusCode      *int    `json:"statusCode"`
	DurationMS      int     `json:"durationMs"`
	RequestSummary  any     `json:"requestSummary"`
	ResponseSummary any     `json:"responseSummary"`
	ErrorMessage    *string `json:"errorMessage"`
	CreatedAt       string  `json:"createdAt"`
}
