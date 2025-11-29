package aihelper

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"

	"github.com/cloudwego/eino-ext/components/model/ollama"
	"github.com/cloudwego/eino/components/model"
	"github.com/cloudwego/eino/schema"
)

type AIModel interface {
	GenerateResponse(ctx context.Context, messages []*schema.Message) (*schema.Message, error)
	GetModelType() string
}

// ollama model
type OllamaModel struct {
	llm model.ToolCallingChatModel
}

func NewOllamaModel(ctx context.Context, baseURL, modelName string) (*OllamaModel, error) {
	llm, err := ollama.NewChatModel(ctx, &ollama.ChatModelConfig{
		BaseURL: baseURL,
		Model:   modelName,
	})
	if err != nil {
		return nil, fmt.Errorf("create ollama model failed: %v", err)
	}
	return &OllamaModel{llm: llm}, nil
}

func (o *OllamaModel) GenerateResponse(ctx context.Context, messages []*schema.Message) (*schema.Message, error) {
	resp, err := o.llm.Generate(ctx, messages)
	if err != nil {
		return nil, fmt.Errorf("ollama generate failed: %v", err)
	}
	return resp, nil
}

func (o *OllamaModel) GetModelType() string { return "ollama" }

// Gemini model
type GeminiModel struct {
	apiKey    string
	modelName string
	baseURL   string
}

func NewGeminiModel(ctx context.Context, apiKey, modelName, baseURL string) (*GeminiModel, error) {
	if apiKey == "" {
		return nil, fmt.Errorf("GEMINI_API_KEY environment variable is not set")
	}
	if modelName == "" {
		modelName = "gemini-1.5-flash" // Default model (updated to valid model name)
	}
	if baseURL == "" {
		baseURL = "https://generativelanguage.googleapis.com/v1" // Use v1 instead of v1beta
	}
	return &GeminiModel{
		apiKey:    apiKey,
		modelName: modelName,
		baseURL:   baseURL,
	}, nil
}

func (g *GeminiModel) convertMessages(messages []*schema.Message) []map[string]interface{} {
	var parts []map[string]interface{}
	for _, msg := range messages {
		role := "user"
		if msg.Role == schema.Assistant {
			role = "model"
		}
		parts = append(parts, map[string]interface{}{
			"role": role,
			"parts": []map[string]interface{}{
				{"text": msg.Content},
			},
		})
	}
	return parts
}

func (g *GeminiModel) GenerateResponse(ctx context.Context, messages []*schema.Message) (*schema.Message, error) {
	geminiMessages := g.convertMessages(messages)

	payload := map[string]interface{}{
		"contents": geminiMessages,
	}

	url := fmt.Sprintf("%s/models/%s:streamGenerateContent?key=%s", g.baseURL, g.modelName, g.apiKey)

	payloadJSON, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("gemini marshal request failed: %v", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(payloadJSON))
	if err != nil {
		return nil, fmt.Errorf("gemini create request failed: %v", err)
	}
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("gemini request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(resp.Body)
		log.Printf("[Gemini API Error] Status: %d, Body: %s", resp.StatusCode, string(bodyBytes))
		return nil, fmt.Errorf("gemini API error: status %d, body: %s", resp.StatusCode, string(bodyBytes))
	}

	scanner := bufio.NewScanner(resp.Body)
	var fullResp strings.Builder

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}

		var jsonLine string
		if strings.HasPrefix(line, "data: ") {
			jsonLine = strings.TrimPrefix(line, "data: ")
			if jsonLine == "[DONE]" {
				break
			}
		} else {
			jsonLine = line
		}

		var geminiResp map[string]interface{}
		if err := json.Unmarshal([]byte(jsonLine), &geminiResp); err != nil {
			log.Printf("[Gemini] Failed to parse JSON line: %s, error: %v", jsonLine, err)
			continue
		}

		if candidates, ok := geminiResp["candidates"].([]interface{}); ok && len(candidates) > 0 {
			if candidate, ok := candidates[0].(map[string]interface{}); ok {
				if content, ok := candidate["content"].(map[string]interface{}); ok {
					if parts, ok := content["parts"].([]interface{}); ok {
						for _, part := range parts {
							if partMap, ok := part.(map[string]interface{}); ok {
								if text, ok := partMap["text"].(string); ok && text != "" {
									fullResp.WriteString(text)
								}
							}
						}
					}
				}
			}
		}
	}

	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("gemini stream read failed: %v", err)
	}

	return &schema.Message{
		Role:    schema.Assistant,
		Content: fullResp.String(),
	}, nil
}

func (g *GeminiModel) GetModelType() string { return "gemini" }
