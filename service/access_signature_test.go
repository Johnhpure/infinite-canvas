package service

import (
	"context"
	"net/url"
	"path/filepath"
	"testing"
	"time"

	"github.com/basketikun/infinite-canvas/config"
	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

func TestVerifySignedAccessRequiresMatchingResourceIDAndExpiry(t *testing.T) {
	previous := config.Cfg
	t.Cleanup(func() { config.Cfg = previous })
	config.Cfg.JWTSecret = "test-access-secret"

	expires := time.Now().Add(time.Hour).Unix()
	signature := SignAccessToken("file", "object-1", expires)

	if !VerifyAccessToken("file", "object-1", expires, signature) {
		t.Fatal("expected signed access token to verify for the same resource and id")
	}
	if VerifyAccessToken("file", "object-2", expires, signature) {
		t.Fatal("expected signed access token to reject a different object id")
	}
	if VerifyAccessToken("reference", "object-1", expires, signature) {
		t.Fatal("expected signed access token to reject a different resource type")
	}
	if VerifyAccessToken("file", "object-1", time.Now().Add(-time.Minute).Unix(), signature) {
		t.Fatal("expected signed access token to reject expired links")
	}
}

func TestCanAccessStorageObjectAllowsOwnerAndAdminOnly(t *testing.T) {
	object := model.StorageObject{ID: "object-1", CreatedBy: "user-1"}

	if !CanAccessStorageObject(WithUser(context.Background(), model.AuthUser{ID: "user-1", Role: model.UserRoleUser}), object) {
		t.Fatal("expected object owner to access storage object")
	}
	if CanAccessStorageObject(WithUser(context.Background(), model.AuthUser{ID: "user-2", Role: model.UserRoleUser}), object) {
		t.Fatal("expected different user to be denied")
	}
	if !CanAccessStorageObject(WithUser(context.Background(), model.AuthUser{ID: "admin-1", Role: model.UserRoleAdmin}), object) {
		t.Fatal("expected admin to access any storage object")
	}
	if CanAccessStorageObject(context.Background(), object) {
		t.Fatal("expected anonymous context to be denied")
	}
}

func TestStorageObjectAccessURLRequiresOwnerOrAdmin(t *testing.T) {
	previous := config.Cfg
	t.Cleanup(func() { config.Cfg = previous })
	root := t.TempDir()
	config.Cfg = config.Config{StorageDriver: "sqlite", DatabaseDSN: filepath.Join(root, "infinite-canvas.db"), JWTSecret: "storage-secret"}

	object := model.StorageObject{ID: "object-1", CreatedBy: "user-1", Bytes: 12, MimeType: "image/png"}
	if _, err := repository.SaveStorageObject(object); err != nil {
		t.Fatalf("save storage object: %v", err)
	}

	if _, err := StorageObjectAccessURL(WithUser(context.Background(), model.AuthUser{ID: "user-2", Role: model.UserRoleUser}), object.ID); err == nil {
		t.Fatal("expected different user to be denied")
	}

	access, err := StorageObjectAccessURL(WithUser(context.Background(), model.AuthUser{ID: "user-1", Role: model.UserRoleUser}), object.ID)
	if err != nil {
		t.Fatalf("owner access url returned error: %v", err)
	}
	if access.URL == "" || !VerifyAccessTokenFromQuery(AccessResourceFile, object.ID, mustParseQuery(t, access.URL)) {
		t.Fatalf("owner access url did not include a valid signature: %#v", access)
	}
}

func mustParseQuery(t *testing.T, rawURL string) url.Values {
	t.Helper()
	parsed, err := url.Parse(rawURL)
	if err != nil {
		t.Fatalf("parse url: %v", err)
	}
	return parsed.Query()
}
