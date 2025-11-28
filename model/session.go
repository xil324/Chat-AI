package model

import (
	"time"
)

type Session struct {
	ID        string    `bson:"id" json:"id"`
	UserName  string    `bson:"user_name" json:"username"`
	Title     string    `bson:"title" json:"title"`
	CreatedAt time.Time `bson:"created_at" json:"created_at"`
	UpdatedAt time.Time `bson:"updated_at" json:"updated_at"`
}

type SessionInfo struct {
	SessionID string `json:"sessionId"`
	Title     string `json:"name"`
}
