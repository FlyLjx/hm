package generation

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"aipi-go/internal/database"
	"aipi-go/internal/pricing"
)

var ErrDuplicateResultImage = errors.New("上游返回了已被其他任务使用的图片，已阻止串图")

func (s *Service) finishSuccessWithBilling(ctx context.Context, input BillingSuccessInput) error {
	tx, err := s.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelReadCommitted})
	if err != nil {
		return err
	}
	defer tx.Rollback()

	actualQuantity := input.Quantity
	if actualQuantity < 1 {
		actualQuantity = len(ExtractImages(input.Result))
	}
	if actualQuantity < 1 {
		actualQuantity = 1
	}
	if err := s.claimResultImages(ctx, tx, input.ProviderID, input.TaskID, input.Result); err != nil {
		return err
	}
	resultBytes, _ := json.Marshal(input.Result)
	if _, err := tx.ExecContext(ctx, `
		UPDATE generation_tasks
		SET status = 'success',
			quantity = ?,
			cost_credits = ?,
			model_cost_credits = ?,
			remaining_credits = ?,
			duration_seconds = ?,
			result_json = ?,
			error_message = NULL
		WHERE id = ?
	`, actualQuantity, 0, input.ModelCostCredits, 0, input.DurationSeconds, string(resultBytes), input.TaskID); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	return nil
}

func (s *Service) claimResultImages(ctx context.Context, tx *database.Tx, providerID string, taskID string, result any) error {
	providerID = strings.TrimSpace(providerID)
	taskID = strings.TrimSpace(taskID)
	if providerID == "" || taskID == "" {
		return nil
	}
	urls := extractedImageURLs(ExtractImages(result))
	if len(urls) == 0 {
		return nil
	}
	for _, url := range urls {
		hash := resultImageHash(providerID, url)
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO generation_result_images
				(id, task_id, provider_id, url_hash, image_url)
			VALUES
				(?, ?, ?, ?, ?)
		`, newID(), taskID, providerID, hash, url); err != nil {
			if isDuplicateResultImageError(err) {
				return ErrDuplicateResultImage
			}
			return err
		}
	}
	return nil
}

func resultImageHash(providerID string, imageURL string) string {
	sum := sha256.Sum256([]byte(strings.TrimSpace(providerID) + "\n" + strings.TrimSpace(imageURL)))
	return hex.EncodeToString(sum[:])
}

func isDuplicateResultImageError(err error) bool {
	if err == nil {
		return false
	}
	message := strings.ToLower(err.Error())
	return strings.Contains(message, "duplicate") ||
		strings.Contains(message, "unique") ||
		strings.Contains(message, "duplicate entry") ||
		strings.Contains(message, "duplicate key") ||
		strings.Contains(message, "sqlstate 23505")
}

type BillingSuccessInput struct {
	TaskID           string
	UserID           string
	ProviderID       string
	Quantity         int
	CostCredits      float64
	ModelCostCredits float64
	DurationSeconds  float64
	Remark           string
	Result           any
}

func taskCost(sizeTier string, quantity int, modelPrice1k float64, modelPrice2k float64, modelPrice4k float64) float64 {
	return taskUnitPrice(sizeTier, modelPrice1k, modelPrice2k, modelPrice4k) * float64(quantity)
}

func taskUnitPrice(sizeTier string, modelPrice1k float64, modelPrice2k float64, modelPrice4k float64) float64 {
	unit := modelPrice1k
	if sizeTier == "2k" {
		unit = modelPrice2k
	}
	if sizeTier == "4k" {
		unit = modelPrice4k
	}
	return unit
}

func taskModelCost(sizeTier string, quantity int, modelCost1k float64, modelCost2k float64, modelCost4k float64) float64 {
	unit := modelCost1k
	if sizeTier == "2k" {
		unit = modelCost2k
	}
	if sizeTier == "4k" {
		unit = modelCost4k
	}
	return unit * float64(quantity)
}

func billingRemark(base string, incentive pricing.Result, discount float64, source string) string {
	if discount <= 0 {
		return base
	}
	if source == "subscription" {
		return base + " / 会员折扣"
	}
	name := incentive.PlanName
	if name == "" {
		name = "全站生图活动"
	}
	return base + " / " + name + " / 活动折扣"
}

func newID() string {
	var bytes [16]byte
	if _, err := rand.Read(bytes[:]); err != nil {
		return fmt.Sprintf("%d", time.Now().UnixNano())
	}
	bytes[6] = (bytes[6] & 0x0f) | 0x40
	bytes[8] = (bytes[8] & 0x3f) | 0x80
	value := hex.EncodeToString(bytes[:])
	return fmt.Sprintf("%s-%s-%s-%s-%s", value[0:8], value[8:12], value[12:16], value[16:20], value[20:32])
}
