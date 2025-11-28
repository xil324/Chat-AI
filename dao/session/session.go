package session

import (
	"GopherAI/common/mongo"
	"GopherAI/model"
	"context"
	"time"

	"go.mongodb.org/mongo-driver/bson"
)

func GetSessionsByUserName(UserName string) ([]model.Session, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var sessions []model.Session
	cursor, err := mongo.DB.Collection("sessions").Find(ctx, bson.M{"user_name": UserName})
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	err = cursor.All(ctx, &sessions)
	return sessions, err
}

func CreateSession(session *model.Session) (*model.Session, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	session.CreatedAt = time.Now()
	session.UpdatedAt = time.Now()

	_, err := mongo.DB.Collection("sessions").InsertOne(ctx, session)
	return session, err
}

func GetSessionByID(sessionID string) (*model.Session, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var session model.Session
	err := mongo.DB.Collection("sessions").FindOne(ctx, bson.M{"id": sessionID}).Decode(&session)
	if err != nil {
		return nil, err
	}
	return &session, nil
}
