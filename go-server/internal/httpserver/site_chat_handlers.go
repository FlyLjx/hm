package httpserver

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"

	"aipi-go/internal/models"
	"aipi-go/internal/providers"
	"aipi-go/internal/users"
)

func (r *Router) siteChatCompletions(w http.ResponseWriter, req *http.Request) {
	if req.Method != http.MethodPost {
		writeMethodNotAllowed(w)
		return
	}
	var input struct {
		UserID   string           `json:"userId"`
		Messages []map[string]any `json:"messages"`
		Stream   bool             `json:"stream"`
	}
	if err := decodeCompatJSON(req, &input); err != nil {
		writeError(w, newAppError(http.StatusBadRequest, "请求参数不正确"))
		return
	}
	if strings.TrimSpace(input.UserID) == "" || len(input.Messages) == 0 {
		writeError(w, newAppError(http.StatusBadRequest, "缺少用户或消息"))
		return
	}
	ctx, cancel := context.WithTimeout(req.Context(), 10*time.Second)
	defer cancel()
	user, err := users.NewRepository(r.db).FindByID(ctx, input.UserID)
	if errors.Is(err, sql.ErrNoRows) || user == nil || user.Status != "active" {
		writeError(w, newAppError(http.StatusNotFound, "用户不存在或已禁用"))
		return
	}
	if err != nil {
		writeError(w, err)
		return
	}
	model, err := models.NewRepository(r.db).FindActiveByNameOrDisplayName(ctx, "gpt-5-5")
	if errors.Is(err, sql.ErrNoRows) || model == nil {
		writeError(w, newAppError(http.StatusBadRequest, "请先在后台模型管理中添加并启用 gpt-5-5，用于前台对话聊天"))
		return
	}
	if err != nil {
		writeError(w, err)
		return
	}
	provider, err := providers.NewRepository(r.db).FindByID(ctx, model.ProviderID)
	if err != nil || provider.Status != "active" {
		writeError(w, newAppError(http.StatusBadRequest, "聊天模型接口未启用"))
		return
	}
	body := map[string]any{"model": model.ModelName, "messages": input.Messages, "stream": input.Stream}
	if input.Stream {
		r.siteChatStream(w, req, *provider, body, user.Credits)
		return
	}
	body["stream"] = false
	responseBytes, _, err := postOpenAIJSON(req.Context(), *provider, "chat/completions", body)
	if err != nil {
		writeError(w, newAppError(upstreamStatus(err), err.Error()))
		return
	}
	var payload any
	_ = json.Unmarshal(responseBytes, &payload)
	text := strings.TrimSpace(extractText(payload))
	if text == "" {
		writeError(w, newAppError(http.StatusBadGateway, "上游聊天接口未返回内容"))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"data": map[string]any{
			"message":          map[string]any{"role": "assistant", "content": text},
			"costCredits":      0,
			"remainingCredits": user.Credits,
		},
	})
}

func (r *Router) siteChatStream(w http.ResponseWriter, req *http.Request, provider providers.Provider, body map[string]any, remainingCredits float64) {
	payload, _ := json.Marshal(body)
	upstreamReq, err := http.NewRequestWithContext(req.Context(), http.MethodPost, openAIProxyEndpoint(provider, "chat/completions"), bytes.NewReader(payload))
	if err != nil {
		writeError(w, err)
		return
	}
	upstreamReq.Header.Set("Authorization", "Bearer "+provider.APIKey)
	upstreamReq.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(upstreamReq)
	if err != nil {
		writeError(w, newAppError(http.StatusBadGateway, "上游接口连接失败："+err.Error()))
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		bodyBytes, _ := io.ReadAll(io.LimitReader(resp.Body, 2*1024*1024))
		writeError(w, newAppError(resp.StatusCode, upstreamErrorMessage(bodyBytes, resp.StatusCode)))
		return
	}
	w.Header().Set("Content-Type", "text/event-stream; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache, no-transform")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)
	writeGenerationSSE(w, "start", map[string]any{"model": body["model"]})
	decoder := json.NewDecoder(resp.Body)
	_ = decoder
	buffer, _ := io.ReadAll(resp.Body)
	text := parseSSEText(string(buffer))
	for _, chunk := range splitTextChunks(text, 32) {
		writeGenerationSSE(w, "delta", map[string]any{"text": chunk})
	}
	writeGenerationSSE(w, "done", map[string]any{
		"message":          map[string]any{"role": "assistant", "content": text},
		"costCredits":      0,
		"remainingCredits": remainingCredits,
	})
}

func extractText(value any) string {
	if text, ok := value.(string); ok {
		return text
	}
	payload, ok := value.(map[string]any)
	if !ok {
		return ""
	}
	for _, key := range []string{"content", "text", "message", "output_text"} {
		if text, ok := payload[key].(string); ok {
			return text
		}
	}
	if choices, ok := payload["choices"].([]any); ok {
		parts := []string{}
		for _, choice := range choices {
			if item, ok := choice.(map[string]any); ok {
				if message, ok := item["message"].(map[string]any); ok {
					parts = append(parts, extractText(message))
				}
				if delta, ok := item["delta"].(map[string]any); ok {
					parts = append(parts, extractText(delta))
				}
				if text, ok := item["text"].(string); ok {
					parts = append(parts, text)
				}
			}
		}
		return strings.Join(parts, "")
	}
	return ""
}

func parseSSEText(raw string) string {
	parts := []string{}
	for _, block := range strings.Split(raw, "\n\n") {
		for _, line := range strings.Split(block, "\n") {
			line = strings.TrimSpace(strings.TrimPrefix(line, "data:"))
			if line == "" || line == "[DONE]" {
				continue
			}
			var payload any
			if json.Unmarshal([]byte(line), &payload) == nil {
				parts = append(parts, extractText(payload))
			}
		}
	}
	return strings.Join(parts, "")
}

func splitTextChunks(text string, size int) []string {
	if text == "" {
		return []string{"没有返回内容"}
	}
	runes := []rune(text)
	result := []string{}
	for start := 0; start < len(runes); start += size {
		end := start + size
		if end > len(runes) {
			end = len(runes)
		}
		result = append(result, string(runes[start:end]))
	}
	return result
}
