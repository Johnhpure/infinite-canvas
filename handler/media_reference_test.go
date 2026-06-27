package handler

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"testing"
	"time"

	"github.com/basketikun/infinite-canvas/config"
	"github.com/basketikun/infinite-canvas/service"
)

func TestNormalizeReferenceMediaTypeSupportsImages(t *testing.T) {
	tests := []struct {
		name        string
		contentType string
		ext         string
		wantMime    string
		wantExt     string
	}{
		{name: "png mime", contentType: "image/png", ext: ".bin", wantMime: "image/png", wantExt: ".png"},
		{name: "webp ext fallback", contentType: "application/octet-stream", ext: ".webp", wantMime: "image/webp", wantExt: ".webp"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			mimeType, ext, ok := normalizeReferenceMediaType(tt.contentType, tt.ext)
			if !ok {
				t.Fatal("expected media type to be accepted")
			}
			if mimeType != tt.wantMime || ext != tt.wantExt {
				t.Fatalf("got (%q, %q), want (%q, %q)", mimeType, ext, tt.wantMime, tt.wantExt)
			}
		})
	}
}

func TestReferenceMediaTypeMaxBytes(t *testing.T) {
	if got := referenceMediaTypeMaxBytes("image/png"); got != referenceImageMaxBytes {
		t.Fatalf("image max bytes = %d, want %d", got, referenceImageMaxBytes)
	}
}

func TestReferenceMediaDirUsesAbsoluteSQLiteDataDir(t *testing.T) {
	previous := config.Cfg
	t.Cleanup(func() { config.Cfg = previous })
	root := t.TempDir()
	config.Cfg = config.Config{StorageDriver: "sqlite", DatabaseDSN: filepath.Join(root, "infinite-canvas.db")}

	if got := referenceMediaDir(); got != filepath.Join(root, "reference-media") {
		t.Fatalf("referenceMediaDir = %q", got)
	}
}

func TestReferenceMediaRequiresSignedAccess(t *testing.T) {
	previous := config.Cfg
	t.Cleanup(func() { config.Cfg = previous })
	root := t.TempDir()
	config.Cfg = config.Config{StorageDriver: "sqlite", DatabaseDSN: filepath.Join(root, "infinite-canvas.db"), JWTSecret: "reference-secret"}

	id := "sample.png"
	if err := os.MkdirAll(referenceMediaDir(), 0o755); err != nil {
		t.Fatalf("mkdir reference dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(referenceMediaDir(), id), []byte("png-data"), 0o644); err != nil {
		t.Fatalf("write reference media: %v", err)
	}

	unsigned := httptest.NewRecorder()
	ReferenceMedia(unsigned, httptest.NewRequest(http.MethodGet, "/api/media/references/"+id, nil), id)
	if unsigned.Code != http.StatusNotFound {
		t.Fatalf("unsigned reference media status = %d, want %d", unsigned.Code, http.StatusNotFound)
	}

	expires := time.Now().Add(time.Hour).Unix()
	signedURL := "/api/media/references/" + id + "?expires=" + strconv.FormatInt(expires, 10) + "&signature=" + service.SignAccessToken(service.AccessResourceReference, id, expires)
	signed := httptest.NewRecorder()
	ReferenceMedia(signed, httptest.NewRequest(http.MethodGet, signedURL, nil), id)
	if signed.Code != http.StatusOK {
		t.Fatalf("signed reference media status = %d, want %d", signed.Code, http.StatusOK)
	}
}
