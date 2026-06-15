package generation

import (
	"context"
	"fmt"

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
	if input.Quantity <= 1 {
		return s.callImageJSON(ctx, input, 1)
	}

	type result struct {
		payload any
		err     error
	}
	resultCh := make(chan result, input.Quantity)
	for index := 0; index < input.Quantity; index++ {
		go func(attempt int) {
			payload, err := s.callImageJSON(ctx, ImageRequest{
				TaskID:                fmt.Sprintf("%s#%d", input.TaskID, attempt),
				Operation:             input.Operation,
				Provider:              input.Provider,
				Model:                 input.Model,
				Prompt:                input.Prompt,
				SizeTier:              input.SizeTier,
				Size:                  input.Size,
				Quantity:              1,
				OutputFormat:          input.OutputFormat,
				TransparentBackground: input.TransparentBackground,
				ReferenceImageURLs:    input.ReferenceImageURLs,
				MaskImageURL:          input.MaskImageURL,
			}, attempt)
			resultCh <- result{payload: payload, err: err}
		}(index + 1)
	}

	images := []ExtractedImage{}
	for index := 0; index < input.Quantity; index++ {
		item := <-resultCh
		if item.err != nil {
			return nil, item.err
		}
		images = append(images, ExtractImages(item.payload)...)
	}
	return map[string]any{"data": images}, nil
}
