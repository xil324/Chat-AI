package rabbitmq

var (

	RMQMessage *RabbitMQ
)

func InitRabbitMQ() {
	RMQMessage = NewWorkRabbitMQ("Message")
	go RMQMessage.Consume(MQMessage)

}

func DestroyRabbitMQ() {
	RMQMessage.Destroy()
}
