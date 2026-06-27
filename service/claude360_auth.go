package service

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
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

const (
	Claude360PlatformChannelID = "claude360-platform"
	Claude360ImageGroup        = "image"
	Claude360ImageModel        = "gpt-image-2"
	Claude360WorkflowTextModel = "gpt-5.5"
)

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
		ID:       Claude360PlatformChannelID,
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
	models, err := fetchClaude360Models(baseURL, apiKey)
	if err != nil {
		return nil, err
	}
	if err := probeClaude360ImageGroupAccess(baseURL, apiKey); err != nil {
		return nil, err
	}
	return ensureClaude360RequiredModels(models), nil
}

func fetchClaude360Models(baseURL string, apiKey string) ([]string, error) {
	endpoint := buildClaude360URL(baseURL, "/models")
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("New-Api-Group", Claude360ImageGroup)
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

func probeClaude360ImageGroupAccess(baseURL string, apiKey string) error {
	body := []byte(`{"model":"` + Claude360ImageModel + `","prompt":""}`)
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, buildClaude360URL(baseURL, "/images/generations"), bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("New-Api-Group", Claude360ImageGroup)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return safeMessageError{message: "无法验证 Claude360 image 分组权限"}
	}
	defer resp.Body.Close()
	responseBody, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
	if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden || claude360ImageProbeDenied(string(responseBody)) {
		return safeMessageError{message: "当前 Claude360 APIKEY 没有 image 分组的生图调用权限，请更换有调用权限的 APIKEY"}
	}
	if resp.StatusCode >= http.StatusInternalServerError || resp.StatusCode == http.StatusNotFound {
		return safeMessageError{message: "无法验证 Claude360 image 分组权限"}
	}
	return nil
}

func ensureClaude360RequiredModels(models []string) []string {
	result := make([]string, 0, len(models)+2)
	seen := map[string]bool{}
	for _, modelName := range models {
		modelName = strings.TrimSpace(modelName)
		if modelName != "" && !seen[modelName] {
			seen[modelName] = true
			result = append(result, modelName)
		}
	}
	for _, modelName := range []string{Claude360ImageModel, Claude360WorkflowTextModel} {
		if !seen[modelName] {
			seen[modelName] = true
			result = append(result, modelName)
		}
	}
	return result
}

func claude360ImageProbeDenied(response string) bool {
	value := strings.ToLower(response)
	for _, keyword := range []string{"无权访问", "分组", "group access", "access denied", "no channel", "model forbidden", "no model access", "does not exist"} {
		if strings.Contains(value, keyword) {
			return true
		}
	}
	return false
}

func hasClaude360ImageAccess(models []string) bool {
	for _, modelName := range models {
		if claude360ModelMatchesImage(modelName) {
			return true
		}
	}
	return false
}

func claude360ModelMatchesImage(modelName string) bool {
	value := strings.ToLower(strings.TrimSpace(modelName))
	if value == "" {
		return false
	}
	if value == Claude360ImageModel {
		return true
	}
	for _, keyword := range []string{"image", "seedream", "flux", "dall", "imagen", "midjourney", "stable-diffusion", "sdxl"} {
		if strings.Contains(value, keyword) {
			return true
		}
	}
	return false
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
