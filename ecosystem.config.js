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

module.exports = {
  apps: [
    // ==========================================
    // 🐍 Python Services & Scheduled Tasks
    // ==========================================
    {
      name: "antigravity-bridge",
      script: "src/telegram_antigravity_bridge.py",
      interpreter: "/Users/daniel/Developer/AGY_caches/the_system/my_venv/bin/python3",
      cwd: "/Users/daniel/Documents/AGY/the_system",
      env: {
        TELEGRAM_BOT_TOKEN: localEnv.TELEGRAM_BOT_TOKEN || "",
        TELEGRAM_USER_ID: localEnv.TELEGRAM_USER_ID || ""
      },
      autorestart: true,
      restart_delay: 5000
    },
    {
      name: "telegram-bridge",
      script: "src/ingestion/telegram_bridge.py",
      interpreter: "/Users/daniel/Developer/AGY_caches/the_system/my_venv/bin/python3",
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
      interpreter: "/Users/daniel/Developer/AGY_caches/the_system/my_venv/bin/python3",
      cwd: "/Users/daniel/Documents/AGY/the_system",
      cron_restart: "*/2 * * * *", // Runs every 2 minutes
      autorestart: false,
      out_file: "logs/task_sync_out.log",
      error_file: "logs/task_sync_err.log"
    },
    {
      name: "sheet-sync-maintenance",
      script: "scripts/utils/sheet_sync_and_maintenance.py",
      interpreter: "/Users/daniel/Developer/AGY_caches/the_system/my_venv/bin/python3",
      cwd: "/Users/daniel/Documents/AGY/the_system",
      cron_restart: "*/15 * * * *", // Runs every 15 minutes
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
        NODE_PATH: "/Users/daniel/Developer/AGY_caches/the_system/node_modules"
      },
      autorestart: true,
      restart_delay: 5000
    },
    {
      name: "system-monitor",
      script: "src/ingestion/monitor.js",
      cwd: "/Users/daniel/Documents/AGY/the_system",
      env: {
        NODE_PATH: "/Users/daniel/Developer/AGY_caches/the_system/node_modules"
      },
      autorestart: true,
      restart_delay: 5000
    },
    {
      name: "check-bridges-daily",
      script: "src/ingestion/check_bridges_daily.js",
      cwd: "/Users/daniel/Documents/AGY/the_system",
      env: {
        NODE_PATH: "/Users/daniel/Developer/AGY_caches/the_system/node_modules"
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
      name: "local-gemini-weekly-sync",
      script: "scripts/maintenance/run_local_weekly_synthesis.py",
      interpreter: "python3",
      cwd: "/Users/daniel/Documents/AGY/the_system",
      cron_restart: "0 2 * * 0", // 2:00 AM Every Sunday
      autorestart: false,
      out_file: "logs/local_gemini_weekly_sync_out.log",
      error_file: "logs/local_gemini_weekly_sync_err.log"
    }
  ]
};
