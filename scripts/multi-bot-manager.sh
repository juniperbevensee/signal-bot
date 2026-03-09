#!/bin/bash

# Multi-Bot Manager Script
# Helper script to manage multiple Signal bot instances

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Functions
print_header() {
    echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  Signal Bot - Multi-Bot Manager${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
    echo ""
}

check_docker() {
    if ! command -v docker &> /dev/null; then
        echo -e "${RED}Error: Docker is not installed${NC}"
        exit 1
    fi
}

start_signal_apis() {
    echo -e "${GREEN}Starting Signal API containers...${NC}"
    docker-compose -f docker-compose.multi.yml up -d
    echo ""
    echo -e "${GREEN}✓ Signal API containers started${NC}"
    echo ""
    echo "Waiting for containers to initialize (30 seconds)..."
    sleep 30
    echo ""
    echo -e "${GREEN}Ready to link phone numbers!${NC}"
}

stop_signal_apis() {
    echo -e "${YELLOW}Stopping Signal API containers...${NC}"
    docker-compose -f docker-compose.multi.yml down
    echo -e "${GREEN}✓ Signal API containers stopped${NC}"
}

status_signal_apis() {
    echo -e "${BLUE}Signal API Container Status:${NC}"
    echo ""
    docker ps --filter "name=signal-api" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
    echo ""
}

check_api_health() {
    echo -e "${BLUE}Checking Signal API health...${NC}"
    echo ""

    for port in 8080 8081 8082; do
        echo -n "Port $port: "
        if curl -s "http://localhost:$port/v1/about" &> /dev/null; then
            echo -e "${GREEN}✓ OK${NC}"
        else
            echo -e "${RED}✗ Not responding${NC}"
        fi
    done
    echo ""
}

open_qr_codes() {
    echo -e "${BLUE}Opening QR code registration pages...${NC}"
    echo ""

    open "http://localhost:8080/v1/qrcodelink?device_name=bot-1" 2>/dev/null || \
        echo "Bot 1: http://localhost:8080/v1/qrcodelink?device_name=bot-1"

    open "http://localhost:8081/v1/qrcodelink?device_name=bot-2" 2>/dev/null || \
        echo "Bot 2: http://localhost:8081/v1/qrcodelink?device_name=bot-2"

    open "http://localhost:8082/v1/qrcodelink?device_name=bot-3" 2>/dev/null || \
        echo "Bot 3: http://localhost:8082/v1/qrcodelink?device_name=bot-3"

    echo ""
    echo "Scan each QR code with a different Signal account"
}

view_logs() {
    bot_num=$1
    if [ -z "$bot_num" ]; then
        echo -e "${YELLOW}Usage: $0 logs <bot-number>${NC}"
        echo "Example: $0 logs 1"
        exit 1
    fi

    container="signal-api-$bot_num"
    echo -e "${BLUE}Showing logs for $container...${NC}"
    echo "Press Ctrl+C to exit"
    echo ""
    docker logs -f "$container"
}

create_env_files() {
    echo -e "${BLUE}Creating .env files from examples...${NC}"
    echo ""

    for i in 1 2 3; do
        if [ ! -f ".env.bot$i" ]; then
            if [ -f ".env.bot$i.example" ]; then
                cp ".env.bot$i.example" ".env.bot$i"
                echo -e "${GREEN}✓ Created .env.bot$i${NC}"
            else
                echo -e "${YELLOW}⚠ .env.bot$i.example not found${NC}"
            fi
        else
            echo -e "${YELLOW}⚠ .env.bot$i already exists (skipping)${NC}"
        fi
    done

    echo ""
    echo -e "${YELLOW}Remember to edit each .env.bot* file with your settings!${NC}"
}

show_help() {
    print_header
    echo "Usage: $0 <command>"
    echo ""
    echo "Commands:"
    echo "  start         Start all Signal API containers"
    echo "  stop          Stop all Signal API containers"
    echo "  restart       Restart all Signal API containers"
    echo "  status        Show container status"
    echo "  health        Check API health"
    echo "  qr            Open QR code registration pages"
    echo "  logs <1-3>    View logs for specific bot"
    echo "  setup         Create .env files from examples"
    echo "  help          Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 start      # Start all Signal APIs"
    echo "  $0 qr         # Open QR codes to link phones"
    echo "  $0 logs 1     # View logs for bot 1"
    echo ""
}

# Main script
case "$1" in
    start)
        check_docker
        start_signal_apis
        ;;
    stop)
        check_docker
        stop_signal_apis
        ;;
    restart)
        check_docker
        stop_signal_apis
        echo ""
        start_signal_apis
        ;;
    status)
        check_docker
        status_signal_apis
        ;;
    health)
        check_api_health
        ;;
    qr)
        open_qr_codes
        ;;
    logs)
        check_docker
        view_logs "$2"
        ;;
    setup)
        create_env_files
        ;;
    help|--help|-h|"")
        show_help
        ;;
    *)
        echo -e "${RED}Unknown command: $1${NC}"
        echo ""
        show_help
        exit 1
        ;;
esac
