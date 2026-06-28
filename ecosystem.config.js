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
      cron_restart: "0 * * * *", // Runs every hour
      autorestart: false,
      out_file: "logs/second_brain_sync_out.log",
      error_file: "logs/second_brain_sync_err.log"
    },
    {
      name: "trigger-jules-backend",
      script: "scripts/maintenance/trigger_jules.js",
      args: "--micro-backend",
      cwd: "/Users/daniel/Documents/AGY/the_system",
      env: {
        JULES_API_KEY: localEnv.JULES_API_KEY || ""
      },
      cron_restart: "0 2 * * *", // 2:00 AM Daily
      autorestart: false,
      out_file: "logs/trigger_jules_backend_out.log",
      error_file: "logs/trigger_jules_backend_err.log"
    },
    {
      name: "trigger-jules-ui",
      script: "scripts/maintenance/trigger_jules.js",
      args: "--micro-ui",
      cwd: "/Users/daniel/Documents/AGY/the_system",
      env: {
        JULES_API_KEY: localEnv.JULES_API_KEY || ""
      },
      cron_restart: "0 3 * * *", // 3:00 AM Daily
      autorestart: false,
      out_file: "logs/trigger_jules_ui_out.log",
      error_file: "logs/trigger_jules_ui_err.log"
    },
    {
      name: "trigger-jules-cleanup",
      script: "scripts/maintenance/trigger_jules.js",
      args: "--micro-cleanup",
      cwd: "/Users/daniel/Documents/AGY/the_system",
      env: {
        JULES_API_KEY: localEnv.JULES_API_KEY || ""
      },
      cron_restart: "0 4 * * *", // 4:00 AM Daily
      autorestart: false,
      out_file: "logs/trigger_jules_cleanup_out.log",
      error_file: "logs/trigger_jules_cleanup_err.log"
    },
    {
      name: "trigger-jules-major",
      script: "scripts/maintenance/trigger_jules.js",
      args: "--major",
      cwd: "/Users/daniel/Documents/AGY/the_system",
      env: {
        JULES_API_KEY: localEnv.JULES_API_KEY || ""
      },
      cron_restart: "0 5 * * 0,3", // 5:00 AM Wednesday & Sunday
      autorestart: false,
      out_file: "logs/trigger_jules_major_out.log",
      error_file: "logs/trigger_jules_major_err.log"
    }
  ]
};
