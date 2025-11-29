package aihelper

import (
	"context"
	"fmt"
	"sync"
)

type ModelCreator func(ctx context.Context, config map[string]interface{}) (AIModel, error)

type AIModelFactory struct {
	creators map[string]ModelCreator
	mu       sync.RWMutex
}

var (
	globalFactory *AIModelFactory
	factoryOnce   sync.Once
)

func GetGlobalFactory() *AIModelFactory {
	factoryOnce.Do(func() {
		globalFactory = &AIModelFactory{
			creators: make(map[string]ModelCreator),
		}
		globalFactory.registerCreators()
	})
	return globalFactory
}


func (f *AIModelFactory) registerCreators() {
	f.creators["2"] = func(ctx context.Context, config map[string]interface{}) (AIModel, error) {
		baseURL, _ := config["baseURL"].(string)
		modelName, ok := config["modelName"].(string)
		if !ok {
			return nil, fmt.Errorf("Ollama model requires modelName")
		}
		return NewOllamaModel(ctx, baseURL, modelName)
	}

	f.creators["3"] = func(ctx context.Context, config map[string]interface{}) (AIModel, error) {
		apiKey, _ := config["apiKey"].(string)
		modelName, _ := config["modelName"].(string)
		baseURL, _ := config["baseURL"].(string)
		return NewGeminiModel(ctx, apiKey, modelName, baseURL)
	}
}

func (f *AIModelFactory) CreateAIModel(ctx context.Context, modelType string, config map[string]interface{}) (AIModel, error) {
	creator, ok := f.creators[modelType]
	if !ok {
		return nil, fmt.Errorf("unsupported model type: %s", modelType)
	}
	return creator(ctx, config)
}

func (f *AIModelFactory) CreateAIHelper(ctx context.Context, modelType string, SessionID string, config map[string]interface{}) (*AIHelper, error) {
	model, err := f.CreateAIModel(ctx, modelType, config)
	if err != nil {
		return nil, err
	}
	return NewAIHelper(model, SessionID), nil
}


func (f *AIModelFactory) RegisterModel(modelType string, creator ModelCreator) {
	f.creators[modelType] = creator
}
