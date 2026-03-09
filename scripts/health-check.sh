#!/bin/bash

#######################################
# Signal Bot Orchestrator - Health Check
# Returns exit code 0 if all bots are healthy, 1 otherwise
# Useful for monitoring systems and CI/CD pipelines
#######################################

set -euo pipefail

# Configuration
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_FILE="${PROJECT_DIR}/.bot-pids"
DOCKER_COMPOSE_FILE="${PROJECT_DIR}/docker-compose.multi.yml"

# Silent mode for monitoring systems
SILENT=false
if [ "${1:-}" = "--silent" ] || [ "${1:-}" = "-s" ]; then
    SILENT=true
fi

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

print_status() {
    if [ "$SILENT" = false ]; then
        echo -e "$1"
    fi
}

# Check if all expected containers are running
check_containers_health() {
    if [ ! -f "$DOCKER_COMPOSE_FILE" ]; then
        return 1
    fi
    
    local services=$(docker-compose -f "$DOCKER_COMPOSE_FILE" config --services 2>/dev/null)
    
    if [ -z "$services" ]; then
        return 1
    fi
    
    while IFS= read -r service; do
        if ! docker-compose -f "$DOCKER_COMPOSE_FILE" ps "$service" 2>/dev/null | grep -q "Up"; then
            print_status "${RED}✗${NC} Container ${service} is not running"
            return 1
        fi
    done <<< "$services"
    
    return 0
}

# Check if all expected bots are running
check_bots_health() {
    if [ ! -f "$PID_FILE" ]; then
        print_status "${RED}✗${NC} No bots are running (PID file not found)"
        return 1
    fi
    
    local all_running=true
    
    while IFS=':' read -r env_file pid; do
        if [ -z "$pid" ] || [ -z "$env_file" ]; then
            continue
        fi
        
        local bot_name=${env_file#.env.}
        
        if ! kill -0 "$pid" 2>/dev/null; then
            print_status "${RED}✗${NC} Bot ${bot_name} (PID: ${pid}) is not running"
            all_running=false
        fi
    done < "$PID_FILE"
    
    if [ "$all_running" = false ]; then
        return 1
    fi
    
    return 0
}

# Main health check
main() {
    local containers_ok=false
    local bots_ok=false
    
    if check_containers_health; then
        containers_ok=true
        print_status "${GREEN}✓${NC} All containers are healthy"
    fi
    
    if check_bots_health; then
        bots_ok=true
        print_status "${GREEN}✓${NC} All bots are healthy"
    fi
    
    if [ "$containers_ok" = true ] && [ "$bots_ok" = true ]; then
        print_status "${GREEN}✓${NC} System is healthy"
        exit 0
    else
        print_status "${RED}✗${NC} System is unhealthy"
        exit 1
    fi
}

# Show help
if [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Health check for Signal bot orchestrator system."
    echo "Returns exit code 0 if healthy, 1 if unhealthy."
    echo ""
    echo "Options:"
    echo "  -s, --silent    Silent mode (no output, only exit code)"
    echo "  -h, --help      Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0              # Check health with output"
    echo "  $0 --silent     # Check health silently"
    echo "  $0 && echo OK   # Use in scripts"
    exit 0
fi

main
