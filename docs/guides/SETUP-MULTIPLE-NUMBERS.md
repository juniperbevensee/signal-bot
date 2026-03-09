# Setup Guide: Multiple Phone Numbers (Headless)

This guide shows you how to set up the Signal bot with multiple phone numbers using **headless registration** - no Signal app required.

## What is Headless Registration?

Unlike QR code linking (which requires an existing Signal app), headless registration lets you register **brand new** Signal phone numbers directly through the terminal. Each number is independent and doesn't require a device with the Signal app installed.

---

## Quick Setup (3 Steps)

### Step 1: Start Signal API Containers

We'll start **2 Signal API containers** (one per phone number):

```bash
# Start 2 Signal API instances
docker-compose -f docker-compose.multi.yml up -d signal-api-1 signal-api-2

# Wait 30 seconds for them to initialize
sleep 30

# Check they're running
docker ps | grep signal-api
```

You should see:
```
signal-api-1   bbernhard/signal-cli-rest-api   Up   0.0.0.0:8080->8080/tcp
signal-api-2   bbernhard/signal-cli-rest-api   Up   0.0.0.0:8081->8080/tcp
```

Each container stores its account data in a separate directory:
- `signal-api-1` → `./signal-data-1/`
- `signal-api-2` → `./signal-data-2/`
- `signal-api-3` → `./signal-data-3/`

---

### Step 2: Register Phone Numbers (Headless)

#### **Phone Number 1** (Port 8080)

```bash
PHONE_NUMBER=+14155551234 SIGNAL_API_PORT=8080 tsx scripts/register-signal-number.ts
```

**The script will:**
1. Check if the Signal API is running
2. Ask if you want SMS or voice verification
3. Request a verification code from Signal
4. **If captcha is required**, prompt you to visit signalcaptchas.org
5. Ask you to enter the 6-digit code you receive
6. Complete registration

**Captcha flow (if needed):**
1. Visit: https://signalcaptchas.org/registration/generate.html
2. Complete the captcha challenge
3. **Right-click** the "Open Signal" button and **copy link address**
4. Paste the full link when prompted (looks like `signalcaptcha://signal-hcaptcha.XXXXX...`)

#### **Phone Number 2** (Port 8081)

```bash
PHONE_NUMBER=+14155559999 SIGNAL_API_PORT=8081 tsx scripts/register-signal-number.ts
```

Repeat the same process with a different phone number.

---

### Step 3: Configure Your Bots

#### **Bot 1 Configuration**

Create `.env.bot1`:

```bash
cat > .env.bot1 << 'EOF'
# Signal API
SIGNAL_API_URL=http://localhost:8080
SIGNAL_PHONE_NUMBER=+14155551234    # <-- Number you just registered
SIGNAL_POLL_INTERVAL=5000

# Access Control
SIGNAL_ALLOWED_SENDERS=+14155559999  # <-- Your personal number
SIGNAL_ALLOWED_GROUPS=
SIGNAL_BOT_NAMES=Bot1,Assistant

# Database
DATABASE_TYPE=sqlite
DATABASE_PATH=./data/bot1.db

# LLM
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...  # <-- Your API key
LLM_MODEL=claude-sonnet-4-20250514

# Optional
WORKSPACE_DIR=./workspace-bot1
ENABLE_ACTIVITY_LOGGING=true
LOG_LEVEL=info
EOF
```

#### **Bot 2 Configuration**

Create `.env.bot2`:

```bash
cat > .env.bot2 << 'EOF'
# Signal API
SIGNAL_API_URL=http://localhost:8081
SIGNAL_PHONE_NUMBER=+14155559999    # <-- Second number you registered
SIGNAL_POLL_INTERVAL=5000

# Access Control
SIGNAL_ALLOWED_SENDERS=+14155558888  # <-- Different personal number
SIGNAL_ALLOWED_GROUPS=
SIGNAL_BOT_NAMES=Bot2,Assistant

# Database
DATABASE_TYPE=sqlite
DATABASE_PATH=./data/bot2.db

# LLM
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...  # <-- Your API key
LLM_MODEL=claude-haiku-4-20250514  # Faster/cheaper model

# Optional
WORKSPACE_DIR=./workspace-bot2
ENABLE_ACTIVITY_LOGGING=true
LOG_LEVEL=info
EOF
```

---

## Start Your Bots

### Option A: Start All Bots Automatically

```bash
# This will auto-detect .env.bot1 and .env.bot2
./scripts/start-all-bots.sh
```

### Option B: Start Manually (Separate Terminals)

**Terminal 1:**
```bash
ENV_FILE=.env.bot1 npm start
```

**Terminal 2:**
```bash
ENV_FILE=.env.bot2 npm start
```

---

## Test It

Send a message from Signal to each bot's number:

**To Bot 1:**
```
"Hello Bot1!"
```

**To Bot 2:**
```
"Hello Bot2!"
```

Both should respond!

---

## Check Status

```bash
./scripts/status-bots.sh
```

You should see:
```
Signal API Containers:
  signal-api-1    running    8080    Up 5 minutes
  signal-api-2    running    8081    Up 5 minutes

Bot Processes:
  bot1           running    PID 12345    5m 23s    45 MB
  bot2           running    PID 12346    5m 20s    42 MB
```

---

## Reusing an Existing Registration

If you already have a Signal number registered in `~/.signal-cli` from a previous setup:

### Option 1: Copy to signal-bot directory

```bash
# Copy the entire directory
cp -r ~/.signal-cli ./signal-data-1/

# Start the container
docker-compose -f docker-compose.multi.yml up -d signal-api-1

# The number should already be registered
```

### Option 2: Use ~/.signal-cli directly (single bot only)

Edit `docker-compose.yml`:

```yaml
volumes:
  - ~/.signal-cli:/home/.local/share/signal-cli  # Direct mount
```

Then check what number is registered:

```bash
cat ~/.signal-cli/data/accounts.json | python3 -m json.tool
```

Use that number in your `.env` file.

---

## Troubleshooting

### "Signal API is not running"

```bash
# Check if containers are running
docker ps | grep signal-api

# Start them if not running
docker-compose -f docker-compose.multi.yml up -d signal-api-1 signal-api-2
```

### "Container name already in use"

If you have old containers:

```bash
# Stop and remove old containers
docker stop signal-api-1 signal-api-2 2>/dev/null
docker rm signal-api-1 signal-api-2 2>/dev/null

# Start fresh
docker-compose -f docker-compose.multi.yml up -d signal-api-1 signal-api-2
```

### "Port already in use"

If 8080 or 8081 is taken:

```bash
# Find what's using the port
lsof -i :8080
lsof -i :8081

# Kill it or change ports in docker-compose.multi.yml
```

### "Captcha required"

Signal requires captchas for new registrations to prevent spam. Follow the captcha flow:

1. Visit https://signalcaptchas.org/registration/generate.html
2. Complete the challenge
3. Right-click "Open Signal" → Copy link address
4. Paste when prompted by the registration script

### "Verification code expired"

Verification codes are time-limited (usually 10 minutes). If yours expired:

```bash
# Run the registration script again
PHONE_NUMBER=+14155551234 SIGNAL_API_PORT=8080 tsx scripts/register-signal-number.ts
```

### Bot doesn't respond

1. Check the bot is running:
   ```bash
   ps aux | grep "npm start"
   ```

2. Check logs:
   ```bash
   tail -f logs/bot1.log
   ```

3. Verify `SIGNAL_ALLOWED_SENDERS` has your number

4. Check the phone number matches:
   ```bash
   # Check what's registered in the container
   docker exec signal-api-1 cat /home/.local/share/signal-cli/data/accounts.json
   ```

---

## Advanced: 3+ Phone Numbers

To add more numbers:

1. **Start additional container:**
   ```bash
   docker-compose -f docker-compose.multi.yml up -d signal-api-3
   ```

2. **Register the number:**
   ```bash
   PHONE_NUMBER=+14155553333 SIGNAL_API_PORT=8082 tsx scripts/register-signal-number.ts
   ```

3. **Configure:** Create `.env.bot3` with `SIGNAL_API_URL=http://localhost:8082`

4. **Start:** The orchestrator will auto-detect it
   ```bash
   ./scripts/start-all-bots.sh
   ```

---

## Managing Multiple Bots

```bash
# Start all
./scripts/start-all-bots.sh

# Check status
./scripts/status-bots.sh

# View logs for specific bot
tail -f logs/bot1.log

# Stop all
./scripts/stop-all-bots.sh

# Stop just the bots (keep containers running)
./scripts/stop-all-bots.sh --keep-containers
```

---

## Quick Reference

| Bot | Container | Port | Config File | Database | Data Location | API URL |
|-----|-----------|------|-------------|----------|---------------|---------|
| 1 | signal-api-1 | 8080 | .env.bot1 | data/bot1.db | signal-data-1/ | http://localhost:8080 |
| 2 | signal-api-2 | 8081 | .env.bot2 | data/bot2.db | signal-data-2/ | http://localhost:8081 |
| 3 | signal-api-3 | 8082 | .env.bot3 | data/bot3.db | signal-data-3/ | http://localhost:8082 |

---

## Summary

**For 2 headless phone numbers:**

1. `docker-compose -f docker-compose.multi.yml up -d signal-api-1 signal-api-2`
2. Register each: `PHONE_NUMBER=+1... SIGNAL_API_PORT=8080 tsx scripts/register-signal-number.ts`
3. Create `.env.bot1` and `.env.bot2` with the registered numbers
4. `./scripts/start-all-bots.sh`
5. Test by sending messages!

**Key differences from QR linking:**
- ✅ No Signal app required
- ✅ Each number is independent (not a linked device)
- ✅ Terminal-based registration
- ✅ Supports SMS or voice verification
- ✅ Handles captcha flow
- ✅ Data stored in local directories per bot

That's it! 🚀
