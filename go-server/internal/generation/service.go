package generation

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"aipi-go/internal/apiaccess"
	"aipi-go/internal/tasks"
)

const upstreamDuplicateGuardAttempts = 3

func (s *Service) Process(ctx context.Context, taskID string) error {
	startedAt := time.Now()
	task, err := s.tasks.UpdateStatus(ctx, taskID, "processing")
	if err != nil {
		return err
	}
	s.markAPIAccessLogProcessing(taskID)
	if s.hub != nil {
		s.hub.PublishTask(*task)
		s.hub.PublishProgress(taskID, map[string]any{
			"taskId":  taskID,
			"stage":   "processing",
			"message": "正在生成图片...",
			"detail":  "Go worker 已开始调用生成模型",
		})
	}

	model, provider, err := modelAndProvider(ctx, s.db, task)
	if err != nil {
		failed, _ := s.tasks.FinishFailed(context.Background(), taskID, err.Error(), time.Since(startedAt).Seconds())
		s.syncAPIAccessLogForTask(failed)
		if failed != nil && s.hub != nil {
			s.hub.PublishTask(*failed)
		}
		s.logger.Error("[generation:finished]",
			"taskId", taskID,
			"status", "failed",
			"durationSeconds", time.Since(startedAt).Seconds(),
			"error", err,
		)
		return err
	}
	if provider.Status != "active" || model.Status != "active" {
		message := "模型或接口已禁用"
		failed, _ := s.tasks.FinishFailed(context.Background(), taskID, message, time.Since(startedAt).Seconds())
		s.syncAPIAccessLogForTask(failed)
		if failed != nil && s.hub != nil {
			s.hub.PublishTask(*failed)
		}
		s.logger.Warn("[generation:finished]",
			"taskId", taskID,
			"status", "failed",
			"durationSeconds", time.Since(startedAt).Seconds(),
			"error", message,
		)
		return errors.New(message)
	}
	size := defaultImageSize(task.SizeTier)
	if task.Size != nil && *task.Size != "" {
		size = *task.Size
	}
	expectedQuantity := task.Quantity
	if expectedQuantity < 1 {
		expectedQuantity = 1
	}
	request := ImageRequest{
		TaskID:                taskID,
		Capability:            task.Capability,
		Operation:             imageOperation(task.ReferenceImageURL),
		Provider:              *provider,
		Model:                 *model,
		Prompt:                task.Prompt,
		SizeTier:              task.SizeTier,
		Size:                  size,
		Quantity:              task.Quantity,
		OutputFormat:          taskOutputFormat(task.OutputFormat, task.TransparentBackground),
		TransparentBackground: task.TransparentBackground,
		ReferenceImageURLs:    referenceImages(task.ReferenceImageURL),
		MaskImageURL:          maskImage(task.ReferenceImageURL),
	}
	releaseProvider := acquireUpstreamProvider(*provider)
	defer releaseProvider()

	result, actualQuantity, err := s.callImageGenerationWithGuards(ctx, taskID, provider.ID, expectedQuantity, request)
	if err != nil {
		failed, _ := s.tasks.FinishFailed(context.Background(), taskID, err.Error(), time.Since(startedAt).Seconds())
		s.syncAPIAccessLogForTask(failed)
		if failed != nil && s.hub != nil {
			s.hub.PublishTask(*failed)
		}
		s.logger.Error("[generation:finished]",
			"taskId", taskID,
			"status", "failed",
			"durationSeconds", time.Since(startedAt).Seconds(),
			"error", err,
		)
		return err
	}
	modelCostCredits := taskModelCost(task.SizeTier, actualQuantity, model.Cost1K, model.Cost2K, model.Cost4K)
	if err := s.finishSuccessWithBilling(ctx, BillingSuccessInput{
		TaskID:           taskID,
		UserID:           task.UserID,
		Quantity:         actualQuantity,
		CostCredits:      0,
		ModelCostCredits: modelCostCredits,
		DurationSeconds:  time.Since(startedAt).Seconds(),
		Remark:           "订阅生图：" + model.DisplayName,
		Result:           result,
	}); err != nil {
		failed, _ := s.tasks.FinishFailed(context.Background(), taskID, err.Error(), time.Since(startedAt).Seconds())
		s.syncAPIAccessLogForTask(failed)
		if failed != nil && s.hub != nil {
			s.hub.PublishTask(*failed)
		}
		s.logger.Error("[generation:finished]",
			"taskId", taskID,
			"status", "failed",
			"durationSeconds", time.Since(startedAt).Seconds(),
			"error", err,
		)
		return err
	}
	if finalTask, err := s.tasks.FindByID(context.Background(), taskID); err == nil && finalTask != nil {
		s.syncAPIAccessLogForTask(finalTask)
		if s.hub != nil {
			s.hub.PublishTask(*finalTask)
		}
	}
	s.logger.Info("[generation:finished]",
		"taskId", taskID,
		"status", "success",
		"durationSeconds", time.Since(startedAt).Seconds(),
		"costCredits", 0,
		"modelCostCredits", modelCostCredits,
		"imageCount", actualQuantity,
	)
	return nil
}

func (s *Service) callImageGenerationWithGuards(ctx context.Context, taskID string, providerID string, expectedQuantity int, request ImageRequest) (any, int, error) {
	var lastDuplicateError error
	for attempt := 1; attempt <= upstreamDuplicateGuardAttempts; attempt++ {
		result, err := s.callImageGeneration(ctx, request)
		if err != nil {
			return nil, 0, err
		}
		images := ExtractImages(result)
		actualQuantity := len(images)
		if actualQuantity < expectedQuantity {
			return nil, actualQuantity, fmt.Errorf("上游实际返回 %d 张，少于请求的 %d 张", actualQuantity, expectedQuantity)
		}
		urls := extractedImageURLs(images)
		duplicateTaskID, duplicateURL, err := s.tasks.FindRecentSuccessfulTaskByResultURL(ctx, providerID, taskID, urls)
		if err != nil {
			return nil, actualQuantity, err
		}
		if duplicateURL == "" {
			return result, actualQuantity, nil
		}
		lastDuplicateError = fmt.Errorf("上游返回了已被其他任务使用的图片，已阻止串图")
		if s.logger != nil {
			s.logger.Warn("generation upstream duplicate image blocked",
				"taskId", taskID,
				"duplicateTaskId", duplicateTaskID,
				"duplicateUrl", trimLong(duplicateURL, 180),
				"attempt", attempt,
				"maxAttempts", upstreamDuplicateGuardAttempts,
			)
		}
		if attempt < upstreamDuplicateGuardAttempts {
			if err := sleepImageRetry(ctx, attempt); err != nil {
				return nil, actualQuantity, err
			}
		}
	}
	return nil, 0, lastDuplicateError
}

func extractedImageURLs(images []ExtractedImage) []string {
	result := []string{}
	seen := map[string]bool{}
	for _, image := range images {
		url := strings.TrimSpace(image.URL)
		if url == "" || seen[url] {
			continue
		}
		seen[url] = true
		result = append(result, url)
	}
	return result
}

func (s *Service) markAPIAccessLogProcessing(taskID string) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = apiaccess.NewRepository(s.db).MarkLogsProcessingForTask(ctx, taskID)
}

func (s *Service) syncAPIAccessLogForTask(task *tasks.Task) {
	if task == nil {
		return
	}
	status := ""
	imageCount := 0
	message := ""
	switch task.Status {
	case tasks.StatusSuccess:
		status = "success"
		imageCount = len(tasks.ResultURLs(task.ResultJSON))
		if imageCount < 1 {
			imageCount = task.Quantity
		}
		if imageCount < 1 {
			imageCount = 1
		}
	case tasks.StatusFailed, tasks.StatusCanceled:
		status = "failed"
		if task.ErrorMessage != nil && strings.TrimSpace(*task.ErrorMessage) != "" {
			message = strings.TrimSpace(*task.ErrorMessage)
		} else if task.Status == tasks.StatusCanceled {
			message = "任务已取消"
		} else {
			message = "图片生成失败"
		}
	default:
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = apiaccess.NewRepository(s.db).FinishLogsForTask(ctx, task.ID, status, imageCount, message)
}

func taskOutputFormat(format string, transparent bool) string {
	if transparent || strings.EqualFold(format, "png") {
		return "png"
	}
	format = strings.ToLower(strings.TrimSpace(format))
	switch format {
	case "jpg":
		return "jpeg"
	case "jpeg", "webp":
		return format
	}
	return "jpeg"
}

func imageOperation(raw *string) string {
	if raw == nil || strings.TrimSpace(*raw) == "" {
		return "generation"
	}
	return "edit"
}

func referenceImages(raw *string) []string {
	if raw == nil || strings.TrimSpace(*raw) == "" {
		return nil
	}
	text := strings.TrimSpace(*raw)
	if strings.HasPrefix(text, "[") {
		var items []string
		if err := json.Unmarshal([]byte(text), &items); err == nil {
			result := []string{}
			for _, item := range items {
				item = strings.TrimSpace(item)
				if item != "" && !strings.HasPrefix(item, "mask:") {
					result = append(result, item)
				}
			}
			return result
		}
	}
	if strings.HasPrefix(text, "mask:") {
		return nil
	}
	return []string{text}
}

func maskImage(raw *string) string {
	if raw == nil || strings.TrimSpace(*raw) == "" {
		return ""
	}
	text := strings.TrimSpace(*raw)
	if strings.HasPrefix(text, "[") {
		var items []string
		if err := json.Unmarshal([]byte(text), &items); err == nil {
			for _, item := range items {
				item = strings.TrimSpace(item)
				if strings.HasPrefix(item, "mask:") {
					return strings.TrimPrefix(item, "mask:")
				}
			}
		}
	}
	if strings.HasPrefix(text, "mask:") {
		return strings.TrimPrefix(text, "mask:")
	}
	return ""
}
