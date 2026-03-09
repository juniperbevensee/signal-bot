#!/usr/bin/env tsx

/**
 * Start All Bots Script
 *
 * Auto-discovers .env.* files and starts each as a separate pm2 process.
 * Handles Docker startup, Signal registration checks, and inline registration.
 *
 * Usage:
 *   npm run start:all           # Start docker + all bots
 *   npm run start:all -- --no-docker  # Skip docker, just start bots
 *   npm run stop:all            # Stop all bots
 *   npm run status              # Show status
 *   npm run logs                # View combined logs
 */

import { execSync, spawn } from 'child_process';
import { readdirSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { resolve, join } from 'path';
import * as readline from 'readline';

const ROOT_DIR = resolve(import.meta.dirname, '..');

// Color codes
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const DIM = '\x1b[2m';
const NC = '\x1b[0m';

function log(color: string, symbol: string, message: string) {
  console.log(`${color}${symbol}${NC} ${message}`);
}

// Readline for user input
let rl: readline.Interface | null = null;

function getReadline(): readline.Interface {
  if (!rl) {
    rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }
  return rl;
}

function closeReadline() {
  if (rl) {
    rl.close();
    rl = null;
  }
}

function question(query: string): Promise<string> {
  return new Promise((resolve) => getReadline().question(query, resolve));
}

interface EnvFile {
  name: string;
  path: string;
  phoneNumber?: string;
  apiUrl?: string;
  apiPort?: string;
}

function discoverEnvFiles(): EnvFile[] {
  const files = readdirSync(ROOT_DIR);

  return files
    .filter(f => f.startsWith('.env.') && !f.endsWith('.example'))
    .map(f => {
      const filePath = join(ROOT_DIR, f);
      const name = f.replace('.env.', '').replace(/\./g, '-');

      const content = readFileSync(filePath, 'utf-8');
      // Match only uncommented lines (not starting with #)
      const phoneMatch = content.match(/^[^#\n]*SIGNAL_PHONE_NUMBER=([^\n]+)/m);
      const apiMatch = content.match(/^[^#\n]*SIGNAL_API_URL=([^\n]+)/m);

      const apiUrl = apiMatch?.[1]?.trim() || 'http://localhost:8080';
      const portMatch = apiUrl.match(/:(\d+)/);

      return {
        name,
        path: filePath,
        phoneNumber: phoneMatch?.[1]?.trim(),
        apiUrl,
        apiPort: portMatch?.[1] || '8080',
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function isDockerRunning(): boolean {
  try {
    execSync('docker info', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function getRunningContainers(): string[] {
  try {
    const output = execSync('docker ps --format "{{.Names}}"', { encoding: 'utf-8' });
    return output.trim().split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

async function checkSignalRegistration(apiUrl: string, phoneNumber: string): Promise<boolean> {
  try {
    const response = await fetch(`${apiUrl}/v1/accounts`);
    if (!response.ok) return false;

    const accounts = await response.json() as string[];
    return accounts.includes(phoneNumber);
  } catch {
    return false;
  }
}

async function checkApiRunning(apiUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${apiUrl}/v1/about`);
    return response.ok;
  } catch {
    return false;
  }
}

// ============================================================================
// Registration Functions (from register-signal-number.ts)
// ============================================================================

async function registerWithCaptcha(
  apiUrl: string,
  phoneNumber: string,
  captcha: string,
  useVoice: boolean = false
): Promise<any> {
  let captchaToken = captcha.trim();

  if (captchaToken.startsWith('signalcaptcha://')) {
    captchaToken = captchaToken.substring('signalcaptcha://'.length);
  }

  const body: any = { captcha: captchaToken };
  if (useVoice) {
    body.use_voice = true;
  }

  const response = await fetch(
    `${apiUrl}/v1/register/${encodeURIComponent(phoneNumber)}`,
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
    if (text.includes('409') || text.includes('AlreadyVerified')) {
      throw new Error('ALREADY_REGISTERED');
    }
    throw new Error(`Registration failed (${response.status}): ${text}`);
  }

  return text ? JSON.parse(text) : {};
}

async function registerNumber(
  apiUrl: string,
  phoneNumber: string,
  useVoice: boolean = false
): Promise<any> {
  const body: any = {};
  if (useVoice) {
    body.use_voice = true;
  }

  const response = await fetch(
    `${apiUrl}/v1/register/${encodeURIComponent(phoneNumber)}`,
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
    if (text.includes('409') || text.includes('AlreadyVerified')) {
      throw new Error('ALREADY_REGISTERED');
    }
    throw new Error(`Registration failed (${response.status}): ${text}`);
  }

  return text ? JSON.parse(text) : {};
}

async function verifyCode(
  apiUrl: string,
  phoneNumber: string,
  code: string,
  retries: number = 2
): Promise<any> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(
        `${apiUrl}/v1/register/${encodeURIComponent(phoneNumber)}/verify/${encodeURIComponent(code)}`,
        { method: 'POST' }
      );

      const text = await response.text();

      if (!response.ok) {
        if (text.includes('499')) {
          log(YELLOW, '⚠', 'Signal server timeout, checking if registration succeeded...');
          await new Promise(r => setTimeout(r, 2000));

          if (await checkSignalRegistration(apiUrl, phoneNumber)) {
            log(GREEN, '✓', 'Registration confirmed despite timeout');
            return { alreadyRegistered: true };
          }

          if (attempt < retries) {
            log(YELLOW, '⚠', `Retrying verification (${attempt + 1}/${retries})...`);
            continue;
          }
        }
        throw new Error(`Verification failed (${response.status}): ${text}`);
      }

      return text ? JSON.parse(text) : {};
    } catch (error: any) {
      if (error.message?.includes('fetch') && attempt < retries) {
        log(YELLOW, '⚠', `Network error, retrying (${attempt + 1}/${retries})...`);
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }
      throw error;
    }
  }
}

async function registerPhoneNumber(env: EnvFile): Promise<boolean> {
  const apiUrl = env.apiUrl || 'http://localhost:8080';
  const phoneNumber = env.phoneNumber!;

  console.log();
  log(CYAN, '📱', `Registering ${phoneNumber} for ${env.name}`);
  console.log();

  // Check API is running
  if (!await checkApiRunning(apiUrl)) {
    log(RED, '✗', `Signal API not running at ${apiUrl}`);
    return false;
  }

  // Ask for verification method
  const methodAnswer = await question(`${BLUE}Verification method? (1=SMS, 2=Voice call) [1]: ${NC}`);
  const useVoice = methodAnswer.trim() === '2';
  console.log();

  let captcha = '';

  try {
    // Try registration without captcha first
    log(BLUE, '📤', `Requesting verification code for ${phoneNumber}...`);
    await registerNumber(apiUrl, phoneNumber, useVoice);
    log(GREEN, '✓', 'Verification code requested');
  } catch (error: any) {
    if (error.message === 'ALREADY_REGISTERED') {
      log(GREEN, '✓', 'This number is already registered!');
      return true;
    }

    if (error.message === 'CAPTCHA_REQUIRED') {
      log(YELLOW, '⚠', 'Captcha required for registration');
      console.log();
      console.log(`${BLUE}To get a captcha:${NC}`);
      console.log(`  1. Visit: ${CYAN}https://signalcaptchas.org/registration/generate.html${NC}`);
      console.log(`  2. Complete the captcha challenge`);
      console.log(`  3. ${YELLOW}Right-click${NC} the "Open Signal" button`);
      console.log(`  4. Select "Copy link address"`);
      console.log(`  5. The link will look like: ${CYAN}signalcaptcha://signal-hcaptcha.XXXXX...${NC}`);
      console.log();

      captcha = await question(`${BLUE}Paste the full captcha link here: ${NC}`);
      console.log();

      try {
        await registerWithCaptcha(apiUrl, phoneNumber, captcha, useVoice);
        log(GREEN, '✓', 'Verification code requested (with captcha)');
      } catch (captchaError: any) {
        if (captchaError.message === 'ALREADY_REGISTERED') {
          log(GREEN, '✓', 'This number is already registered!');
          return true;
        }
        log(RED, '✗', captchaError.message);
        return false;
      }
    } else {
      log(RED, '✗', error.message);
      return false;
    }
  }

  console.log();
  if (useVoice) {
    log(YELLOW, '📞', 'You should receive a voice call with the verification code');
  } else {
    log(YELLOW, '📱', 'Check your phone for an SMS with the verification code');
  }
  console.log();

  // Get verification code with retry loop
  let verified = false;
  let attempts = 0;
  const maxAttempts = 3;

  while (!verified && attempts < maxAttempts) {
    const code = await question(`${BLUE}Enter the 6-digit verification code: ${NC}`);
    console.log();

    try {
      await verifyCode(apiUrl, phoneNumber, code.trim());
      verified = true;
      log(GREEN, '✓', `${phoneNumber} registered successfully!`);
    } catch (error: any) {
      attempts++;
      log(RED, '✗', error.message);
      console.log();

      if (attempts < maxAttempts) {
        if (error.message.includes('499') || error.message.includes('timeout')) {
          console.log(`${YELLOW}This looks like a server issue. Try entering the same code again.${NC}`);
        } else {
          console.log(`${YELLOW}You can try again (${maxAttempts - attempts} attempts remaining)${NC}`);
        }
        console.log();
      } else {
        log(RED, '✗', 'Maximum attempts reached');
        return false;
      }
    }
  }

  return verified;
}

// ============================================================================
// Docker and Bot Management
// ============================================================================

async function startDocker() {
  log(CYAN, '🐳', 'Checking Docker...');

  if (!isDockerRunning()) {
    log(RED, '✗', 'Docker is not running. Please start Docker Desktop first.');
    process.exit(1);
  }

  const running = getRunningContainers();
  const composeFile = existsSync(join(ROOT_DIR, 'docker-compose.multi.yml'))
    ? 'docker-compose.multi.yml'
    : 'docker-compose.yml';

  const signalContainers = running.filter(c => c.includes('signal-api'));

  if (signalContainers.length === 0) {
    log(YELLOW, '▶', `Starting Signal API containers (${composeFile})...`);
    try {
      execSync(`docker-compose -f ${composeFile} up -d`, {
        cwd: ROOT_DIR,
        stdio: 'inherit',
      });
      log(GREEN, '✓', 'Signal API containers started');

      log(DIM, '⏳', 'Waiting for API to be ready...');
      await new Promise(resolve => setTimeout(resolve, 5000));
    } catch (error) {
      log(RED, '✗', 'Failed to start Docker containers');
      process.exit(1);
    }
  } else {
    log(GREEN, '✓', `Signal API already running: ${signalContainers.join(', ')}`);
  }
}

async function checkAndRegister(envFiles: EnvFile[]): Promise<boolean> {
  log(CYAN, '📱', 'Checking Signal registrations...\n');

  const unregistered: EnvFile[] = [];

  for (const env of envFiles) {
    if (!env.phoneNumber) {
      log(YELLOW, '⚠', `${env.name}: No SIGNAL_PHONE_NUMBER configured`);
      continue;
    }

    const apiUrl = env.apiUrl || 'http://localhost:8080';
    const registered = await checkSignalRegistration(apiUrl, env.phoneNumber);

    if (registered) {
      log(GREEN, '✓', `${env.name}: ${env.phoneNumber} registered`);
    } else {
      log(YELLOW, '⚠', `${env.name}: ${env.phoneNumber} not registered`);
      unregistered.push(env);
    }
  }

  console.log();

  if (unregistered.length === 0) {
    return true;
  }

  // Ask if user wants to register
  const answer = await question(
    `${BLUE}${unregistered.length} number(s) need registration. Register now? (y/n) [y]: ${NC}`
  );

  if (answer.toLowerCase() === 'n') {
    log(YELLOW, '⚠', 'Skipping registration. Bots may not work correctly.');
    return true;
  }

  // Register each number
  for (const env of unregistered) {
    const success = await registerPhoneNumber(env);
    if (!success) {
      const continueAnswer = await question(
        `${BLUE}Registration failed for ${env.name}. Continue with other bots? (y/n) [y]: ${NC}`
      );
      if (continueAnswer.toLowerCase() === 'n') {
        return false;
      }
    }
  }

  console.log();
  return true;
}

function generateEcosystemConfig(envFiles: EnvFile[]): string {
  const apps = envFiles.map(env => ({
    name: env.name,
    script: 'npx',
    args: 'tsx src/index.ts',
    cwd: ROOT_DIR,
    env: {
      ENV_FILE: env.path,
    },
    watch: false,
    autorestart: true,
    max_restarts: 5,
    min_uptime: '10s',
  }));

  return `module.exports = { apps: ${JSON.stringify(apps, null, 2)} };`;
}

function validateEnvFiles(envFiles: EnvFile[]): boolean {
  let valid = true;

  // Check for duplicate phone numbers (would leak content between bots)
  const phoneToEnvs = new Map<string, string[]>();
  for (const env of envFiles) {
    if (env.phoneNumber) {
      const existing = phoneToEnvs.get(env.phoneNumber) || [];
      existing.push(env.name);
      phoneToEnvs.set(env.phoneNumber, existing);
    }
  }

  for (const [phone, envNames] of phoneToEnvs) {
    if (envNames.length > 1) {
      log(RED, '✗', `Duplicate phone number ${phone} in: ${envNames.join(', ')}`);
      log(RED, ' ', 'Each bot must have a unique phone number to prevent content leaking!');
      valid = false;
    }
  }

  // Check that bots on different ports use different API URLs
  const apiToEnvs = new Map<string, string[]>();
  for (const env of envFiles) {
    if (env.phoneNumber && env.apiUrl) {
      const existing = apiToEnvs.get(env.apiUrl) || [];
      existing.push(`${env.name} (${env.phoneNumber})`);
      apiToEnvs.set(env.apiUrl, existing);
    }
  }

  for (const [apiUrl, envNames] of apiToEnvs) {
    if (envNames.length > 1) {
      log(YELLOW, '⚠', `Multiple bots using same API ${apiUrl}: ${envNames.join(', ')}`);
      log(YELLOW, ' ', 'Each phone number needs its own Signal API container on a different port.');
      valid = false;
    }
  }

  return valid;
}

async function startAll(skipDocker: boolean) {
  const envFiles = discoverEnvFiles();

  if (envFiles.length === 0) {
    log(RED, '✗', 'No .env.* files found (excluding .example files)');
    log(YELLOW, '→', 'Create a .env.sandbox or similar file to get started');
    process.exit(1);
  }

  log(CYAN, '🤖', `Found ${envFiles.length} bot configuration(s):\n`);
  for (const env of envFiles) {
    const phone = env.phoneNumber || 'no phone configured';
    const api = env.apiUrl || 'default';
    console.log(`   ${CYAN}•${NC} ${env.name} ${DIM}(${phone} → ${api})${NC}`);
  }
  console.log();

  // Validate configuration
  if (!validateEnvFiles(envFiles)) {
    console.log();
    const answer = await question(`${BLUE}Configuration issues detected. Continue anyway? (y/n) [n]: ${NC}`);
    if (answer.toLowerCase() !== 'y') {
      closeReadline();
      process.exit(1);
    }
  }

  // Start Docker if needed
  if (!skipDocker) {
    await startDocker();
    const shouldContinue = await checkAndRegister(envFiles);
    if (!shouldContinue) {
      log(RED, '✗', 'Aborting due to registration failure');
      closeReadline();
      process.exit(1);
    }
  }

  closeReadline();

  // Build web UI
  log(CYAN, '🔨', 'Building web UI...');
  try {
    execSync('npm run build:web', {
      cwd: ROOT_DIR,
      stdio: 'inherit',
    });
    log(GREEN, '✓', 'Web UI built successfully');
  } catch (error) {
    log(RED, '✗', 'Failed to build web UI');
    log(YELLOW, '⚠', 'Continuing without web UI...');
  }
  console.log();

  // Generate ecosystem config for pm2
  const ecosystemPath = join(ROOT_DIR, 'ecosystem.config.cjs');
  const ecosystemConfig = generateEcosystemConfig(envFiles);
  writeFileSync(ecosystemPath, ecosystemConfig);

  // Stop existing instances
  log(YELLOW, '⏹', 'Stopping any existing bot processes...');
  try {
    execSync('npx pm2 delete all', { cwd: ROOT_DIR, stdio: 'pipe' });
  } catch {
    // Ignore if no processes
  }

  // Start all bots using ecosystem file
  log(GREEN, '▶', 'Starting all bots...\n');
  execSync('npx pm2 start ecosystem.config.cjs', {
    cwd: ROOT_DIR,
    stdio: 'inherit',
  });

  console.log();
  log(GREEN, '✓', 'All bots started!\n');

  execSync('npx pm2 status', { cwd: ROOT_DIR, stdio: 'inherit' });

  console.log();
  log(CYAN, '🌐', 'Web UI available at:');
  console.log(`   ${GREEN}http://localhost:3000${NC}\n`);

  log(CYAN, '📋', 'Commands:');
  console.log(`   ${CYAN}npm run logs${NC}       View combined logs (all bots)`);
  console.log(`   ${CYAN}npm run status${NC}     Show bot status`);
  console.log(`   ${CYAN}npm run stop:all${NC}   Stop all bots`);
  console.log(`   ${CYAN}pm2 logs <name>${NC}    View logs for specific bot`);
  console.log(`   ${CYAN}pm2 restart all${NC}    Restart all bots`);
  console.log();
}

function stopAll() {
  log(YELLOW, '⏹', 'Stopping all bots...');
  try {
    execSync('npx pm2 stop all', { cwd: ROOT_DIR, stdio: 'inherit' });
    log(GREEN, '✓', 'All bots stopped');
  } catch {
    log(YELLOW, '⚠', 'No bots were running');
  }

  // Stop signal-api containers
  log(YELLOW, '🐳', 'Stopping Signal API containers...');
  try {
    const containers = execSync('docker ps --format "{{.Names}}" | grep signal-api', { encoding: 'utf-8' }).trim().split('\n').filter(Boolean);
    if (containers.length > 0) {
      execSync(`docker stop ${containers.join(' ')}`, { stdio: 'inherit' });
      log(GREEN, '✓', `Stopped: ${containers.join(', ')}`);
    } else {
      log(DIM, '⚠', 'No signal-api containers running');
    }
  } catch {
    log(DIM, '⚠', 'No signal-api containers to stop');
  }
}

function showStatus() {
  execSync('npx pm2 status', { cwd: ROOT_DIR, stdio: 'inherit' });
}

function showLogs() {
  const child = spawn('npx', ['pm2', 'logs'], {
    cwd: ROOT_DIR,
    stdio: 'inherit',
  });

  child.on('error', (err) => {
    log(RED, '✗', `Failed to show logs: ${err.message}`);
  });
}

// Main
const args = process.argv.slice(2);
const command = args.find(a => !a.startsWith('-')) || 'start';
const skipDocker = args.includes('--no-docker');

switch (command) {
  case 'start':
    startAll(skipDocker);
    break;
  case 'stop':
    stopAll();
    break;
  case 'status':
    showStatus();
    break;
  case 'logs':
    showLogs();
    break;
  default:
    log(RED, '✗', `Unknown command: ${command}`);
    console.log('\nUsage: npm run start:all [-- --no-docker]');
    console.log('       npm run stop:all');
    console.log('       npm run status');
    console.log('       npm run logs');
    process.exit(1);
}
