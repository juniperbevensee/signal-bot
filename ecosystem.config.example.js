/**
 * PM2 Configuration for Multiple Signal Bots
 *
 * Usage:
 *   1. Copy to ecosystem.config.js
 *   2. Customize for your setup
 *   3. Run: pm2 start ecosystem.config.js
 *   4. Save: pm2 save
 *   5. Auto-start on boot: pm2 startup
 */

module.exports = {
  apps: [
    {
      name: 'signal-bot-1',
      script: 'tsx',
      args: 'src/index.ts',
      cwd: __dirname,
      env: {
        ENV_FILE: '.env.bot1',
        NODE_ENV: 'production',
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      error_file: './logs/bot1-error.log',
      out_file: './logs/bot1-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
    },
    {
      name: 'signal-bot-2',
      script: 'tsx',
      args: 'src/index.ts',
      cwd: __dirname,
      env: {
        ENV_FILE: '.env.bot2',
        NODE_ENV: 'production',
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      error_file: './logs/bot2-error.log',
      out_file: './logs/bot2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
    },
    {
      name: 'signal-bot-3',
      script: 'tsx',
      args: 'src/index.ts',
      cwd: __dirname,
      env: {
        ENV_FILE: '.env.bot3',
        NODE_ENV: 'production',
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      error_file: './logs/bot3-error.log',
      out_file: './logs/bot3-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
    },
  ],
};
