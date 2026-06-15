package generation

import (
	"context"

	"aipi-go/internal/models"
	"aipi-go/internal/providers"
)

type ImageRequest struct {
	TaskID                string
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
	return s.callImageJSON(ctx, input, 1)
}
