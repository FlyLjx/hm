package generation

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"aipi-go/internal/pricing"
	"aipi-go/internal/settings"
)

func (s *Service) Process(ctx context.Context, taskID string) error {
	startedAt := time.Now()
	task, err := s.tasks.UpdateStatus(ctx, taskID, "processing")
	if err != nil {
		return err
	}
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
		_, _ = s.tasks.FinishFailed(ctx, taskID, message, time.Since(startedAt).Seconds())
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
	baseUnitPrice := taskUnitPrice(task.SizeTier, model.Price1K, model.Price2K, model.Price4K)
	incentive, err := s.pricingIncentive(ctx, task.UserID)
	if err != nil {
		failed, _ := s.tasks.FinishFailed(context.Background(), taskID, err.Error(), time.Since(startedAt).Seconds())
		if failed != nil && s.hub != nil {
			s.hub.PublishTask(*failed)
		}
		return err
	}
	subscriptionDiscount, err := pricing.CurrentSubscriptionDiscount(ctx, s.db, task.UserID)
	if err != nil {
		failed, _ := s.tasks.FinishFailed(context.Background(), taskID, err.Error(), time.Since(startedAt).Seconds())
		if failed != nil && s.hub != nil {
			s.hub.PublishTask(*failed)
		}
		return err
	}
	unitPrice, appliedDiscount, discountSource := pricing.ApplyUnitPrice(baseUnitPrice, incentive, subscriptionDiscount)
	costCredits := unitPrice * float64(task.Quantity)
	modelCostCredits := taskModelCost(task.SizeTier, task.Quantity, model.Cost1K, model.Cost2K, model.Cost4K)
	if err := s.finishSuccessWithBilling(ctx, BillingSuccessInput{
		TaskID:           taskID,
		UserID:           task.UserID,
		CostCredits:      costCredits,
		ModelCostCredits: modelCostCredits,
		DurationSeconds:  time.Since(startedAt).Seconds(),
		Remark:           billingRemark("图片生成："+model.DisplayName, incentive, appliedDiscount, discountSource),
		Result:           result,
	}); err != nil {
		failed, _ := s.tasks.FinishFailed(context.Background(), taskID, err.Error(), time.Since(startedAt).Seconds())
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
	if finalTask, err := s.tasks.FindByID(context.Background(), taskID); err == nil && finalTask != nil && s.hub != nil {
		s.hub.PublishTask(*finalTask)
	}
	s.logger.Info("[generation:finished]",
		"taskId", taskID,
		"status", "success",
		"durationSeconds", time.Since(startedAt).Seconds(),
		"costCredits", costCredits,
		"modelCostCredits", modelCostCredits,
		"imageCount", len(ExtractImages(result)),
	)
	return nil
}

func (s *Service) pricingIncentive(ctx context.Context, userID string) (pricing.Result, error) {
	values, err := settings.NewRepository(s.db).Get(ctx)
	if err != nil {
		return pricing.Result{}, err
	}
	return pricing.Evaluate(ctx, s.db, values, userID, time.Now())
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
