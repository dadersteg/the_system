const fs = require('fs');
const path = require('path');
let localEnv = {};
try {
  const envContent = fs.readFileSync(path.join(__dirname, '.env'), 'utf-8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      localEnv[match[1]] = match[2].replace(/^["'](.*)["']$/, '$1');
    }
  });
} catch(e) {
  console.warn("No .env file found or unable to parse.");
}

const VENV_PATH = localEnv.VENV_PATH || path.join(__dirname, 'venv/bin/python3');
const NODE_MODULES_PATH = localEnv.NODE_MODULES_PATH || path.join(__dirname, 'node_modules');

module.exports = {
  apps: [
    // ==========================================
    // 🐍 Python Services & Scheduled Tasks
    // ==========================================
    // Note: 'antigravity-bridge' (CDP WebSocket scraper) has been retired in favor of native Antigravity Remote Access.
    {
      name: "telegram-bridge",
      script: "src/ingestion/telegram_bridge.py",
      interpreter: VENV_PATH,
      cwd: "/Users/daniel/Documents/AGY/the_system",
      env: {
        TELEGRAM_BOT_TOKEN: localEnv.TELEGRAM_BOT_TOKEN || "",
        TELEGRAM_USER_ID: localEnv.TELEGRAM_USER_ID || ""
      },
      autorestart: true,
      restart_delay: 5000
    },
    {
      name: "task-sync",
      script: "scripts/utils/sync_tasks_combined.py",
      interpreter: VENV_PATH,
      cwd: "/Users/daniel/Documents/AGY/the_system",
      cron_restart: "*/2 * * * *", // Runs every 2 minutes
      autorestart: false,
      out_file: "logs/task_sync_out.log",
      error_file: "logs/task_sync_err.log"
    },
    {
      name: "sheet-sync-maintenance",
      script: "scripts/utils/sheet_sync_and_maintenance.py",
      interpreter: VENV_PATH,
      cwd: "/Users/daniel/Documents/AGY/the_system",
      cron_restart: "*/5 * * * *", // Runs every 5 minutes
      autorestart: false,
      out_file: "logs/sheet_sync_maintenance_out.log",
      error_file: "logs/sheet_sync_maintenance_err.log"
    },


    // ==========================================
    // 🟢 Node.js Services & Scheduled Tasks
    // ==========================================
    {
      name: "beeper-bridge",
      script: "src/ingestion/beeper_bridge.js",
      cwd: "/Users/daniel/Documents/AGY/the_system",
      env: {
        ...localEnv,
        NODE_PATH: NODE_MODULES_PATH
      },
      autorestart: true,
      restart_delay: 5000
    },
    {
      name: "system-monitor",
      script: "src/ingestion/monitor.js",
      cwd: "/Users/daniel/Documents/AGY/the_system",
      env: {
        ...localEnv,
        NODE_PATH: NODE_MODULES_PATH
      },
      autorestart: true,
      restart_delay: 5000
    },
    {
      name: "check-bridges-daily",
      script: "src/ingestion/check_bridges_daily.js",
      cwd: "/Users/daniel/Documents/AGY/the_system",
      env: {
        ...localEnv,
        NODE_PATH: NODE_MODULES_PATH
      },
      cron_restart: "0 9 * * *", // Runs daily at 9:00 AM
      autorestart: false,
      out_file: "logs/check_bridges_daily_out.log",
      error_file: "logs/check_bridges_daily_err.log"
    },
    {
      name: "second-brain-sync",
      script: "scripts/utils/second_brain_sync.sh",
      cwd: "/Users/daniel/Documents/AGY/the_system",
      cron_restart: "59 23 * * *", // Runs daily at 23:59
      autorestart: false,
      out_file: "logs/second_brain_sync_out.log",
      error_file: "logs/second_brain_sync_err.log"
    },
    {
      name: "antigravity-drive-backup",
      script: "scripts/utils/backup_antigravity.py",
      args: "--keep 7",
      interpreter: "python3",
      cwd: "/Users/daniel/Documents/AGY/the_system",
      cron_restart: "30 0 * * *", // Runs daily at 00:30
      autorestart: false,
      out_file: "logs/antigravity_drive_backup_out.log",
      error_file: "logs/antigravity_drive_backup_err.log"
    },

    {
      name: "antigravity-cloud-backfill",
      script: "scripts/utils/backfill_antigravity_logs.py",
      args: "--max-hours 1",
      interpreter: "python3",
      cwd: "/Users/daniel/Documents/AGY/the_system",
      cron_restart: "0 1 * * *", // 1:00 AM Daily
      autorestart: false,
      out_file: "logs/antigravity_cloud_backfill_out.log",
      error_file: "logs/antigravity_cloud_backfill_err.log"
    },
    {
      name: "local-gemini-backfill",
      script: "scripts/maintenance/run_local_backfill.py",
      interpreter: "python3",
      cwd: "/Users/daniel/Documents/AGY/the_system",
      cron_restart: "0 1 * * *", // 1:00 AM Daily
      autorestart: false,
      out_file: "logs/local_gemini_backfill_out.log",
      error_file: "logs/local_gemini_backfill_err.log"
    },
    {
      name: "local-gemini-weekly-sync",
      script: "scripts/maintenance/run_local_weekly_synthesis.py",
      interpreter: "python3",
      cwd: "/Users/daniel/Documents/AGY/the_system",
      cron_restart: "0 2 * * 0", // 2:00 AM Every Sunday
      autorestart: false,
      out_file: "logs/local_gemini_weekly_sync_out.log",
      error_file: "logs/local_gemini_weekly_sync_err.log"
    },
    {
      name: "local-gemini-periodic-sync",
      script: "scripts/maintenance/run_local_periodic_synthesis.py",
      interpreter: "python3",
      cwd: "/Users/daniel/Documents/AGY/the_system",
      cron_restart: "0 3 * * 0", // 3:00 AM Every Sunday
      autorestart: false,
      out_file: "logs/local_gemini_periodic_sync_out.log",
      error_file: "logs/local_gemini_periodic_sync_err.log"
    },
    {
      name: "jules-weekly",
      script: "scripts/automation/jules_weekly.js",
      cwd: "/Users/daniel/Documents/AGY/the_system",
      cron_restart: "0 2 * * 3", // 2:00 AM Every Wednesday
      autorestart: false,
      out_file: "logs/jules_weekly_out.log",
      error_file: "logs/jules_weekly_err.log"
    }
  ]
};
