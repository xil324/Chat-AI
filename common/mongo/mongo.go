package mongo

import (
	"GopherAI/config"
	"GopherAI/model"
	"context"
	"fmt"
	"math/rand"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

var DB *mongo.Database
var Client *mongo.Client

func InitMongo() error {
	host := config.GetConfig().MongoHost
	port := config.GetConfig().MongoPort
	dbname := config.GetConfig().MongoDatabaseName
	username := config.GetConfig().MongoUser
	password := config.GetConfig().MongoPassword

	var uri string
	if username != "" && password != "" {
		uri = fmt.Sprintf("mongodb://%s:%s@%s:%d/%s?authSource=admin", username, password, host, port, dbname)
	} else {
		uri = fmt.Sprintf("mongodb://%s:%d/%s", host, port, dbname)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	clientOptions := options.Client().ApplyURI(uri)
	client, err := mongo.Connect(ctx, clientOptions)
	if err != nil {
		return err
	}

	err = client.Ping(ctx, nil)
	if err != nil {
		return err
	}

	Client = client
	DB = client.Database(dbname)

	return nil
}

func InsertUser(user *model.User) (*model.User, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if user.ID == 0 {
		rand.Seed(time.Now().UnixNano())
		user.ID = time.Now().UnixMilli()*1000 + int64(rand.Intn(1000))
	}
	if user.CreatedAt.IsZero() {
		user.CreatedAt = time.Now()
	}
	if user.UpdatedAt.IsZero() {
		user.UpdatedAt = time.Now()
	}

	_, err := DB.Collection("users").InsertOne(ctx, user)
	if err != nil {
		return nil, err
	}
	return user, nil
}

func GetUserByUsername(username string) (*model.User, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var user model.User
	err := DB.Collection("users").FindOne(ctx, bson.M{"username": username}).Decode(&user)
	if err != nil {
		return nil, err
	}
	return &user, nil
}
