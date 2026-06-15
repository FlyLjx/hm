package generation

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"aipi-go/internal/providers"
)

func (s *Service) callImageJSON(ctx context.Context, input ImageRequest, attempt int) (any, error) {
	body := map[string]any{
		"model":           input.Model.ModelName,
		"prompt":          buildUpstreamPrompt(input.Prompt, input.Size, input.SizeTier, input.Model.AppendSizeToPrompt, input.TransparentBackground),
		"size":            input.Size,
		"n":               input.Quantity,
		"quality":         "high",
		"response_format": "url",
	}
	if input.OutputFormat != "" {
		body["output_format"] = input.OutputFormat
	}
	if input.TransparentBackground {
		body["background"] = "transparent"
	}
	if len(input.ReferenceImageURLs) > 0 {
		items := make([]map[string]string, 0, len(input.ReferenceImageURLs))
		for _, url := range input.ReferenceImageURLs {
			if strings.TrimSpace(url) == "" {
				continue
			}
			items = append(items, map[string]string{"url": strings.TrimSpace(url)})
		}
		if len(items) > 0 {
			body["referenceImages"] = items
			body["referenceImage"] = map[string]any{
				"count": len(items),
				"items": items,
			}
		}
	}
	if strings.TrimSpace(input.MaskImageURL) != "" {
		body["maskImage"] = map[string]string{"url": strings.TrimSpace(input.MaskImageURL)}
	}
	payload, _ := json.Marshal(body)
	endpoint := imageEndpoint(input.Provider, input.Operation)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(payload))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+input.Provider.APIKey)
	req.Header.Set("Content-Type", "application/json")

	startedAt := time.Now()
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("上游接口连接失败：%w", err)
	}
	defer resp.Body.Close()

	responseBytes, _ := io.ReadAll(io.LimitReader(resp.Body, 8*1024*1024))
	var responseJSON any
	_ = json.Unmarshal(responseBytes, &responseJSON)
	s.logger.Info("generation upstream image response",
		"taskId", input.TaskID,
		"providerId", input.Provider.ID,
		"attempt", attempt,
		"status", resp.StatusCode,
		"durationMs", time.Since(startedAt).Milliseconds(),
		"imageCount", len(ExtractImages(responseJSON)),
	)
	if isHTMLResponse(resp, responseBytes) {
		return nil, errors.New("上游返回了网页 HTML，不是图片接口 JSON，请检查接口 Base URL")
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		message := cleanUpstreamError(responseJSON, string(responseBytes))
		if message == "" {
			message = fmt.Sprintf("上游接口调用失败：%d", resp.StatusCode)
		}
		return nil, errors.New(message)
	}
	if len(ExtractImages(responseJSON)) == 0 {
		message := cleanUpstreamError(responseJSON, string(responseBytes))
		if message != "" {
			return nil, errors.New("上游接口未返回图片结果：" + message)
		}
		return nil, errors.New("上游接口未返回图片结果")
	}
	return NormalizeImageResultForProvider(responseJSON, input.Provider), nil
}

func imageEndpoint(provider providers.Provider, operation string) string {
	baseURL := strings.TrimRight(provider.BaseURL, "/")
	if provider.Type == "custom" || provider.Type == "newapi" {
		if !strings.HasSuffix(baseURL, "/v1") {
			baseURL += "/v1"
		}
	}
	if operation == "edit" {
		return baseURL + "/images/edits"
	}
	return baseURL + "/images/generations"
}
