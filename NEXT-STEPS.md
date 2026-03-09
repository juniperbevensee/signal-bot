# Next Steps - Your Signal Bot is Ready! 🚀

All headless registration features are implemented and ready to use.

## Check for Existing Registration

If you have a previous Signal setup, check for existing registration:

```bash
ls -la ~/.signal-cli/ 2>/dev/null && echo "✓ Found existing registration" || echo "No existing registration"

# If found, check the phone number:
cat ~/.signal-cli/data/accounts.json | python3 -m json.tool
```

## Three Ways to Get Started

### Option 1: Use Your Existing Registration (Fastest)

This is the quickest way to get your bot running right now.

```bash
# 1. Edit docker-compose.yml - change volume mount:
sed -i '' 's|./signal-data|~/.signal-cli|' docker-compose.yml

# 2. Start Signal API
docker-compose up -d signal-api

# 3. Create .env
cp .env.example .env

# 4. Edit .env (replace with your actual values):
cat > .env << 'ENVFILE'
SIGNAL_API_URL=http://localhost:8080
SIGNAL_PHONE_NUMBER=+14155551234
SIGNAL_POLL_INTERVAL=5000

SIGNAL_ALLOWED_SENDERS=+1XXXXXXXXXX  # Your personal number
SIGNAL_ALLOWED_GROUPS=
SIGNAL_BOT_NAMES=Bot,Assistant

DATABASE_TYPE=sqlite
DATABASE_PATH=./data/signal-bot.db

LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...  # Your actual API key
LLM_MODEL=claude-sonnet-4-20250514

WORKSPACE_DIR=./workspace
ENABLE_ACTIVITY_LOGGING=true
LOG_LEVEL=info
ENVFILE

# 5. Start the bot
npm start

# 6. Test it - send a message to +14155551234 from your phone!
```

**See full guide:** [REUSE-EXISTING-REGISTRATION.md](REUSE-EXISTING-REGISTRATION.md)

---

### Option 2: Register a New Number (Headless)

Register a brand new Signal number without any Signal app.

```bash
# 1. Start Signal API
docker-compose up -d signal-api

# 2. Register new number
PHONE_NUMBER=+14155551234 tsx scripts/register-signal-number.ts

# Follow the prompts:
# - Choose SMS or voice verification
# - Complete captcha if required (signalcaptchas.org)
# - Enter the 6-digit code you receive

# 3. Create .env with the new number
cp .env.example .env
# Edit SIGNAL_PHONE_NUMBER to match the number you registered

# 4. Start the bot
npm start
```

**See full guide:** [SETUP-MULTIPLE-NUMBERS.md](SETUP-MULTIPLE-NUMBERS.md)

---

### Option 3: Set Up Multiple Numbers

Run 2-3 bots simultaneously with different phone numbers.

```bash
# Use the automated wizard
./scripts/setup-multi-numbers.sh

# It will:
# 1. Start Docker containers (signal-api-1, signal-api-2, etc.)
# 2. Guide you through registering each number
# 3. Create .env.bot1, .env.bot2, etc.
# 4. Set up directories and configs

# Then start all bots:
./scripts/start-all-bots.sh

# Check status:
./scripts/status-bots.sh
```

**See full guide:** [SETUP-MULTIPLE-NUMBERS.md](SETUP-MULTIPLE-NUMBERS.md)

---

## Quick Commands

### Single Bot

```bash
# Start Signal API
docker-compose up -d signal-api

# Start bot
npm start

# Check logs
tail -f logs/signal-bot.log
```

### Multiple Bots

```bash
# Start all bots
./scripts/start-all-bots.sh

# Check status
./scripts/status-bots.sh

# View specific bot logs
tail -f logs/bot1.log

# Stop all
./scripts/stop-all-bots.sh
```

---

## What Works Now

✅ **Headless registration** - scripts/register-signal-number.ts
✅ **Multi-bot wizard** - scripts/setup-multi-numbers.sh  
✅ **Existing registration reuse** - Mount ~/.signal-cli directly
✅ **Multiple simultaneous bots** - Each with own port, DB, workspace
✅ **Captcha handling** - Integrated signalcaptchas.org flow
✅ **SMS & voice verification** - Both methods supported
✅ **5 LLM providers** - Anthropic, OpenAI, LM Studio, Vertex AI, Bedrock
✅ **Security** - Rate limiting, access control, sandboxed file ops
✅ **Database logging** - Hierarchical activity traces like Loria
✅ **Status monitoring** - Multi-bot status dashboard

---

## Documentation

| File | Purpose |
|------|---------|
| [README.md](README.md) | Main setup guide |
| [SETUP-MULTIPLE-NUMBERS.md](SETUP-MULTIPLE-NUMBERS.md) | Headless multi-number setup |
| [REUSE-EXISTING-REGISTRATION.md](REUSE-EXISTING-REGISTRATION.md) | Using existing ~/.signal-cli |
| [HEADLESS-REGISTRATION-COMPLETE.md](HEADLESS-REGISTRATION-COMPLETE.md) | Implementation details |
| [DATABASE-STRUCTURE.md](DATABASE-STRUCTURE.md) | Database schema & logging |
| [IMPLEMENTATION-COMPLETE.md](IMPLEMENTATION-COMPLETE.md) | All features overview |
| [agents.md](agents.md) | Technical architecture |

---

## Testing Checklist

- [ ] Choose which option to use (1, 2, or 3 above)
- [ ] Start Signal API container(s)
- [ ] Register/configure phone number(s)
- [ ] Create .env file(s) with your settings
- [ ] Start bot(s)
- [ ] Send test message from your phone
- [ ] Verify bot responds
- [ ] Check logs for any issues

---

## Troubleshooting

### Bot doesn't respond

1. Check bot is running: `ps aux | grep "npm start"`
2. Check logs: `tail -f logs/signal-bot.log` or `tail -f logs/bot1.log`
3. Verify SIGNAL_ALLOWED_SENDERS includes your number
4. Check Signal API is running: `docker ps | grep signal-api`

### Signal API not running

```bash
# Check if it's running
docker ps | grep signal-api

# Start it
docker-compose up -d signal-api

# Check logs
docker logs signal-api
```

### Registration issues

- **Captcha required**: Visit signalcaptchas.org/registration/generate.html
- **Code expired**: Run registration script again
- **Rate limited**: Wait a few hours before retrying

### Port conflicts

```bash
# Check what's using port 8080
lsof -i :8080

# Kill it or use different port in docker-compose
```

---

## Need Help?

1. Check the relevant documentation above
2. Look in logs/ directory for error messages
3. Verify docker containers are running: `docker ps`
4. Check .env file has correct values
5. Make sure ANTHROPIC_API_KEY is set

---

## Summary

**Recommended first step:**
If you have an existing registration in ~/.signal-cli/, use Option 1 to get started fastest.
Otherwise, use Option 2 (headless registration) or Option 3 (multi-bot wizard).

**All files ready:**
- ✅ scripts/register-signal-number.ts
- ✅ scripts/setup-multi-numbers.sh
- ✅ docker-compose.yml & docker-compose.multi.yml
- ✅ Complete documentation

**Check for existing registration:**
```bash
cat ~/.signal-cli/data/accounts.json 2>/dev/null | python3 -m json.tool
```

Choose your option above and you'll be chatting with your bot in under 5 minutes! 🎉
