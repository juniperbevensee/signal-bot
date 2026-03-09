#!/bin/bash

# Multi-Number Setup Helper (Headless Registration)
# Guides you through setting up multiple Signal phone numbers without any Signal app

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║                                                          ║${NC}"
echo -e "${CYAN}║     Signal Bot - Multiple Numbers Setup (Headless)      ║${NC}"
echo -e "${CYAN}║                                                          ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}This setup registers phone numbers without any Signal app.${NC}"
echo ""

# Ask how many numbers
echo -e "${BLUE}How many phone numbers do you want to set up?${NC}"
echo -e "  ${GREEN}1${NC} - One number (simple setup)"
echo -e "  ${GREEN}2${NC} - Two numbers"
echo -e "  ${GREEN}3${NC} - Three numbers"
echo ""
read -p "Enter number (1-3): " NUM_BOTS

if [[ ! "$NUM_BOTS" =~ ^[1-3]$ ]]; then
    echo -e "${RED}✗ Invalid choice. Please run again and choose 1, 2, or 3.${NC}"
    exit 1
fi

echo ""
echo -e "${YELLOW}▸ Setting up ${NUM_BOTS} bot(s)...${NC}"
echo ""

# Step 1: Start Signal API containers
echo -e "${BLUE}Step 1: Starting Signal API containers...${NC}"
echo ""

case $NUM_BOTS in
    1)
        docker-compose up -d signal-api
        CONTAINERS="signal-api"
        PORTS="8080"
        ;;
    2)
        docker-compose -f docker-compose.multi.yml up -d signal-api-1 signal-api-2
        CONTAINERS="signal-api-1 signal-api-2"
        PORTS="8080 8081"
        ;;
    3)
        docker-compose -f docker-compose.multi.yml up -d signal-api-1 signal-api-2 signal-api-3
        CONTAINERS="signal-api-1 signal-api-2 signal-api-3"
        PORTS="8080 8081 8082"
        ;;
esac

echo -e "${GREEN}✓ Containers started${NC}"
echo ""
echo -e "${YELLOW}Waiting 30 seconds for initialization...${NC}"
sleep 30

# Verify containers are running
echo ""
echo -e "${BLUE}Verifying containers...${NC}"
docker ps --filter "name=signal-api" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
echo ""

# Step 2: Register phone numbers
echo -e "${BLUE}Step 2: Register your phone numbers (headless)${NC}"
echo ""
echo -e "${YELLOW}NOTE: Each registration is done through terminal prompts.${NC}"
echo -e "${YELLOW}You'll receive SMS/voice codes to verify each number.${NC}"
echo ""

BOT_NUM=1
for PORT in $PORTS; do
    echo -e "${CYAN}═══════════════════════════════════════${NC}"
    echo -e "${CYAN}Bot $BOT_NUM - Port $PORT${NC}"
    echo -e "${CYAN}═══════════════════════════════════════${NC}"
    echo ""

    read -p "Enter phone number (E.164 format, e.g. +14155551234): " PHONE_NUM

    # Run the headless registration script
    echo ""
    echo -e "${BLUE}Starting registration for ${PHONE_NUM}...${NC}"
    PHONE_NUMBER="$PHONE_NUM" SIGNAL_API_PORT="$PORT" npx tsx scripts/register-signal-number.ts

    if [ $? -ne 0 ]; then
        echo ""
        echo -e "${RED}✗ Registration failed for Bot $BOT_NUM${NC}"
        echo -e "${YELLOW}You can retry later with:${NC}"
        echo -e "   ${CYAN}PHONE_NUMBER=$PHONE_NUM SIGNAL_API_PORT=$PORT npx tsx scripts/register-signal-number.ts${NC}"
        echo ""
        exit 1
    fi

    # Save for config creation
    eval "BOT${BOT_NUM}_PHONE=$PHONE_NUM"
    eval "BOT${BOT_NUM}_PORT=$PORT"

    echo -e "${GREEN}✓ Bot $BOT_NUM registered successfully${NC}"
    echo ""

    BOT_NUM=$((BOT_NUM + 1))
done

# Step 3: Create configuration files
echo ""
echo -e "${BLUE}Step 3: Creating configuration files...${NC}"
echo ""

read -p "Enter your Anthropic API key: " ANTHROPIC_KEY
echo ""
read -p "Enter your personal phone number (who can message the bot): " ALLOWED_SENDER
echo ""

for i in $(seq 1 $NUM_BOTS); do
    eval "PHONE=\$BOT${i}_PHONE"
    eval "PORT=\$BOT${i}_PORT"

    if [ $NUM_BOTS -eq 1 ]; then
        ENV_FILE=".env"
    else
        ENV_FILE=".env.bot$i"
    fi

    cat > "$ENV_FILE" << EOF
# Signal API
SIGNAL_API_URL=http://localhost:$PORT
SIGNAL_PHONE_NUMBER=$PHONE
SIGNAL_POLL_INTERVAL=5000

# Access Control
SIGNAL_ALLOWED_SENDERS=$ALLOWED_SENDER
SIGNAL_ALLOWED_GROUPS=
SIGNAL_BOT_NAMES=Bot$i,Assistant

# Database
DATABASE_TYPE=sqlite
DATABASE_PATH=./data/bot$i.db

# LLM Configuration
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=$ANTHROPIC_KEY
LLM_MODEL=claude-sonnet-4-20250514

# Optional Features
WORKSPACE_DIR=./workspace-bot$i
ENABLE_ACTIVITY_LOGGING=true
LOG_LEVEL=info
EOF

    echo -e "${GREEN}✓ Created $ENV_FILE${NC}"
done

# Create directories
mkdir -p data logs
for i in $(seq 1 $NUM_BOTS); do
    mkdir -p "workspace-bot$i"
done

echo ""
echo -e "${GREEN}✓ Configuration complete!${NC}"
echo ""

# Step 4: Start bots
echo -e "${BLUE}Step 4: Starting bots...${NC}"
echo ""

if [ $NUM_BOTS -eq 1 ]; then
    echo -e "${YELLOW}To start the bot:${NC}"
    echo -e "   ${CYAN}npm start${NC}"
else
    echo -e "${YELLOW}To start all bots:${NC}"
    echo -e "   ${CYAN}./scripts/start-all-bots.sh${NC}"
    echo ""
    echo -e "${YELLOW}Or manually in separate terminals:${NC}"
    for i in $(seq 1 $NUM_BOTS); do
        echo -e "   ${CYAN}ENV_FILE=.env.bot$i npm start${NC}"
    done
fi

echo ""
echo -e "${GREEN}═══════════════════════════════════════${NC}"
echo -e "${GREEN}✓ Setup Complete!${NC}"
echo -e "${GREEN}═══════════════════════════════════════${NC}"
echo ""
echo -e "${BLUE}What was set up:${NC}"
for i in $(seq 1 $NUM_BOTS); do
    eval "PHONE=\$BOT${i}_PHONE"
    eval "PORT=\$BOT${i}_PORT"
    echo -e "  Bot $i: ${GREEN}$PHONE${NC} on port ${CYAN}$PORT${NC}"
done
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo -e "  1. Start your bot(s) using the command above"
echo -e "  2. Send a test message from Signal to each bot"
echo -e "  3. Check status: ${CYAN}./scripts/status-bots.sh${NC}"
echo ""
echo -e "${YELLOW}Docs:${NC} See SETUP-MULTIPLE-NUMBERS.md for troubleshooting"
echo ""
