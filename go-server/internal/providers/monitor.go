package providers

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"time"
)

const (
	monitorInterval = time.Minute
	monitorTimeout  = 15 * time.Second
	monitorPhase    = "service-monitor"
)

type Monitor struct {
	db     *sql.DB
	logger *slog.Logger
	client *http.Client
}

func NewMonitor(db *sql.DB, logger *slog.Logger) *Monitor {
	return &Monitor{
		db:     db,
		logger: logger,
		client: &http.Client{Timeout: monitorTimeout},
	}
}

func (m *Monitor) Start(ctx context.Context) {
	go func() {
		m.logger.Info("service monitor started", "interval", monitorInterval.String())
		m.sample(ctx)

		ticker := time.NewTicker(monitorInterval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				m.logger.Info("service monitor stopped")
				return
			case <-ticker.C:
				m.sample(ctx)
			}
		}
	}()
}

func (m *Monitor) sample(parent context.Context) {
	ctx, cancel := context.WithTimeout(parent, monitorTimeout+5*time.Second)
	defer cancel()

	providers, err := NewRepository(m.db).FindAll(ctx)
	if err != nil {
		m.logger.Error("service monitor provider query failed", "error", err)
		return
	}

	var wait sync.WaitGroup
	for _, provider := range providers {
		if provider.Status != "active" {
			continue
		}
		wait.Add(1)
		go func(item Provider) {
			defer wait.Done()
			m.sampleProvider(ctx, item)
		}(provider)
	}
	wait.Wait()
}

func (m *Monitor) sampleProvider(parent context.Context, provider Provider) {
	ctx, cancel := context.WithTimeout(parent, monitorTimeout)
	defer cancel()

	endpoint := monitorModelsEndpoint(provider.BaseURL)
	startedAt := time.Now()
	status := "failed"
	var statusCode any
	modelCount := 0
	errorMessage := ""

	request, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err == nil {
		request.Header.Set("Authorization", AuthorizationHeader(provider.APIKey))
		request.Header.Set("Accept", "application/json")
		var response *http.Response
		response, err = m.client.Do(request)
		if response != nil {
			statusCode = response.StatusCode
			body, readErr := io.ReadAll(io.LimitReader(response.Body, 2*1024*1024))
			response.Body.Close()
			if readErr == nil {
				modelCount = monitorModelCount(body)
			}
			if response.StatusCode >= 200 && response.StatusCode < 300 {
				status = "success"
			} else {
				errorMessage = fmt.Sprintf("监控失败：HTTP %d", response.StatusCode)
			}
		}
	}
	if err != nil {
		if ctx.Err() != nil {
			errorMessage = "监控超时：超过 15 秒"
		} else {
			errorMessage = err.Error()
		}
	}

	durationMS := int(time.Since(startedAt).Milliseconds())
	requestSummary, _ := json.Marshal(map[string]any{"source": monitorPhase})
	responseSummary, _ := json.Marshal(map[string]any{
		"ok":         status == "success",
		"modelCount": modelCount,
	})
	_, insertErr := m.db.ExecContext(context.Background(), `
		INSERT INTO api_call_logs
			(id, direction, provider_id, provider_type, endpoint, phase, method, status,
			 status_code, duration_ms, request_summary, response_summary, error_message)
		VALUES (?, 'upstream', ?, ?, ?, ?, 'GET', ?, ?, ?, ?, ?, ?)
	`, monitorID(), provider.ID, provider.Type, endpoint, monitorPhase, status, statusCode,
		durationMS, string(requestSummary), string(responseSummary), nullableMonitorError(errorMessage))
	if insertErr != nil {
		m.logger.Error("service monitor log insert failed", "providerId", provider.ID, "error", insertErr)
	}
}

func monitorModelsEndpoint(baseURL string) string {
	base := strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if strings.HasSuffix(strings.ToLower(base), "/v1") {
		return base + "/models"
	}
	return base + "/v1/models"
}

func monitorModelCount(body []byte) int {
	var payload struct {
		Data   []json.RawMessage `json:"data"`
		Models []json.RawMessage `json:"models"`
	}
	if json.Unmarshal(body, &payload) != nil {
		return 0
	}
	if payload.Data != nil {
		return len(payload.Data)
	}
	return len(payload.Models)
}

func nullableMonitorError(value string) any {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	return value
}

func monitorID() string {
	var bytes [16]byte
	if _, err := rand.Read(bytes[:]); err != nil {
		return fmt.Sprintf("%d", time.Now().UnixNano())
	}
	bytes[6] = (bytes[6] & 0x0f) | 0x40
	bytes[8] = (bytes[8] & 0x3f) | 0x80
	value := hex.EncodeToString(bytes[:])
	return fmt.Sprintf("%s-%s-%s-%s-%s", value[0:8], value[8:12], value[12:16], value[16:20], value[20:32])
}
