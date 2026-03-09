#!/bin/bash

# Signal Bot Launcher
# Double-click to start the bot

# Change to the script's directory
cd "$(dirname "$0")"

echo "🌳 Starting Signal Bot..."
echo ""

# Run the start script
npm run start:all

# Keep window open if there's an error
if [ $? -ne 0 ]; then
    echo ""
    echo "❌ Something went wrong. Press any key to close."
    read -n 1
fi
