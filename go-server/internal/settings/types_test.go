package settings

import "testing"

func TestSupportGroupSettingsArePublic(t *testing.T) {
	values := Settings{
		"supportGroupNumber": "123456",
		"supportGroupUrl":    "https://example.com/group",
	}
	public := Public(values)
	for _, key := range []string{"supportGroupNumber", "supportGroupUrl"} {
		if _, ok := Defaults[key]; !ok {
			t.Fatalf("Defaults missing %s", key)
		}
		if public[key] != values[key] {
			t.Fatalf("Public(%s) = %v, want %v", key, public[key], values[key])
		}
	}
}
