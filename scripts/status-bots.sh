#!/bin/bash

#######################################
# Signal Bot Orchestrator - Status Check
# Shows status of all Signal bot instances and containers
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

# Print functions
print_header() {
    echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}${CYAN}  Signal Bot Orchestrator - Status${NC}"
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

# Get process uptime
get_uptime() {
    local pid=$1
    
    if ! kill -0 "$pid" 2>/dev/null; then
        echo "N/A"
        return
    fi
    
    # Get process start time (platform-specific)
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        local start_time=$(ps -p "$pid" -o lstart= 2>/dev/null | xargs -I {} date -j -f "%a %b %d %T %Y" "{}" "+%s" 2>/dev/null || echo "0")
    else
        # Linux
        local start_time=$(ps -p "$pid" -o lstart= 2>/dev/null | xargs -I {} date -d "{}" "+%s" 2>/dev/null || echo "0")
    fi
    
    if [ "$start_time" = "0" ]; then
        echo "unknown"
        return
    fi
    
    local current_time=$(date +%s)
    local uptime_seconds=$((current_time - start_time))
    
    # Format uptime
    local days=$((uptime_seconds / 86400))
    local hours=$(((uptime_seconds % 86400) / 3600))
    local minutes=$(((uptime_seconds % 3600) / 60))
    
    if [ $days -gt 0 ]; then
        echo "${days}d ${hours}h ${minutes}m"
    elif [ $hours -gt 0 ]; then
        echo "${hours}h ${minutes}m"
    else
        echo "${minutes}m"
    fi
}

# Get process memory usage
get_memory() {
    local pid=$1
    
    if ! kill -0 "$pid" 2>/dev/null; then
        echo "N/A"
        return
    fi
    
    # Get memory usage (platform-specific)
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS - RSS in KB
        local mem_kb=$(ps -p "$pid" -o rss= 2>/dev/null | tr -d ' ' || echo "0")
        local mem_mb=$((mem_kb / 1024))
    else
        # Linux - RSS in KB
        local mem_kb=$(ps -p "$pid" -o rss= 2>/dev/null | tr -d ' ' || echo "0")
        local mem_mb=$((mem_kb / 1024))
    fi
    
    echo "${mem_mb}MB"
}

# Check Signal API containers status
check_containers() {
    print_step "Signal API Containers:"
    echo ""
    
    if [ ! -f "$DOCKER_COMPOSE_FILE" ]; then
        print_warning "Docker Compose file not found: ${DOCKER_COMPOSE_FILE}"
        echo ""
        return
    fi
    
    if ! command -v docker-compose &> /dev/null; then
        print_warning "docker-compose not found"
        echo ""
        return
    fi
    
    cd "$PROJECT_DIR"
    
    # Get container status
    local services=$(docker-compose -f "$DOCKER_COMPOSE_FILE" config --services 2>/dev/null || echo "")
    
    if [ -z "$services" ]; then
        print_info "No services defined"
        echo ""
        return
    fi
    
    local running_count=0
    local total_count=0
    
    printf "  %-20s %-15s %-15s %s\n" "SERVICE" "STATUS" "PORTS" "UPTIME"
    echo "  ────────────────────────────────────────────────────────────────"
    
    while IFS= read -r service; do
        ((total_count++))
        
        local status=$(docker-compose -f "$DOCKER_COMPOSE_FILE" ps -q "$service" 2>/dev/null | xargs -I {} docker inspect -f '{{.State.Status}}' {} 2>/dev/null || echo "not running")
        local ports=$(docker-compose -f "$DOCKER_COMPOSE_FILE" ps "$service" 2>/dev/null | tail -n +3 | awk '{print $NF}' || echo "-")
        
        if [ "$status" = "running" ]; then
            ((running_count++))
            local container_id=$(docker-compose -f "$DOCKER_COMPOSE_FILE" ps -q "$service" 2>/dev/null)
            local started=$(docker inspect -f '{{.State.StartedAt}}' "$container_id" 2>/dev/null | cut -d'.' -f1 || echo "")
            
            if [ -n "$started" ]; then
                local uptime=$(get_container_uptime "$started")
            else
                local uptime="-"
            fi
            
            printf "  %-20s ${GREEN}%-15s${NC} %-15s %s\n" "$service" "running" "$ports" "$uptime"
        else
            printf "  %-20s ${RED}%-15s${NC} %-15s %s\n" "$service" "stopped" "-" "-"
        fi
    done <<< "$services"
    
    echo ""
    
    if [ $running_count -eq $total_count ] && [ $total_count -gt 0 ]; then
        print_success "All ${total_count} container(s) running"
    elif [ $running_count -gt 0 ]; then
        print_warning "${running_count}/${total_count} container(s) running"
    else
        print_error "No containers running"
    fi
    
    echo ""
}

# Get container uptime
get_container_uptime() {
    local started=$1
    
    local start_time=$(date -j -f "%Y-%m-%dT%H:%M:%S" "$started" "+%s" 2>/dev/null || date -d "$started" "+%s" 2>/dev/null || echo "0")
    
    if [ "$start_time" = "0" ]; then
        echo "unknown"
        return
    fi
    
    local current_time=$(date +%s)
    local uptime_seconds=$((current_time - start_time))
    
    local days=$((uptime_seconds / 86400))
    local hours=$(((uptime_seconds % 86400) / 3600))
    local minutes=$(((uptime_seconds % 3600) / 60))
    
    if [ $days -gt 0 ]; then
        echo "${days}d ${hours}h ${minutes}m"
    elif [ $hours -gt 0 ]; then
        echo "${hours}h ${minutes}m"
    else
        echo "${minutes}m"
    fi
}

# Check bot processes status
check_bots() {
    print_step "Bot Processes:"
    echo ""
    
    if [ ! -f "$PID_FILE" ]; then
        print_info "No bots running (PID file not found)"
        print_info "Start bots with: ${BOLD}./scripts/start-all-bots.sh${NC}"
        echo ""
        return
    fi
    
    local running_count=0
    local stopped_count=0
    
    printf "  %-20s %-15s %-10s %-12s %s\n" "BOT" "STATUS" "PID" "MEMORY" "UPTIME"
    echo "  ────────────────────────────────────────────────────────────────"
    
    while IFS=':' read -r env_file pid; do
        if [ -z "$pid" ] || [ -z "$env_file" ]; then
            continue
        fi
        
        local bot_name=${env_file#.env.}
        
        if kill -0 "$pid" 2>/dev/null; then
            local uptime=$(get_uptime "$pid")
            local memory=$(get_memory "$pid")
            printf "  %-20s ${GREEN}%-15s${NC} %-10s %-12s %s\n" "$bot_name" "running" "$pid" "$memory" "$uptime"
            ((running_count++))
        else
            printf "  %-20s ${RED}%-15s${NC} %-10s %-12s %s\n" "$bot_name" "stopped" "$pid" "-" "-"
            ((stopped_count++))
        fi
    done < "$PID_FILE"
    
    echo ""
    
    if [ $running_count -gt 0 ]; then
        print_success "${running_count} bot(s) running"
    fi
    
    if [ $stopped_count -gt 0 ]; then
        print_warning "${stopped_count} bot(s) stopped (stale PIDs)"
    fi
    
    if [ $running_count -eq 0 ] && [ $stopped_count -eq 0 ]; then
        print_info "No bots found"
    fi
    
    echo ""
}

# Check log files
check_logs() {
    print_step "Recent Log Activity:"
    echo ""
    
    local log_dir="${PROJECT_DIR}/logs"
    
    if [ ! -d "$log_dir" ]; then
        print_info "No log directory found"
        echo ""
        return
    fi
    
    local log_files=$(find "$log_dir" -name "*.log" -type f 2>/dev/null | sort)
    
    if [ -z "$log_files" ]; then
        print_info "No log files found"
        echo ""
        return
    fi
    
    printf "  %-20s %-15s %s\n" "LOG FILE" "SIZE" "LAST MODIFIED"
    echo "  ────────────────────────────────────────────────────────────────"
    
    while IFS= read -r log_file; do
        local filename=$(basename "$log_file")
        local size=$(du -h "$log_file" 2>/dev/null | cut -f1 || echo "0")
        local modified
        
        if [[ "$OSTYPE" == "darwin"* ]]; then
            modified=$(stat -f "%Sm" -t "%Y-%m-%d %H:%M" "$log_file" 2>/dev/null || echo "unknown")
        else
            modified=$(stat -c "%y" "$log_file" 2>/dev/null | cut -d'.' -f1 || echo "unknown")
        fi
        
        printf "  %-20s %-15s %s\n" "$filename" "$size" "$modified"
    done <<< "$log_files"
    
    echo ""
}

# Main execution
main() {
    print_header
    
    check_containers
    check_bots
    check_logs
    
    echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    print_info "Use ${BOLD}./scripts/start-all-bots.sh${NC} to start bots"
    print_info "Use ${BOLD}./scripts/stop-all-bots.sh${NC} to stop bots"
    echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

main "$@"
