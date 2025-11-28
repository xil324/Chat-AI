package user

import (
	"GopherAI/common/code"
	myemail "GopherAI/common/email"
	myredis "GopherAI/common/redis"
	"GopherAI/dao/user"
	"GopherAI/model"
	"GopherAI/utils"
	"GopherAI/utils/myjwt"
	"log"
)

func Login(username, password string) (string, code.Code) {
	var userInformation *model.User
	var ok bool

	if ok, userInformation = user.IsExistUser(username); !ok {

		return "", code.CodeUserNotExist
	}

	if userInformation.Password != utils.MD5(password) {
		return "", code.CodeInvalidPassword
	}

	token, err := myjwt.GenerateToken(userInformation.ID, userInformation.Username)

	if err != nil {
		return "", code.CodeServerBusy
	}
	return token, code.CodeSuccess
}

func Register(email, password, captcha string) (string, code.Code) {

	var ok bool
	var userInformation *model.User

	if ok, _ := user.IsExistUser(email); ok {
		return "", code.CodeUserExist
	}

	if ok, _ := myredis.CheckCaptchaForEmail(email, captcha); !ok {
		return "", code.CodeInvalidCaptcha
	}

	username := utils.GetRandomNumbers(11)

	if userInformation, ok = user.Register(username, email, password); !ok {
		return "", code.CodeServerBusy
	}

	if err := myemail.SendCaptcha(email, username, user.UserNameMsg); err != nil {
		return "", code.CodeServerBusy
	}

	token, err := myjwt.GenerateToken(userInformation.ID, userInformation.Username)

	if err != nil {
		return "", code.CodeServerBusy
	}

	return token, code.CodeSuccess
}


func SendCaptcha(email_ string) code.Code {
	log.Printf("[SERVICE] SendCaptcha called for email: %s", email_)
	send_code := utils.GetRandomNumbers(6)
	log.Printf("[SERVICE] Generated captcha code: %s", send_code)

	if err := myredis.SetCaptchaForEmail(email_, send_code); err != nil {
		log.Printf("[SERVICE ERROR] Failed to set captcha in redis for email %s: %v", email_, err)
		return code.CodeServerBusy
	}
	log.Printf("[SERVICE] Captcha stored in redis successfully")

	if err := myemail.SendCaptcha(email_, send_code, myemail.CodeMsg); err != nil {
		log.Printf("[SERVICE ERROR] Failed to send email to %s: %v", email_, err)
		return code.CodeServerBusy
	}

	log.Printf("[SERVICE] SendCaptcha completed successfully for email: %s", email_)
	return code.CodeSuccess
}
