package generation

import (
	"fmt"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"aipi-go/internal/providers"
)

func TestAcquireUpstreamProviderSerializesSameProvider(t *testing.T) {
	provider := providers.Provider{ID: "serial-provider-test", BaseURL: "https://example.test"}
	const workers = 8
	var active int64
	var maxActive int64
	var wait sync.WaitGroup
	for i := 0; i < workers; i++ {
		wait.Add(1)
		go func() {
			defer wait.Done()
			release := acquireUpstreamProvider(provider)
			defer release()
			current := atomic.AddInt64(&active, 1)
			for {
				previous := atomic.LoadInt64(&maxActive)
				if current <= previous || atomic.CompareAndSwapInt64(&maxActive, previous, current) {
					break
				}
			}
			time.Sleep(5 * time.Millisecond)
			atomic.AddInt64(&active, -1)
		}()
	}
	wait.Wait()
	if maxActive != 1 {
		t.Fatalf("expected same provider to be serialized, max active got %d", maxActive)
	}
}

func TestAcquireUpstreamProviderAllowsDifferentProviders(t *testing.T) {
	const workers = 8
	var active int64
	var maxActive int64
	var wait sync.WaitGroup
	for i := 0; i < workers; i++ {
		wait.Add(1)
		go func(index int) {
			defer wait.Done()
			release := acquireUpstreamProvider(providers.Provider{ID: fmt.Sprintf("parallel-provider-test-%d", index)})
			defer release()
			current := atomic.AddInt64(&active, 1)
			for {
				previous := atomic.LoadInt64(&maxActive)
				if current <= previous || atomic.CompareAndSwapInt64(&maxActive, previous, current) {
					break
				}
			}
			time.Sleep(5 * time.Millisecond)
			atomic.AddInt64(&active, -1)
		}(i)
	}
	wait.Wait()
	if maxActive <= 1 {
		t.Fatalf("expected different providers to run in parallel, max active got %d", maxActive)
	}
}
