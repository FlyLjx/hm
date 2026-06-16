package httpserver

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"aipi-go/internal/models"
	"aipi-go/internal/tasks"
	"aipi-go/internal/users"
)

type generateImageInput struct {
	UserID                string   `json:"userId"`
	ModelID               string   `json:"modelId"`
	Prompt                string   `json:"prompt"`
	SizeTier              string   `json:"sizeTier"`
	Size                  string   `json:"size"`
	TransparentBackground bool     `json:"transparentBackground"`
	Quantity              int      `json:"quantity"`
	ReferenceImageURL     string   `json:"referenceImageUrl"`
	ReferenceImageURLs    []string `json:"referenceImageUrls"`
	MaskImageURL          string   `json:"maskImageUrl"`
	OutputFormat          string   `json:"outputFormat"`
	OpenAIParams          any      `json:"openaiParams"`
}

func (r *Router) generateImage(w http.ResponseWriter, req *http.Request) {
	if req.Method != http.MethodPost {
		writeMethodNotAllowed(w)
		return
	}
	savedTask, err := r.createGenerationTask(req)
	if err != nil {
		writeError(w, err)
		return
	}
	r.queue.Enqueue(savedTask.ID)
	writeJSON(w, http.StatusCreated, map[string]any{"data": tasks.ToPublic(savedTask)})
}

func (r *Router) generateImageStream(w http.ResponseWriter, req *http.Request) {
	if req.Method != http.MethodPost {
		writeMethodNotAllowed(w)
		return
	}
	savedTask, err := r.createGenerationTask(req)
	if err != nil {
		writeError(w, err)
		return
	}
	r.queue.Enqueue(savedTask.ID)
	w.Header().Set("Content-Type", "text/event-stream; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache, no-transform")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)
	writeGenerationSSE(w, "task", map[string]any{"data": tasks.ToPublic(savedTask)})
	if flusher, ok := w.(http.Flusher); ok {
		flusher.Flush()
	}
	finalTask, err := r.waitForCompatTask(req.Context(), savedTask.ID)
	if err != nil {
		writeGenerationSSE(w, "error", map[string]any{"message": err.Error()})
		return
	}
	writeGenerationSSE(w, "task", map[string]any{"data": tasks.ToPublic(finalTask)})
	writeGenerationSSE(w, "done", map[string]any{"data": tasks.ToPublic(finalTask)})
}

func (r *Router) createGenerationTask(req *http.Request) (*tasks.Task, error) {
	var input generateImageInput
	if err := decodeJSON(req, &input); err != nil {
		return nil, newAppError(http.StatusBadRequest, "请求参数不正确")
	}
	input.UserID = strings.TrimSpace(input.UserID)
	input.ModelID = strings.TrimSpace(input.ModelID)
	input.Prompt = strings.TrimSpace(input.Prompt)
	input.SizeTier = defaultString(strings.TrimSpace(input.SizeTier), "1k")
	input.Size = strings.TrimSpace(input.Size)
	input.OutputFormat = normalizeOutputFormat(input.OutputFormat)
	if input.Quantity == 0 {
		input.Quantity = 1
	}
	if input.UserID == "" || input.ModelID == "" || input.Prompt == "" {
		return nil, newAppError(http.StatusBadRequest, "缺少用户、模型或提示词")
	}
	if input.Quantity < 1 || input.Quantity > 10 {
		return nil, newAppError(http.StatusBadRequest, "生成数量必须在 1 到 10 之间")
	}
	if input.SizeTier != "1k" && input.SizeTier != "2k" && input.SizeTier != "4k" {
		return nil, newAppError(http.StatusBadRequest, "清晰度参数不正确")
	}

	ctx, cancel := context.WithTimeout(req.Context(), 8*time.Second)
	defer cancel()
	model, err := models.NewRepository(r.db).FindByID(ctx, input.ModelID)
	if errors.Is(err, sql.ErrNoRows) || model == nil {
		return nil, newAppError(http.StatusNotFound, "模型不存在")
	}
	if err != nil {
		return nil, err
	}
	if model.Status != "active" {
		return nil, newAppError(http.StatusBadRequest, "模型已禁用")
	}
	if !modelNameMatchesCapability(model.ModelName, "chat_image") {
		return nil, newAppError(http.StatusBadRequest, "当前模型不是生图模型，请重新选择")
	}
	if !sizeTierEnabled(model.EnabledSizeTiers, input.SizeTier) {
		return nil, newAppError(http.StatusBadRequest, "当前模型未开放 "+strings.ToUpper(input.SizeTier)+" 清晰度，请重新选择")
	}
	user, err := users.NewRepository(r.db).FindByID(ctx, input.UserID)
	if errors.Is(err, sql.ErrNoRows) || user == nil {
		return nil, newAppError(http.StatusNotFound, "用户不存在")
	}
	if err != nil {
		return nil, err
	}
	if user.Status != "active" {
		return nil, newAppError(http.StatusForbidden, "用户已被禁用")
	}

	unitPrice, _, err := r.imageUnitPrice(ctx, user.ID, *model, input.SizeTier)
	if err != nil {
		return nil, err
	}
	price := unitPrice * float64(input.Quantity)
	if user.Credits < price {
		return nil, newAppError(http.StatusPaymentRequired, "用户积分不足")
	}
	size := input.Size
	if size == "" {
		size = defaultImageSize(input.SizeTier)
	}
	task := tasks.Task{
		ID:                    newID(),
		UserID:                user.ID,
		ModelID:               model.ID,
		ProviderID:            model.ProviderID,
		Capability:            model.Capability,
		Prompt:                input.Prompt,
		ReferenceImageURL:     referenceImagePayload(input),
		SizeTier:              input.SizeTier,
		Size:                  &size,
		OutputFormat:          effectiveOutputFormat(input.OutputFormat, input.TransparentBackground),
		TransparentBackground: input.TransparentBackground || input.OutputFormat == "png",
		Quantity:              input.Quantity,
		UserIP:                requestIP(req),
		CostCredits:           0,
		ModelCostCredits:      0,
		RemainingCredits:      user.Credits,
		DurationSeconds:       0,
		Status:                tasks.StatusQueued,
		PublicStatus:          "private",
	}
	savedTask, err := tasks.NewRepository(r.db).Create(ctx, task)
	if err != nil {
		return nil, err
	}
	if r.logger != nil {
		r.logger.Info("[generation:request-accepted]",
			"taskId", savedTask.ID,
			"userId", savedTask.UserID,
			"modelId", savedTask.ModelID,
			"sizeTier", savedTask.SizeTier,
			"size", ptrStringValue(savedTask.Size),
			"outputFormat", savedTask.OutputFormat,
			"quantity", savedTask.Quantity,
			"providerId", savedTask.ProviderID,
		)
	}
	return savedTask, nil
}

func effectiveOutputFormat(outputFormat string, transparentBackground bool) string {
	normalized := normalizeOutputFormat(outputFormat)
	if transparentBackground || normalized == "png" {
		return "png"
	}
	if normalized == "" {
		return "jpeg"
	}
	return normalized
}

func referenceImagePayload(input generateImageInput) *string {
	urls := []string{}
	if strings.TrimSpace(input.ReferenceImageURL) != "" {
		urls = append(urls, strings.TrimSpace(input.ReferenceImageURL))
	}
	for _, item := range input.ReferenceImageURLs {
		if strings.TrimSpace(item) != "" {
			urls = append(urls, strings.TrimSpace(item))
		}
	}
	if strings.TrimSpace(input.MaskImageURL) != "" {
		urls = append(urls, "mask:"+strings.TrimSpace(input.MaskImageURL))
	}
	if len(urls) == 0 {
		return nil
	}
	if len(urls) == 1 && !strings.HasPrefix(urls[0], "mask:") {
		return &urls[0]
	}
	bytes, _ := json.Marshal(urls)
	value := string(bytes)
	return &value
}

func writeGenerationSSE(w http.ResponseWriter, event string, payload any) {
	bytes, _ := json.Marshal(payload)
	_, _ = fmt.Fprintf(w, "event: %s\n", event)
	_, _ = fmt.Fprintf(w, "data: %s\n\n", bytes)
	if flusher, ok := w.(http.Flusher); ok {
		flusher.Flush()
	}
}
