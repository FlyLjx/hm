package httpserver

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"aipi-go/internal/providers"
)

type remoteModelPrice struct {
	Cost1K float64 `json:"cost1k"`
	Cost2K float64 `json:"cost2k"`
	Cost4K float64 `json:"cost4k"`
}

type remoteModel struct {
	Name string `json:"name"`
	remoteModelPrice
}

func (r *Router) providerModelDetails(w http.ResponseWriter, req *http.Request) {
	if req.Method != http.MethodPost {
		writeMethodNotAllowed(w)
		return
	}
	if _, err := r.requireAdmin(req); err != nil {
		writeError(w, err)
		return
	}
	var input providerInput
	if err := decodeCompatJSON(req, &input); err != nil {
		writeError(w, newAppError(http.StatusBadRequest, "请求参数不正确"))
		return
	}
	input.BaseURL = strings.TrimRight(strings.TrimSpace(input.BaseURL), "/")
	input.APIKey = strings.TrimSpace(input.APIKey)
	if input.BaseURL == "" || input.APIKey == "" {
		writeError(w, newAppError(http.StatusBadRequest, "请填写 Base URL 和 API Key"))
		return
	}
	ctx, cancel := context.WithTimeout(req.Context(), 20*time.Second)
	defer cancel()
	items, err := r.fetchProviderModelDetails(ctx, input.BaseURL, input.APIKey)
	if err != nil {
		writeError(w, providerProbeError(err))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": items})
}

func providerProbeError(err error) error {
	var appErr appError
	if strings.Contains(err.Error(), "上游") || strings.Contains(err.Error(), "模型接口") || strings.Contains(err.Error(), "获取模型") {
		return err
	}
	if strings.Contains(err.Error(), "connect") || strings.Contains(err.Error(), "timeout") || strings.Contains(err.Error(), "no such host") || strings.Contains(err.Error(), "refused") {
		return newAppError(http.StatusBadGateway, "接口连接失败，请检查 Base URL、网络和 API Key")
	}
	if errors.As(err, &appErr) {
		return err
	}
	return newAppError(http.StatusBadGateway, "接口连接失败："+err.Error())
}

func (r *Router) testProvider(w http.ResponseWriter, req *http.Request, id string) {
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
	provider, err := providers.NewRepository(r.db).FindByID(ctx, strings.Trim(id, "/"))
	if err != nil {
		writeError(w, err)
		return
	}
	startedAt := time.Now()
	endpoint := providerModelsEndpoint(provider.BaseURL)
	items, err := r.fetchProviderModelDetails(ctx, provider.BaseURL, provider.APIKey)
	duration := time.Since(startedAt).Milliseconds()
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]any{"data": map[string]any{
			"ok":         false,
			"status":     "failed",
			"statusCode": nil,
			"durationMs": duration,
			"endpoint":   endpoint,
			"modelCount": 0,
			"message":    err.Error(),
		}})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": map[string]any{
		"ok":         true,
		"status":     "success",
		"statusCode": http.StatusOK,
		"durationMs": duration,
		"endpoint":   endpoint,
		"modelCount": len(items),
		"message":    "连接成功，模型 " + itoa(len(items)) + " 个",
	}})
}

func (r *Router) fetchProviderModelDetails(ctx context.Context, baseURL string, apiKey string) ([]remoteModel, error) {
	models, err := fetchOpenAIModels(ctx, providerModelsEndpoint(baseURL), apiKey)
	if err != nil {
		return nil, err
	}
	priceMap := map[string]remoteModelPrice{}
	for name, price := range fetchNewAPIRatioConfig(ctx, baseURL, apiKey) {
		priceMap[name] = price
	}
	for name, price := range fetchNewAPIPricing(ctx, baseURL, apiKey) {
		priceMap[name] = price
	}
	for index := range models {
		if hasRemotePrice(models[index].remoteModelPrice) {
			continue
		}
		if price, ok := priceMap[models[index].Name]; ok {
			models[index].remoteModelPrice = price
			continue
		}
		if price, ok := priceMap[normalizeRemoteModelName(models[index].Name)]; ok {
			models[index].remoteModelPrice = price
		}
	}
	return models, nil
}

func fetchOpenAIModels(ctx context.Context, endpoint string, apiKey string) ([]remoteModel, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}
	request.Header.Set("Authorization", providers.AuthorizationHeader(apiKey))
	request.Header.Set("Accept", "application/json")
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	var payload struct {
		Data   []any `json:"data"`
		Models []any `json:"models"`
		Error  *struct {
			Message string `json:"message"`
		} `json:"error"`
		Message string `json:"message"`
	}
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		return nil, newAppError(http.StatusBadGateway, "模型接口返回格式不正确")
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		message := payload.Message
		if payload.Error != nil && payload.Error.Message != "" {
			message = payload.Error.Message
		}
		if message == "" {
			message = "获取模型列表失败：HTTP " + itoa(response.StatusCode)
		}
		return nil, newAppError(response.StatusCode, message)
	}
	source := payload.Data
	if len(source) == 0 {
		source = payload.Models
	}
	if source == nil {
		return nil, newAppError(http.StatusBadGateway, "模型接口返回格式不正确")
	}
	items := []remoteModel{}
	for _, raw := range source {
		switch item := raw.(type) {
		case string:
			if strings.TrimSpace(item) != "" {
				items = append(items, remoteModel{Name: strings.TrimSpace(item)})
			}
		case map[string]any:
			name := firstString(item["id"], item["name"], item["model"])
			if name == "" {
				continue
			}
			items = append(items, remoteModel{Name: name, remoteModelPrice: readRemotePrice(item)})
		}
	}
	return items, nil
}

func fetchNewAPIPricing(ctx context.Context, baseURL string, apiKey string) map[string]remoteModelPrice {
	var payload struct {
		Data []map[string]any `json:"data"`
	}
	if err := fetchProviderJSON(ctx, providerAPIEndpoint(baseURL, "/api/pricing"), apiKey, &payload); err != nil {
		return map[string]remoteModelPrice{}
	}
	result := map[string]remoteModelPrice{}
	for _, item := range payload.Data {
		name := firstString(item["model_name"], item["model"], item["name"])
		price := readNumber(item["model_price"])
		if price == nil {
			price = readNumber(item["price"])
		}
		if price == nil {
			price = readNumber(item["input_price"])
		}
		if name != "" && price != nil {
			setRemotePriceAlias(result, name, tieredRemotePrice(*price))
		}
	}
	return result
}

func fetchNewAPIRatioConfig(ctx context.Context, baseURL string, apiKey string) map[string]remoteModelPrice {
	var payload struct {
		Data struct {
			ModelPrice map[string]any `json:"model_price"`
			ModelRatio map[string]any `json:"model_ratio"`
		} `json:"data"`
	}
	if err := fetchProviderJSON(ctx, providerAPIEndpoint(baseURL, "/api/ratio_config"), apiKey, &payload); err != nil {
		return map[string]remoteModelPrice{}
	}
	result := map[string]remoteModelPrice{}
	for _, source := range []map[string]any{payload.Data.ModelRatio, payload.Data.ModelPrice} {
		for name, value := range source {
			price := readNumber(value)
			if price != nil {
				setRemotePriceAlias(result, name, tieredRemotePrice(*price))
			}
		}
	}
	return result
}

func fetchProviderJSON(ctx context.Context, endpoint string, apiKey string, target any) error {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return err
	}
	request.Header.Set("Authorization", providers.AuthorizationHeader(apiKey))
	request.Header.Set("Accept", "application/json")
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return newAppError(response.StatusCode, "接口返回 HTTP "+itoa(response.StatusCode))
	}
	return json.NewDecoder(response.Body).Decode(target)
}

func providerModelsEndpoint(baseURL string) string {
	base := strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if strings.HasSuffix(strings.ToLower(base), "/v1") {
		return base + "/models"
	}
	return base + "/v1/models"
}

func providerAPIEndpoint(baseURL string, path string) string {
	base := strings.TrimRight(strings.TrimSpace(baseURL), "/")
	base = strings.TrimSuffix(base, "/v1")
	return base + path
}

func readRemotePrice(item map[string]any) remoteModelPrice {
	source := map[string]any{}
	for _, key := range []string{"metadata", "price", "cost", "pricing"} {
		if nested, ok := item[key].(map[string]any); ok {
			for nestedKey, value := range nested {
				source[nestedKey] = value
			}
		}
	}
	for key, value := range item {
		source[key] = value
	}
	cost1 := firstNumber(source, "cost_1k", "price_1k", "1k", "low", "base", "price", "cost")
	cost2 := firstNumber(source, "cost_2k", "price_2k", "2k", "medium")
	cost4 := firstNumber(source, "cost_4k", "price_4k", "4k", "high")
	if cost2 == nil {
		cost2 = cost1
	}
	if cost4 == nil {
		cost4 = cost2
	}
	return remoteModelPrice{Cost1K: valueOrZero(cost1), Cost2K: valueOrZero(cost2), Cost4K: valueOrZero(cost4)}
}

func firstString(values ...any) string {
	for _, value := range values {
		if text, ok := value.(string); ok && strings.TrimSpace(text) != "" {
			return strings.TrimSpace(text)
		}
	}
	return ""
}

func readNumber(value any) *float64 {
	switch item := value.(type) {
	case float64:
		return &item
	case float32:
		value := float64(item)
		return &value
	case int:
		value := float64(item)
		return &value
	case int64:
		value := float64(item)
		return &value
	case json.Number:
		if parsed, err := item.Float64(); err == nil {
			return &parsed
		}
	case string:
		if parsed, ok := parseFloat(strings.TrimSpace(item)); ok {
			return &parsed
		}
	}
	return nil
}

func firstNumber(source map[string]any, keys ...string) *float64 {
	for _, key := range keys {
		if value := readNumber(source[key]); value != nil {
			return value
		}
	}
	return nil
}

func valueOrZero(value *float64) float64 {
	if value == nil {
		return 0
	}
	return *value
}

func hasRemotePrice(price remoteModelPrice) bool {
	return price.Cost1K > 0 || price.Cost2K > 0 || price.Cost4K > 0
}

func tieredRemotePrice(price float64) remoteModelPrice {
	return remoteModelPrice{Cost1K: price, Cost2K: price, Cost4K: price}
}

func setRemotePriceAlias(target map[string]remoteModelPrice, name string, price remoteModelPrice) {
	if strings.TrimSpace(name) == "" || !hasRemotePrice(price) {
		return
	}
	target[name] = price
	normalized := normalizeRemoteModelName(name)
	if normalized != "" && normalized != name {
		target[normalized] = price
	}
}

func normalizeRemoteModelName(name string) string {
	parts := []string{}
	for _, part := range strings.FieldsFunc(name, func(r rune) bool { return r == '-' || r == '_' || r == ' ' }) {
		part = strings.TrimSpace(part)
		lower := strings.ToLower(part)
		if lower == "1k" || lower == "2k" || lower == "4k" || normalizeRatio(part) != "" || strings.Contains(part, "x") || strings.Contains(part, "×") {
			continue
		}
		parts = append(parts, part)
	}
	return strings.Join(parts, "-")
}
