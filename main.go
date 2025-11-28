package main

import (
	"GopherAI/common/aihelper"
	"GopherAI/common/mongo"
	"GopherAI/common/rabbitmq"
	"GopherAI/common/redis"
	"GopherAI/config"
	"GopherAI/dao/message"
	"GopherAI/router"
	"fmt"
	"log"
	"os"
)

func StartServer(addr string, port int) error {
	r := router.InitRouter()
	return r.Run(fmt.Sprintf("%s:%d", addr, port))
}


func readDataFromDB() error {
	manager := aihelper.GetGlobalManager()
	msgs, err := message.GetAllMessages()
	if err != nil {
		return err
	}

	for i := range msgs {
		m := &msgs[i]
		modelType := "2"
		config := map[string]interface{}{
			"baseURL":  getEnvOrDefault("OLLAMA_BASE_URL", "http://localhost:11434"),
			"modelName": getEnvOrDefault("OLLAMA_MODEL_NAME", "llama2"),
		}

		helper, err := manager.GetOrCreateAIHelper(m.UserName, m.SessionID, modelType, config)
		if err != nil {
			log.Printf("[readDataFromDB] failed to create helper for user=%s session=%s: %v", m.UserName, m.SessionID, err)
			continue
		}
		log.Println("readDataFromDB init:  ", helper.SessionID)
		helper.AddMessage(m.Content, m.UserName, m.IsUser, false)
	}

	log.Println("AIHelperManager init success ")
	return nil
}

func getEnvOrDefault(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}


func main() {
	// Configure log output with timestamps
	log.SetFlags(log.LstdFlags | log.Lshortfile)



	conf := config.GetConfig()
	host := conf.MainConfig.Host
	port := conf.MainConfig.Port

	if err := mongo.InitMongo(); err != nil {
		log.Println("InitMongo error , " + err.Error())
		return
	}

	readDataFromDB()


	redis.Init()
	log.Println("redis init success  ")
	rabbitmq.InitRabbitMQ()
	log.Println("rabbitmq init success  ")

	err := StartServer(host, port)
	if err != nil {
		panic(err)
	}
}
