package redis

import (
	"GopherAI/config"
	"context"
	"log"
	"strconv"
	"strings"
	"time"

	"github.com/go-redis/redis/v8"
)

var Rdb *redis.Client

var ctx = context.Background()

func Init() {
	conf := config.GetConfig()
	host := conf.RedisConfig.RedisHost
	port := conf.RedisConfig.RedisPort
	password := conf.RedisConfig.RedisPassword
	db := conf.RedisConfig.RedisDb
	addr := host + ":" + strconv.Itoa(port)

	Rdb = redis.NewClient(&redis.Options{
		Addr:     addr,
		Password: password,
		DB:       db,
	})

	_, err := Rdb.Ping(ctx).Result()
	if err != nil {
		log.Printf("Redis connection failed: %v", err)
		log.Printf("Redis config: host=%s, port=%d, db=%d", host, port, db)
	} else {
		log.Println("Redis connection successful")
	}
}

func SetCaptchaForEmail(email, captcha string) error {
	if Rdb == nil {
		return redis.Nil
	}
	key := GenerateCaptcha(email)
	expire := 2 * time.Minute
	return Rdb.Set(ctx, key, captcha, expire).Err()
}



func CheckCaptchaForEmail(email, userInput string) (bool, error) {
	key := GenerateCaptcha(email)


	storedCaptcha, err := Rdb.Get(ctx, key).Result()
	if err != nil {
		if err == redis.Nil {

			return false, nil
		}

		return false, err
	}



	if strings.EqualFold(storedCaptcha, userInput) {

		if err := Rdb.Del(ctx, key).Err(); err != nil {

		} else {

		}
		return true, nil
	}


	return false, nil
}
