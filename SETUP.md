# GopherAI Service Setup Guide

## Prerequisites

Make sure you have the following services installed and running:

### 1. MongoDB
MongoDB appears to be installed. If not, install it:
```bash
brew install mongodb-community@4.4
brew services start mongodb-community@4.4
```

### 2. RabbitMQ
Install and start RabbitMQ:
```bash
brew install rabbitmq
brew services start rabbitmq
```

**Note:** The default RabbitMQ credentials in `config/config.toml` are:
- Username: `root`
- Password: `123456`

To set these credentials, after starting RabbitMQ, run:
```bash
rabbitmqctl add_user root 123456
rabbitmqctl set_user_tags root administrator
rabbitmqctl set_permissions -p / root ".*" ".*" ".*"
```

### 3. Redis
Install and start Redis:
```bash
brew install redis
brew services start redis
```

## Starting All Services

### Option 1: Use the startup script (Recommended)
```bash
./start-services.sh
```

### Option 2: Start services manually

**Terminal 1 - MongoDB:**
```bash
brew services start mongodb-community@4.4
# Or if already running, skip this
```

**Terminal 2 - RabbitMQ:**
```bash
brew services start rabbitmq
```

**Terminal 3 - Redis:**
```bash
brew services start redis
```

**Terminal 4 - Go Server:**
```bash
cd /Users/xiaohanliu/Desktop/GopherAI
go run main.go
```

## Verify Services Are Running

Check if services are running on their expected ports:
```bash
# MongoDB (port 27017)
lsof -i :27017

# RabbitMQ (port 5672)
lsof -i :5672

# Redis (port 6379)
lsof -i :6379

# Go Server (port 9090)
lsof -i :9090
```

## Service URLs

- **Go Server:** http://localhost:9090
- **MongoDB:** mongodb://127.0.0.1:27017
- **RabbitMQ Management:** http://localhost:15672 (if management plugin is enabled)
- **Redis:** redis://127.0.0.1:6379

## OpenAI Configuration (Required for AI Chat)

The AI chat feature requires OpenAI API credentials. Set the following environment variables before starting the server:

```bash
export OPENAI_API_KEY="your-openai-api-key"
export OPENAI_MODEL_NAME="gpt-3.5-turbo"  # or "gpt-4", "gpt-4-turbo", etc.
export OPENAI_BASE_URL=""  # Optional: leave empty for default OpenAI API, or set custom endpoint
```

**To make these persistent**, add them to your shell profile (e.g., `~/.zshrc` or `~/.bash_profile`):
```bash
echo 'export OPENAI_API_KEY="your-openai-api-key"' >> ~/.zshrc
echo 'export OPENAI_MODEL_NAME="gpt-3.5-turbo"' >> ~/.zshrc
source ~/.zshrc
```

**Getting an OpenAI API Key:**
1. Go to https://platform.openai.com/api-keys
2. Sign up or log in
3. Create a new API key
4. Copy the key and set it as `OPENAI_API_KEY`

**Note:** If these environment variables are not set, you will get a "Model run failed" (5003) error when trying to use the chat feature.

## Email Configuration (Optional for Development)

For development, email sending is optional. If email credentials are not configured in `config/config.toml`, the captcha code will be logged to the server console instead of being sent via email.

To configure email for production:

1. **Gmail Setup:**
   - Enable 2-factor authentication on your Gmail account
   - Generate an App Password: https://myaccount.google.com/apppasswords
   - Update `config/config.toml`:
     ```toml
     [emailConfig]
     authcode = "your-16-char-app-password"
     email = "your-email@gmail.com"
     smtpHost = "smtp.gmail.com"
     smtpPort = 587
     ```

2. **Development Mode:**
   - If email is not configured, check server logs for captcha codes
   - The captcha will still be stored in Redis and can be used for registration

## Troubleshooting

### "Model run failed" (5003) error when using chat
- **Solution:** Make sure you have set the required OpenAI environment variables:
  ```bash
  export OPENAI_API_KEY="your-api-key"
  export OPENAI_MODEL_NAME="gpt-3.5-turbo"
  ```
- Check server logs for detailed error messages - they will now show the specific error
- Verify your API key is valid and has sufficient credits
- If using a custom endpoint, ensure `OPENAI_BASE_URL` is set correctly

### Internal Server Error (500) when sending captcha
- **Solution:** Check server logs - if email is not configured, the captcha code will be printed in the console
- The API should still return success, and you can use the captcha code from the logs

### MongoDB not starting
```bash
# Check MongoDB logs
tail -f /usr/local/var/log/mongodb/mongo.log
```

### RabbitMQ not starting
```bash
# Check RabbitMQ status
export PATH="/usr/local/opt/rabbitmq/sbin:$PATH"
rabbitmqctl status

# Enable management plugin (optional)
rabbitmq-plugins enable rabbitmq_management
```

### Redis not starting
```bash
# Check Redis status
redis-cli ping
# Should return: PONG
```

