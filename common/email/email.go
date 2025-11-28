package email

import (
	"GopherAI/config"
	"log"

	"gopkg.in/gomail.v2"
)

const (
	CodeMsg     = "Your GopherAI verification code is (valid for 2 minutes only): "
	UserNameMsg = "Your GopherAI account is below. Please keep it safe - you can use your account/email to log in later: "
)

func SendCaptcha(email, code, msg string) error {
	conf := config.GetConfig()

	if conf.EmailConfig.Email == "" ||
	   conf.EmailConfig.Email == "your gmail address" ||
	   conf.EmailConfig.Authcode == "" ||
	   conf.EmailConfig.Authcode == "your gmail app password" {
		log.Printf("[EMAIL DEV MODE] Email not configured. Captcha code for %s: %s", email, code)
		log.Printf("[EMAIL DEV MODE] Message: %s", msg)
		log.Printf("[EMAIL DEV MODE] To configure email, update config/config.toml with your Gmail credentials")
		return nil
	}

	smtpHost := conf.EmailConfig.SmtpHost
	smtpPort := conf.EmailConfig.SmtpPort

	if smtpHost == "" {
		smtpHost = "smtp.gmail.com"
	}
	if smtpPort == 0 {
		smtpPort = 587
	}

	log.Printf("[EMAIL] Attempting to send email to %s via %s:%d", email, smtpHost, smtpPort)
	log.Printf("[EMAIL] From: %s", conf.EmailConfig.Email)

	m := gomail.NewMessage()

	m.SetHeader("From", conf.EmailConfig.Email)
	m.SetHeader("To", email)
	m.SetHeader("Subject", "Information from GopherAI")
	m.SetBody("text/plain", msg+" "+code)

	d := gomail.NewDialer(smtpHost, smtpPort, conf.EmailConfig.Email, conf.EmailConfig.Authcode)

	if err := d.DialAndSend(m); err != nil {
		log.Printf("[EMAIL ERROR] Failed to send email to %s via %s:%d", email, smtpHost, smtpPort)
		log.Printf("[EMAIL ERROR] Error details: %v", err)
		log.Printf("[EMAIL ERROR] From email: %s", conf.EmailConfig.Email)
		return err
	}
	log.Printf("[EMAIL SUCCESS] Email sent successfully to %s", email)
	return nil
}
