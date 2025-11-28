package model

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type Message struct {
	ID        primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	SessionID string             `bson:"session_id" json:"session_id"`
	UserName  string             `bson:"user_name" json:"username"`
	Content   string             `bson:"content" json:"content"`
	IsUser    bool               `bson:"is_user" json:"is_user"`
	CreatedAt time.Time          `bson:"created_at" json:"created_at"`
}

type History struct {
	IsUser  bool   `json:"is_user"`
	Content string `json:"content"`
}
