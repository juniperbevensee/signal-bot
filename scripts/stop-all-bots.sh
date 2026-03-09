#!/bin/bash

#######################################
# Signal Bot Orchestrator - Stop All Bots
# Stops all running Signal bot instances
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
    echo -e "${BOLD}${CYAN}  Signal Bot Orchestrator - Stop All Bots${NC}"
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

# Parse command line arguments
STOP_CONTAINERS=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --stop-containers|-c)
            STOP_CONTAINERS=true
            shift
            ;;
        --help|-h)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  -c, --stop-containers    Also stop Signal API Docker containers"
            echo "  -h, --help              Show this help message"
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Stop bot processes
stop_bots() {
    print_step "Stopping bot processes..."
    
    if [ ! -f "$PID_FILE" ]; then
        print_warning "No PID file found at ${PID_FILE}"
        print_info "No bots appear to be running (or they were not started with start-all-bots.sh)"
        return 0
    fi
    
    local stopped_count=0
    local not_running_count=0
    local failed_count=0
    
    while IFS=':' read -r env_file pid; do
        if [ -z "$pid" ] || [ -z "$env_file" ]; then
            continue
        fi
        
        local bot_name=${env_file#.env.}
        
        if kill -0 "$pid" 2>/dev/null; then
            echo -n "  Stopping ${BOLD}${bot_name}${NC} (PID: ${pid})... "
            
            # Try graceful shutdown first (SIGTERM)
            if kill "$pid" 2>/dev/null; then
                # Wait up to 5 seconds for graceful shutdown
                local wait_count=0
                while kill -0 "$pid" 2>/dev/null && [ $wait_count -lt 50 ]; do
                    sleep 0.1
                    ((wait_count++))
                done
                
                # Force kill if still running
                if kill -0 "$pid" 2>/dev/null; then
                    kill -9 "$pid" 2>/dev/null || true
                    sleep 0.5
                fi
                
                if ! kill -0 "$pid" 2>/dev/null; then
                    echo -e "${GREEN}✓${NC}"
                    ((stopped_count++))
                else
                    echo -e "${RED}✗${NC}"
                    ((failed_count++))
                fi
            else
                echo -e "${RED}✗${NC}"
                ((failed_count++))
            fi
        else
            echo -e "  Bot ${BOLD}${bot_name}${NC} (PID: ${pid}): ${YELLOW}not running${NC}"
            ((not_running_count++))
        fi
    done < "$PID_FILE"
    
    echo ""
    
    # Remove PID file
    rm -f "$PID_FILE"
    
    # Summary
    if [ $stopped_count -gt 0 ]; then
        print_success "Stopped ${stopped_count} bot(s)"
    fi
    
    if [ $not_running_count -gt 0 ]; then
        print_info "${not_running_count} bot(s) were not running"
    fi
    
    if [ $failed_count -gt 0 ]; then
        print_error "Failed to stop ${failed_count} bot(s)"
    fi
    
    echo ""
}

# Stop Signal API containers
stop_containers() {
    print_step "Stopping Signal API containers..."
    
    if [ ! -f "$DOCKER_COMPOSE_FILE" ]; then
        print_warning "Docker Compose file not found: ${DOCKER_COMPOSE_FILE}"
        return 0
    fi
    
    cd "$PROJECT_DIR"
    
    if docker-compose -f "$DOCKER_COMPOSE_FILE" ps -q | grep -q .; then
        if docker-compose -f "$DOCKER_COMPOSE_FILE" down; then
            print_success "Signal API containers stopped"
        else
            print_error "Failed to stop Signal API containers"
            return 1
        fi
    else
        print_info "No Signal API containers are running"
    fi
    
    echo ""
}

# Main execution
main() {
    print_header
    
    # Stop bots
    stop_bots
    
    # Stop containers if requested
    if [ "$STOP_CONTAINERS" = true ]; then
        stop_containers
    else
        print_info "Signal API containers are still running"
        print_info "Use ${BOLD}--stop-containers${NC} flag to also stop them"
        echo ""
    fi
    
    echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    print_success "All bots stopped successfully"
    echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

main "$@"
