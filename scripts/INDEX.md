# Signal Bot Orchestrator - File Index

## Quick Navigation

### Getting Started
1. **[QUICKSTART.md](QUICKSTART.md)** - 5-minute setup guide
2. **[example-bot-config.env](example-bot-config.env)** - Configuration template

### Main Scripts
1. **[start-all-bots.sh](start-all-bots.sh)** - Start all bots and containers
2. **[stop-all-bots.sh](stop-all-bots.sh)** - Stop all bots (optionally containers)
3. **[status-bots.sh](status-bots.sh)** - Check status of everything
4. **[health-check.sh](health-check.sh)** - Health check for monitoring

### Documentation
1. **[README.md](README.md)** - Complete documentation (12KB)
2. **[FEATURES.md](FEATURES.md)** - Feature overview and capabilities
3. **[INDEX.md](INDEX.md)** - This file

## File Purposes

### Executable Scripts (chmod +x)

#### start-all-bots.sh (9.0KB)
- Auto-detects `.env.bot*` configuration files
- Checks and starts Docker containers if needed
- Launches all bots in background
- Creates log files in `logs/` directory
- Saves PIDs to `.bot-pids` for tracking
- 30-second initialization wait for containers
- Colorful progress output

**Usage:** `./scripts/start-all-bots.sh`

#### stop-all-bots.sh (5.6KB)
- Reads PIDs from `.bot-pids` file
- Gracefully stops all bot processes (SIGTERM)
- Force kills after 5 seconds if needed (SIGKILL)
- Optional container shutdown with `--stop-containers`
- Cleans up PID tracking file

**Usage:** `./scripts/stop-all-bots.sh [--stop-containers]`

#### status-bots.sh (9.7KB)
- Shows Signal API container status with uptime
- Displays bot process info (PID, memory, uptime)
- Lists log files with sizes and timestamps
- Color-coded status indicators
- Formatted tables for easy reading

**Usage:** `./scripts/status-bots.sh`

#### health-check.sh (3.2KB)
- Validates all containers are running
- Validates all bot processes are alive
- Returns exit code 0 if healthy, 1 if not
- Silent mode for monitoring integration
- Suitable for cron jobs and CI/CD

**Usage:** `./scripts/health-check.sh [--silent]`

#### multi-bot-manager.sh (5.0KB)
- Legacy script (pre-orchestrator)
- Can be used as reference or alternative approach

### Configuration Files

#### example-bot-config.env (1.2KB)
Template for creating bot configuration files. Copy to `.env.bot1`, `.env.bot2`, etc.

**Key settings:**
- `SIGNAL_API_URL` - Signal API endpoint (must be unique per bot)
- `SIGNAL_NUMBER` - Bot's phone number (must be unique)
- `BOT_NAME` - Friendly name for the bot
- Additional environment variables as needed

### Documentation Files

#### README.md (12KB)
Complete documentation covering:
- Overview and features
- Detailed script descriptions
- Configuration guide
- Usage examples
- Troubleshooting
- Error handling
- Platform compatibility
- Advanced usage

#### QUICKSTART.md (3.6KB)
Fast-track guide with:
- Quick commands reference
- Minimal setup instructions
- Common workflows
- Troubleshooting tips
- File structure

#### FEATURES.md (8.5KB)
Comprehensive feature list:
- All capabilities explained
- Feature matrix comparison
- Technical details
- Use cases
- Integration examples
- Future enhancements

#### INDEX.md (This File)
Navigation and file reference guide.

## Typical Workflow

### First Time Setup
```bash
# 1. Copy configuration template
cp scripts/example-bot-config.env .env.bot1

# 2. Edit configuration
vim .env.bot1

# 3. Create additional bots if needed
cp .env.bot1 .env.bot2
vim .env.bot2

# 4. Start everything
./scripts/start-all-bots.sh
```

### Daily Usage
```bash
# Check status
./scripts/status-bots.sh

# View logs
tail -f logs/bot1.log

# Restart everything
./scripts/stop-all-bots.sh
./scripts/start-all-bots.sh

# Stop for the day
./scripts/stop-all-bots.sh --stop-containers
```

### Monitoring
```bash
# Quick health check
./scripts/health-check.sh

# Silent check (for scripts)
./scripts/health-check.sh --silent && echo "Healthy" || echo "Unhealthy"

# Continuous monitoring
watch -n 5 ./scripts/status-bots.sh
```

## Generated Files

### .bot-pids
Auto-generated file tracking running bot processes.
Format: `env_file:pid` (one per line)

Example:
```
.env.bot1:12345
.env.bot2:12346
```

**Location:** Project root  
**Created by:** start-all-bots.sh  
**Used by:** stop-all-bots.sh, status-bots.sh, health-check.sh  
**Deleted by:** stop-all-bots.sh

### logs/*.log
Individual log files for each bot instance.

Example files:
- `logs/bot1.log` - Logs for first bot
- `logs/bot2.log` - Logs for second bot
- `logs/bot3.log` - Logs for third bot

**Location:** `logs/` directory  
**Created by:** start-all-bots.sh  
**Format:** Standard output/error from bot process

## Dependencies

### Required
- **bash** - Shell interpreter (v4.0+)
- **docker** - Container runtime
- **docker-compose** - Multi-container orchestration
- **npm** - Node package manager (for bot execution)

### Optional
- **tail** - For log viewing
- **watch** - For continuous monitoring
- **systemd** - For service management
- **cron** - For scheduled health checks

## Script Interactions

```
start-all-bots.sh
    ├─> Detects .env.bot* files
    ├─> Starts docker-compose containers
    ├─> Launches bot processes with npm
    └─> Creates .bot-pids and logs/*.log

stop-all-bots.sh
    ├─> Reads .bot-pids
    ├─> Kills bot processes
    ├─> Optionally stops docker-compose
    └─> Deletes .bot-pids

status-bots.sh
    ├─> Reads .bot-pids
    ├─> Queries docker-compose
    └─> Checks logs/ directory

health-check.sh
    ├─> Reads .bot-pids
    ├─> Queries docker-compose
    └─> Returns exit code
```

## Color Coding

All scripts use consistent color coding:
- **Green (✓)** - Success, healthy, running
- **Red (✗)** - Error, stopped, unhealthy
- **Yellow (⚠)** - Warning, partial state
- **Blue (ℹ)** - Information, hints
- **Magenta (▸)** - Step/section header
- **Cyan** - Headers and borders

## File Size Summary

```
Total: ~48KB of scripts
Total: ~24KB of documentation

Scripts:    27.7KB
Docs:       24.3KB
Config:      1.2KB
```

## Getting Help

### In Scripts
```bash
./scripts/stop-all-bots.sh --help
./scripts/health-check.sh --help
```

### Documentation
- Quick start: Read QUICKSTART.md
- Full docs: Read README.md
- Features: Read FEATURES.md

### Troubleshooting
1. Check logs: `tail -f logs/*.log`
2. Check status: `./scripts/status-bots.sh`
3. Check health: `./scripts/health-check.sh`
4. Read README.md troubleshooting section

## Version History

### v1.0 (2026-03-09)
- Initial release
- Four main scripts (start, stop, status, health-check)
- Complete documentation
- Auto-detection of bot configurations
- Docker container management
- Process lifecycle management
- Logging and monitoring
- Error handling and recovery

## License

Part of the Signal Bot project.

## Contributing

When modifying scripts:
1. Test on both macOS and Linux
2. Maintain consistent color coding
3. Update documentation
4. Follow existing code style
5. Add error handling
6. Test edge cases

## Support

For issues or questions:
1. Check documentation
2. Review log files
3. Check GitHub issues
4. Ask in project chat

---

**Quick Links:**
- [Get Started](QUICKSTART.md)
- [Full Documentation](README.md)
- [Feature List](FEATURES.md)

