package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/basketikun/infinite-canvas/config"
	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

type Claude360APIKeySession struct {
	model.AuthSession
	BaseURL string   `json:"baseUrl"`
	Models  []string `json:"models"`
}

type claude360UsageResponse struct {
	Success bool `json:"success"`
	Code    bool `json:"code"`
	Data    struct {
		Name               string          `json:"name"`
		ModelLimits        map[string]bool `json:"model_limits"`
		ModelLimitsEnabled bool            `json:"model_limits_enabled"`
	} `json:"data"`
	Message string `json:"message"`
	Msg     string `json:"msg"`
}

type claude360ModelsResponse struct {
	Data []struct {
		ID string `json:"id"`
	} `json:"data"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error"`
	Message string `json:"message"`
	Msg     string `json:"msg"`
	Success *bool  `json:"success"`
}

func LoginWithClaude360APIKey(apiKey string) (Claude360APIKeySession, error) {
	apiKey = strings.TrimSpace(apiKey)
	if apiKey == "" {
		return Claude360APIKeySession{}, safeMessageError{message: "请输入 Claude360 APIKEY"}
	}
	baseURL := claude360APIBaseURL()
	models, err := validateClaude360APIKey(baseURL, apiKey)
	if err != nil {
		return Claude360APIKeySession{}, err
	}
	user, err := upsertClaude360APIKeyUser(apiKey)
	if err != nil {
		return Claude360APIKeySession{}, err
	}
	session, err := newSession(user)
	if err != nil {
		return Claude360APIKeySession{}, err
	}
	return Claude360APIKeySession{AuthSession: session, BaseURL: baseURL, Models: models}, nil
}

func Claude360ModelChannelForUser(userID string) (model.ModelChannel, bool, error) {
	user, ok, err := repository.GetUserByID(userID)
	if err != nil || !ok {
		return model.ModelChannel{}, false, err
	}
	apiKey, ok := claude360APIKeyFromExtra(user.Extra)
	if !ok {
		return model.ModelChannel{}, false, nil
	}
	return model.ModelChannel{
		ID:       "claude360-platform",
		Protocol: "openai",
		Name:     "Claude360 平台模型",
		BaseURL:  claude360APIBaseURL(),
		APIKey:   apiKey,
		Weight:   1,
		Timeout:  600,
		Enabled:  true,
	}, true, nil
}

func claude360APIKeyFromExtra(extra string) (string, bool) {
	var payload struct {
		Claude360APIKey string `json:"claude360ApiKey"`
	}
	if strings.TrimSpace(extra) == "" || json.Unmarshal([]byte(extra), &payload) != nil {
		return "", false
	}
	apiKey := strings.TrimSpace(payload.Claude360APIKey)
	return apiKey, apiKey != ""
}

func claude360APIBaseURL() string {
	baseURL := strings.TrimRight(strings.TrimSpace(config.Cfg.Claude360APIBaseURL), "/")
	if baseURL == "" {
		return "http://127.0.0.1:3000"
	}
	return baseURL
}

func validateClaude360APIKey(baseURL string, apiKey string) ([]string, error) {
	endpoint := buildClaude360URL(baseURL, "/models")
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, safeMessageError{message: "无法连接 Claude360 本机接口"}
	}
	defer resp.Body.Close()
	var payload claude360ModelsResponse
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return nil, safeMessageError{message: "Claude360 接口返回异常"}
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, safeMessageError{message: firstNonEmpty(payload.Message, payload.Msg, errorMessage(payload), "Claude360 APIKEY 无效")}
	}
	if payload.Success != nil && !*payload.Success {
		return nil, safeMessageError{message: firstNonEmpty(payload.Message, payload.Msg, errorMessage(payload), "Claude360 APIKEY 无效")}
	}
	return filterClaude360Models(baseURL, apiKey, payload), nil
}

func filterClaude360Models(baseURL string, apiKey string, payload claude360ModelsResponse) []string {
	models := make([]string, 0, len(payload.Data))
	for _, item := range payload.Data {
		if id := strings.TrimSpace(item.ID); id != "" {
			models = append(models, id)
		}
	}
	limits, enabled := claude360TokenModelLimits(baseURL, apiKey)
	if !enabled {
		return models
	}
	if len(limits) == 0 {
		return []string{}
	}
	allowed := make(map[string]bool, len(limits))
	for modelName := range limits {
		if strings.TrimSpace(modelName) != "" {
			allowed[modelName] = true
		}
	}
	filtered := make([]string, 0, len(models))
	for _, modelName := range models {
		if allowed[modelName] {
			filtered = append(filtered, modelName)
		}
	}
	return filtered
}

func claude360TokenModelLimits(baseURL string, apiKey string) (map[string]bool, bool) {
	endpoint := strings.TrimRight(claude360RootURL(baseURL), "/") + "/api/usage/token/"
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, false
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, false
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, false
	}
	var payload claude360UsageResponse
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return nil, false
	}
	return payload.Data.ModelLimits, payload.Data.ModelLimitsEnabled
}

func claude360RootURL(baseURL string) string {
	parsed, err := url.Parse(baseURL)
	if err == nil && parsed.Scheme != "" && parsed.Host != "" {
		parsed.RawQuery = ""
		parsed.Fragment = ""
		parsed.Path = strings.TrimRight(parsed.Path, "/")
		if strings.HasSuffix(strings.ToLower(parsed.Path), "/v1") {
			parsed.Path = strings.TrimRight(parsed.Path[:len(parsed.Path)-3], "/")
		}
		return strings.TrimRight(parsed.String(), "/")
	}
	return strings.TrimRight(strings.TrimSuffix(baseURL, "/v1"), "/")
}

func buildClaude360URL(baseURL string, path string) string {
	parsed, err := url.Parse(baseURL)
	if err == nil && parsed.Scheme != "" && parsed.Host != "" {
		parsed.RawQuery = ""
		parsed.Fragment = ""
		parsed.Path = strings.TrimRight(parsed.Path, "/")
		if !strings.HasSuffix(strings.ToLower(parsed.Path), "/v1") {
			parsed.Path += "/v1"
		}
		return strings.TrimRight(parsed.String(), "/") + path
	}
	return strings.TrimRight(baseURL, "/") + "/v1" + path
}

func upsertClaude360APIKeyUser(apiKey string) (model.User, error) {
	fingerprint := claude360APIKeyFingerprint(apiKey)
	username := "claude360_" + fingerprint[:16]
	current := now()
	user, ok, err := repository.GetUserByUsername(username)
	if err != nil {
		return model.User{}, err
	}
	if !ok {
		user = model.User{
			ID:          newID("user"),
			Username:    username,
			DisplayName: "Claude360 用户 " + fingerprint[:8],
			Role:        model.UserRoleUser,
			AffCode:     newAffCode(),
			Status:      model.UserStatusActive,
			CreatedAt:   current,
		}
	} else if user.Status == model.UserStatusBan {
		return model.User{}, safeMessageError{message: "账号已被禁用"}
	}
	user.LastLoginAt = current
	user.UpdatedAt = current
	extra, _ := json.Marshal(map[string]string{
		"claude360ApiKey":            apiKey,
		"claude360ApiKeyFingerprint": fingerprint,
	})
	user.Extra = string(extra)
	user, err = repository.SaveUser(user)
	if err != nil {
		return model.User{}, err
	}
	return user, nil
}

func claude360APIKeyFingerprint(apiKey string) string {
	sum := sha256.Sum256([]byte(apiKey))
	return hex.EncodeToString(sum[:])
}

func errorMessage(payload claude360ModelsResponse) string {
	if payload.Error != nil {
		return payload.Error.Message
	}
	return ""
}
