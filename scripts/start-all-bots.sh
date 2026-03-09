#!/bin/bash

#######################################
# Signal Bot Orchestrator - Start All Bots
# Automatically detects and launches multiple Signal bot instances
#######################################

set -euo pipefail

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# Configuration
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_FILE="${PROJECT_DIR}/.bot-pids"
DOCKER_COMPOSE_FILE="${PROJECT_DIR}/docker-compose.multi.yml"
INIT_WAIT_TIME=30

# Print functions
print_header() {
    echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}${CYAN}  Signal Bot Orchestrator - Start All Bots${NC}"
    echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

print_step() {
    echo -e "${MAGENTA}▸${NC} ${BOLD}$1${NC}"
}

# Cleanup function for signal handling
cleanup() {
    print_warning "Interrupted! Cleaning up..."
    exit 130
}

trap cleanup SIGINT SIGTERM

# Check if docker is available
check_docker() {
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed or not in PATH"
        exit 1
    fi
    
    if ! docker info &> /dev/null; then
        print_error "Docker daemon is not running"
        exit 1
    fi
    
    print_success "Docker is available"
}

# Check if docker-compose is available
check_docker_compose() {
    if ! command -v docker-compose &> /dev/null; then
        print_error "docker-compose is not installed or not in PATH"
        exit 1
    fi
    
    print_success "docker-compose is available"
}

# Detect all .env.bot* files
detect_env_files() {
    local env_files=()
    
    print_step "Detecting bot environment files..."
    
    for file in "${PROJECT_DIR}"/.env.bot*; do
        if [ -f "$file" ]; then
            env_files+=("$(basename "$file")")
        fi
    done
    
    if [ ${#env_files[@]} -eq 0 ]; then
        print_error "No .env.bot* files found in ${PROJECT_DIR}"
        exit 1
    fi
    
    print_success "Found ${#env_files[@]} bot configuration(s):"
    for env_file in "${env_files[@]}"; do
        echo -e "  ${CYAN}•${NC} $env_file"
    done
    echo ""
    
    echo "${env_files[@]}"
}

# Parse SIGNAL_API_URL from env file to extract port
parse_api_port() {
    local env_file=$1
    local api_url
    
    if [ ! -f "${PROJECT_DIR}/${env_file}" ]; then
        print_error "Environment file ${env_file} not found"
        return 1
    fi
    
    api_url=$(grep -E "^SIGNAL_API_URL=" "${PROJECT_DIR}/${env_file}" | cut -d'=' -f2- | tr -d '"' | tr -d "'")
    
    if [ -z "$api_url" ]; then
        print_warning "No SIGNAL_API_URL found in ${env_file}, using default"
        echo "8080"
        return 0
    fi
    
    # Extract port from URL (e.g., http://localhost:8080 -> 8080)
    local port=$(echo "$api_url" | sed -E 's|.*:([0-9]+).*|\1|')
    
    if [ -z "$port" ] || ! [[ "$port" =~ ^[0-9]+$ ]]; then
        print_warning "Could not parse port from ${api_url}, using default"
        echo "8080"
    else
        echo "$port"
    fi
}

# Check if Signal API containers are running
check_signal_containers() {
    print_step "Checking Signal API containers..."
    
    if [ ! -f "$DOCKER_COMPOSE_FILE" ]; then
        print_error "Docker Compose file not found: ${DOCKER_COMPOSE_FILE}"
        exit 1
    fi
    
    # Get list of services defined in docker-compose file
    local services=$(docker-compose -f "$DOCKER_COMPOSE_FILE" config --services 2>/dev/null)
    
    if [ -z "$services" ]; then
        print_warning "No services defined in docker-compose.multi.yml"
        return 1
    fi
    
    local running_count=0
    local total_count=0
    
    while IFS= read -r service; do
        ((total_count++))
        if docker-compose -f "$DOCKER_COMPOSE_FILE" ps "$service" 2>/dev/null | grep -q "Up"; then
            ((running_count++))
        fi
    done <<< "$services"
    
    if [ $running_count -eq $total_count ] && [ $total_count -gt 0 ]; then
        print_success "All ${total_count} Signal API container(s) are running"
        return 0
    elif [ $running_count -gt 0 ]; then
        print_warning "${running_count}/${total_count} Signal API container(s) are running"
        return 1
    else
        print_warning "No Signal API containers are running"
        return 1
    fi
}

# Start Signal API containers
start_signal_containers() {
    print_step "Starting Signal API containers..."
    
    cd "$PROJECT_DIR"
    
    if docker-compose -f "$DOCKER_COMPOSE_FILE" up -d; then
        print_success "Signal API containers started"
        
        print_info "Waiting ${INIT_WAIT_TIME} seconds for initialization..."
        for ((i=INIT_WAIT_TIME; i>0; i--)); do
            echo -ne "\r  ${BLUE}⏳${NC} ${i} seconds remaining...  "
            sleep 1
        done
        echo -e "\r  ${GREEN}✓${NC} Initialization complete      "
        echo ""
    else
        print_error "Failed to start Signal API containers"
        exit 1
    fi
}

# Check if a specific port's container is running
check_port_container() {
    local port=$1
    
    # Check if any container is listening on this port
    if docker ps --format '{{.Ports}}' | grep -q ":${port}->"; then
        return 0
    else
        return 1
    fi
}

# Launch a bot instance
launch_bot() {
    local env_file=$1
    local bot_name=${env_file#.env.}
    local port=$(parse_api_port "$env_file")
    
    print_step "Launching bot: ${BOLD}${bot_name}${NC} (API port: ${port})"
    
    # Check if the specific Signal API container is running
    if ! check_port_container "$port"; then
        print_error "Signal API container for port ${port} is not running"
        return 1
    fi
    
    # Check if bot is already running
    if [ -f "$PID_FILE" ]; then
        while IFS=':' read -r existing_env existing_pid; do
            if [ "$existing_env" = "$env_file" ] && kill -0 "$existing_pid" 2>/dev/null; then
                print_warning "Bot ${bot_name} is already running (PID: ${existing_pid})"
                return 0
            fi
        done < "$PID_FILE"
    fi
    
    # Launch bot in background
    cd "$PROJECT_DIR"
    
    # Create log directory if it doesn't exist
    mkdir -p "${PROJECT_DIR}/logs"
    
    local log_file="${PROJECT_DIR}/logs/${bot_name}.log"
    
    # Start the bot with nohup to prevent it from being killed when the script exits
    ENV_FILE="$env_file" nohup npm start > "$log_file" 2>&1 &
    local pid=$!
    
    # Wait a moment to check if the process started successfully
    sleep 2
    
    if kill -0 "$pid" 2>/dev/null; then
        # Save PID to file
        echo "${env_file}:${pid}" >> "$PID_FILE"
        print_success "Bot ${bot_name} started (PID: ${pid}, Log: logs/${bot_name}.log)"
        return 0
    else
        print_error "Failed to start bot ${bot_name}"
        print_info "Check log file: ${log_file}"
        return 1
    fi
}

# Main execution
main() {
    print_header
    
    # Check prerequisites
    print_step "Checking prerequisites..."
    check_docker
    check_docker_compose
    echo ""
    
    # Detect environment files
    local env_files=($(detect_env_files))
    
    # Check and start Signal API containers if needed
    if ! check_signal_containers; then
        echo ""
        start_signal_containers
    fi
    echo ""
    
    # Clear old PID file
    > "$PID_FILE"
    
    # Launch each bot
    print_step "Launching bots..."
    echo ""
    
    local success_count=0
    local fail_count=0
    
    for env_file in "${env_files[@]}"; do
        if launch_bot "$env_file"; then
            ((success_count++))
        else
            ((fail_count++))
        fi
        echo ""
    done
    
    # Summary
    echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}Summary:${NC}"
    echo -e "  ${GREEN}✓${NC} ${success_count} bot(s) started successfully"
    
    if [ $fail_count -gt 0 ]; then
        echo -e "  ${RED}✗${NC} ${fail_count} bot(s) failed to start"
    fi
    
    echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    
    if [ $success_count -gt 0 ]; then
        print_info "Use ${BOLD}./scripts/stop-all-bots.sh${NC} to stop all bots"
        print_info "Use ${BOLD}./scripts/status-bots.sh${NC} to check bot status"
        print_info "Bot logs are available in: ${BOLD}logs/${NC}"
    fi
    
    if [ $fail_count -gt 0 ]; then
        exit 1
    fi
}

main "$@"
