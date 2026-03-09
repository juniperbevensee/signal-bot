# Signal Bot Orchestrator - Quick Start Guide

## Overview

Manage multiple Signal bot instances with three simple scripts.

## Quick Commands

```bash
# Start all bots (auto-starts containers if needed)
./scripts/start-all-bots.sh

# Check status of bots and containers
./scripts/status-bots.sh

# Stop all bots
./scripts/stop-all-bots.sh

# Stop bots and containers
./scripts/stop-all-bots.sh --stop-containers
```

## Setup Requirements

1. **Create bot configuration files:**
   ```bash
   cp .env .env.bot1
   cp .env .env.bot2
   # Edit each file with unique SIGNAL_API_URL and SIGNAL_NUMBER
   ```

2. **Create docker-compose.multi.yml:**
   ```yaml
   version: '3'
   services:
     signal-api-1:
       image: bbernhard/signal-cli-rest-api:latest
       ports:
         - "8080:8080"
       volumes:
         - ./signal-data-1:/home/.local/share/signal-cli
     
     signal-api-2:
       image: bbernhard/signal-cli-rest-api:latest
       ports:
         - "8081:8080"
       volumes:
         - ./signal-data-2:/home/.local/share/signal-cli
   ```

3. **Run the start script:**
   ```bash
   ./scripts/start-all-bots.sh
   ```

## What Each Script Does

### start-all-bots.sh
- Detects all `.env.bot*` files
- Starts Docker containers if needed
- Launches each bot in background
- Creates log files in `logs/` directory
- Saves PIDs for easy cleanup

### stop-all-bots.sh
- Reads PIDs from `.bot-pids` file
- Gracefully stops all bot processes
- Optionally stops Docker containers with `--stop-containers`
- Cleans up PID tracking file

### status-bots.sh
- Shows container status with uptime
- Displays bot process info (PID, memory, uptime)
- Lists log files with sizes
- Color-coded status indicators

## File Structure

```
signal-bot/
├── scripts/
│   ├── start-all-bots.sh      # Start everything
│   ├── stop-all-bots.sh       # Stop everything
│   └── status-bots.sh         # Check status
├── logs/
│   ├── bot1.log               # Bot logs (auto-created)
│   └── bot2.log
├── .env.bot1                  # Bot configurations
├── .env.bot2
├── .bot-pids                  # PID tracking (auto-created)
└── docker-compose.multi.yml   # Container definitions
```

## Viewing Logs

```bash
# Follow logs for a specific bot
tail -f logs/bot1.log

# View all logs
tail -f logs/*.log

# Check last 100 lines
tail -n 100 logs/bot1.log
```

## Common Issues

### "No .env.bot* files found"
Create at least one `.env.bot1` file with bot configuration.

### "Docker daemon is not running"
Start Docker Desktop or the Docker daemon.

### "Signal API container for port 8080 is not running"
The script will automatically start containers. Wait 30 seconds for initialization.

### Bots won't start
Check logs in `logs/` directory for error messages.

## Features

- Auto-detection of bot configurations
- Intelligent Docker container management
- Process lifecycle management with PID tracking
- Graceful shutdown with fallback to force kill
- Colorful output with status indicators
- Individual log files for each bot
- Memory and uptime monitoring
- Platform-compatible (macOS and Linux)
- Robust error handling
- Signal handling (Ctrl+C safety)

## Advanced Usage

### Start containers only (no bots)
```bash
docker-compose -f docker-compose.multi.yml up -d
```

### Start single bot manually
```bash
ENV_FILE=.env.bot1 npm start
```

### Clean everything
```bash
./scripts/stop-all-bots.sh --stop-containers
rm -rf logs/*.log .bot-pids
```

## Help

For detailed documentation, see `scripts/README.md`

For script help:
```bash
./scripts/stop-all-bots.sh --help
```

