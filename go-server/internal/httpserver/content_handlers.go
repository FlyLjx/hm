package httpserver

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"aipi-go/internal/content"
	"aipi-go/internal/models"
	"aipi-go/internal/providers"
)

func (r *Router) publicAnnouncements(w http.ResponseWriter, req *http.Request) {
	if req.Method != http.MethodGet {
		writeMethodNotAllowed(w)
		return
	}
	ctx, cancel := context.WithTimeout(req.Context(), 8*time.Second)
	defer cancel()
	items, err := content.NewRepository(r.db).FindAnnouncements(ctx, true, strings.TrimSpace(req.URL.Query().Get("userId")))
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": items})
}

func (r *Router) announcements(w http.ResponseWriter, req *http.Request) {
	if _, err := r.requireAdmin(req); err != nil {
		writeError(w, err)
		return
	}
	ctx, cancel := context.WithTimeout(req.Context(), 8*time.Second)
	defer cancel()
	repo := content.NewRepository(r.db)
	switch req.Method {
	case http.MethodGet:
		items, err := repo.FindAnnouncements(ctx, false, "")
		if err != nil {
			writeError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"data": items})
	case http.MethodPost:
		var input content.Announcement
		if err := decodeCompatJSON(req, &input); err != nil {
			writeError(w, newAppError(http.StatusBadRequest, "请求参数不正确"))
			return
		}
		input.ID = defaultString(strings.TrimSpace(input.ID), newID())
		item, err := repo.SaveAnnouncement(ctx, input)
		if err != nil {
			writeError(w, err)
			return
		}
		writeJSON(w, http.StatusCreated, map[string]any{"data": item})
	default:
		writeMethodNotAllowed(w)
	}
}

func (r *Router) generateAnnouncement(w http.ResponseWriter, req *http.Request) {
	if req.Method != http.MethodPost {
		writeMethodNotAllowed(w)
		return
	}
	if _, err := r.requireAdmin(req); err != nil {
		writeError(w, err)
		return
	}
	var input struct {
		Prompt      string `json:"prompt"`
		Title       string `json:"title"`
		Content     string `json:"content"`
		DisplayMode string `json:"displayMode"`
		TargetType  string `json:"targetType"`
	}
	if err := decodeCompatJSON(req, &input); err != nil {
		writeError(w, newAppError(http.StatusBadRequest, "请求参数不正确"))
		return
	}
	prompt := strings.TrimSpace(input.Prompt)
	if prompt == "" {
		writeError(w, newAppError(http.StatusBadRequest, "请先填写公告主题或要点"))
		return
	}
	ctx, cancel := context.WithTimeout(req.Context(), 25*time.Second)
	defer cancel()
	model, err := models.NewRepository(r.db).FindActiveByNameOrDisplayName(ctx, "gpt-5-5")
	if errors.Is(err, sql.ErrNoRows) || model == nil {
		writeError(w, newAppError(http.StatusBadRequest, "请先在后台模型管理中添加并启用 gpt-5-5，用于 AI 代写公告"))
		return
	}
	if err != nil {
		writeError(w, err)
		return
	}
	provider, err := providers.NewRepository(r.db).FindByID(ctx, model.ProviderID)
	if err != nil || provider.Status != "active" {
		writeError(w, newAppError(http.StatusBadRequest, "AI 代写模型接口未启用"))
		return
	}
	body := map[string]any{
		"model":  model.ModelName,
		"stream": false,
		"messages": []map[string]any{
			{
				"role": "system",
				"content": strings.Join([]string{
					"你是 AI 生图平台的运营公告文案助手。",
					"只返回 JSON，不要 Markdown 代码块，不要解释。",
					"JSON 字段必须包含 title 和 content。",
					"title 要简洁醒目，8 到 18 个中文字符。",
					"content 使用 Markdown，适合后台公告直接发布。",
					"内容要清晰、可信、带行动引导，避免夸大承诺。",
					"如果是活动公告，要强调全站用户共同参与、邀请好友一起冲档或完成目标。",
					"不要编造不存在的日期、价格、模型名称、客服方式；不确定的内容用“以页面展示为准”。",
				}, "\n"),
			},
			{
				"role":    "user",
				"content": "公告主题或要点：" + prompt + "\n当前标题：" + strings.TrimSpace(input.Title) + "\n当前内容：" + strings.TrimSpace(input.Content) + "\n展示方式：" + strings.TrimSpace(input.DisplayMode) + "\n展示范围：" + strings.TrimSpace(input.TargetType),
			},
		},
	}
	responseBytes, _, err := postOpenAIJSON(ctx, *provider, "chat/completions", body)
	if err != nil {
		writeError(w, newAppError(upstreamStatus(err), err.Error()))
		return
	}
	var payload any
	_ = json.Unmarshal(responseBytes, &payload)
	draft, err := parseAnnouncementDraft(extractText(payload))
	if err != nil {
		writeError(w, newAppError(http.StatusBadGateway, err.Error()))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": draft})
}

func (r *Router) announcementByID(w http.ResponseWriter, req *http.Request) {
	path := strings.Trim(strings.TrimPrefix(req.URL.Path, "/api/announcements/"), "/")
	if strings.HasSuffix(path, "/sign") {
		r.signAnnouncement(w, req, strings.TrimSuffix(path, "/sign"))
		return
	}
	id := strings.Trim(path, "/")
	if id == "" || strings.Contains(id, "/") {
		writeError(w, newAppError(http.StatusNotFound, "公告不存在"))
		return
	}
	ctx, cancel := context.WithTimeout(req.Context(), 8*time.Second)
	defer cancel()
	repo := content.NewRepository(r.db)
	switch req.Method {
	case http.MethodPatch:
		if _, err := r.requireAdmin(req); err != nil {
			writeError(w, err)
			return
		}
		var input content.Announcement
		if err := decodeCompatJSON(req, &input); err != nil {
			writeError(w, newAppError(http.StatusBadRequest, "请求参数不正确"))
			return
		}
		input.ID = id
		item, err := repo.SaveAnnouncement(ctx, input)
		if err != nil {
			writeError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"data": item})
	case http.MethodDelete:
		if _, err := r.requireAdmin(req); err != nil {
			writeError(w, err)
			return
		}
		ok, err := repo.DeleteAnnouncement(ctx, id)
		if err != nil {
			writeError(w, err)
			return
		}
		if !ok {
			writeError(w, newAppError(http.StatusNotFound, "公告不存在"))
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"data": map[string]any{"deleted": true}})
	default:
		writeMethodNotAllowed(w)
	}
}

func (r *Router) signAnnouncement(w http.ResponseWriter, req *http.Request, id string) {
	if req.Method != http.MethodPost {
		writeMethodNotAllowed(w)
		return
	}
	var input struct {
		UserID string `json:"userId"`
	}
	if err := decodeCompatJSON(req, &input); err != nil {
		writeError(w, newAppError(http.StatusBadRequest, "请求参数不正确"))
		return
	}
	if strings.TrimSpace(input.UserID) == "" {
		writeError(w, newAppError(http.StatusBadRequest, "缺少用户信息"))
		return
	}
	ctx, cancel := context.WithTimeout(req.Context(), 8*time.Second)
	defer cancel()
	if err := content.NewRepository(r.db).SignAnnouncement(ctx, strings.Trim(id, "/"), strings.TrimSpace(input.UserID)); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": map[string]any{"signed": true}})
}

func (r *Router) publicPromotions(w http.ResponseWriter, req *http.Request) {
	if req.Method != http.MethodGet {
		writeMethodNotAllowed(w)
		return
	}
	ctx, cancel := context.WithTimeout(req.Context(), 8*time.Second)
	defer cancel()
	items, err := content.NewRepository(r.db).FindPromotions(ctx, true)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": items})
}

func (r *Router) promotions(w http.ResponseWriter, req *http.Request) {
	if _, err := r.requireAdmin(req); err != nil {
		writeError(w, err)
		return
	}
	ctx, cancel := context.WithTimeout(req.Context(), 8*time.Second)
	defer cancel()
	repo := content.NewRepository(r.db)
	switch req.Method {
	case http.MethodGet:
		items, err := repo.FindPromotions(ctx, false)
		if err != nil {
			writeError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"data": items})
	case http.MethodPost:
		var input content.Promotion
		if err := decodeCompatJSON(req, &input); err != nil {
			writeError(w, newAppError(http.StatusBadRequest, "请求参数不正确"))
			return
		}
		input.ID = defaultString(strings.TrimSpace(input.ID), newID())
		item, err := repo.SavePromotion(ctx, input)
		if err != nil {
			writeError(w, err)
			return
		}
		writeJSON(w, http.StatusCreated, map[string]any{"data": item})
	default:
		writeMethodNotAllowed(w)
	}
}

func (r *Router) promotionByID(w http.ResponseWriter, req *http.Request) {
	if _, err := r.requireAdmin(req); err != nil {
		writeError(w, err)
		return
	}
	id := strings.Trim(strings.TrimPrefix(req.URL.Path, "/api/promotions/"), "/")
	if id == "" || strings.Contains(id, "/") {
		writeError(w, newAppError(http.StatusNotFound, "活动不存在"))
		return
	}
	ctx, cancel := context.WithTimeout(req.Context(), 8*time.Second)
	defer cancel()
	repo := content.NewRepository(r.db)
	switch req.Method {
	case http.MethodPatch:
		var input content.Promotion
		if err := decodeCompatJSON(req, &input); err != nil {
			writeError(w, newAppError(http.StatusBadRequest, "请求参数不正确"))
			return
		}
		input.ID = id
		item, err := repo.SavePromotion(ctx, input)
		if err != nil {
			writeError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"data": item})
	case http.MethodDelete:
		ok, err := repo.DeletePromotion(ctx, id)
		if errors.Is(err, sql.ErrNoRows) || !ok {
			writeError(w, newAppError(http.StatusNotFound, "活动不存在"))
			return
		}
		if err != nil {
			writeError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"data": map[string]any{"deleted": true}})
	default:
		writeMethodNotAllowed(w)
	}
}

func parseAnnouncementDraft(raw string) (map[string]string, error) {
	text := strings.TrimSpace(raw)
	text = strings.TrimPrefix(text, "```json")
	text = strings.TrimPrefix(text, "```")
	text = strings.TrimSuffix(text, "```")
	text = strings.TrimSpace(text)
	if start := strings.Index(text, "{"); start >= 0 {
		if end := strings.LastIndex(text, "}"); end >= start {
			text = text[start : end+1]
		}
	}
	var draft struct {
		Title   string `json:"title"`
		Content string `json:"content"`
	}
	if err := json.Unmarshal([]byte(text), &draft); err != nil {
		return nil, errors.New("AI 返回内容解析失败，请重试")
	}
	title := strings.TrimSpace(draft.Title)
	body := strings.TrimSpace(draft.Content)
	if title == "" || body == "" {
		return nil, errors.New("AI 未返回有效公告标题或内容，请重试")
	}
	return map[string]string{
		"title":   title,
		"content": body,
	}, nil
}
