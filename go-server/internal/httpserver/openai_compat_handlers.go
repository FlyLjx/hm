package httpserver

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"aipi-go/internal/apikeys"
	"aipi-go/internal/models"
	"aipi-go/internal/tasks"
	"aipi-go/internal/users"
)

type compatImageInput struct {
	Model          string   `json:"model"`
	Prompt         string   `json:"prompt"`
	N              int      `json:"n"`
	Size           string   `json:"size"`
	AspectRatio    string   `json:"aspect_ratio"`
	Ratio          string   `json:"ratio"`
	SizeTier       string   `json:"size_tier"`
	Resolution     string   `json:"resolution"`
	Quality        string   `json:"quality"`
	ResponseFormat string   `json:"response_format"`
	Background     string   `json:"background"`
	OutputFormat   string   `json:"output_format"`
	ReferenceURLs  []string `json:"referenceImages"`
	Image          any      `json:"image"`
	ImageURL       any      `json:"image_url"`
	Mask           any      `json:"mask"`
}

func (r *Router) compatModels(w http.ResponseWriter, req *http.Request) {
	if req.Method != http.MethodGet {
		writeMethodNotAllowed(w)
		return
	}
	ctx, cancel := context.WithTimeout(req.Context(), 8*time.Second)
	defer cancel()
	items, err := models.NewRepository(r.db).FindAll(ctx)
	if err != nil {
		writeOpenAIError(w, http.StatusInternalServerError, err.Error(), "api_error")
		return
	}
	data := []map[string]any{}
	for _, item := range uniqueCompatModels(items) {
		data = append(data, map[string]any{
			"id":       item.DisplayName,
			"object":   "model",
			"created":  item.CreatedAt.Unix(),
			"owned_by": "aipi",
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"object": "list",
		"data":   data,
		"meta": map[string]any{
			"total_count":  len(items),
			"unique_count": len(data),
		},
	})
}

func (r *Router) compatBalance(w http.ResponseWriter, req *http.Request) {
	if req.Method != http.MethodGet {
		writeMethodNotAllowed(w)
		return
	}
	auth, err := r.authenticateAPIKey(req)
	if err != nil {
		writeCompatAuthError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"object":   "balance",
		"balance":  auth.User.Credits,
		"credits":  auth.User.Credits,
		"currency": "credits",
		"user": map[string]any{
			"id":    auth.User.ID,
			"email": auth.User.Email,
		},
		"api_key": map[string]any{
			"id":     auth.APIKey.ID,
			"name":   auth.APIKey.Name,
			"prefix": auth.APIKey.KeyPrefix,
			"status": auth.APIKey.Status,
		},
	})
}

func (r *Router) compatImageGenerations(w http.ResponseWriter, req *http.Request) {
	r.compatImageRequest(w, req, false)
}

func (r *Router) compatImageEdits(w http.ResponseWriter, req *http.Request) {
	r.compatImageRequest(w, req, true)
}

func (r *Router) compatImageRequest(w http.ResponseWriter, req *http.Request, isEdit bool) {
	if req.Method != http.MethodPost {
		writeMethodNotAllowed(w)
		return
	}
	auth, err := r.authenticateAPIKey(req)
	if err != nil {
		writeCompatAuthError(w, err)
		return
	}
	var input compatImageInput
	if err := decodeCompatJSON(req, &input); err != nil {
		writeOpenAIError(w, http.StatusBadRequest, "请求参数不正确", "invalid_request_error")
		return
	}
	input.Model = strings.TrimSpace(input.Model)
	input.Prompt = strings.TrimSpace(input.Prompt)
	if input.N == 0 {
		input.N = 1
	}
	if input.Model == "" || input.Prompt == "" {
		writeOpenAIError(w, http.StatusBadRequest, "缺少模型或提示词", "invalid_request_error")
		return
	}
	if input.N < 1 || input.N > 10 {
		writeOpenAIError(w, http.StatusBadRequest, "生成数量必须在 1 到 10 之间", "invalid_request_error")
		return
	}

	ctx, cancel := context.WithTimeout(req.Context(), 8*time.Second)
	defer cancel()
	model, err := models.NewRepository(r.db).FindActiveByNameOrDisplayName(ctx, input.Model)
	if errors.Is(err, sql.ErrNoRows) || model == nil {
		writeOpenAIError(w, http.StatusNotFound, "模型不存在或已禁用", "invalid_request_error")
		return
	}
	if err != nil {
		writeOpenAIError(w, http.StatusInternalServerError, err.Error(), "api_error")
		return
	}
	size, sizeTier := resolveCompatSize(input, model.ModelName)
	if !sizeTierEnabled(model.EnabledSizeTiers, sizeTier) {
		writeOpenAIError(w, http.StatusBadRequest, "当前模型未开放 "+strings.ToUpper(sizeTier)+" 清晰度", "invalid_request_error")
		return
	}
	price := modelPriceForTier(*model, sizeTier) * float64(input.N)
	if auth.User.Credits < price {
		writeOpenAIError(w, http.StatusPaymentRequired, "用户积分不足", "insufficient_quota")
		return
	}
	outputFormat := normalizeOutputFormat(input.OutputFormat)
	transparent := strings.EqualFold(input.Background, "transparent") || outputFormat == "png"
	referencePayload := compatReferencePayload(input.ReferenceURLs)
	if isEdit {
		referencePayload = compatEditReferencePayload(input)
		if referencePayload == nil {
			writeOpenAIError(w, http.StatusBadRequest, "图片编辑缺少参考图", "invalid_request_error")
			return
		}
	}
	task := tasks.Task{
		ID:                    newID(),
		UserID:                auth.User.ID,
		ModelID:               model.ID,
		ProviderID:            model.ProviderID,
		Capability:            model.Capability,
		Prompt:                input.Prompt,
		ReferenceImageURL:     referencePayload,
		SizeTier:              sizeTier,
		Size:                  &size,
		OutputFormat:          effectiveOutputFormat(outputFormat, transparent),
		TransparentBackground: transparent,
		Quantity:              input.N,
		UserIP:                requestIP(req),
		CostCredits:           0,
		ModelCostCredits:      0,
		RemainingCredits:      auth.User.Credits,
		DurationSeconds:       0,
		Status:                tasks.StatusQueued,
		PublicStatus:          "private",
	}
	savedTask, err := tasks.NewRepository(r.db).Create(ctx, task)
	if err != nil {
		writeOpenAIError(w, http.StatusInternalServerError, err.Error(), "api_error")
		return
	}
	r.queue.Enqueue(savedTask.ID)
	finalTask, err := r.waitForCompatTask(req.Context(), savedTask.ID)
	if err != nil {
		writeOpenAIError(w, http.StatusGatewayTimeout, err.Error(), "api_error")
		return
	}
	if finalTask.Status != tasks.StatusSuccess {
		message := "图片生成失败"
		if finalTask.ErrorMessage != nil && *finalTask.ErrorMessage != "" {
			message = *finalTask.ErrorMessage
		}
		writeOpenAIError(w, http.StatusInternalServerError, message, "api_error")
		return
	}
	urls := tasks.ToPublic(finalTask).ResultURLs
	data := make([]map[string]string, 0, len(urls))
	for _, url := range urls {
		if strings.HasPrefix(url, "/") {
			url = absoluteURL(req, url)
		}
		data = append(data, map[string]string{"url": url})
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"created": time.Now().Unix(),
		"data":    data,
	})
}

func (r *Router) authenticateAPIKey(req *http.Request) (*apikeys.Authenticated, error) {
	token := bearerToken(req)
	ctx, cancel := context.WithTimeout(req.Context(), 8*time.Second)
	defer cancel()
	return apikeys.NewService(apikeys.NewRepository(r.db), users.NewRepository(r.db)).Authenticate(ctx, token)
}

func (r *Router) waitForCompatTask(ctx context.Context, id string) (*tasks.Task, error) {
	deadline := time.After(8 * time.Minute)
	ticker := time.NewTicker(1200 * time.Millisecond)
	defer ticker.Stop()
	repo := tasks.NewRepository(r.db)
	for {
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-deadline:
			return nil, errors.New("图片生成超时")
		case <-ticker.C:
			task, err := repo.FindByID(context.Background(), id)
			if err != nil {
				return nil, err
			}
			if task.Status == tasks.StatusSuccess || task.Status == tasks.StatusFailed || task.Status == tasks.StatusCanceled {
				return task, nil
			}
		}
	}
}

func writeCompatAuthError(w http.ResponseWriter, err error) {
	if errors.Is(err, apikeys.ErrMissingKey) || errors.Is(err, apikeys.ErrInvalidKey) {
		writeOpenAIError(w, http.StatusUnauthorized, err.Error(), "invalid_api_key")
		return
	}
	writeOpenAIError(w, http.StatusUnauthorized, err.Error(), "invalid_api_key")
}

func writeOpenAIError(w http.ResponseWriter, status int, message string, errorType string) {
	writeJSON(w, status, map[string]any{
		"error": map[string]any{
			"message": message,
			"type":    errorType,
			"param":   nil,
			"code":    nil,
		},
	})
}

func uniqueCompatModels(items []models.Model) []models.Model {
	seen := map[string]bool{}
	result := []models.Model{}
	for _, item := range items {
		if item.Status != "active" || item.ProviderStatus == nil || *item.ProviderStatus != "active" {
			continue
		}
		key := strings.ToLower(strings.TrimSpace(item.DisplayName))
		if key == "" || seen[key] {
			continue
		}
		seen[key] = true
		result = append(result, item)
	}
	return result
}

func resolveCompatSize(input compatImageInput, modelName string) (string, string) {
	tier := normalizeSizeTier(input.SizeTier)
	if tier == "" {
		tier = normalizeSizeTier(input.Resolution)
	}
	if tier == "" {
		tier = normalizeSizeTier(input.Quality)
	}
	if input.Size != "" {
		if tier == "" {
			tier = sizeToTier(input.Size)
		}
		return input.Size, tier
	}
	ratio := normalizeRatio(input.AspectRatio)
	if ratio == "" {
		ratio = normalizeRatio(input.Ratio)
	}
	if ratio == "" {
		ratio = ratioFromModelName(modelName)
	}
	if ratio == "" {
		ratio = "1:1"
	}
	if tier == "" {
		tier = tierFromModelName(modelName)
	}
	if tier == "" {
		tier = "1k"
	}
	return compatSizeForRatio(ratio, tier), tier
}

func normalizeSizeTier(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	if value == "1k" || value == "2k" || value == "4k" {
		return value
	}
	return ""
}

func sizeToTier(size string) string {
	parts := strings.Split(strings.ToLower(size), "x")
	maxSide := 0
	for _, part := range parts {
		n, _ := strconv.Atoi(strings.TrimSpace(part))
		if n > maxSide {
			maxSide = n
		}
	}
	if maxSide >= 3000 {
		return "4k"
	}
	if maxSide >= 2000 {
		return "2k"
	}
	return "1k"
}

func normalizeRatio(value string) string {
	value = strings.NewReplacer("×", ":", "x", ":", "X", ":", "*", ":").Replace(strings.TrimSpace(value))
	parts := strings.Split(value, ":")
	if len(parts) != 2 {
		return ""
	}
	left, errLeft := strconv.Atoi(strings.TrimSpace(parts[0]))
	right, errRight := strconv.Atoi(strings.TrimSpace(parts[1]))
	if errLeft != nil || errRight != nil || left <= 0 || right <= 0 {
		return ""
	}
	return strconv.Itoa(left) + ":" + strconv.Itoa(right)
}

func tierFromModelName(value string) string {
	lower := strings.ToLower(value)
	for _, tier := range []string{"4k", "2k", "1k"} {
		if strings.Contains(lower, "-"+tier) || strings.Contains(lower, "_"+tier) || strings.Contains(lower, " "+tier) {
			return tier
		}
	}
	return ""
}

func ratioFromModelName(value string) string {
	parts := strings.FieldsFunc(value, func(r rune) bool {
		return r == '-' || r == '_' || r == ' '
	})
	for i := len(parts) - 1; i >= 0; i-- {
		if ratio := normalizeRatio(parts[i]); ratio != "" {
			return ratio
		}
	}
	return ""
}

func compatSizeForRatio(ratio string, tier string) string {
	sizes := map[string]map[string]string{
		"1:1":  {"1k": "1024x1024", "2k": "2048x2048", "4k": "3072x3072"},
		"16:9": {"1k": "1536x864", "2k": "2048x1152", "4k": "3072x1728"},
		"9:16": {"1k": "864x1536", "2k": "1152x2048", "4k": "1728x3072"},
		"4:3":  {"1k": "1536x1152", "2k": "2048x1536", "4k": "3072x2304"},
		"3:4":  {"1k": "1152x1536", "2k": "1536x2048", "4k": "2304x3072"},
		"3:2":  {"1k": "1536x1024", "2k": "2048x1360", "4k": "3072x2048"},
		"2:3":  {"1k": "1024x1536", "2k": "1360x2048", "4k": "2048x3072"},
	}
	if sizes[ratio] == nil || sizes[ratio][tier] == "" {
		return sizes["1:1"][tier]
	}
	return sizes[ratio][tier]
}

func normalizeOutputFormat(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	if value == "jpg" {
		return "jpeg"
	}
	if value == "jpeg" || value == "png" || value == "webp" {
		return value
	}
	return "jpeg"
}

func compatReferencePayload(urls []string) *string {
	cleaned := []string{}
	for _, url := range urls {
		if strings.TrimSpace(url) != "" {
			cleaned = append(cleaned, strings.TrimSpace(url))
		}
	}
	if len(cleaned) == 0 {
		return nil
	}
	value := strings.Join(cleaned, "\n")
	return &value
}

func compatEditReferencePayload(input compatImageInput) *string {
	items := extractCompatImageURLs(input.ImageURL)
	if len(items) == 0 {
		items = extractCompatImageURLs(input.Image)
	}
	if len(input.ReferenceURLs) > 0 {
		items = append(items, input.ReferenceURLs...)
	}
	mask := firstCompatImageURL(input.Mask)
	cleaned := []string{}
	for _, item := range items {
		item = strings.TrimSpace(item)
		if item != "" {
			cleaned = append(cleaned, item)
		}
	}
	if strings.TrimSpace(mask) != "" {
		cleaned = append(cleaned, "mask:"+strings.TrimSpace(mask))
	}
	if len(cleaned) == 0 {
		return nil
	}
	bytes, _ := json.Marshal(cleaned)
	value := string(bytes)
	return &value
}

func extractCompatImageURLs(value any) []string {
	if value == nil {
		return nil
	}
	switch item := value.(type) {
	case string:
		if strings.TrimSpace(item) == "" {
			return nil
		}
		return []string{strings.TrimSpace(item)}
	case []any:
		result := []string{}
		for _, child := range item {
			result = append(result, extractCompatImageURLs(child)...)
		}
		return result
	case map[string]any:
		for _, key := range []string{"url", "image_url", "imageUrl"} {
			if result := extractCompatImageURLs(item[key]); len(result) > 0 {
				return result
			}
		}
		if nested, ok := item["image_url"].(map[string]any); ok {
			return extractCompatImageURLs(nested["url"])
		}
	}
	return nil
}

func firstCompatImageURL(value any) string {
	items := extractCompatImageURLs(value)
	if len(items) == 0 {
		return ""
	}
	return items[0]
}

func decodeCompatJSON(req *http.Request, target any) error {
	return json.NewDecoder(req.Body).Decode(target)
}

func absoluteURL(req *http.Request, path string) string {
	scheme := "http"
	if req.TLS != nil {
		scheme = "https"
	}
	if forwarded := req.Header.Get("X-Forwarded-Proto"); forwarded != "" {
		scheme = strings.Split(forwarded, ",")[0]
	}
	return scheme + "://" + req.Host + path
}
