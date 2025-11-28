package message

import (
	"GopherAI/common/mongo"
	"GopherAI/model"
	"context"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo/options"
)

func GetMessagesBySessionID(sessionID string) ([]model.Message, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var msgs []model.Message
	opts := options.Find().SetSort(bson.D{{Key: "created_at", Value: 1}})
	cursor, err := mongo.DB.Collection("messages").Find(ctx, bson.M{"session_id": sessionID}, opts)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	err = cursor.All(ctx, &msgs)
	return msgs, err
}

func GetMessagesBySessionIDs(sessionIDs []string) ([]model.Message, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var msgs []model.Message
	if len(sessionIDs) == 0 {
		return msgs, nil
	}

	opts := options.Find().SetSort(bson.D{{Key: "created_at", Value: 1}})
	cursor, err := mongo.DB.Collection("messages").Find(ctx, bson.M{"session_id": bson.M{"$in": sessionIDs}}, opts)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	err = cursor.All(ctx, &msgs)
	return msgs, err
}

func CreateMessage(message *model.Message) (*model.Message, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	message.CreatedAt = time.Now()
	_, err := mongo.DB.Collection("messages").InsertOne(ctx, message)
	return message, err
}

func GetAllMessages() ([]model.Message, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var msgs []model.Message
	opts := options.Find().SetSort(bson.D{{Key: "created_at", Value: 1}})
	cursor, err := mongo.DB.Collection("messages").Find(ctx, bson.M{}, opts)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	err = cursor.All(ctx, &msgs)
	return msgs, err
}
