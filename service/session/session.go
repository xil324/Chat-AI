package session

import (
	"GopherAI/common/aihelper"
	"GopherAI/common/code"
	"GopherAI/dao/session"
	"GopherAI/model"
	"context"
	"log"
	"os"

	"github.com/google/uuid"
)

var ctx = context.Background()


func getModelConfig(modelType string) map[string]interface{} {
	config := make(map[string]interface{})

	if modelType == "2" {
		// Ollama configuration
		baseURL := os.Getenv("OLLAMA_BASE_URL")
		if baseURL == "" {
			baseURL = "http://localhost:11434" // Default Ollama URL
		}
		modelName := os.Getenv("OLLAMA_MODEL_NAME")
		if modelName == "" {
			modelName = "llama2" // Default model
		}
		config["baseURL"] = baseURL
		config["modelName"] = modelName
	} else if modelType == "3" {
		apiKey := os.Getenv("GEMINI_API_KEY")
		if apiKey == "" {
			config["apiKey"] = ""
		} else {
			config["apiKey"] = apiKey
		}
		modelName := os.Getenv("GEMINI_MODEL_NAME")
		if modelName == "" {
			modelName = "gemini-1.5-flash"
		}
		config["modelName"] = modelName
		baseURL := os.Getenv("GEMINI_BASE_URL")
		if baseURL != "" {
			config["baseURL"] = baseURL
		}
	}

	return config
}

func GetUserSessionsByUserName(userName string) ([]model.SessionInfo, error) {
	manager := aihelper.GetGlobalManager()
	Sessions := manager.GetUserSessions(userName)

	var SessionInfos []model.SessionInfo

	for _, session := range Sessions {
		SessionInfos = append(SessionInfos, model.SessionInfo{
			SessionID: session,
			Title:     session,
		})
	}

	return SessionInfos, nil
}

func CreateSessionAndSendMessage(userName string, userQuestion string, modelType string) (string, string, code.Code) {
	newSession := &model.Session{
		ID:       uuid.New().String(),
		UserName: userName,
		Title:    userQuestion,
	}
	createdSession, err := session.CreateSession(newSession)
	if err != nil {
		log.Println("CreateSessionAndSendMessage CreateSession error:", err)
		return "", "", code.CodeServerBusy
	}

	manager := aihelper.GetGlobalManager()
	config := getModelConfig(modelType)
	helper, err := manager.GetOrCreateAIHelper(userName, createdSession.ID, modelType, config)
	if err != nil {
		log.Printf("CreateSessionAndSendMessage GetOrCreateAIHelper error: userName=%s, sessionID=%s, modelType=%s, error=%v", userName, createdSession.ID, modelType, err)
		return "", "", code.AIModelFail
	}

	aiResponse, err_ := helper.GenerateResponse(userName, ctx, userQuestion)
	if err_ != nil {
		log.Printf("CreateSessionAndSendMessage GenerateResponse error: userName=%s, sessionID=%s, modelType=%s, error=%v", userName, createdSession.ID, modelType, err_)
		return "", "", code.AIModelFail
	}

	return createdSession.ID, aiResponse.Content, code.CodeSuccess
}

func ChatSend(userName string, sessionID string, userQuestion string, modelType string) (string, code.Code) {

	manager := aihelper.GetGlobalManager()
	config := getModelConfig(modelType)
	helper, err := manager.GetOrCreateAIHelper(userName, sessionID, modelType, config)
	if err != nil {
		log.Printf("ChatSend GetOrCreateAIHelper error: userName=%s, sessionID=%s, modelType=%s, error=%v", userName, sessionID, modelType, err)
		return "", code.AIModelFail
	}

	aiResponse, err_ := helper.GenerateResponse(userName, ctx, userQuestion)
	if err_ != nil {
		log.Printf("ChatSend GenerateResponse error: userName=%s, sessionID=%s, modelType=%s, error=%v", userName, sessionID, modelType, err_)
		return "", code.AIModelFail
	}

	return aiResponse.Content, code.CodeSuccess
}

func GetChatHistory(userName string, sessionID string) ([]model.History, code.Code) {
	manager := aihelper.GetGlobalManager()
	helper, exists := manager.GetAIHelper(userName, sessionID)
	if !exists {
		return nil, code.CodeServerBusy
	}

	messages := helper.GetMessages()
	history := make([]model.History, 0, len(messages))

	for i, msg := range messages {
		isUser := i%2 == 0
		history = append(history, model.History{
			IsUser:  isUser,
			Content: msg.Content,
		})
	}

	return history, code.CodeSuccess
}
