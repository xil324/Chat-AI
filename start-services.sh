#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Starting GopherAI services...${NC}\n"

# Check if MongoDB is running
echo -e "${YELLOW}Checking MongoDB...${NC}"
if pgrep -x "mongod" > /dev/null; then
    echo -e "${GREEN}✓ MongoDB is already running${NC}"
else
    echo -e "${YELLOW}Starting MongoDB...${NC}"
    brew services start mongodb-community@4.4 || mongod --config /usr/local/etc/mongod.conf &
    sleep 2
    if pgrep -x "mongod" > /dev/null; then
        echo -e "${GREEN}✓ MongoDB started${NC}"
    else
        echo -e "${RED}✗ Failed to start MongoDB${NC}"
    fi
fi

# Check if RabbitMQ is running
echo -e "\n${YELLOW}Checking RabbitMQ...${NC}"
if pgrep -x "beam.smp" > /dev/null || lsof -i :5672 > /dev/null 2>&1; then
    echo -e "${GREEN}✓ RabbitMQ is already running${NC}"
else
    echo -e "${YELLOW}Starting RabbitMQ...${NC}"
    brew services start rabbitmq || rabbitmq-server -detached
    sleep 3
    if lsof -i :5672 > /dev/null 2>&1; then
        echo -e "${GREEN}✓ RabbitMQ started${NC}"
    else
        echo -e "${RED}✗ Failed to start RabbitMQ${NC}"
        echo -e "${YELLOW}You may need to install RabbitMQ: brew install rabbitmq${NC}"
    fi
fi

# Check if Redis is running
echo -e "\n${YELLOW}Checking Redis...${NC}"
if pgrep -x "redis-server" > /dev/null || lsof -i :6379 > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Redis is already running${NC}"
else
    echo -e "${YELLOW}Starting Redis...${NC}"
    brew services start redis || redis-server --daemonize yes
    sleep 2
    if lsof -i :6379 > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Redis started${NC}"
    else
        echo -e "${RED}✗ Failed to start Redis${NC}"
        echo -e "${YELLOW}You may need to install Redis: brew install redis${NC}"
    fi
fi

# Load .env file if it exists
if [ -f ".env" ]; then
    echo -e "${GREEN}✓ Loading environment variables from .env file${NC}"
    set -a
    source .env
    set +a
fi

# Check OpenAI environment variables
echo -e "\n${YELLOW}Checking OpenAI configuration...${NC}"
if [ -z "$OPENAI_API_KEY" ]; then
    echo -e "${RED}⚠️  WARNING: OPENAI_API_KEY is not set${NC}"
    echo -e "${YELLOW}   AI chat features will not work.${NC}"
    echo -e "${YELLOW}   Options to set it:${NC}"
    echo -e "${YELLOW}   1. Create a .env file (copy .env.example to .env and edit)${NC}"
    echo -e "${YELLOW}   2. Export in terminal: export OPENAI_API_KEY='your-api-key'${NC}"
    echo -e "${YELLOW}   3. Add to ~/.zshrc for persistence${NC}"
else
    echo -e "${GREEN}✓ OPENAI_API_KEY is set${NC}"
fi

if [ -z "$OPENAI_MODEL_NAME" ]; then
    echo -e "${RED}⚠️  WARNING: OPENAI_MODEL_NAME is not set${NC}"
    echo -e "${YELLOW}   AI chat features will not work.${NC}"
    echo -e "${YELLOW}   Options to set it:${NC}"
    echo -e "${YELLOW}   1. Create a .env file (copy .env.example to .env and edit)${NC}"
    echo -e "${YELLOW}   2. Export in terminal: export OPENAI_MODEL_NAME='gpt-3.5-turbo'${NC}"
    echo -e "${YELLOW}   3. Add to ~/.zshrc for persistence${NC}"
else
    echo -e "${GREEN}✓ OPENAI_MODEL_NAME is set to: $OPENAI_MODEL_NAME${NC}"
fi

# Start Go server
echo -e "\n${YELLOW}Starting Go server...${NC}"
cd "$(dirname "$0")"

# Ensure Go is in PATH (for Homebrew installations)
if [ -f "/usr/local/bin/go" ]; then
    export PATH="/usr/local/bin:$PATH"
elif [ -f "/opt/homebrew/bin/go" ]; then
    export PATH="/opt/homebrew/bin:$PATH"
fi

# Check if Go is available
if ! command -v go &> /dev/null; then
    echo -e "${RED}✗ Go is not installed or not in PATH${NC}"
    echo -e "${YELLOW}Install Go with: brew install go${NC}"
    exit 1
fi

if [ -f "go.mod" ]; then
    echo -e "${GREEN}✓ Starting server on port 9090${NC}"
    go run main.go
else
    echo -e "${RED}✗ go.mod not found. Are you in the project root?${NC}"
    exit 1
fi

