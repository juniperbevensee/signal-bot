# Signal Bot

A simple AI assistant for Signal that you can run on your own computer. Chat with Claude through Signal messages.

## What You Need

1. A computer (Mac, Linux, Windows with WSL, or Raspberry Pi)
2. **A phone number for the bot** - This **MUST** be different from your personal Signal number:
   - Get a new number (Google Voice, Twilio, burner phone) - **Recommended**
   - OR link as a secondary device to your existing account (see "Device Linking" below)
3. Docker installed ([get Docker](https://docs.docker.com/get-docker/))
4. **An LLM** - Choose one:
   - **LM Studio with local models** (FREE, runs on your computer) - **Recommended for testing**
   - Anthropic API key ([sign up](https://console.anthropic.com/)) - Paid, more powerful
   - See "Alternative LLM Providers" section for OpenAI, Vertex AI, etc.

> **Note:** This bot uses [signal-cli-rest-api](https://github.com/bbernhard/signal-cli-rest-api) (run via Docker) as the bridge to Signal's servers. The bot itself runs on Node.js.

### Phone Number Options

**Option 1: New Number (Recommended)**
- Get a number from Google Voice, Twilio, talkyto.io, or a burner phone
- Register it with Signal using headless authentication (see below)
- Bot operates independently with its own Signal identity
- Best for production use and group chats

**Option 2: Device Linking (Testing/Personal Use)**
- Link the bot as a secondary device to your existing Signal account
- Bot appears as "you" in conversations
- Good for testing via "Note to Self" feature
- ⚠️ **Caveat:** In groups, bot responds as you - can confuse other members
- Setup: Use QR code linking method described in "Manual Setup" section below

## Setup (5 minutes)

### Step 1: Download and Install

```bash
git clone <this-repo-url>
cd signal-bot
npm install
```

### Step 2: Configure

```bash
cp .env.example .env
nano .env  # or use any text editor
```

**Required settings:**
```bash
SIGNAL_PHONE_NUMBER=+14155551234      # Bot's phone number (the NEW number, not yours!)
SIGNAL_ALLOWED_SENDERS=+19876543210   # YOUR personal number (who can message the bot)

# Choose ONE of these LLM options:

# Option 1: LM Studio (FREE, local) - Recommended for testing
LLM_PROVIDER=lmstudio
LLM_BASE_URL=http://localhost:1234
LLM_MODEL=qwen/qwen-2.5-coder-7b-instruct
ANTHROPIC_API_KEY=not-needed  # Required but not used with LM Studio

# Option 2: Anthropic Claude (Paid, cloud)
# LLM_PROVIDER=anthropic
# ANTHROPIC_API_KEY=sk-ant-api03-...
```

> **Important:** `SIGNAL_PHONE_NUMBER` is the bot's number, `SIGNAL_ALLOWED_SENDERS` is YOUR number.

**If using LM Studio (recommended for testing):**

1. Download [LM Studio](https://lmstudio.ai) (it's free!)
2. Open LM Studio → Search for "qwen-2.5-coder-7b" or "qwen-2.5-coder-9b"
3. Click Download on the model
4. Click the "↔" icon (Local Server) → Start Server
5. Leave it running on `http://localhost:1234`

That's it! The bot will use your local model instead of paid API calls.

**Review these defaults:**
```bash
DATABASE_PATH=./data/signal-bot.db    # Where SQLite stores messages
SIGNAL_BOT_NAMES=Bot,Assistant        # Names for @mentions in groups
SIGNAL_API_URL=http://localhost:8080  # Signal API endpoint (change if running multiple bots)
```

> **Tip:** The `.env.example` file has detailed comments for all settings. Most defaults work fine, but review them to understand what's configurable.

### Step 3: Start Everything

```bash
npm run start:all
```

This single command:
- ✅ Checks Docker is running
- ✅ Starts the Signal API container
- ✅ Checks if your number is registered
- ✅ Walks you through registration if needed
- ✅ Stops any existing bot processes
- ✅ Starts the bot(s) via PM2

That's it! From your personal Signal account, send a message to the bot's number to test it.

> **Tip:** `npm run start:all` is also the restart command - it automatically stops existing processes first. Use it whenever you change config or pull updates.

### Testing

1. Open Signal on your phone
2. Start a new conversation with the bot's phone number (the number you configured in `SIGNAL_PHONE_NUMBER`)
3. Send a message: "Hello!" or "What can you do?"
4. The bot should respond within a few seconds

**If using Device Linking:** Message yourself via "Note to Self" to test the bot.

---

## Manual Setup (Alternative)

If you prefer more control, here's the step-by-step approach:

### Start the Signal Service

```bash
docker-compose up -d signal-api
```

This starts signal-cli-rest-api in Docker, which connects your bot to Signal's servers. Wait 30 seconds for it to start.

### Register Your Signal Number

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

### Configure and Start

```bash
cp .env.example .env
nano .env  # Fill in your settings
npm start
```

You should see:

```
[INFO] Signal Bot starting...
[INFO] LLM provider: anthropic
[INFO] Database initialized
[INFO] Listening for messages...
```

### Test It

From your personal Signal account, send a message to the bot's phone number. Try: "Hello!" or "What can you do?"

If you used device linking, you can message "Note to Self" to test.

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

## Advanced Features

### Data Science Tools

The bot includes 20+ data science tools for analysis and visualization:

**Statistics & Analysis:**
- Calculate summary statistics (mean, median, std, quartiles)
- Correlation analysis between datasets
- Linear regression
- Moving averages

**Charts & Visualizations:**
- Line charts, bar charts, scatter plots
- Pie charts, histograms
- All charts saved as PNG files in your workspace

**Text & NLP:**
- Sentiment analysis
- Word frequency analysis
- TF-IDF, keyword extraction
- Topic modeling, text similarity
- Text classification

**Data Wrangling:**
- Convert between CSV and JSON
- Fill missing values
- Filter and aggregate data

Example usage:
```
"Calculate summary statistics for [1, 5, 10, 15, 20, 25]"
"Create a line chart showing monthly sales: Jan=100, Feb=150, Mar=200"
"Analyze the sentiment of this review: [text]"
```

### Optional Integrations

#### Open Measures (Social Media Intelligence)

Search and analyze data across 30+ social media platforms including Telegram, Gab, Discord, Truth Social, Bluesky, and more.

Setup:
```bash
# In .env, add:
OPEN_MEASURES_API_KEY=your-api-key-here
```

Available tools:
- `om_search` - Search posts across platforms
- `om_timeseries` - Analyze activity trends over time
- `om_account_info` - Get account details

Example: "Search Telegram for posts about bitcoin in the last 7 days"

#### Discord Integration

Send messages and interact with Discord servers.

Setup:
```bash
# In .env, add:
DISCORD_TOKEN=your-bot-token
DISCORD_CLIENT_ID=your-client-id
DISCORD_GUILD_ID=your-server-id  # Optional default server
```

Available tools:
- `discord_send_message` - Send messages to channels
- `discord_list_channels` - List server channels
- `discord_get_messages` - Fetch recent messages

Example: "Send a message to Discord channel 123456789"

**Note:** All integrations are optional and fail gracefully if not configured.

### Approved Users

Restrict certain operations (like profile updates) to approved users:

```bash
# In .env, add:
SIGNAL_APPROVED_USERS=+14155551234,uuid-here
```

Only these users can:
- Update the bot's Signal profile name and avatar
- Other sensitive operations

## Alternative LLM Providers

The bot works with multiple LLM providers. LM Studio (local, free) is recommended for testing. Switch to cloud providers for production use.

### Using Local Models (LM Studio) - FREE

**Recommended for testing and privacy-conscious users.**

Run powerful models locally without API costs or internet dependency.

**Recommended models:**
- `qwen/qwen-2.5-coder-7b-instruct` - Best for coding tasks (4GB RAM)
- `qwen/qwen-2.5-coder-9b-instruct` - More capable (6GB RAM)
- `llama-3.2-3b-instruct` - Fastest, lower requirements (2GB RAM)

Setup:
1. Download [LM Studio](https://lmstudio.ai) (free desktop app)
2. Search for "qwen-2.5-coder" in LM Studio
3. Download the 7B or 9B model
4. Click "↔" (Local Server) → Start Server
5. Configure `.env`:

```bash
LLM_PROVIDER=lmstudio
LLM_BASE_URL=http://localhost:1234
LLM_MODEL=qwen/qwen-2.5-coder-7b-instruct
ANTHROPIC_API_KEY=not-needed
```

Restart the bot - done! No API costs, runs completely offline.

> **Note:** LM Studio has a CLI (`lms`) that can automate model downloads. Future versions may auto-download models on startup if configured.

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

### Using Anthropic Claude (Recommended for Production)

Best quality responses, but requires paid API access.

```bash
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-api03-your-key-here
LLM_MODEL=claude-3-5-sonnet-20241022
```

Get your API key at [console.anthropic.com](https://console.anthropic.com/).

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

### Privacy in Group Chats

When the bot analyzes logs (message history, statistics, tool usage):

- **In group chats:** The bot only analyzes logs from the current group - members cannot access logs from other groups
- **In DMs with approved users:** Full access to logs across all groups (useful for bot administrators)

This ensures group conversations remain private and members cannot query information from other groups the bot participates in.

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

### Running Multiple Bots

The unified start script handles Docker + multiple bots automatically:

```bash
# Create .env files for each bot (.env.bot1, .env.bot2, etc.)
cp .env.example .env.bot1
cp .env.example .env.bot2

# Edit each with different SIGNAL_PHONE_NUMBER and SIGNAL_API_URL (ports 8080, 8081, etc.)

# Start everything (Docker + all bots via PM2)
npm run start:all

# Other commands
npm run stop:all     # Stop all bots
npm run status       # Show status of all bots
npm run logs         # View combined logs
```

The script auto-discovers `.env.*` files and manages each as a separate PM2 process.

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
