# Signal Bot Orchestrator Scripts

A comprehensive suite of scripts for managing multiple Signal bot instances with intelligent detection and monitoring.

## Overview

These scripts provide an automated way to:
- Detect and manage multiple bot configurations
- Start/stop multiple Signal API containers
- Launch multiple bot instances
- Monitor bot health and status
- Handle process lifecycle and cleanup

## Scripts

### 1. `start-all-bots.sh`

**Purpose:** Automatically detect and launch all configured Signal bot instances.

**Features:**
- Auto-detects all `.env.bot*` configuration files
- Checks if Docker containers are running, starts them if needed
- Validates each bot's Signal API container is available
- Launches bots in background with proper process management
- Saves PIDs for easy cleanup
- Creates individual log files for each bot
- Colorful output with status indicators

**Usage:**
```bash
./scripts/start-all-bots.sh
```

**What it does:**
1. Checks for Docker and docker-compose availability
2. Scans for `.env.bot*` files in the project directory
3. Verifies Signal API containers are running
   - If not running: starts them with `docker-compose -f docker-compose.multi.yml up -d`
   - Waits 30 seconds for initialization
4. For each bot configuration:
   - Parses the SIGNAL_API_URL to determine the required port
   - Checks if the corresponding Signal API container is running
   - Launches the bot with `ENV_FILE=.env.botN npm start` in background
   - Saves the PID to `.bot-pids` file
5. Creates log files in `logs/` directory

**Output Example:**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Signal Bot Orchestrator - Start All Bots
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

▸ Checking prerequisites...
✓ Docker is available
✓ docker-compose is available

▸ Detecting bot environment files...
✓ Found 2 bot configuration(s):
  • .env.bot1
  • .env.bot2

▸ Checking Signal API containers...
✓ All 2 Signal API container(s) are running

▸ Launching bots...

▸ Launching bot: bot1 (API port: 8080)
✓ Bot bot1 started (PID: 12345, Log: logs/bot1.log)

▸ Launching bot: bot2 (API port: 8081)
✓ Bot bot2 started (PID: 12346, Log: logs/bot2.log)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Summary:
  ✓ 2 bot(s) started successfully
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

### 2. `stop-all-bots.sh`

**Purpose:** Gracefully stop all running Signal bot instances.

**Features:**
- Reads PIDs from `.bot-pids` file
- Attempts graceful shutdown (SIGTERM) first
- Force kills (SIGKILL) if process doesn't stop within 5 seconds
- Optional flag to also stop Signal API containers
- Cleans up PID file after stopping

**Usage:**
```bash
# Stop only bots (leave containers running)
./scripts/stop-all-bots.sh

# Stop bots AND Signal API containers
./scripts/stop-all-bots.sh --stop-containers
./scripts/stop-all-bots.sh -c
```

**Options:**
- `-c, --stop-containers` - Also stop Signal API Docker containers
- `-h, --help` - Show help message

**Output Example:**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Signal Bot Orchestrator - Stop All Bots
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

▸ Stopping bot processes...
  Stopping bot1 (PID: 12345)... ✓
  Stopping bot2 (PID: 12346)... ✓

✓ Stopped 2 bot(s)

ℹ Signal API containers are still running
ℹ Use --stop-containers flag to also stop them

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✓ All bots stopped successfully
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

### 3. `status-bots.sh`

**Purpose:** Display comprehensive status of all bots and containers.

**Features:**
- Shows Signal API container status, ports, and uptime
- Displays bot process status with PID, memory usage, and uptime
- Lists recent log activity with file sizes and modification times
- Color-coded status indicators (green=running, red=stopped)
- Formatted tables for easy reading

**Usage:**
```bash
./scripts/status-bots.sh
```

**Output Example:**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Signal Bot Orchestrator - Status
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

▸ Signal API Containers:

  SERVICE              STATUS          PORTS           UPTIME
  ────────────────────────────────────────────────────────────────
  signal-api-1         running         8080:8080       2h 15m
  signal-api-2         running         8081:8081       2h 15m

✓ All 2 container(s) running

▸ Bot Processes:

  BOT                  STATUS          PID        MEMORY       UPTIME
  ────────────────────────────────────────────────────────────────
  bot1                 running         12345      145MB        1h 30m
  bot2                 running         12346      132MB        1h 30m

✓ 2 bot(s) running

▸ Recent Log Activity:

  LOG FILE             SIZE            LAST MODIFIED
  ────────────────────────────────────────────────────────────────
  bot1.log             2.3M            2026-03-09 14:30
  bot2.log             1.8M            2026-03-09 14:29

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ℹ Use ./scripts/start-all-bots.sh to start bots
ℹ Use ./scripts/stop-all-bots.sh to stop bots
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Configuration

### Bot Configuration Files

The orchestrator auto-detects configuration files matching the pattern `.env.bot*`:

```
.env.bot1    # First bot configuration
.env.bot2    # Second bot configuration
.env.bot3    # Third bot configuration
```

Each configuration file should contain:
```bash
SIGNAL_API_URL=http://localhost:8080  # Signal API endpoint
SIGNAL_NUMBER=+1234567890             # Bot's Signal number
# ... other configuration ...
```

### Docker Compose

The scripts expect a `docker-compose.multi.yml` file that defines multiple Signal API services:

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

---

## File Structure

```
signal-bot/
├── scripts/
│   ├── start-all-bots.sh      # Start all bots
│   ├── stop-all-bots.sh       # Stop all bots
│   ├── status-bots.sh         # Check status
│   └── README.md              # This file
├── logs/
│   ├── bot1.log               # Bot 1 logs
│   └── bot2.log               # Bot 2 logs
├── .env.bot1                  # Bot 1 configuration
├── .env.bot2                  # Bot 2 configuration
├── .bot-pids                  # Process ID tracking (auto-generated)
└── docker-compose.multi.yml   # Multi-container setup
```

---

## Common Workflows

### Starting Everything from Scratch

```bash
# Start all bots (will auto-start containers if needed)
./scripts/start-all-bots.sh

# Check status
./scripts/status-bots.sh
```

### Restarting a Single Bot

```bash
# Stop all bots
./scripts/stop-all-bots.sh

# Manually start just one bot
ENV_FILE=.env.bot1 npm start
```

### Checking Logs

```bash
# View logs for a specific bot
tail -f logs/bot1.log

# View all logs together
tail -f logs/*.log
```

### Cleaning Up Everything

```bash
# Stop bots and containers
./scripts/stop-all-bots.sh --stop-containers

# Remove log files
rm -rf logs/*.log

# Remove PID file
rm .bot-pids
```

---

## Error Handling

The scripts handle various error conditions:

1. **No .env files found:** Script exits with error message
2. **Docker not available:** Script exits with error message
3. **Containers not running:** Automatically starts them
4. **Port conflicts:** Reports which bots failed to start
5. **Process already running:** Detects and reports existing processes
6. **Stale PIDs:** Identifies processes that are no longer running

---

## Signal Handling

- **SIGINT/SIGTERM:** Graceful cleanup on Ctrl+C
- **Bot shutdown:** First attempts SIGTERM, then SIGKILL after 5 seconds
- **Container shutdown:** Uses docker-compose down for proper cleanup

---

## Platform Compatibility

These scripts are designed to work on:
- macOS (tested on Darwin 25.3.0)
- Linux (Ubuntu, Debian, etc.)

Platform-specific commands are used for:
- Process uptime calculation
- Memory usage reporting
- File timestamps

---

## Advanced Usage

### Custom Initialization Wait Time

Edit `start-all-bots.sh` and modify:
```bash
INIT_WAIT_TIME=30  # Change to desired seconds
```

### Custom Log Location

Edit `start-all-bots.sh` and modify:
```bash
mkdir -p "${PROJECT_DIR}/logs"  # Change to custom directory
```

### Running Bots with Different npm Scripts

Modify the launch command in `start-all-bots.sh`:
```bash
# Change from:
ENV_FILE="$env_file" nohup npm start > "$log_file" 2>&1 &

# To custom script:
ENV_FILE="$env_file" nohup npm run dev > "$log_file" 2>&1 &
```

---

## Troubleshooting

### Bots won't start

1. Check Docker containers are running:
   ```bash
   docker-compose -f docker-compose.multi.yml ps
   ```

2. Check bot logs:
   ```bash
   tail -f logs/bot1.log
   ```

3. Verify .env file configuration:
   ```bash
   cat .env.bot1
   ```

### Containers won't start

1. Check Docker daemon:
   ```bash
   docker info
   ```

2. Check port availability:
   ```bash
   lsof -i :8080
   ```

3. Check docker-compose file:
   ```bash
   docker-compose -f docker-compose.multi.yml config
   ```

### Stale PIDs

If bots show as running but aren't:
```bash
# Remove stale PID file
rm .bot-pids

# Restart bots
./scripts/start-all-bots.sh
```

---

## Security Notes

- Scripts use `set -euo pipefail` for robust error handling
- Proper signal handling prevents orphaned processes
- PID files track all running processes
- Graceful shutdown prevents data corruption
- Logs are stored locally (not in version control)

---

## Future Enhancements

Possible additions:
- Automatic restart on failure
- Resource usage monitoring and alerts
- Log rotation
- Health check pings
- Email/Slack notifications
- Web dashboard for monitoring
- systemd service integration
- Docker Swarm/Kubernetes deployment

---

## Contributing

When modifying these scripts:
1. Test on both macOS and Linux
2. Maintain backward compatibility
3. Update this README with changes
4. Follow existing code style and formatting
5. Add error handling for new features

---

## License

These scripts are part of the Signal Bot project.

