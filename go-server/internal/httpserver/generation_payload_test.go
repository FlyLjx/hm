package httpserver

import (
	"encoding/json"
	"net/http/httptest"
	"testing"
)

func TestReferenceImagePayloadAbsolutizesRelativeURLs(t *testing.T) {
	req := httptest.NewRequest("POST", "http://example.test/api/generate/image", nil)
	payload := referenceImagePayload(req, generateImageInput{
		ReferenceImageURL:  "/api/tasks/task-1/images/0",
		ReferenceImageURLs: []string{"/api/tasks/task-1/images/0", "data:image/png;base64,abc"},
		MaskImageURL:       "/api/tasks/task-1/images/0/mask",
	})
	if payload == nil {
		t.Fatal("expected reference payload")
	}
	var items []string
	if err := json.Unmarshal([]byte(*payload), &items); err != nil {
		t.Fatalf("decode payload: %v", err)
	}
	want := []string{
		"http://example.test/api/tasks/task-1/images/0",
		"data:image/png;base64,abc",
		"mask:http://example.test/api/tasks/task-1/images/0/mask",
	}
	if len(items) != len(want) {
		t.Fatalf("expected %d payload items, got %#v", len(want), items)
	}
	for index := range want {
		if items[index] != want[index] {
			t.Fatalf("payload item %d should be %q, got %q", index, want[index], items[index])
		}
	}
}

func TestCompatEditReferencePayloadAbsolutizesRelativeURLs(t *testing.T) {
	req := httptest.NewRequest("POST", "https://aipi.example.test/v1/images/edits", nil)
	payload := compatEditReferencePayload(req, compatImageInput{
		ImageURL: map[string]any{"url": "/api/tasks/task-2/images/0"},
		Mask:     "/api/tasks/task-2/images/0/mask",
	})
	if payload == nil {
		t.Fatal("expected reference payload")
	}
	var items []string
	if err := json.Unmarshal([]byte(*payload), &items); err != nil {
		t.Fatalf("decode payload: %v", err)
	}
	want := []string{
		"https://aipi.example.test/api/tasks/task-2/images/0",
		"mask:https://aipi.example.test/api/tasks/task-2/images/0/mask",
	}
	if len(items) != len(want) {
		t.Fatalf("expected %d payload items, got %#v", len(want), items)
	}
	for index := range want {
		if items[index] != want[index] {
			t.Fatalf("payload item %d should be %q, got %q", index, want[index], items[index])
		}
	}
}
