package operations

import (
	"testing"
	"time"
)

func TestGenerationUsageQuantityUsesActualSuccessImages(t *testing.T) {
	resultJSON := `{"data":[{"url":"https://cdn.example.test/a.png"},{"url":"https://cdn.example.test/b.png"},{"url":"https://cdn.example.test/c.png"}]}`

	got := generationUsageQuantity("success", 5, resultJSON)
	if got != 3 {
		t.Fatalf("expected actual result image count, got %d", got)
	}
}

func TestGenerationUsageQuantityReservesRequestedQuantityForRunningTask(t *testing.T) {
	got := generationUsageQuantity("processing", 5, "")
	if got != 5 {
		t.Fatalf("expected requested quantity reservation, got %d", got)
	}
}

func TestGenerationUsageQuantityFallsBackToRequestedQuantity(t *testing.T) {
	got := generationUsageQuantity("success", 2, `{"data":[]}`)
	if got != 2 {
		t.Fatalf("expected fallback quantity, got %d", got)
	}
}

func TestShouldHitLotteryPrizeReturnsFalseWhenMonthlyLimitIsUsed(t *testing.T) {
	got, err := shouldHitLotteryPrize([]LotteryPrize{
		{MonthlyStock: 7, MonthUsed: 7, Weight: 1},
	}, time.Date(2026, 7, 6, 12, 0, 0, 0, time.Local), 100)
	if err != nil {
		t.Fatal(err)
	}
	if got {
		t.Fatal("expected no hit after monthly limit is used")
	}
}

func TestShouldHitLotteryPrizeAllowsUnlimitedPrize(t *testing.T) {
	got, err := shouldHitLotteryPrize([]LotteryPrize{
		{MonthlyStock: 0, MonthUsed: 0, Weight: 1},
	}, time.Date(2026, 7, 6, 12, 0, 0, 0, time.Local), 100)
	if err != nil {
		t.Fatal(err)
	}
	if !got {
		t.Fatal("expected unlimited lottery prize to be drawable")
	}
}

func TestShouldHitLotteryPrizeCatchesUpNearMonthEnd(t *testing.T) {
	got, err := shouldHitLotteryPrize([]LotteryPrize{
		{MonthlyStock: 7, MonthUsed: 1, Weight: 1},
	}, time.Date(2026, 7, 31, 12, 0, 0, 0, time.Local), 100)
	if err != nil {
		t.Fatal(err)
	}
	if !got {
		t.Fatal("expected remaining monthly quota to be drawable near month end")
	}
}
