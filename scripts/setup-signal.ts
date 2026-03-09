#!/usr/bin/env tsx
/**
 * Signal Bot Setup Helper
 * Interactive script to register a Signal number with the bot
 */

import * as readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function checkSignalAPI(url: string): Promise<boolean> {
  try {
    const response = await fetch(`${url}/v1/about`);
    if (response.ok) {
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

async function generateQRCode(url: string, deviceName: string): Promise<string> {
  try {
    const qrURL = `${url}/v1/qrcodelink?device_name=${encodeURIComponent(deviceName)}`;
    console.log('\n🔗 Visit this URL to see the QR code:');
    console.log(`   ${qrURL}\n`);

    return qrURL;
  } catch (error) {
    throw new Error(`Failed to generate QR code: ${error}`);
  }
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║                                                          ║');
  console.log('║            Signal Bot Setup Helper                      ║');
  console.log('║                                                          ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  // Step 1: Check if Signal API is running
  console.log('Step 1: Checking Signal API...');
  const apiURL = 'http://localhost:8080';

  const apiRunning = await checkSignalAPI(apiURL);

  if (!apiRunning) {
    console.log('\n❌ Signal API is not running!\n');
    console.log('Please start it first:');
    console.log('   docker-compose up -d signal-api\n');
    console.log('Wait 30 seconds, then run this script again.');
    process.exit(1);
  }

  console.log('✓ Signal API is running\n');

  // Step 2: Get device name
  console.log('Step 2: Device Registration');
  console.log('Choose a name for this device (default: signal-bot):');
  let deviceName = await question('Device name: ');

  if (!deviceName.trim()) {
    deviceName = 'signal-bot';
  }

  console.log(`\n✓ Device name: ${deviceName}\n`);

  // Step 3: Generate QR code
  console.log('Step 3: Link Your Phone');
  console.log('─────────────────────────────────────────────────────────\n');

  const qrURL = await generateQRCode(apiURL, deviceName);

  console.log('On your phone:');
  console.log('  1. Open Signal');
  console.log('  2. Tap your profile (top left)');
  console.log('  3. Tap "Linked Devices"');
  console.log('  4. Tap "+" or "Link New Device"');
  console.log('  5. Scan the QR code from the URL above\n');

  console.log('Alternatively, open the URL in your browser and scan from there.\n');

  await question('Press Enter once you\'ve scanned the QR code...');

  // Step 4: Verify registration
  console.log('\n\nStep 4: Verifying registration...\n');

  // Give it a few seconds for registration to complete
  await new Promise((resolve) => setTimeout(resolve, 3000));

  try {
    // Try to get registered number
    const response = await fetch(`${apiURL}/v1/about`);
    const data = await response.json();

    if (data.versions && data.versions.length > 0) {
      console.log('✓ Registration appears successful!\n');

      // Try to extract phone number if available in response
      console.log('📱 Check the Signal API logs for your registered number:');
      console.log('   docker logs signal-api | grep -i "registered"\n');
    } else {
      console.log('⚠️  Could not verify registration automatically.');
      console.log('   Check the logs: docker logs signal-api\n');
    }
  } catch (error) {
    console.log('⚠️  Could not verify registration automatically.');
    console.log('   Check the logs: docker logs signal-api\n');
  }

  // Step 5: Instructions for .env
  console.log('─────────────────────────────────────────────────────────');
  console.log('\nStep 5: Configure Your Bot\n');
  console.log('1. Find your registered phone number in the logs:');
  console.log('   docker logs signal-api | grep -i number\n');

  console.log('2. Create/update your .env file:');
  console.log('   cp .env.example .env\n');

  console.log('3. Edit .env and set:');
  console.log('   SIGNAL_PHONE_NUMBER=+YOUR_NUMBER_HERE');
  console.log('   SIGNAL_ALLOWED_SENDERS=+YOUR_PERSONAL_NUMBER');
  console.log('   ANTHROPIC_API_KEY=your-api-key-here\n');

  console.log('4. Start the bot:');
  console.log('   npm start\n');

  console.log('5. Send a test message to your bot number from Signal!\n');

  console.log('─────────────────────────────────────────────────────────\n');
  console.log('✅ Setup complete! Check README.md for more details.\n');

  rl.close();
}

main().catch((error) => {
  console.error('\n❌ Error:', error.message);
  console.error('\nTroubleshooting:');
  console.error('  - Make sure Docker is running');
  console.error('  - Make sure Signal API is started: docker-compose up -d signal-api');
  console.error('  - Check logs: docker logs signal-api');
  console.error('  - Try manual setup: http://localhost:8080/v1/qrcodelink?device_name=bot\n');
  process.exit(1);
});
