#!/usr/bin/env tsx

/**
 * Headless Signal Registration Script
 *
 * Registers a new Signal phone number without any Signal app.
 * Supports SMS/voice verification and captcha handling.
 *
 * Usage:
 *   PHONE_NUMBER=+14155551234 tsx scripts/register-signal-number.ts
 *
 *   # With captcha upfront:
 *   PHONE_NUMBER=+14155551234 CAPTCHA="signalcaptcha://..." tsx scripts/register-signal-number.ts
 *
 *   # Specify which Signal API port:
 *   PHONE_NUMBER=+14155551234 SIGNAL_API_PORT=8081 tsx scripts/register-signal-number.ts
 */

import * as readline from 'readline';
import * as process from 'process';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(query: string): Promise<string> {
  return new Promise((resolve) => rl.question(query, resolve));
}

const SIGNAL_API_PORT = process.env.SIGNAL_API_PORT || '8080';
const API_URL = `http://localhost:${SIGNAL_API_PORT}`;

// Color codes for terminal output
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const NC = '\x1b[0m'; // No Color

async function checkApiRunning(): Promise<boolean> {
  try {
    const response = await fetch(`${API_URL}/v1/about`);
    return response.ok;
  } catch {
    return false;
  }
}

async function registerWithCaptcha(
  phoneNumber: string,
  captcha: string,
  useVoice: boolean = false
): Promise<any> {
  let captchaToken = captcha.trim();

  // Remove the signalcaptcha:// prefix if present
  if (captchaToken.startsWith('signalcaptcha://')) {
    captchaToken = captchaToken.substring('signalcaptcha://'.length);
  }

  const body: any = { captcha: captchaToken };
  if (useVoice) {
    body.use_voice = true;
  }

  console.log(`${BLUE}📤 Requesting verification code for ${phoneNumber}...${NC}`);

  const response = await fetch(
    `${API_URL}/v1/register/${encodeURIComponent(phoneNumber)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );

  const text = await response.text();

  if (!response.ok) {
    if (response.status === 400 && text.includes('Captcha required')) {
      throw new Error('CAPTCHA_REQUIRED');
    }
    throw new Error(`Registration failed (${response.status}): ${text}`);
  }

  return text ? JSON.parse(text) : {};
}

async function register(
  phoneNumber: string,
  useVoice: boolean = false
): Promise<any> {
  console.log(`${BLUE}📤 Requesting verification code for ${phoneNumber}...${NC}`);

  const body: any = {};
  if (useVoice) {
    body.use_voice = true;
  }

  const response = await fetch(
    `${API_URL}/v1/register/${encodeURIComponent(phoneNumber)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );

  const text = await response.text();

  if (!response.ok) {
    if (response.status === 400 && text.includes('Captcha required')) {
      throw new Error('CAPTCHA_REQUIRED');
    }
    throw new Error(`Registration failed (${response.status}): ${text}`);
  }

  return text ? JSON.parse(text) : {};
}

async function verify(phoneNumber: string, code: string): Promise<any> {
  console.log(`${BLUE}🔐 Verifying code...${NC}`);

  const response = await fetch(
    `${API_URL}/v1/register/${encodeURIComponent(phoneNumber)}/verify/${encodeURIComponent(code)}`,
    { method: 'POST' }
  );

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Verification failed (${response.status}): ${text}`);
  }

  return text ? JSON.parse(text) : {};
}

async function main() {
  console.log(`${CYAN}╔══════════════════════════════════════════════════════════╗${NC}`);
  console.log(`${CYAN}║                                                          ║${NC}`);
  console.log(`${CYAN}║     Signal Bot - Headless Registration                  ║${NC}`);
  console.log(`${CYAN}║                                                          ║${NC}`);
  console.log(`${CYAN}╚══════════════════════════════════════════════════════════╝${NC}`);
  console.log('');

  // Check if Signal API is running
  console.log(`${BLUE}Checking if Signal API is running on port ${SIGNAL_API_PORT}...${NC}`);
  const apiRunning = await checkApiRunning();

  if (!apiRunning) {
    console.error(`${RED}✗ Signal API is not running on port ${SIGNAL_API_PORT}${NC}`);
    console.log('');
    console.log(`${YELLOW}Please start the Signal API container first:${NC}`);
    console.log(`  ${CYAN}docker-compose up -d signal-api${NC}`);
    console.log('');
    console.log(`${YELLOW}Or for multiple numbers, specify the container:${NC}`);
    console.log(`  ${CYAN}docker-compose -f docker-compose.multi.yml up -d signal-api-1${NC}`);
    console.log('');
    process.exit(1);
  }

  console.log(`${GREEN}✓ Signal API is running${NC}`);
  console.log('');

  // Get phone number
  let phoneNumber = process.env.PHONE_NUMBER;

  if (!phoneNumber) {
    phoneNumber = await question(`${BLUE}Enter phone number (E.164 format, e.g. +14155551234): ${NC}`);
    phoneNumber = phoneNumber.trim();
  } else {
    console.log(`${BLUE}Phone number (from PHONE_NUMBER env): ${phoneNumber}${NC}`);
  }

  if (!phoneNumber.startsWith('+')) {
    console.error(`${RED}✗ Phone number must start with + and include country code${NC}`);
    process.exit(1);
  }

  console.log('');

  // Ask for SMS or voice
  const useVoice = await question(`${BLUE}Verification method? (1=SMS, 2=Voice call) [1]: ${NC}`);
  const isVoice = useVoice.trim() === '2';

  console.log('');

  // Check if captcha was provided
  let captcha = process.env.CAPTCHA || process.env.SIGNAL_CAPTCHA || '';

  try {
    if (captcha) {
      console.log(`${YELLOW}Using captcha from environment variable${NC}`);
      await registerWithCaptcha(phoneNumber, captcha, isVoice);
    } else {
      // Try registration without captcha first
      await register(phoneNumber, isVoice);
    }

    console.log(`${GREEN}✓ Verification code requested${NC}`);
    console.log('');

    if (isVoice) {
      console.log(`${YELLOW}📞 You should receive a voice call with the verification code${NC}`);
    } else {
      console.log(`${YELLOW}📱 Check your phone for an SMS with the verification code${NC}`);
    }

  } catch (error: any) {
    if (error.message === 'CAPTCHA_REQUIRED') {
      console.log(`${YELLOW}⚠ Captcha required for registration${NC}`);
      console.log('');
      console.log(`${BLUE}To get a captcha:${NC}`);
      console.log(`  1. Visit: ${CYAN}https://signalcaptchas.org/registration/generate.html${NC}`);
      console.log(`  2. Complete the captcha challenge`);
      console.log(`  3. ${YELLOW}Right-click${NC} the "Open Signal" button`);
      console.log(`  4. Select "Copy link address"`);
      console.log(`  5. The link will look like: ${CYAN}signalcaptcha://signal-hcaptcha.XXXXX...${NC}`);
      console.log('');

      captcha = await question(`${BLUE}Paste the full captcha link here: ${NC}`);
      console.log('');

      try {
        await registerWithCaptcha(phoneNumber, captcha, isVoice);
        console.log(`${GREEN}✓ Verification code requested (with captcha)${NC}`);
        console.log('');

        if (isVoice) {
          console.log(`${YELLOW}📞 You should receive a voice call with the verification code${NC}`);
        } else {
          console.log(`${YELLOW}📱 Check your phone for an SMS with the verification code${NC}`);
        }
      } catch (captchaError: any) {
        console.error(`${RED}✗ ${captchaError.message}${NC}`);
        process.exit(1);
      }
    } else {
      console.error(`${RED}✗ ${error.message}${NC}`);
      process.exit(1);
    }
  }

  // Get verification code
  const code = await question(`${BLUE}Enter the 6-digit verification code: ${NC}`);
  console.log('');

  try {
    await verify(phoneNumber, code.trim());
    console.log(`${GREEN}✓ Registration successful!${NC}`);
    console.log('');
    console.log(`${GREEN}═══════════════════════════════════════${NC}`);
    console.log(`${GREEN}✓ ${phoneNumber} is now registered${NC}`);
    console.log(`${GREEN}═══════════════════════════════════════${NC}`);
    console.log('');
    console.log(`${BLUE}Next steps:${NC}`);
    console.log(`  1. Add this number to your .env file:`);
    console.log(`     ${CYAN}SIGNAL_PHONE_NUMBER=${phoneNumber}${NC}`);
    console.log(`  2. Start your bot:`);
    console.log(`     ${CYAN}npm start${NC}`);
    console.log('');

  } catch (error: any) {
    console.error(`${RED}✗ ${error.message}${NC}`);
    console.log('');
    console.log(`${YELLOW}Common issues:${NC}`);
    console.log(`  - Code expired (codes are time-limited)`);
    console.log(`  - Wrong code entered`);
    console.log(`  - Network/API issues`);
    console.log('');
    process.exit(1);
  }

  rl.close();
}

main().catch((error) => {
  console.error(`${RED}Fatal error: ${error.message}${NC}`);
  process.exit(1);
});
