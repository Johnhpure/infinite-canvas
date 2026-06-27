package service

import "testing"

func TestNormalizeDraftConfigDefaultsToImagesAPI(t *testing.T) {
	config := normalizeDraftConfig(map[string]any{})
	if got := config["apiMode"]; got != "images" {
		t.Fatalf("apiMode = %#v, want images", got)
	}
}

func TestNormalizeDraftConfigPreservesExplicitResponsesAPI(t *testing.T) {
	config := normalizeDraftConfig(map[string]any{"apiMode": "responses"})
	if got := config["apiMode"]; got != "responses" {
		t.Fatalf("apiMode = %#v, want responses", got)
	}
}
