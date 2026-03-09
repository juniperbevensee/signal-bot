# Signal Bot

A simple AI assistant for Signal that you can run on your own computer. Chat with Claude through Signal messages.

## What You Need

1. A computer (Mac, Linux, Windows with WSL, or Raspberry Pi)
2. Signal app on your phone
3. Docker installed ([get Docker](https://docs.docker.com/get-docker/))
4. An Anthropic API key ([sign up free](https://console.anthropic.com/))

## Setup (10 minutes)

### Step 1: Download the Code

```bash
git clone <this-repo-url>
cd signal-bot
npm install
```

### Step 2: Start the Signal Service

```bash
docker-compose up -d signal-api
```

This starts a local service that connects your bot to Signal. Wait 30 seconds for it to start.

### Step 3: Register Your Signal Number

> **⚠️ Note on Signal Registration:**
> This auth flow has been tested primarily with **Twilio numbers** and **talkyto.io** for headless registration. You can also use a regular phone with the Signal app for device linking (Option B below). Signal's registration servers can be finicky - if you encounter issues, try waiting a few minutes and retrying, or use a different number/method.

**Two approaches:**

**Option A: Headless Registration (Recommended)**

Register a brand new Signal number without any Signal app:

```bash
PHONE_NUMBER=+14155551234 tsx scripts/register-signal-number.ts
```

The script will:
- Request SMS/voice verification code
- Handle captcha if required (signalcaptchas.org)
- Guide you through verification

For multiple numbers, see [SETUP-MULTIPLE-NUMBERS.md](SETUP-MULTIPLE-NUMBERS.md).

**Option B: QR Code Linking (Device Linking)**

Link an existing Signal account as a secondary device:

```bash
npm run setup:signal
```

Or manually:
1. Visit: http://localhost:8080/v1/qrcodelink?device_name=my-bot
2. Scan the QR code with Signal (Settings → Linked Devices → Link New Device)
3. Wait for "Successfully linked" message

**Already have a number registered in ~/.signal-cli?** See [REUSE-EXISTING-REGISTRATION.md](REUSE-EXISTING-REGISTRATION.md)

### Step 4: Configure the Bot

Create a file called `.env`:

```bash
# Copy the example
cp .env.example .env

# Edit it with your info
nano .env
```

Fill in these values:

```bash
# The phone number you just linked (include country code)
SIGNAL_PHONE_NUMBER=+14155551234

# Your Anthropic API key from console.anthropic.com
ANTHROPIC_API_KEY=sk-ant-api03-...

# Your phone number (who can message the bot)
SIGNAL_ALLOWED_SENDERS=+14155551234

# Which Signal API to use (don't change if using Docker)
SIGNAL_API_URL=http://localhost:8080
```

**Save and close** (Ctrl+X, then Y, then Enter in nano)

### Step 5: Start the Bot

```bash
npm start
```

You should see:

```
[INFO] Signal Bot starting...
[INFO] LLM provider: anthropic
[INFO] Database initialized
[INFO] Listening for messages...
```

### Step 6: Test It

1. Open Signal on your phone
2. Send a message to the number you linked
3. The bot should respond!

Try: "Hello!" or "What can you do?"

## Using the Bot

### Basic Commands

- Just chat normally - the bot remembers context within each conversation
- Ask it to remember preferences: "Remember that I prefer short responses"
- Search chat history: "What did we talk about yesterday?"
- Send reactions: The bot can see when you react with emoji

### In Group Chats

To use the bot in groups:

1. Add the bot's number to your group
2. Add the group ID to `SIGNAL_ALLOWED_GROUPS` in `.env`
3. Mention the bot by name: "@Bot hello" or "hey Assistant"

### File Attachments

The bot can send files if you set up a workspace:

```bash
# In .env, add:
WORKSPACE_DIR=./workspace

# Create the directory
mkdir -p workspace
```

Then ask: "Create a chart and send it to me"

## Alternative LLM Providers

### Using Google Vertex AI (Gemini)

Want to use Google's Gemini models? Configure Vertex AI:

#### Step 1: Get Google Cloud API Key

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project or select an existing one
3. Enable the Vertex AI API
4. Create an API key in [API Credentials](https://console.cloud.google.com/apis/credentials)

#### Step 2: Update Configuration

In your `.env` file:

```bash
# Change these lines:
LLM_PROVIDER=vertex
GOOGLE_CLOUD_API_KEY=your-google-cloud-api-key
LLM_MODEL=gemini-2.5-pro

# Available models:
# - gemini-2.5-pro (most capable)
# - gemini-2.0-flash-exp (fast)
# - gemini-1.5-pro (stable)

# You still need this (but can be any value):
ANTHROPIC_API_KEY=not-needed
```

Restart the bot. It now uses Gemini via Vertex AI!

### Using Local Models (LM Studio)

Don't want to pay for API calls? Run models locally with LM Studio.

#### Step 1: Install LM Studio

Download from [lmstudio.ai](https://lmstudio.ai)

#### Step 2: Download a Model

1. Open LM Studio
2. Search for "llama-3.2" or "qwen-2.5"
3. Click Download

#### Step 3: Start the Server

1. Click the "↔" icon (Local Server)
2. Click "Start Server"
3. Note the URL (usually http://localhost:1234)

#### Step 4: Update Configuration

In your `.env` file:

```bash
# Change these lines:
LLM_PROVIDER=lmstudio
LLM_BASE_URL=http://localhost:1234
LLM_MODEL=llama-3.2-3b-instruct

# You still need this (but can be any value):
ANTHROPIC_API_KEY=not-needed
```

Restart the bot. It now uses your local model!

## Troubleshooting

### "Cannot connect to Signal API"

- Make sure Docker is running: `docker ps`
- Restart the service: `docker-compose restart signal-api`
- Check logs: `docker-compose logs signal-api`

### "Not authorized" Errors

- Check `SIGNAL_ALLOWED_SENDERS` has your phone number
- Format must be: `+14155551234` (country code + number, no spaces)
- Restart the bot after changing `.env`

### Bot Doesn't Respond

- Check the bot is running: look for "Listening for messages..."
- Check you're messaging from an allowed number
- Try restarting: Ctrl+C, then `npm start`

### "Rate limit exceeded"

- Wait a minute - there's a limit of 10 messages per minute
- This prevents accidental API cost explosions

## Advanced Features

### Memory System

The bot maintains a `persistent_memory.md` file with your preferences:

```bash
# View current memory
cat persistent_memory.md

# Edit manually if needed
nano persistent_memory.md
```

### Database

All messages are stored in `data/signal-bot.db`:

```bash
# View with sqlite3
sqlite3 data/signal-bot.db "SELECT * FROM messages LIMIT 10;"
```

### Activity Logs

Set `ENABLE_ACTIVITY_LOGGING=true` in `.env` to see detailed tool usage logs.

## Security Notes

- Only responds to phone numbers in `SIGNAL_ALLOWED_SENDERS`
- File attachments are sandboxed to `WORKSPACE_DIR`
- Executable files (.exe, .sh, etc.) are blocked
- Rate limiting prevents quota exhaustion
- All data stays on your machine

## Need Help?

- Check [agents.md](./agents.md) for technical details
- Open an issue on GitHub
- Read the logs: the bot prints helpful error messages

## Deployment Options

### On a Raspberry Pi

This works great on a Pi 4 or Pi 5:

```bash
# Same steps, but use ARM-compatible models in LM Studio
# Or use Anthropic API (lighter on resources)
```

### On a Cloud Server

```bash
# Deploy to any Ubuntu/Debian VPS
# Make sure to set firewall rules (block port 8080 from internet)
# Use environment variables instead of .env file
```

### Running 24/7

Use a process manager like PM2:

```bash
npm install -g pm2
pm2 start npm --name signal-bot -- start
pm2 save
pm2 startup  # Follow instructions to start on boot
```

## Documentation

### User Guides
- **[NEXT-STEPS.md](NEXT-STEPS.md)** - Quick start with three setup options
- **[docs/guides/SETUP-MULTIPLE-NUMBERS.md](docs/guides/SETUP-MULTIPLE-NUMBERS.md)** - Headless registration for multiple bots
- **[docs/guides/REUSE-EXISTING-REGISTRATION.md](docs/guides/REUSE-EXISTING-REGISTRATION.md)** - Using existing ~/.signal-cli registration

### Technical Documentation
- **[agents.md](agents.md)** - Architecture, LLM providers, adding custom tools
- **[DATABASE-STRUCTURE.md](DATABASE-STRUCTURE.md)** - Database schema and activity logging

### Development Notes
- **[docs/development/](docs/development/)** - Implementation notes and changelogs

## Customization

See [agents.md](./agents.md) for:

- Adding custom tools
- Connecting to other APIs
- Modifying the system prompt
- Database schema details
- Architecture overview

## License

GNU General Public License v3.0 - see LICENSE file for details
