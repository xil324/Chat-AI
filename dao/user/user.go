package user

import (
	"GopherAI/common/mongo"
	"GopherAI/model"
	"GopherAI/utils"
	"context"
	"errors"
	"time"

	driverMongo "go.mongodb.org/mongo-driver/mongo"
)

const (
	CodeMsg     = "GopherAI verification code is as follows (verification code is valid for 2 minutes only): "
	UserNameMsg = "GopherAI account is as follows, please keep it safe, you can use this account to log in later "
)

var ctx = context.Background()


func IsExistUser(username string) (bool, *model.User) {
	user, err := mongo.GetUserByUsername(username)

	if err != nil {
		if errors.Is(err, driverMongo.ErrNoDocuments) {
			return false, nil
		}
		return false, nil
	}

	if user == nil {
		return false, nil
	}

	return true, user
}

func Register(username, email, password string) (*model.User, bool) {
	user := &model.User{
		Email:    email,
		Name:     username,
		Username: username,
		Password: utils.MD5(password),
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}

	if insertedUser, err := mongo.InsertUser(user); err != nil {
		return nil, false
	} else {
		return insertedUser, true
	}
}
