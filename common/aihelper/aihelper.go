package aihelper

import (
	"GopherAI/common/rabbitmq"
	"GopherAI/model"
	"GopherAI/utils"
	"context"
	"sync"
)


type AIHelper struct {
	model    AIModel
	messages []*model.Message
	mu       sync.RWMutex

	SessionID string
	saveFunc  func(*model.Message) (*model.Message, error)
}

func NewAIHelper(model_ AIModel, SessionID string) *AIHelper {
	return &AIHelper{
		model:    model_,
		messages: make([]*model.Message, 0),
		saveFunc: func(msg *model.Message) (*model.Message, error) {
			data := rabbitmq.GenerateMessageMQParam(msg.SessionID, msg.Content, msg.UserName, msg.IsUser)
			err := rabbitmq.RMQMessage.Publish(data)
			return msg, err
		},
		SessionID: SessionID,
	}
}

func (a *AIHelper) AddMessage(Content string, UserName string, IsUser bool, Save bool) {
	a.mu.Lock()
	defer a.mu.Unlock()

	userMsg := model.Message{
		SessionID: a.SessionID,
		Content:   Content,
		UserName:  UserName,
		IsUser:    IsUser,
	}
	a.messages = append(a.messages, &userMsg)
	if Save {
		a.saveFunc(&userMsg)
	}
}


func (a *AIHelper) SetSaveFunc(saveFunc func(*model.Message) (*model.Message, error)) {
	a.saveFunc = saveFunc
}


func (a *AIHelper) GetMessages() []*model.Message {
	a.mu.RLock()
	defer a.mu.RUnlock()
	out := make([]*model.Message, len(a.messages))
	copy(out, a.messages)
	return out
}


func (a *AIHelper) GenerateResponse(userName string, ctx context.Context, userQuestion string) (*model.Message, error) {

	a.mu.Lock()
	userMsg := model.Message{
		SessionID: a.SessionID,
		Content:   userQuestion,
		UserName:  userName,
		IsUser:    true,
	}
	a.messages = append(a.messages, &userMsg)
	messages := utils.ConvertToSchemaMessages(a.messages)
	a.mu.Unlock()

	a.saveFunc(&userMsg)

	schemaMsg, err := a.model.GenerateResponse(ctx, messages)
	if err != nil {
		return nil, err
	}

	modelMsg := utils.ConvertToModelMessage(a.SessionID, userName, schemaMsg)

	a.AddMessage(modelMsg.Content, userName, false, true)

	return modelMsg, nil
}

func (a *AIHelper) GetModelType() string {
	return a.model.GetModelType()
}
