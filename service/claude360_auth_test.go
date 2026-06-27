package service

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestValidateClaude360APIKeyRejectsNonImageTokenGroup(t *testing.T) {
	var imageProbeCalled bool
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/usage/token/":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"code":true,"data":{"group":"default","model_limits_enabled":false}}`))
		case "/v1/models":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"data":[{"id":"gpt-image-2"},{"id":"gpt-5.5"}]}`))
		case "/v1/images/generations":
			imageProbeCalled = true
			http.Error(w, "should reject before probing image generation", http.StatusInternalServerError)
		default:
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
	}))
	defer server.Close()

	_, err := validateClaude360APIKey(server.URL, "sk-non-image")
	if err == nil {
		t.Fatal("expected non-image token group to be rejected")
	}
	if !strings.Contains(err.Error(), "没有 image 分组") {
		t.Fatalf("error = %q, want image group permission message", err.Error())
	}
	if imageProbeCalled {
		t.Fatal("image probe should not run for non-image token group")
	}
}

func TestValidateClaude360APIKeyAcceptsImageTokenGroupWithPromptValidation(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/usage/token/":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"code":true,"data":{"group":"image","model_limits_enabled":true,"model_limits":{"gpt-image-2":true,"gpt-5.5":true}}}`))
		case "/v1/models":
			if got := r.Header.Get("New-Api-Group"); got != Claude360ImageGroup {
				t.Fatalf("New-Api-Group = %q, want %q", got, Claude360ImageGroup)
			}
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"data":[{"id":"gpt-image-2"},{"id":"gpt-5.5"},{"id":"gpt-4.1"}]}`))
		case "/v1/images/generations":
			if got := r.Header.Get("New-Api-Group"); got != Claude360ImageGroup {
				t.Fatalf("image probe New-Api-Group = %q, want %q", got, Claude360ImageGroup)
			}
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			_, _ = w.Write([]byte(`{"error":{"message":"prompt is required"}}`))
		default:
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
	}))
	defer server.Close()

	models, err := validateClaude360APIKey(server.URL, "sk-image")
	if err != nil {
		t.Fatalf("validateClaude360APIKey returned error: %v", err)
	}
	if !containsString(models, "gpt-image-2") {
		t.Fatalf("models = %#v, want gpt-image-2", models)
	}
}

func containsString(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}
