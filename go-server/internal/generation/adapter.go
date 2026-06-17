package generation

import (
	"context"
	"fmt"

	"aipi-go/internal/models"
	"aipi-go/internal/providers"
)

const maxUpstreamImageBatch = 4

type ImageRequest struct {
	TaskID                string
	Capability            string
	Operation             string
	Provider              providers.Provider
	Model                 models.Model
	Prompt                string
	SizeTier              string
	Size                  string
	Quantity              int
	OutputFormat          string
	TransparentBackground bool
	ReferenceImageURLs    []string
	MaskImageURL          string
}

func (s *Service) callImageGeneration(ctx context.Context, input ImageRequest) (any, error) {
	if input.Quantity <= maxUpstreamImageBatch {
		return s.callImageJSON(ctx, input, 1)
	}

	images := []ExtractedImage{}
	remaining := input.Quantity
	attempt := 1
	for remaining > 0 {
		batchQuantity := maxUpstreamImageBatch
		if remaining < batchQuantity {
			batchQuantity = remaining
		}
		batchInput := input
		batchInput.TaskID = fmt.Sprintf("%s#batch-%d", input.TaskID, attempt)
		batchInput.Quantity = batchQuantity
		payload, err := s.callImageJSON(ctx, batchInput, attempt)
		if err != nil {
			return nil, err
		}
		images = append(images, ExtractImages(payload)...)
		remaining -= batchQuantity
		attempt++
	}
	return map[string]any{"data": images}, nil
}
