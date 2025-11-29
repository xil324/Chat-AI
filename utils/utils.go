package utils

import (
	"GopherAI/model"
	"crypto/md5"
	"encoding/hex"
	"math/rand"
	"strconv"
	"time"

	"github.com/cloudwego/eino/schema"
	"github.com/google/uuid"
)

func GetRandomNumbers(num int) string {
	r := rand.New(rand.NewSource(time.Now().UnixNano()))

	code := ""
	for i := 0; i < num; i++ {
		digit := r.Intn(10)
		code += strconv.Itoa(digit)
	}
	return code
}

func MD5(str string) string {
	m := md5.New()
	m.Write([]byte(str))
	return hex.EncodeToString(m.Sum(nil))
}

func GenerateUUID() string {
	return uuid.New().String()
}

func ConvertToModelMessage(sessionID string, userName string, msg *schema.Message) *model.Message {
	return &model.Message{
		SessionID: sessionID,
		UserName:  userName,
		Content:   msg.Content,
	}
}


func ConvertToSchemaMessages(msgs []*model.Message) []*schema.Message {
	schemaMsgs := make([]*schema.Message, 0, len(msgs))
	for _, m := range msgs {
		role := schema.User
		if !m.IsUser {
			role = schema.Assistant
		}
		schemaMsgs = append(schemaMsgs, &schema.Message{
			Role:    role,
			Content: m.Content,
		})
	}
	return schemaMsgs
}
