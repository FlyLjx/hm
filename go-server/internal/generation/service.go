package generation

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"aipi-go/internal/apiaccess"
	"aipi-go/internal/tasks"
)

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
	result, err := s.callImageGeneration(ctx, ImageRequest{
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
	})
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
	actualQuantity := len(ExtractImages(result))
	if actualQuantity < 1 {
		actualQuantity = task.Quantity
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
