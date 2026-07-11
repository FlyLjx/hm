package generation

import (
	"strings"
	"sync"

	"aipi-go/internal/providers"
)

var upstreamProviderLimiter = newUpstreamLimiter()

type upstreamLimiter struct {
	mu     sync.Mutex
	scopes map[string]*upstreamScope
}

type upstreamScope struct {
	mu sync.Mutex
}

func newUpstreamLimiter() *upstreamLimiter {
	return &upstreamLimiter{scopes: map[string]*upstreamScope{}}
}

func acquireUpstreamProvider(provider providers.Provider) func() {
	key := upstreamProviderKey(provider)
	if key == "" {
		return func() {}
	}
	scope := upstreamProviderLimiter.scope(key)
	scope.mu.Lock()
	return scope.mu.Unlock
}

func upstreamProviderKey(provider providers.Provider) string {
	if strings.TrimSpace(provider.ID) != "" {
		return "provider:" + strings.TrimSpace(provider.ID)
	}
	baseURL := strings.TrimRight(strings.TrimSpace(provider.BaseURL), "/")
	if baseURL == "" {
		return ""
	}
	return "provider-url:" + baseURL
}

func (l *upstreamLimiter) scope(key string) *upstreamScope {
	l.mu.Lock()
	defer l.mu.Unlock()
	if scope := l.scopes[key]; scope != nil {
		return scope
	}
	scope := &upstreamScope{}
	l.scopes[key] = scope
	return scope
}
